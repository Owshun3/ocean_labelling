'use strict';

const express = require('express');
const fs      = require('fs');
const { pool } = require('../db');
const { logoPath, mimeForExt } = require('../lib/logoStorage');

const router = express.Router();

async function loadFilename() {
  try {
    const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'platform.logo_filename'`);
    const v = rows[0]?.value;
    return (typeof v === 'string' && v.trim().length > 0) ? v.trim() : null;
  } catch { return null; }
}

// Public (pas d'auth) : le logo s'affiche aussi sur la page de login.
router.get('/stream', async (_req, res) => {
  const filename = await loadFilename();
  if (!filename) return res.status(404).json({ error: 'no logo' });
  const filePath = logoPath(filename);
  try {
    const stat = await fs.promises.stat(filePath);
    res.setHeader('Content-Type', mimeForExt(filename));
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'file missing' });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
