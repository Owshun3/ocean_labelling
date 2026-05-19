'use strict';

const express = require('express');
const { pool } = require('../../db');
const { recordAction } = require('../../lib/auditLog');
const { loadDefinitions } = require('../../lib/speciesTagValidation');

const router = express.Router();

// Lecture admin (même payload que GET /species/tag-definitions, mais inclut les archivés
// pour permettre la gestion).
router.get('/', async (_req, res) => {
  try {
    const { rows: groups } = await pool.query(`
      SELECT id, key, label, is_required, is_exclusive, sort_order
      FROM species_tag_groups
      ORDER BY sort_order ASC, id ASC
    `);
    const { rows: defs } = await pool.query(`
      SELECT id, group_id, value, label, sort_order, archived_at
      FROM species_tag_definitions
      ORDER BY sort_order ASC, id ASC
    `);
    const byGroup = new Map(groups.map((g) => [g.id, { ...g, definitions: [] }]));
    for (const d of defs) {
      const g = byGroup.get(d.group_id);
      if (g) g.definitions.push(d);
    }
    res.json({ groups: Array.from(byGroup.values()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function sanitizeKey(s) {
  if (typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!/^[a-z][a-z0-9_]{1,49}$/.test(trimmed)) return null;
  return trimmed;
}
function sanitizeLabel(s, maxLen = 120) {
  if (typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (trimmed.length === 0 || trimmed.length > maxLen) return null;
  return trimmed;
}

// ── Groups ─────────────────────────────────────────────────────────────────
router.post('/groups', async (req, res) => {
  const b = req.body || {};
  const key   = sanitizeKey(b.key);
  const label = sanitizeLabel(b.label);
  if (!key)   return res.status(400).json({ error: 'key invalide (minuscules, _, 2-50 chars, commence par lettre)' });
  if (!label) return res.status(400).json({ error: 'label requis (1-120 chars)' });
  const isRequired  = !!b.is_required;
  const isExclusive = !!b.is_exclusive;
  const sortOrder   = Number.isInteger(b.sort_order) ? b.sort_order : 0;
  try {
    const { rows } = await pool.query(`
      INSERT INTO species_tag_groups (key, label, is_required, is_exclusive, sort_order)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [key, label, isRequired, isExclusive, sortOrder]);
    recordAction(req.cvatUser.id, 'species_tags.group_created', { payload: rows[0] });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'key déjà utilisée' });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/groups/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id invalide' });
  const b = req.body || {};
  const sets = []; const params = [];
  if ('label' in b)        { const v = sanitizeLabel(b.label); if (!v) return res.status(400).json({ error: 'label invalide' }); params.push(v); sets.push(`label = $${params.length}`); }
  if ('is_required' in b)  { params.push(!!b.is_required);  sets.push(`is_required = $${params.length}`); }
  if ('is_exclusive' in b) { params.push(!!b.is_exclusive); sets.push(`is_exclusive = $${params.length}`); }
  if ('sort_order' in b)   {
    if (!Number.isInteger(b.sort_order)) return res.status(400).json({ error: 'sort_order doit être un entier' });
    params.push(b.sort_order); sets.push(`sort_order = $${params.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'rien à modifier' });
  sets.push('updated_at = NOW()');
  params.push(id);
  try {
    const { rows } = await pool.query(`UPDATE species_tag_groups SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    if (rows.length === 0) return res.status(404).json({ error: 'groupe introuvable' });
    recordAction(req.cvatUser.id, 'species_tags.group_updated', { payload: { id, changes: b } });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/groups/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id invalide' });
  try {
    // CASCADE supprime aussi les définitions du groupe. Attention : les valeurs
    // restent dans species.tags[] des espèces existantes (FK array — pas géré).
    // Au prochain edit de ces espèces, la validation rejettera les tags orphelins.
    const { rowCount } = await pool.query('DELETE FROM species_tag_groups WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'groupe introuvable' });
    recordAction(req.cvatUser.id, 'species_tags.group_deleted', { payload: { id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Definitions (valeurs) ──────────────────────────────────────────────────
router.post('/definitions', async (req, res) => {
  const b = req.body || {};
  const groupId = Number(b.group_id);
  if (!Number.isFinite(groupId)) return res.status(400).json({ error: 'group_id requis' });
  const value = sanitizeKey(b.value);
  const label = sanitizeLabel(b.label);
  if (!value) return res.status(400).json({ error: 'value invalide (minuscules, _, 2-50 chars, commence par lettre)' });
  if (!label) return res.status(400).json({ error: 'label requis' });
  const sortOrder = Number.isInteger(b.sort_order) ? b.sort_order : 0;
  try {
    const { rows } = await pool.query(`
      INSERT INTO species_tag_definitions (group_id, value, label, sort_order)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [groupId, value, label, sortOrder]);
    recordAction(req.cvatUser.id, 'species_tags.definition_created', { payload: rows[0] });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'value déjà utilisée' });
    if (err.code === '23503') return res.status(400).json({ error: 'group_id inconnu' });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/definitions/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id invalide' });
  const b = req.body || {};
  const sets = []; const params = [];
  if ('label' in b)      { const v = sanitizeLabel(b.label); if (!v) return res.status(400).json({ error: 'label invalide' }); params.push(v); sets.push(`label = $${params.length}`); }
  if ('sort_order' in b) {
    if (!Number.isInteger(b.sort_order)) return res.status(400).json({ error: 'sort_order doit être un entier' });
    params.push(b.sort_order); sets.push(`sort_order = $${params.length}`);
  }
  if ('archived' in b) {
    params.push(b.archived ? new Date().toISOString() : null);
    sets.push(`archived_at = $${params.length}`);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'rien à modifier' });
  sets.push('updated_at = NOW()');
  params.push(id);
  try {
    const { rows } = await pool.query(`UPDATE species_tag_definitions SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
    if (rows.length === 0) return res.status(404).json({ error: 'définition introuvable' });
    recordAction(req.cvatUser.id, 'species_tags.definition_updated', { payload: { id, changes: b } });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Suppression dure (rare — préférer archiver). À utiliser uniquement si la
// valeur n'a jamais été assignée à une espèce.
router.delete('/definitions/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'id invalide' });
  try {
    const { rowCount } = await pool.query('DELETE FROM species_tag_definitions WHERE id = $1', [id]);
    if (rowCount === 0) return res.status(404).json({ error: 'définition introuvable' });
    recordAction(req.cvatUser.id, 'species_tags.definition_deleted', { payload: { id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
