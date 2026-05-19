'use strict';

const express = require('express');
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');
const { pool } = require('../../db');
const { recordAction } = require('../../lib/auditLog');
const {
  ALLOWED_VIDEO_MIME, extForMime, helpVideoPath, ensureHelpDirSync, removeAllHelpVideos,
} = require('../../lib/helpVideoStorage');

const router = express.Router();
ensureHelpDirSync();

const TMP_DIR = path.join(process.env.VIDEO_STORAGE_ROOT || '/data/videos', '.tmp');

const tmpStorage = multer.diskStorage({
  destination: (_req, _file, cb) => { fs.mkdirSync(TMP_DIR, { recursive: true }); cb(null, TMP_DIR); },
  filename: (_req, file, cb) => cb(null, `help-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
});

const HELP_MAX_BYTES = 500 * 1024 * 1024; // 500 Mo — usage interne, taille raisonnable.

const upload = multer({
  storage: tmpStorage,
  limits: { fileSize: HELP_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_VIDEO_MIME.has(file.mimetype)) return cb(new Error(`Type vidéo non supporté : ${file.mimetype}`));
    cb(null, true);
  },
}).single('video');

router.post('/', (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `Fichier trop volumineux (max ${HELP_MAX_BYTES / 1024 / 1024} Mo).` });
      }
      return res.status(400).json({ error: err.message });
    }
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'champ "video" requis' });

    const ext = extForMime(file.mimetype);
    const filename = `help-video.${ext}`;

    try {
      // Remplace l'ancienne (peu importe son extension).
      await removeAllHelpVideos();
      await fs.promises.rename(file.path, helpVideoPath(filename));

      await pool.query(`
        INSERT INTO app_settings (key, value) VALUES ('platform.help_video_filename', $1)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `, [filename]);

      recordAction(req.cvatUser.id, 'help_video.uploaded', {
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
    await removeAllHelpVideos();
    await pool.query(`UPDATE app_settings SET value = '' WHERE key = 'platform.help_video_filename'`);
    recordAction(req.cvatUser.id, 'help_video.deleted', { payload: {} });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
