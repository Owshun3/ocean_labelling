const express = require('express');
const axios = require('axios');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
const CVAT_API = process.env.CVAT_API_URL || 'http://cvat_server:8080/api';
const VALID_ROLES = ['admin', 'curator', 'moderator', 'annotator', 'guest'];

// GET /users — list all CVAT users merged with our role data
router.get('/', requireAdmin, async (req, res) => {
  try {
    const auth = req.headers['authorization'];
    const cvatResp = await axios.get(`${CVAT_API}/users?page_size=200`, {
      headers: { Authorization: auth, Accept: 'application/vnd.cvat+json', Host: 'localhost' },
      timeout: 8000,
    });

    const cvatUsers = cvatResp.data.results;
    const roleRows = db.prepare('SELECT cvat_user_id, role FROM user_roles').all();
    const roleMap = Object.fromEntries(roleRows.map(r => [r.cvat_user_id, r.role]));

    const users = cvatUsers.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email || '',
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      is_superuser: u.is_superuser || false,
      is_active: u.is_active !== false,
      date_joined: u.date_joined || null,
      role: roleMap[u.id] ?? (u.is_superuser ? 'admin' : 'annotator'),
    }));

    res.json({ results: users, count: users.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /users/:id/role — assign a role
router.patch('/:id/role', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { role } = req.body;

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  db.prepare(`
    INSERT INTO user_roles (cvat_user_id, role, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(cvat_user_id) DO UPDATE SET
      role       = excluded.role,
      updated_at = excluded.updated_at
  `).run(id, role);

  res.json({ id, role });
});

module.exports = router;
