const express = require('express');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const {
  requireAuth, resolveCvatUser, dropSession,
  SESSION_COOKIE, IDLE_TIMEOUT_MS, ABSOLUTE_LIFETIME_MS, REMEMBER_LIFETIME_MS,
} = require('../middleware/auth');
const { getLockoutState, recordFailure, clearFailures } = require('../lib/loginLockout');

const router = express.Router();
const CVAT_API = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';
const IS_PROD  = process.env.NODE_ENV === 'production';

function buildCookieOptions(remember) {
  const opts = {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    path: '/',
  };
  if (remember) opts.maxAge = REMEMBER_LIFETIME_MS;
  return opts;
}

router.post('/login', async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const remember = req.body?.remember_me === true;

  if (!username || !password) {
    return res.status(400).json({ error: 'Identifiant et mot de passe requis.' });
  }

  // Verifier d'abord si le compte est verrouille (rate-limit progressif).
  const lockoutState = await getLockoutState(username);
  if (lockoutState.retryAfterMs > 0) {
    return res.status(429).json({
      error: 'Trop de tentatives. Compte verrouillé temporairement.',
      retry_after_ms: lockoutState.retryAfterMs,
      attempts: lockoutState.attempts,
    });
  }

  let cvatToken;
  try {
    const cvatResp = await axios.post(`${CVAT_API}/auth/login`, { username, password }, {
      headers: { Host: 'localhost', 'Content-Type': 'application/json' },
      timeout: 8000,
    });
    cvatToken = cvatResp.data?.key;
    if (!cvatToken) throw new Error('CVAT login returned no token');
  } catch (err) {
    const status = err?.response?.status;
    const data   = err?.response?.data;
    if (status === 400 || status === 401) {
      // Echec credentials -> incrementer compteur et eventuellement bloquer.
      const after = await recordFailure(username);
      if (after.retryAfterMs > 0) {
        return res.status(429).json({
          error: 'Trop de tentatives. Compte verrouillé temporairement.',
          retry_after_ms: after.retryAfterMs,
          attempts: after.attempts,
        });
      }
      return res.status(401).json({
        error: 'Identifiant ou mot de passe incorrect.',
        attempts: after.attempts,
      });
    }
    console.warn('[auth] CVAT login failed:', { status, data, message: err.message });
    return res.status(502).json({ error: 'Serveur d\'authentification indisponible.' });
  }

  // Login reussi -> reset le compteur.
  await clearFailures(username).catch(() => { /* non-bloquant */ });

  let cvatUser;
  try {
    cvatUser = await resolveCvatUser(cvatToken);
  } catch (err) {
    console.warn('[auth] resolveCvatUser after login failed:', err.message);
    return res.status(502).json({ error: 'Impossible de récupérer le profil utilisateur.' });
  }

  const absoluteMs = remember ? REMEMBER_LIFETIME_MS : ABSOLUTE_LIFETIME_MS;
  const expiresAt  = new Date(Date.now() + absoluteMs);
  const sessionId  = uuidv4();

  await pool.query(
    `INSERT INTO app_sessions (id, cvat_user_id, cvat_token, remember, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [sessionId, cvatUser.id, cvatToken, remember, expiresAt, req.get('user-agent')?.slice(0, 500) ?? null, req.ip?.slice(0, 64) ?? null],
  );

  res.cookie(SESSION_COOKIE, sessionId, buildCookieOptions(remember));

  const roleRow = (await pool.query(
    'SELECT role, has_seen_welcome FROM user_roles WHERE cvat_user_id = $1',
    [cvatUser.id],
  )).rows[0];
  const role = cvatUser.is_superuser ? 'admin' : (roleRow?.role ?? 'annotator');
  const hasSeenWelcome = roleRow?.has_seen_welcome ?? false;

  res.json({
    id: cvatUser.id,
    username: cvatUser.username,
    is_superuser: cvatUser.is_superuser,
    is_staff: cvatUser.is_staff,
    role,
    has_seen_welcome: hasSeenWelcome,
    idle_timeout_ms: IDLE_TIMEOUT_MS,
    expires_at: expiresAt.toISOString(),
  });
});

router.post('/logout', async (req, res) => {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (sessionId) await dropSession(sessionId);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  const me = req.cvatUser;
  const roleRow = (await pool.query(
    'SELECT role, has_seen_welcome, has_accepted_upload_terms FROM user_roles WHERE cvat_user_id = $1',
    [me.id],
  )).rows[0];
  const role = me.is_superuser ? 'admin' : (roleRow?.role ?? 'annotator');
  res.json({
    id: me.id,
    username: me.username,
    is_superuser: me.is_superuser,
    is_staff: me.is_staff,
    role,
    has_seen_welcome: roleRow?.has_seen_welcome ?? false,
    has_accepted_upload_terms: roleRow?.has_accepted_upload_terms ?? false,
  });
});

router.post('/welcome-seen', requireAuth, async (req, res) => {
  const me = req.cvatUser;
  await pool.query(`
    INSERT INTO user_roles (cvat_user_id, has_seen_welcome, updated_at)
    VALUES ($1, TRUE, NOW())
    ON CONFLICT (cvat_user_id) DO UPDATE
      SET has_seen_welcome = TRUE, updated_at = NOW()
  `, [me.id]);
  res.json({ ok: true });
});

router.post('/upload-terms-accepted', requireAuth, async (req, res) => {
  const me = req.cvatUser;
  await pool.query(`
    INSERT INTO user_roles (cvat_user_id, has_accepted_upload_terms, accepted_upload_terms_at, updated_at)
    VALUES ($1, TRUE, NOW(), NOW())
    ON CONFLICT (cvat_user_id) DO UPDATE
      SET has_accepted_upload_terms = TRUE,
          accepted_upload_terms_at = COALESCE(user_roles.accepted_upload_terms_at, NOW()),
          updated_at = NOW()
  `, [me.id]);
  res.json({ ok: true });
});

module.exports = router;
