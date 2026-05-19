'use strict';

const express = require('express');
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');
const { pool } = require('../../db');
const { recordAction } = require('../../lib/auditLog');
const {
  ALLOWED_LOGO_MIME, extForMime, logoPath, ensureLogoDirSync, removeAllLogos,
} = require('../../lib/logoStorage');

const router = express.Router();
ensureLogoDirSync();

const TMP_DIR = path.join(process.env.VIDEO_STORAGE_ROOT || '/data/videos', '.tmp');
const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 Mo — un logo n'a pas vocation à être lourd.

const tmpStorage = multer.diskStorage({
  destination: (_req, _file, cb) => { fs.mkdirSync(TMP_DIR, { recursive: true }); cb(null, TMP_DIR); },
  filename: (_req, file, cb) => cb(null, `logo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
});

const upload = multer({
  storage: tmpStorage,
  limits: { fileSize: LOGO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_LOGO_MIME.has(file.mimetype)) return cb(new Error(`Format non supporté : ${file.mimetype}`));
    cb(null, true);
  },
}).single('logo');

router.post('/', (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `Fichier trop volumineux (max ${LOGO_MAX_BYTES / 1024 / 1024} Mo).` });
      }
      return res.status(400).json({ error: err.message });
    }
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'champ "logo" requis' });

    const ext = extForMime(file.mimetype);
    const filename = `logo.${ext}`;

    try {
      await removeAllLogos();
      await fs.promises.rename(file.path, logoPath(filename));

      await pool.query(`
        INSERT INTO app_settings (key, value) VALUES ('platform.logo_filename', $1)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `, [filename]);

      recordAction(req.cvatUser.id, 'logo.uploaded', {
        payload: { filename, size_bytes: file.size, content_type: file.mimetype },
      });
      res.status(201).json({ filename, size_bytes: file.size, content_type: file.mimetype });
    } catch (errSave) {
      try { await fs.promises.unlink(file.path); } catch {}
      res.status(500).json({ error: errSave.message });
    }
  });
});

router.delete('/', async (req, res) => {
  try {
    await removeAllLogos();
    await pool.query(`UPDATE app_settings SET value = '' WHERE key = 'platform.logo_filename'`);
    recordAction(req.cvatUser.id, 'logo.deleted', { payload: {} });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
