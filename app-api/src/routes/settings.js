'use strict';

const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { coerceFromString } = require('../lib/settingsRegistry');

const router = express.Router();

router.get('/public', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT key, value, type FROM app_settings WHERE is_public = TRUE'
    );
    const map = {};
    for (const r of rows) {
      try { map[r.key] = coerceFromString(r.type, r.value); }
      catch { map[r.key] = r.value; }
    }
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM app_settings');
    const map = {};
    rows.forEach((r) => { map[r.key] = r.value; });
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
