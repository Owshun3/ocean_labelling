'use strict';

const express = require('express');
const { pool } = require('../db');
const { requireChercheur, requireAuth } = require('../middleware/auth');
const { parseFilters, computePreview, streamExportZip } = require('../lib/datumaroExport');
const { recordAction } = require('../lib/auditLog');

const router = express.Router();

// Lecture des facets — accessible chercheur ET admin (le formulaire chercheur réutilise
// les mêmes facets que l'admin → on ne duplique pas).
const { getAdminToken: _t } = require('../lib/cvatAdmin'); // not used, kept for future
router.get('/export/facets', requireChercheur, async (_req, res) => {
  try {
    const tagsQ = await pool.query(`
      SELECT DISTINCT t
      FROM species, unnest(species.tags) AS t
      WHERE species.status = 'approved'
      ORDER BY t ASC
    `);
    res.json({ tags: tagsQ.rows.map((r) => r.t) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Aperçu (chercheur peut voir combien d'items correspondent avant de demander)
router.post('/export/preview', requireChercheur, async (req, res) => {
  const filters = parseFilters(req.body);
  try {
    const preview = await computePreview(filters);
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Crée une nouvelle demande
router.post('/export-requests', requireChercheur, async (req, res) => {
  const b = req.body || {};
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (message.length < 10) return res.status(400).json({ error: 'Message de justification requis (≥ 10 caractères).' });
  const organization = typeof b.organization === 'string' ? b.organization.trim().slice(0, 200) : '';
  if (organization.length < 2) return res.status(400).json({ error: 'Organisation affiliée obligatoire (≥ 2 caractères).' });
  const scope   = parseFilters(b.scope ?? b);

  try {
    const { rows } = await pool.query(`
      INSERT INTO chercheur_export_requests (requester_id, message, organization, scope, status)
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING *
    `, [req.cvatUser.id, message.slice(0, 4000), organization, scope]);
    recordAction(req.cvatUser.id, 'chercheur.export_requested', {
      payload: { id: rows[0].id, scope, organization },
    });
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Liste mes demandes (toutes statuts)
router.get('/export-requests', requireChercheur, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, message, organization, scope, status, reviewed_by, reviewed_at,
             review_comment, expires_at, created_at
      FROM chercheur_export_requests
      WHERE requester_id = $1
      ORDER BY created_at DESC
    `, [req.cvatUser.id]);
    res.json({ results: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retirer ma demande pending (annulation propre)
router.delete('/export-requests/:id', requireChercheur, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const { rowCount } = await pool.query(`
      UPDATE chercheur_export_requests
      SET status = 'withdrawn'
      WHERE id = $1 AND requester_id = $2 AND status = 'pending'
    `, [id, req.cvatUser.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'demande introuvable ou non retirable' });
    recordAction(req.cvatUser.id, 'chercheur.export_withdrawn', { payload: { id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Télécharger l'export d'une demande approuvée et non expirée
router.post('/export-requests/:id/download', requireChercheur, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const { rows } = await pool.query(`
      SELECT id, requester_id, scope, status, expires_at
      FROM chercheur_export_requests
      WHERE id = $1
    `, [id]);
    if (rows.length === 0)                      return res.status(404).json({ error: 'demande introuvable' });
    const r = rows[0];
    if (r.requester_id !== req.cvatUser.id)     return res.status(403).json({ error: 'cette demande ne vous appartient pas' });
    if (r.status !== 'approved')                return res.status(403).json({ error: 'demande non approuvée' });
    if (r.expires_at && new Date(r.expires_at) < new Date()) {
      return res.status(403).json({ error: 'autorisation expirée — soumets une nouvelle demande' });
    }

    await streamExportZip(res, r.scope, { id: req.cvatUser.id }, 'chercheur-approved');
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
