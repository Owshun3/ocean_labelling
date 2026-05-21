const express = require('express');
const axios = require('axios');
const { pool } = require('../db');
const { requireAdmin, requireAuth, fetchAppRole } = require('../middleware/auth');
const { recordAction } = require('../lib/auditLog');
const { fetchActionsTotals } = require('../lib/userStats');
const { assertCanSanction } = require('../lib/permissions');

const router = express.Router();
const CVAT_API = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';
const VALID_ROLES = ['admin', 'moderator', 'curator', 'chercheur', 'annotator', 'guest'];

const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

const CVAT_ERROR_FR = [
  [/old password was entered incorrectly/i,                      'Mot de passe actuel incorrect.'],
  [/user with that username already exists/i,                    'Cet identifiant est déjà utilisé.'],
  [/two password fields didn.?t match/i,                         'Les deux nouveaux mots de passe ne correspondent pas.'],
  [/password is too short.*at least (\d+) character/i,           (m) => `Le mot de passe doit contenir au moins ${m[1]} caractères.`],
  [/password is too common/i,                                    'Le mot de passe est trop courant, choisis-en un plus complexe.'],
  [/password is entirely numeric/i,                              'Le mot de passe ne peut pas être composé uniquement de chiffres.'],
  [/password is too similar to/i,                                'Le mot de passe est trop proche de tes informations personnelles.'],
  [/enter a valid email address/i,                               'Adresse email invalide.'],
  [/user with this email already exists/i,                       'Cette adresse email est déjà utilisée.'],
];

function translateCvatError(msg) {
  if (typeof msg !== 'string') return msg;
  for (const [pattern, replacement] of CVAT_ERROR_FR) {
    const m = msg.match(pattern);
    if (m) return typeof replacement === 'function' ? replacement(m) : replacement;
  }
  return msg;
}

let cachedAdminToken = null;

async function getCvatAdminToken(forceRefresh = false) {
  if (cachedAdminToken && !forceRefresh) return cachedAdminToken;
  const resp = await axios.post(`${CVAT_API}/auth/login`, {
    username: process.env.CVAT_ADMIN_USER,
    password: process.env.CVAT_ADMIN_PASS,
  }, { headers: { Host: 'localhost' } });
  cachedAdminToken = resp.data.key;
  return cachedAdminToken;
}

async function cvatFetchAllUsers() {
  const doGet = (token) => axios.get(`${CVAT_API}/users?page_size=200`, {
    headers: { Authorization: `Token ${token}`, Accept: 'application/vnd.cvat+json', Host: 'localhost' },
    timeout: 8000,
  });
  try {
    return await doGet(await getCvatAdminToken());
  } catch (err) {
    if (err.response?.status === 401) {
      return await doGet(await getCvatAdminToken(true));
    }
    throw err;
  }
}

async function cvatAdminGet(path) {
  const doGet = (token) => axios.get(`${CVAT_API}${path}`, {
    headers: { Authorization: `Token ${token}`, Accept: 'application/vnd.cvat+json', Host: 'localhost' },
    timeout: 8000,
  });
  try {
    return await doGet(await getCvatAdminToken());
  } catch (err) {
    if (err.response?.status === 401) return doGet(await getCvatAdminToken(true));
    throw err;
  }
}

async function cvatGetUser(userId) {
  try {
    const resp = await cvatAdminGet(`/users/${userId}`);
    return resp.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

async function cvatPatchUser(userId, body) {
  const doPatch = (token) => axios.patch(`${CVAT_API}/users/${userId}`, body, {
    headers: {
      Authorization: `Token ${token}`,
      Accept: 'application/vnd.cvat+json',
      'Content-Type': 'application/json',
      Host: 'localhost',
    },
    timeout: 8000,
  });
  try {
    return await doPatch(await getCvatAdminToken());
  } catch (err) {
    if (err.response?.status === 401) {
      return await doPatch(await getCvatAdminToken(true));
    }
    throw err;
  }
}

function classifyBan(b, now = Date.now()) {
  if (!b) return 'none';
  if (b.released_at) return 'released';
  if (b.expires_at && new Date(b.expires_at).getTime() <= now) return 'expired';
  if (new Date(b.banned_at).getTime() > now) return 'scheduled';
  return 'active';
}

async function loadLastBanByUser() {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (cvat_user_id)
      cvat_user_id, reason, expires_at, banned_at, released_at
    FROM user_bans
    ORDER BY cvat_user_id, banned_at DESC
  `);
  const map = new Map();
  rows.forEach((r) => map.set(r.cvat_user_id, r));
  return map;
}

router.get('/me', requireAuth, async (req, res) => {
  const userId = req.cvatUser.id;
  try {
    const { rows } = await pool.query(
      'SELECT role FROM user_roles WHERE cvat_user_id = $1',
      [userId]
    );
    const role = rows[0]?.role ?? (req.cvatUser.is_superuser ? 'admin' : 'annotator');
    res.json({ id: userId, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me/profile', requireAuth, async (req, res) => {
  const me = req.cvatUser;
  try {
    const role = req.cvatUser.is_superuser ? 'admin'
      : (await pool.query('SELECT role FROM user_roles WHERE cvat_user_id = $1', [me.id])).rows[0]?.role
      ?? 'annotator';

    const ucaQ = await pool.query(
      'SELECT username_changed_at FROM user_roles WHERE cvat_user_id = $1',
      [me.id],
    );
    const usernameChangedAt = ucaQ.rows[0]?.username_changed_at ?? null;
    const usernameNextChangeAt = usernameChangedAt
      ? new Date(new Date(usernameChangedAt).getTime() + USERNAME_CHANGE_COOLDOWN_DAYS * 86400 * 1000).toISOString()
      : null;

    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM curator_certifications
         WHERE chosen_bbox_annotator_id = $1 AND mode = 'review')   AS annotations_validated,
        (SELECT COUNT(*) FROM media_moderation
         WHERE uploader_id = $1 AND status = 'validated')           AS media_validated,
        (SELECT COUNT(*) FROM media_moderation
         WHERE uploader_id = $1 AND status = 'rejected')            AS media_rejected,
        (SELECT COUNT(*) FROM media_moderation
         WHERE uploader_id = $1)                                    AS media_uploaded_total
    `, [me.id]);

    const s = stats.rows[0];
    const annValid     = Number(s.annotations_validated);
    const medVal       = Number(s.media_validated);
    const medRej       = Number(s.media_rejected);
    const medUploaded  = Number(s.media_uploaded_total);

    res.json({
      id: me.id,
      username: me.username,
      first_name: me.first_name ?? '',
      last_name:  me.last_name  ?? '',
      email:      me.email      ?? '',
      date_joined: me.date_joined ?? null,
      is_superuser: me.is_superuser,
      role,
      username_changed_at:      usernameChangedAt,
      username_next_change_at:  usernameNextChangeAt,
      stats: {
        annotations_validated:   annValid,
        media_validated:         medVal,
        media_rejected:          medRej,
        media_uploaded_total:    medUploaded,
        actions_validated_total: annValid + medVal,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function cvatPatchSelf(cvatToken, body) {
  return axios.patch(`${CVAT_API}/users/${body.__id}`, body.payload, {
    headers: {
      Authorization: `Token ${cvatToken}`,
      Accept: 'application/vnd.cvat+json',
      'Content-Type': 'application/json',
      Host: 'localhost',
    },
    timeout: 8000,
  });
}

router.patch('/me', requireAuth, async (req, res) => {
  const me = req.cvatUser;
  const body = req.body || {};

  const wantsUsernameChange = typeof body.username === 'string'
    && body.username.trim() !== ''
    && body.username.trim() !== me.username;
  const newUsername = wantsUsernameChange ? body.username.trim() : null;

  try {
    if (wantsUsernameChange) {
      const ucaQ = await pool.query(
        'SELECT username_changed_at FROM user_roles WHERE cvat_user_id = $1',
        [me.id],
      );
      const last = ucaQ.rows[0]?.username_changed_at ?? null;
      if (last) {
        const ageMs = Date.now() - new Date(last).getTime();
        const cooldownMs = USERNAME_CHANGE_COOLDOWN_DAYS * 86400 * 1000;
        if (ageMs < cooldownMs) {
          const nextAt = new Date(new Date(last).getTime() + cooldownMs).toISOString();
          return res.status(429).json({
            error: `Tu as déjà changé d'identifiant récemment. Prochain changement possible le ${new Date(nextAt).toLocaleDateString('fr-FR')}.`,
            next_change_at: nextAt,
          });
        }
      }
    }

    const payload = {};
    if (typeof body.first_name === 'string') payload.first_name = body.first_name.slice(0, 150);
    if (typeof body.last_name  === 'string') payload.last_name  = body.last_name.slice(0, 150);
    if (typeof body.email      === 'string') payload.email      = body.email.slice(0, 254);
    if (newUsername) payload.username = newUsername;

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ error: 'aucun champ modifié' });
    }

    const cvatResp = await cvatPatchSelf(req.cvatToken, { __id: me.id, payload });

    if (newUsername) {
      await pool.query(`
        INSERT INTO user_roles (cvat_user_id, username, username_changed_at, updated_at)
        VALUES ($1, $2, NOW(), NOW())
        ON CONFLICT (cvat_user_id) DO UPDATE SET
          username = EXCLUDED.username,
          username_changed_at = NOW(),
          updated_at = NOW()
      `, [me.id, newUsername]);
    }

    res.json(cvatResp.data);
  } catch (err) {
    const cvatStatus = err.response?.status;
    const cvatData   = err.response?.data;
    if (cvatStatus === 400 && cvatData && typeof cvatData === 'object') {
      const usernameErr = cvatData.username?.[0];
      if (usernameErr) return res.status(409).json({ error: translateCvatError(usernameErr) });
      const emailErr = cvatData.email?.[0];
      if (emailErr) return res.status(400).json({ error: translateCvatError(emailErr) });
    }
    res.status(cvatStatus ?? 500).json({ error: translateCvatError(typeof cvatData === 'string' ? cvatData : cvatData?.detail) ?? err.message });
  }
});

router.post('/me/password', requireAuth, async (req, res) => {
  const body = req.body || {};
  const oldPassword = typeof body.old_password === 'string' ? body.old_password : '';
  const newPassword = typeof body.new_password === 'string' ? body.new_password : '';
  const confirm     = typeof body.confirm_password === 'string' ? body.confirm_password : '';
  if (!oldPassword || !newPassword || !confirm) return res.status(400).json({ error: 'champs requis manquants' });
  if (newPassword !== confirm) return res.status(400).json({ error: 'les deux nouveaux mots de passe ne correspondent pas' });
  if (newPassword.length < 8)  return res.status(400).json({ error: 'mot de passe trop court (minimum 8 caractères)' });

  try {
    await axios.post(`${CVAT_API}/auth/password/change`, {
      old_password: oldPassword,
      new_password1: newPassword,
      new_password2: confirm,
    }, {
      headers: {
        Authorization: `Token ${req.cvatToken}`,
        Accept: 'application/vnd.cvat+json',
        'Content-Type': 'application/json',
        Host: 'localhost',
      },
      timeout: 8000,
    });
    res.json({ ok: true });
  } catch (err) {
    const cvatStatus = err.response?.status;
    const cvatData   = err.response?.data;
    if (cvatStatus === 400 && cvatData) {
      const msg = cvatData.old_password?.[0] || cvatData.new_password2?.[0] || cvatData.new_password1?.[0] || cvatData.detail;
      if (msg) return res.status(400).json({ error: translateCvatError(msg) });
    }
    res.status(cvatStatus ?? 500).json({ error: translateCvatError(typeof cvatData === 'string' ? cvatData : cvatData?.detail) ?? err.message });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const cvatResp = await cvatFetchAllUsers();
    const cvatUsers = cvatResp.data.results;

    const { rows: roleRows } = await pool.query('SELECT cvat_user_id, role FROM user_roles');
    const roleMap = Object.fromEntries(roleRows.map(r => [r.cvat_user_id, r.role]));

    const lastBanByUser = await loadLastBanByUser();

    const reactivateTargets = cvatUsers.filter((u) => {
      if (u.is_active !== false) return false;
      const b = lastBanByUser.get(u.id);
      return classifyBan(b) === 'expired';
    });
    await Promise.all(reactivateTargets.map(async (u) => {
      try {
        await cvatPatchUser(u.id, { is_active: true });
        u.is_active = true;
      } catch (err) {
        console.warn(`[users] auto-reactivate ${u.id} failed:`, err.response?.data ?? err.message);
      }
    }));

    const actionsTotals = await fetchActionsTotals(cvatUsers.map((u) => u.id));

    const { rows: sessionRows } = await pool.query(`
      SELECT cvat_user_id, COUNT(*)::int AS n, MAX(last_seen_at) AS last_seen_at
      FROM app_sessions
      WHERE expires_at > NOW()
        AND last_seen_at > NOW() - INTERVAL '30 minutes'
      GROUP BY cvat_user_id
    `);
    const sessionByUser = new Map(sessionRows.map((r) => [r.cvat_user_id, r]));

    const users = cvatUsers.map(u => {
      const ban = lastBanByUser.get(u.id);
      const banState = classifyBan(ban);
      const isActive = u.is_active !== false;
      let state;
      if (banState === 'active') state = 'banned';
      else if (isActive) state = 'active';
      else state = 'disabled';

      const sess = sessionByUser.get(u.id);
      const sessionsCount = sess?.n ?? 0;
      const lastSeenAt    = sess?.last_seen_at ?? null;

      return {
        id: u.id,
        username: u.username,
        email: u.email || '',
        first_name: u.first_name || '',
        last_name: u.last_name || '',
        is_superuser: u.is_superuser || false,
        is_active: isActive,
        date_joined: u.date_joined || null,
        role: roleMap[u.id] ?? (u.is_superuser ? 'admin' : 'annotator'),
        state,
        ban: state === 'banned'
          ? { reason: ban.reason, expires_at: ban.expires_at, banned_at: ban.banned_at }
          : null,
        active_sessions: sessionsCount,
        last_seen_at:    lastSeenAt,
        actions_validated_total: actionsTotals[u.id] ?? 0,
      };
    });

    res.json({ results: users, count: users.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function assertSanctionAllowed(actorCvatUser, targetUserId, actionLabel) {
  const actorRole  = actorCvatUser.is_superuser ? 'admin' : await fetchAppRole(actorCvatUser.id);
  const targetCvat = await cvatGetUser(targetUserId);
  const targetRole = (targetCvat?.is_superuser || targetCvat?.is_staff)
    ? 'admin'
    : await fetchAppRole(targetUserId);

  assertCanSanction(
    { id: actorCvatUser.id, role: actorRole, is_superuser: !!actorCvatUser.is_superuser, is_staff: !!actorCvatUser.is_staff },
    { id: targetUserId, role: targetRole, is_superuser: !!targetCvat?.is_superuser, is_staff: !!targetCvat?.is_staff },
    actionLabel,
  );
}

router.patch('/:id/active', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid user id' });
  const { is_active } = req.body || {};
  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active must be a boolean' });
  }

  if (is_active === false) {
    try {
      await assertSanctionAllowed(req.cvatUser, id, 'désactiver');
    } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    if (is_active) {
      await pool.query(`
        UPDATE user_bans
        SET released_at = NOW(), released_by = $1
        WHERE cvat_user_id = $2
          AND released_at IS NULL
          AND (expires_at IS NULL OR expires_at > NOW())
      `, [req.cvatUser.id, id]);
    }

    await cvatPatchUser(id, { is_active });
    recordAction(req.cvatUser.id, 'user.active_changed', {
      targetType: 'user', targetId: id, payload: { is_active },
    });
    res.json({ id, is_active });
  } catch (err) {
    res.status(err.response?.status ?? 500).json({ error: err.response?.data ?? err.message });
  }
});

// Le rôle 'guest' est réservé à la session d'invité non-authentifiée (front uniquement,
// aucun compte CVAT/app-api associé). L'attribuer à un compte réel ferait perdre l'accès
// à ses données puisque toutes les vérifications de permission le traitent comme un visiteur
// anonyme. On bloque donc explicitement son assignment ici.
const ASSIGNABLE_ROLES = ['moderator', 'curator', 'chercheur', 'annotator'];

router.patch('/:id/role', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { role } = req.body;

  if (!ASSIGNABLE_ROLES.includes(role)) {
    return res.status(400).json({
      error: `Le rôle doit être l'un de : ${ASSIGNABLE_ROLES.join(', ')}. Le rôle administrateur est réservé aux superusers CVAT.`,
    });
  }

  try {
    const cvatUser = await cvatGetUser(id);
    if (cvatUser?.is_superuser || cvatUser?.is_staff) {
      return res.status(403).json({
        error: 'Le rôle du superuser CVAT est verrouillé sur « administrateur ».',
      });
    }

    const prev = (await pool.query('SELECT role FROM user_roles WHERE cvat_user_id = $1', [id])).rows[0]?.role ?? null;
    await pool.query(`
      INSERT INTO user_roles (cvat_user_id, role, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (cvat_user_id) DO UPDATE SET
        role       = EXCLUDED.role,
        updated_at = EXCLUDED.updated_at
    `, [id, role]);

    recordAction(req.cvatUser.id, 'user.role_changed', {
      targetType: 'user', targetId: id, payload: { from: prev, to: role },
    });
    res.json({ id, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  const b = req.body || {};
  const username   = typeof b.username   === 'string' ? b.username.trim()   : '';
  const password   = typeof b.password   === 'string' ? b.password          : '';
  const email      = typeof b.email      === 'string' ? b.email.trim()      : '';
  const firstName  = typeof b.first_name === 'string' ? b.first_name.trim() : '';
  const lastName   = typeof b.last_name  === 'string' ? b.last_name.trim()  : '';
  const role       = typeof b.role       === 'string' ? b.role              : 'annotator';

  if (!username) return res.status(400).json({ error: 'Identifiant requis.' });
  if (!password || password.length < 8) return res.status(400).json({ error: 'Mot de passe requis (≥ 8 caractères).' });
  if (!email) return res.status(400).json({ error: 'Email requis.' });
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return res.status(400).json({
      error: `Le rôle doit être l'un de : ${ASSIGNABLE_ROLES.join(', ')}. Pour créer un administrateur, passe par le shell CVAT.`,
    });
  }

  try {
    await axios.post(`${CVAT_API}/auth/register`, {
      username, email,
      first_name: firstName, last_name: lastName,
      password1: password, password2: password,
    }, { headers: { Host: 'localhost', 'Content-Type': 'application/json' } });

    const userId = await resolveCvatUserIdByUsername(username);
    if (!userId) {
      return res.status(500).json({ error: 'Compte CVAT créé mais id introuvable — recharge la liste.' });
    }

    await pool.query(`
      INSERT INTO user_roles (cvat_user_id, username, email, role)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (cvat_user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = NOW()
    `, [userId, username, email, role]);

    recordAction(req.cvatUser.id, 'user.created', {
      targetType: 'user', targetId: userId, payload: { username, email, role },
    });
    res.status(201).json({ id: userId, username, email, role });
  } catch (err) {
    const status = err?.response?.status;
    const data   = err?.response?.data;
    if (status === 400 && data) {
      const firstError = (() => {
        for (const k of Object.keys(data)) {
          const v = data[k];
          if (Array.isArray(v) && v.length > 0) return `${k} : ${v[0]}`;
        }
        return JSON.stringify(data);
      })();
      return res.status(400).json({ error: firstError });
    }
    res.status(500).json({ error: err.message });
  }
});

async function resolveCvatUserIdByUsername(username) {
  const resp = await cvatAdminGet(`/users?search=${encodeURIComponent(username)}&page_size=20`);
  const match = (resp.data?.results || []).find((u) => u.username === username);
  return match?.id ?? null;
}

module.exports = router;
