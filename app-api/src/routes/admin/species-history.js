'use strict';

const express = require('express');
const { pool } = require('../../db');
const { cvatGet } = require('../../lib/cvatAdmin');
const { recordAction } = require('../../lib/auditLog');

const router = express.Router();

// Champs édités via PATCH /species/:id que l'on sait restaurer en revert.
const RESTORABLE_FIELDS = [
  'scientific_name',
  'usage_name',
  'polynesian_name',
  'description',
  'description_source',
  'reference_image_url',
  'category',
  'tags',
];

// Liste l'historique des éditions d'espèces (200 dernières).
router.get('/', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, actor_id, action, target_id, payload, created_at
      FROM admin_actions
      WHERE action IN ('species.edited', 'species.reverted')
      ORDER BY created_at DESC
      LIMIT 200
    `);

    const actorIds  = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
    const speciesIds = [...new Set(rows.map((r) => r.target_id).filter(Boolean))];

    const usernames = {};
    await Promise.all(actorIds.map(async (id) => {
      try { const r = await cvatGet(`/users/${id}`); usernames[id] = r.data.username; }
      catch { /* user supprimé éventuellement */ }
    }));

    let speciesByIdMap = {};
    if (speciesIds.length > 0) {
      const { rows: spRows } = await pool.query(`
        SELECT id, name, scientific_name, usage_name FROM species WHERE id = ANY($1)
      `, [speciesIds]);
      speciesByIdMap = Object.fromEntries(spRows.map((s) => [s.id, s]));
    }

    // Marqueur "déjà annulée" : pour chaque ligne edited, on regarde s'il existe
    // une ligne reverted plus récente qui pointe vers elle (via reverted_action_id
    // dans le payload). Plus simple : on flagge les rows où une revert ultérieure
    // référence leur id.
    const editedIds = rows.filter((r) => r.action === 'species.edited').map((r) => r.id);
    const revertedSet = new Set();
    if (editedIds.length > 0) {
      const { rows: rv } = await pool.query(`
        SELECT (payload->>'reverted_action_id')::int AS ref
        FROM admin_actions
        WHERE action = 'species.reverted'
          AND (payload->>'reverted_action_id')::int = ANY($1)
      `, [editedIds]);
      rv.forEach((r) => { if (r.ref) revertedSet.add(r.ref); });
    }

    res.json({
      results: rows.map((r) => ({
        id: r.id,
        action: r.action,
        species_id: r.target_id,
        species: speciesByIdMap[r.target_id] || null,
        actor: { id: r.actor_id, username: usernames[r.actor_id] || null },
        created_at: r.created_at,
        payload: r.payload,
        already_reverted: r.action === 'species.edited' && revertedSet.has(r.id),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Revert : restaure le `before` d'une action `species.edited`.
router.post('/:id/revert', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid action id' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: actionRows } = await client.query(
      `SELECT id, action, target_id, payload FROM admin_actions WHERE id = $1`,
      [id],
    );
    if (actionRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'action introuvable' });
    }
    const action = actionRows[0];
    if (action.action !== 'species.edited') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'seules les actions species.edited peuvent être annulées' });
    }
    const before = action.payload?.before;
    if (!before || typeof before !== 'object') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'snapshot before manquant — action trop ancienne ?' });
    }

    // Sécurité : si une revert ciblant cette action existe déjà, refuse.
    const { rows: existingRevert } = await client.query(`
      SELECT id FROM admin_actions
      WHERE action = 'species.reverted'
        AND (payload->>'reverted_action_id')::int = $1
      LIMIT 1
    `, [id]);
    if (existingRevert.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'cette modification a déjà été annulée' });
    }

    // Lecture de l'état courant pour construire la nouvelle ligne d'historique.
    const { rows: cur } = await client.query(
      `SELECT scientific_name, usage_name, polynesian_name, description, description_source,
              reference_image_url, category, tags
       FROM species WHERE id = $1 FOR UPDATE`,
      [action.target_id],
    );
    if (cur.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'espèce introuvable (supprimée ?)' });
    }
    const currentState = cur[0];

    // Restaure les champs présents dans `before` (sans toucher aux autres).
    const sets = [];
    const params = [];
    let p = 1;
    for (const k of RESTORABLE_FIELDS) {
      if (k in before) {
        params.push(before[k]);
        sets.push(`${k} = $${p++}`);
      }
    }
    if (sets.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'aucun champ restaurable dans le snapshot' });
    }
    params.push(action.target_id);
    const { rows: updated } = await client.query(
      `UPDATE species SET ${sets.join(', ')} WHERE id = $${p}
       RETURNING id, name, scientific_name, usage_name, polynesian_name, description,
                 description_source, reference_image_url, category, tags`,
      params,
    );

    await client.query(`
      INSERT INTO admin_actions (actor_id, action, target_type, target_id, payload)
      VALUES ($1, 'species.reverted', 'species', $2, $3)
    `, [
      req.cvatUser.id,
      action.target_id,
      JSON.stringify({
        reverted_action_id: id,
        before: currentState,
        after:  updated[0],
      }),
    ]);

    await client.query('COMMIT');
    res.json({ reverted: true, species: updated[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
