'use strict';

const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireCuratorOrAbove } = require('../middleware/auth');

const router = express.Router();

const NAME_MAX_LEN = 120;

function normalizeName(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0 || trimmed.length > NAME_MAX_LEN) return null;
  return trimmed;
}

router.get('/', requireAuth, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  try {
    const params = [];
    let where = '';
    if (q.length > 0) {
      params.push(`%${q.toLowerCase()}%`);
      where = `WHERE LOWER(name) LIKE $1
            OR LOWER(COALESCE(scientific_name, '')) LIKE $1
            OR LOWER(COALESCE(polynesian_name, '')) LIKE $1`;
    }
    const { rows } = await pool.query(`
      SELECT id, name, scientific_name, polynesian_name, category, description, description_source, status, usage_count
      FROM species
      ${where}
      ORDER BY LOWER(name) ASC
      LIMIT 10
    `, params);
    res.json({ results: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const name = normalizeName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'name required (1-120 chars)' });

  try {
    const { rows } = await pool.query(`
      INSERT INTO species (name, status, proposed_by)
      VALUES ($1, 'pending', $2)
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, scientific_name, polynesian_name, category, description, description_source, status, usage_count
    `, [name, req.cvatUser.id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const VALID_CATEGORIES = ['terrestrial_fauna', 'marine_fauna', 'flora', 'other'];
const VALID_DESC_SOURCES = ['manual', 'wikipedia', 'annotator_proposal'];

router.patch('/:id', requireCuratorOrAbove, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

  const body = req.body || {};
  const fields = [];
  const params = [];

  const stringField = (key) => {
    if (key in body) {
      const v = body[key];
      if (v !== null && typeof v !== 'string') return false;
      params.push(v === null ? null : v.trim().slice(0, 4000) || null);
      fields.push(`${key} = $${params.length}`);
    }
    return true;
  };

  if (!stringField('scientific_name')) return res.status(400).json({ error: 'scientific_name must be string|null' });
  if (!stringField('polynesian_name')) return res.status(400).json({ error: 'polynesian_name must be string|null' });
  if (!stringField('description'))     return res.status(400).json({ error: 'description must be string|null' });

  if ('category' in body) {
    const v = body.category;
    if (v !== null && (typeof v !== 'string' || !VALID_CATEGORIES.includes(v))) {
      return res.status(400).json({ error: `category must be null or one of ${VALID_CATEGORIES.join(', ')}` });
    }
    params.push(v);
    fields.push(`category = $${params.length}`);
  }

  if ('description_source' in body) {
    const v = body.description_source;
    if (v !== null && (typeof v !== 'string' || !VALID_DESC_SOURCES.includes(v))) {
      return res.status(400).json({ error: `description_source must be null or one of ${VALID_DESC_SOURCES.join(', ')}` });
    }
    params.push(v);
    fields.push(`description_source = $${params.length}`);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'no editable fields provided' });

  params.push(id);
  try {
    const { rows } = await pool.query(`
      UPDATE species SET ${fields.join(', ')}
      WHERE id = $${params.length}
      RETURNING id, name, scientific_name, polynesian_name, category, description, description_source, status, usage_count
    `, params);
    if (rows.length === 0) return res.status(404).json({ error: 'species not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/approve', requireCuratorOrAbove, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const { rows } = await pool.query(`
      UPDATE species
      SET status = 'approved', approved_by = $1
      WHERE id = $2
      RETURNING id, name, status, usage_count
    `, [req.cvatUser.id, id]);
    if (rows.length === 0) return res.status(404).json({ error: 'species not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/increment-usage', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const { rows } = await pool.query(`
      UPDATE species
      SET usage_count = usage_count + 1
      WHERE id = $1
      RETURNING id, usage_count
    `, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'species not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
