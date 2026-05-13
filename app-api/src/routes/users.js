const express = require('express');
const axios = require('axios');
const { pool } = require('../db');
const { requireAdmin, requireAuth } = require('../middleware/auth');

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

// Token CVAT admin caché — utilisé pour lister tous les users (seul un superuser CVAT peut le faire)
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

// GET /users/me — retourne le rôle de l'utilisateur courant (auth requise)
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
         WHERE chosen_bbox_annotator_id = $1 AND mode = 'review') AS annotations_validated,
        (SELECT COUNT(*) FROM curator_certifications
         WHERE rejected_proposals @> $2::jsonb)                    AS annotations_rejected,
        (SELECT COUNT(*) FROM media_moderation
         WHERE uploader_id = $1 AND status = 'validated')          AS media_validated,
        (SELECT COUNT(*) FROM media_moderation
         WHERE uploader_id = $1 AND status = 'rejected')           AS media_rejected
    `, [me.id, JSON.stringify([{ annotator_id: me.id }])]);

    const s = stats.rows[0];
    const annValid = Number(s.annotations_validated);
    const annRej   = Number(s.annotations_rejected);
    const medVal   = Number(s.media_validated);
    const medRej   = Number(s.media_rejected);
    const annDen   = annValid + annRej;
    const medDen   = medVal + medRej;

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
        annotations_validated: annValid,
        media_validated:       medVal,
        media_rejected:        medRej,
        actions_validated_total: annValid + medVal,
        precision_annotations: annDen > 0 ? annValid / annDen : null,
        acceptance_media:      medDen > 0 ? medVal   / medDen : null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function cvatPatchSelf(authHeader, body) {
  return axios.patch(`${CVAT_API}/users/${body.__id}`, body.payload, {
    headers: {
      Authorization: authHeader,
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
  const auth = req.headers['authorization'];

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

    const cvatResp = await cvatPatchSelf(auth, { __id: me.id, payload });

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

  const auth = req.headers['authorization'];
  try {
    await axios.post(`${CVAT_API}/auth/password/change`, {
      old_password: oldPassword,
      new_password1: newPassword,
      new_password2: confirm,
    }, {
      headers: {
        Authorization: auth,
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

// GET /users — liste tous les users CVAT fusionnés avec les rôles DB
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

    const users = cvatUsers.map(u => {
      const ban = lastBanByUser.get(u.id);
      const banState = classifyBan(ban);
      const isActive = u.is_active !== false;
      let state;
      if (banState === 'active') state = 'banned';
      else if (isActive) state = 'active';
      else state = 'disabled';

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
      };
    });

    res.json({ results: users, count: users.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/active', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid user id' });
  const { is_active } = req.body || {};
  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active must be a boolean' });
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
    res.json({ id, is_active });
  } catch (err) {
    res.status(err.response?.status ?? 500).json({ error: err.response?.data ?? err.message });
  }
});

// PATCH /users/:id/role — assigner un rôle
router.patch('/:id/role', requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { role } = req.body;

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  try {
    await pool.query(`
      INSERT INTO user_roles (cvat_user_id, role, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (cvat_user_id) DO UPDATE SET
        role       = EXCLUDED.role,
        updated_at = EXCLUDED.updated_at
    `, [id, role]);

    res.json({ id, role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
