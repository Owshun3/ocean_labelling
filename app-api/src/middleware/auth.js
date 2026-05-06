const axios = require('axios');
const { pool } = require('../db');

const CVAT_API = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';

async function resolveCvatUser(authHeader) {
  const resp = await axios.get(`${CVAT_API}/users/self`, {
    headers: {
      Authorization: authHeader,
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

async function authenticate(req, res) {
  const auth = req.headers['authorization'];
  if (!auth) {
    res.status(401).json({ error: 'Authorization header required' });
    return null;
  }
  try {
    const cvatUser = await resolveCvatUser(auth);
    const isStaff = cvatUser.is_superuser || cvatUser.is_staff;
    if (!isStaff) {
      const ban = await getActiveBan(cvatUser.id);
      if (ban) {
        denyBanned(res, ban);
        return null;
      }
    }
    return cvatUser;
  } catch {
    res.status(401).json({ error: 'Invalid or expired CVAT token' });
    return null;
  }
}

async function fetchAppRole(cvatUserId) {
  const { rows } = await pool.query(
    'SELECT role FROM user_roles WHERE cvat_user_id = $1',
    [cvatUserId]
  );
  return rows[0]?.role ?? 'annotator';
}

async function requireAuth(req, res, next) {
  const cvatUser = await authenticate(req, res);
  if (!cvatUser) return;
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
  req.cvatUser = cvatUser;
  if (cvatUser.is_superuser || cvatUser.is_staff) return next();
  const role = await fetchAppRole(cvatUser.id);
  if (['admin', 'moderator', 'curator'].includes(role)) return next();
  return res.status(403).json({ error: 'Curator access required' });
}

async function requireModeratorOrAbove(req, res, next) {
  const cvatUser = await authenticate(req, res);
  if (!cvatUser) return;
  req.cvatUser = cvatUser;
  if (cvatUser.is_superuser || cvatUser.is_staff) return next();
  const role = await fetchAppRole(cvatUser.id);
  if (['admin', 'moderator'].includes(role)) return next();
  return res.status(403).json({ error: 'Moderator access required' });
}

module.exports = { requireAuth, requireAdmin, requireCuratorOrAbove, requireModeratorOrAbove };
