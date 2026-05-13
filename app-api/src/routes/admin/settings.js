'use strict';

const express = require('express');
const { pool } = require('../../db');
const { REGISTRY_BY_KEY, GROUP_LABELS, coerceFromString, validateForType } = require('../../lib/settingsRegistry');
const { invalidateMaintenanceCache } = require('../../lib/maintenance');
const { recordAction } = require('../../lib/auditLog');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT key, value, type, label, description, group_name, is_public
      FROM app_settings
      ORDER BY group_name ASC, key ASC
    `);
    const items = rows.map((r) => ({
      key:          r.key,
      value:        coerceFromString(r.type, r.value),
      raw_value:    r.value,
      type:         r.type,
      label:        r.label,
      description:  r.description,
      group_name:   r.group_name,
      group_label:  GROUP_LABELS[r.group_name] || r.group_name,
      is_public:    r.is_public,
      known:        Object.prototype.hasOwnProperty.call(REGISTRY_BY_KEY, r.key),
    }));
    res.json({ groups: GROUP_LABELS, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:key', async (req, res) => {
  const { key } = req.params;
  const meta = REGISTRY_BY_KEY[key];
  if (!meta) return res.status(404).json({ error: 'paramètre inconnu' });

  let stored;
  try {
    stored = validateForType(meta.type, req.body?.value);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const prev = (await pool.query('SELECT value FROM app_settings WHERE key = $1', [key])).rows[0]?.value ?? null;
    await pool.query(`
      INSERT INTO app_settings (key, value, type, label, description, group_name, is_public)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, [key, stored, meta.type, meta.label, meta.description, meta.group_name, meta.is_public]);

    if (key === 'platform.maintenance_mode') invalidateMaintenanceCache();

    recordAction(req.cvatUser.id, 'setting.changed', {
      targetType: 'setting',
      payload: { key, from: prev, to: stored },
    });

    res.json({ key, value: coerceFromString(meta.type, stored) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
