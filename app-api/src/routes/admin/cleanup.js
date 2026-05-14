'use strict';

const express = require('express');
const { pool } = require('../../db');
const { runCleanup } = require('../../lib/cleanup');

const router = express.Router();

router.post('/run-now', async (_req, res) => {
  try {
    const result = await runCleanup();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status', async (_req, res) => {
  try {
    const { rows: queue } = await pool.query(`
      SELECT COUNT(*) AS pending_count
      FROM media_moderation mm
      WHERE mm.status = 'rejected'
        AND mm.binaries_deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM moderation_contestations c
          WHERE c.cvat_task_id = mm.cvat_task_id
            AND c.resolved_at IS NULL
        )
    `);
    const { rows: last } = await pool.query(`
      SELECT created_at, payload
      FROM admin_actions
      WHERE action = 'media.auto_deleted'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    res.json({
      queue_total: Number(queue[0].pending_count),
      last_run: last[0] ? { at: last[0].created_at, payload: last[0].payload } : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
