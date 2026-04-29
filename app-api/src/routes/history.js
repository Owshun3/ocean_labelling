const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /upload-history — record an upload batch
router.post('/', requireAuth, (req, res) => {
  const { cvat_task_id, batch_name, file_count } = req.body;
  if (!cvat_task_id || !batch_name) {
    return res.status(400).json({ error: 'cvat_task_id and batch_name required' });
  }

  const result = db.prepare(`
    INSERT INTO upload_history (cvat_user_id, cvat_task_id, batch_name, file_count)
    VALUES (?, ?, ?, ?)
  `).run(req.cvatUser.id, cvat_task_id, batch_name, file_count || 0);

  res.status(201).json({ id: result.lastInsertRowid });
});

// GET /upload-history — list batches (all for admin, own for others)
router.get('/', requireAuth, (req, res) => {
  const user = req.cvatUser;
  const rows = user.is_superuser || user.is_staff
    ? db.prepare('SELECT * FROM upload_history ORDER BY created_at DESC LIMIT 200').all()
    : db.prepare('SELECT * FROM upload_history WHERE cvat_user_id = ? ORDER BY created_at DESC LIMIT 100').all(user.id);

  res.json({ results: rows });
});

module.exports = router;
