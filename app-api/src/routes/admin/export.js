'use strict';

const express = require('express');
const { pool } = require('../../db');
const { parseFilters, computePreview, streamExportZip } = require('../../lib/datumaroExport');

const router = express.Router();

router.post('/preview', async (req, res) => {
  const filters = parseFilters(req.body);
  try {
    const preview = await computePreview(filters);
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/facets', async (_req, res) => {
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

router.post('/run', async (req, res) => {
  const filters = parseFilters(req.body);
  await streamExportZip(res, filters, { id: req.cvatUser.id }, 'admin');
});

module.exports = router;
