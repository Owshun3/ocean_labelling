'use strict';

const express = require('express');
const fs      = require('fs');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { helpVideoPath, mimeForExt } = require('../lib/helpVideoStorage');

const router = express.Router();

async function loadFilename() {
  try {
    const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'platform.help_video_filename'`);
    const v = rows[0]?.value;
    return (typeof v === 'string' && v.trim().length > 0) ? v.trim() : null;
  } catch { return null; }
}

router.get('/info', requireAuth, async (_req, res) => {
  const filename = await loadFilename();
  if (!filename) return res.json({ available: false });
  try {
    const stat = await fs.promises.stat(helpVideoPath(filename));
    res.json({
      available: true,
      filename,
      content_type: mimeForExt(filename),
      size_bytes:   stat.size,
      uploaded_at:  stat.mtime.toISOString(),
    });
  } catch (err) {
    if (err.code === 'ENOENT') return res.json({ available: false });
    res.status(500).json({ error: err.message });
  }
});

router.get('/stream', requireAuth, async (req, res) => {
  const filename = await loadFilename();
  if (!filename) return res.status(404).json({ error: 'no help video' });

  const filePath = helpVideoPath(filename);
  let stat;
  try { stat = await fs.promises.stat(filePath); }
  catch { return res.status(404).json({ error: 'file missing' }); }

  const size = stat.size;
  const range = req.headers.range;

  res.setHeader('Content-Type', mimeForExt(filename));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (!range) {
    res.setHeader('Content-Length', size);
    return fs.createReadStream(filePath).pipe(res);
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) {
    res.status(416).setHeader('Content-Range', `bytes */${size}`);
    return res.end();
  }
  const start = match[1] === '' ? Math.max(size - Number(match[2] || 0), 0) : Number(match[1]);
  const end   = match[2] === '' ? size - 1 : Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= size) {
    res.status(416).setHeader('Content-Range', `bytes */${size}`);
    return res.end();
  }
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  res.setHeader('Content-Length', end - start + 1);
  fs.createReadStream(filePath, { start, end }).pipe(res);
});

module.exports = router;
