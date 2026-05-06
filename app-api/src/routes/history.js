const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /upload-history — record an upload batch + auto-create pending moderation entry
router.post('/', requireAuth, async (req, res) => {
  const { cvat_task_id, batch_name, file_count } = req.body;
  if (!cvat_task_id || !batch_name) {
    return res.status(400).json({ error: 'cvat_task_id and batch_name required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      INSERT INTO upload_history (cvat_user_id, cvat_task_id, batch_name, file_count)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [req.cvatUser.id, cvat_task_id, batch_name, file_count || 0]);

    await client.query(`
      INSERT INTO media_moderation (cvat_task_id, uploader_id, status)
      VALUES ($1, $2, 'pending')
      ON CONFLICT (cvat_task_id) DO NOTHING
    `, [cvat_task_id, req.cvatUser.id]);

    await client.query('COMMIT');
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /upload-history — all batches for admin/staff, own batches for others
router.get('/', requireAuth, async (req, res) => {
  const user = req.cvatUser;
  try {
    const { rows } = user.is_superuser || user.is_staff
      ? await pool.query('SELECT * FROM upload_history ORDER BY created_at DESC LIMIT 200')
      : await pool.query('SELECT * FROM upload_history WHERE cvat_user_id = $1 ORDER BY created_at DESC LIMIT 100', [user.id]);

    res.json({ results: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
