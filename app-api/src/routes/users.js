const express = require('express');
const axios = require('axios');
const { pool } = require('../db');
const { requireAdmin, requireAuth } = require('../middleware/auth');

const router = express.Router();
const CVAT_API = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';
const VALID_ROLES = ['admin', 'moderator', 'curator', 'chercheur', 'annotator', 'guest'];

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
