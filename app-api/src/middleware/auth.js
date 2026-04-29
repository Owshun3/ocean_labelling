const axios = require('axios');
const { pool } = require('../db');

const CVAT_API = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';

async function resolveCvatUser(authHeader) {
  const resp = await axios.get(`${CVAT_API}/users/self`, {
    headers: {
      Authorization: authHeader,
      Accept: 'application/vnd.cvat+json',
      // cvat_server's internal nginx requires Host: localhost to avoid 400
      Host: 'localhost',
    },
    timeout: 5000,
  });
  return resp.data;
}

async function requireAuth(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ error: 'Authorization header required' });
  try {
    req.cvatUser = await resolveCvatUser(auth);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired CVAT token' });
  }
}

async function requireAdmin(req, res, next) {
  const auth = req.headers['authorization'];
  if (!auth) return res.status(401).json({ error: 'Authorization header required' });
  try {
    req.cvatUser = await resolveCvatUser(auth);
    if (req.cvatUser.is_superuser || req.cvatUser.is_staff) return next();
    const { rows } = await pool.query(
      'SELECT role FROM user_roles WHERE cvat_user_id = $1',
      [req.cvatUser.id]
    );
    if (rows[0]?.role === 'admin') return next();
    return res.status(403).json({ error: 'Admin access required' });
  } catch {
    res.status(401).json({ error: 'Invalid or expired CVAT token' });
  }
}

module.exports = { requireAuth, requireAdmin };
