'use strict';

const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/:taskId/metadata', requireAuth, async (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: 'invalid taskId' });
  try {
    const { rows } = await pool.query(
      `SELECT cvat_task_id, gps_latitude, gps_longitude, taken_at,
              camera_make, camera_model, image_width, image_height, created_at
       FROM media_metadata WHERE cvat_task_id = $1`,
      [taskId],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'metadata not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:taskId/metadata', requireAuth, async (req, res) => {
  const taskId = Number(req.params.taskId);
  if (!Number.isFinite(taskId)) return res.status(400).json({ error: 'invalid taskId' });

  const body = req.body || {};
  const lat   = typeof body.gps_latitude  === 'number' ? body.gps_latitude  : null;
  const lng   = typeof body.gps_longitude === 'number' ? body.gps_longitude : null;
  const taken = typeof body.taken_at      === 'string' ? body.taken_at      : null;
  const make  = typeof body.camera_make   === 'string' ? body.camera_make.slice(0, 120) : null;
  const model = typeof body.camera_model  === 'string' ? body.camera_model.slice(0, 120) : null;
  const w     = Number.isFinite(body.image_width)  ? Number(body.image_width)  : null;
  const h     = Number.isFinite(body.image_height) ? Number(body.image_height) : null;
  const raw   = body.raw_exif && typeof body.raw_exif === 'object' ? body.raw_exif : null;

  try {
    const { rows } = await pool.query(`
      INSERT INTO media_metadata
        (cvat_task_id, gps_latitude, gps_longitude, taken_at,
         camera_make, camera_model, image_width, image_height, raw_exif)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (cvat_task_id) DO UPDATE SET
        gps_latitude  = EXCLUDED.gps_latitude,
        gps_longitude = EXCLUDED.gps_longitude,
        taken_at      = EXCLUDED.taken_at,
        camera_make   = EXCLUDED.camera_make,
        camera_model  = EXCLUDED.camera_model,
        image_width   = EXCLUDED.image_width,
        image_height  = EXCLUDED.image_height,
        raw_exif      = EXCLUDED.raw_exif
      RETURNING *
    `, [taskId, lat, lng, taken, make, model, w, h, raw ? JSON.stringify(raw) : null]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
