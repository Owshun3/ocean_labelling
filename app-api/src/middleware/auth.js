const axios = require('axios');
const { pool } = require('../db');

const CVAT_API = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';

const SESSION_COOKIE = 'ocean_session';
const IDLE_TIMEOUT_MS     = 30 * 60 * 1000;
const ABSOLUTE_LIFETIME_MS = 12 * 60 * 60 * 1000;
const REMEMBER_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

async function resolveCvatUser(token) {
  const resp = await axios.get(`${CVAT_API}/users/self`, {
    headers: {
      Authorization: `Token ${token}`,
      Accept: 'application/vnd.cvat+json',
      Host: 'localhost',
    },
    timeout: 5000,
  });
  return resp.data;
}

async function getActiveBan(cvatUserId) {
  try {
    const { rows } = await pool.query(`
      SELECT reason, expires_at, banned_at
      FROM user_bans
      WHERE cvat_user_id = $1
        AND released_at IS NULL
        AND banned_at <= NOW()
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY banned_at DESC
      LIMIT 1
    `, [cvatUserId]);
    return rows[0] || null;
  } catch (err) {
    console.warn(`[auth] ban check failed for user ${cvatUserId}:`, err.message);
    return null;
  }
}

function denyBanned(res, ban) {
  return res.status(403).json({
    error: 'Compte banni',
    reason: ban.reason || null,
    expires_at: ban.expires_at,
    banned_at: ban.banned_at,
  });
}

function deny401(res, hint, extra = {}) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  return res.status(401).json({ error: 'Session invalide ou expirée', hint, ...extra });
}

async function loadSession(sessionId) {
  const { rows } = await pool.query(
    `SELECT id, cvat_user_id, cvat_token, remember, last_seen_at, expires_at
     FROM app_sessions WHERE id = $1`,
    [sessionId],
  );
  return rows[0] || null;
}

async function touchSession(sessionId) {
  await pool.query(
    'UPDATE app_sessions SET last_seen_at = NOW() WHERE id = $1',
    [sessionId],
  );
}

async function dropSession(sessionId) {
  await pool.query('DELETE FROM app_sessions WHERE id = $1', [sessionId]);
}

async function authenticate(req, res) {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId) {
    res.status(401).json({ error: 'Session manquante', hint: 'no_cookie' });
    return null;
  }
  const sess = await loadSession(sessionId);
  if (!sess) return deny401(res, 'unknown_session'), null;

  const now = Date.now();
  if (new Date(sess.expires_at).getTime() <= now) {
    await dropSession(sessionId);
    return deny401(res, 'expired'), null;
  }
  const idleMs = now - new Date(sess.last_seen_at).getTime();
  if (idleMs > IDLE_TIMEOUT_MS) {
    await dropSession(sessionId);
    return deny401(res, 'idle_timeout'), null;
  }

  let cvatUser;
  try {
    cvatUser = await resolveCvatUser(sess.cvat_token);
  } catch (err) {
    const cvatStatus = err?.response?.status;
    console.warn('[auth] CVAT token rejected:', { cvatStatus, message: err?.message });
    await dropSession(sessionId);
    return deny401(res, cvatStatus ? `cvat_returned_${cvatStatus}` : 'cvat_unreachable'), null;
  }

  const isStaff = cvatUser.is_superuser || cvatUser.is_staff;
  if (!isStaff) {
    const ban = await getActiveBan(cvatUser.id);
    if (ban) {
      await dropSession(sessionId);
      denyBanned(res, ban);
      return null;
    }
  }

  await touchSession(sessionId);
  req.cvatSession = sess;
  req.cvatToken   = sess.cvat_token;
  return cvatUser;
}

async function fetchAppRole(cvatUserId) {
  const { rows } = await pool.query(
    'SELECT role FROM user_roles WHERE cvat_user_id = $1',
    [cvatUserId]
  );
  return rows[0]?.role ?? 'annotator';
}

async function isAppAdmin(cvatUser) {
  if (cvatUser.is_superuser || cvatUser.is_staff) return true;
  return (await fetchAppRole(cvatUser.id)) === 'admin';
}

async function guardMaintenance(req, res, cvatUser) {
  const { getMaintenanceState } = require('../lib/maintenance');
  const { active, message } = await getMaintenanceState();
  if (!active) return false;
  if (await isAppAdmin(cvatUser)) return false;
  res.status(503).json({ error: 'maintenance', maintenance: true, message });
  return true;
}

async function requireAuth(req, res, next) {
  const cvatUser = await authenticate(req, res);
  if (!cvatUser) return;
  if (await guardMaintenance(req, res, cvatUser)) return;
  req.cvatUser = cvatUser;
  next();
}

async function requireAdmin(req, res, next) {
  const cvatUser = await authenticate(req, res);
  if (!cvatUser) return;
  req.cvatUser = cvatUser;
  if (cvatUser.is_superuser || cvatUser.is_staff) return next();
  const role = await fetchAppRole(cvatUser.id);
  if (role === 'admin') return next();
  return res.status(403).json({ error: 'Admin access required' });
}

async function requireCuratorOrAbove(req, res, next) {
  const cvatUser = await authenticate(req, res);
  if (!cvatUser) return;
  if (await guardMaintenance(req, res, cvatUser)) return;
  req.cvatUser = cvatUser;
  if (cvatUser.is_superuser || cvatUser.is_staff) return next();
  const role = await fetchAppRole(cvatUser.id);
  if (['admin', 'moderator', 'curator', 'chercheur'].includes(role)) return next();
  return res.status(403).json({ error: 'Curator access required' });
}

async function requireModeratorOrAbove(req, res, next) {
  const cvatUser = await authenticate(req, res);
  if (!cvatUser) return;
  if (await guardMaintenance(req, res, cvatUser)) return;
  req.cvatUser = cvatUser;
  if (cvatUser.is_superuser || cvatUser.is_staff) return next();
  const role = await fetchAppRole(cvatUser.id);
  if (['admin', 'moderator'].includes(role)) return next();
  return res.status(403).json({ error: 'Moderator access required' });
}

async function requireChercheur(req, res, next) {
  const cvatUser = await authenticate(req, res);
  if (!cvatUser) return;
  if (await guardMaintenance(req, res, cvatUser)) return;
  req.cvatUser = cvatUser;
  const role = await fetchAppRole(cvatUser.id);
  if (role === 'chercheur') return next();
  return res.status(403).json({ error: 'Cette fonctionnalité est réservée au rôle chercheur.' });
}

module.exports = {
  requireAuth, requireAdmin, requireCuratorOrAbove, requireModeratorOrAbove,
  requireChercheur,
  resolveCvatUser, dropSession,
  fetchAppRole, isAppAdmin,
  SESSION_COOKIE, IDLE_TIMEOUT_MS, ABSOLUTE_LIFETIME_MS, REMEMBER_LIFETIME_MS,
};
