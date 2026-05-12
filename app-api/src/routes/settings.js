'use strict';

const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const DEFAULTS = {
  upload_max_bytes: String(200 * 1024 * 1024),
};

async function ensureDefaults() {
  for (const [k, v] of Object.entries(DEFAULTS)) {
    await pool.query(
      'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING',
      [k, v],
    );
  }
}

ensureDefaults().catch((err) => console.warn('[settings] seed failed:', err.message));

router.get('/', requireAuth, async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM app_settings');
    const map = {};
    rows.forEach((r) => { map[r.key] = r.value; });
    for (const [k, v] of Object.entries(DEFAULTS)) {
      if (!(k in map)) map[k] = v;
    }
    res.json(map);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:key', requireAdmin, async (req, res) => {
  const { key } = req.params;
  const value = req.body?.value;
  if (typeof value !== 'string' || value.length === 0) {
    return res.status(400).json({ error: 'value required (non-empty string)' });
  }
  try {
    await pool.query(`
      INSERT INTO app_settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, [key, value]);
    res.json({ key, value });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
