'use strict';

const express = require('express');
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');
const { recordAction } = require('../lib/auditLog');
const {
  TMP_DIR,
  ALLOWED_VIDEO_MIME, POSTER_MIME,
  videoPath, posterPath,
  ensureRootSync, ensureVideoDir, deleteVideoFiles,
} = require('../lib/videoStorage');

const router = express.Router();
ensureRootSync();

const DEFAULT_MAX_BYTES = 200 * 1024 * 1024;

async function getUploadMaxBytes() {
  try {
    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'upload_max_bytes'");
    const n = Number(rows[0]?.value);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
  } catch { return DEFAULT_MAX_BYTES; }
}

const tmpStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TMP_DIR),
  filename: (_req, file, cb) => {
    const safe = (file.originalname || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
  },
});

function uploadHandler(req, res, next) {
  getUploadMaxBytes().then((max) => {
    const upload = multer({
      storage: tmpStorage,
      limits: { fileSize: max },
      fileFilter: (_r, file, cb) => {
        if (file.fieldname === 'video') {
          if (!ALLOWED_VIDEO_MIME.has(file.mimetype)) {
            return cb(new Error(`type vidéo non supporté : ${file.mimetype}`));
          }
        } else if (file.fieldname === 'poster') {
          if (file.mimetype !== POSTER_MIME) {
            return cb(new Error('poster doit être image/jpeg'));
          }
        } else {
          return cb(new Error(`champ inattendu : ${file.fieldname}`));
        }
        cb(null, true);
      },
    }).fields([{ name: 'video', maxCount: 1 }, { name: 'poster', maxCount: 1 }]);

    upload(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ error: `Fichier trop volumineux (max ${Math.round(max / 1024 / 1024)} Mo).` });
        }
        return res.status(400).json({ error: err.message });
      }
      next();
    });
  }).catch(next);
}

function parseMetadataBody(raw) {
  let parsed = {};
  if (typeof raw === 'string')                  { try { parsed = JSON.parse(raw); } catch {} }
  else if (raw && typeof raw === 'object')      { parsed = raw; }
  const dur = Number(parsed.duration_seconds);
  const w   = Number(parsed.width);
  const h   = Number(parsed.height);
  return {
    duration_seconds: Number.isFinite(dur) && dur > 0 ? dur : null,
    width:  Number.isInteger(w) && w > 0 ? w : null,
    height: Number.isInteger(h) && h > 0 ? h : null,
  };
}

async function fetchAppRole(cvatUserId) {
  const { rows } = await pool.query('SELECT role FROM user_roles WHERE cvat_user_id = $1', [cvatUserId]);
  return rows[0]?.role || 'annotator';
}

async function isModeratorOrAbove(cvatUser) {
  if (cvatUser.is_superuser || cvatUser.is_staff) return true;
  return ['admin', 'moderator'].includes(await fetchAppRole(cvatUser.id));
}

router.post('/', requireAuth, uploadHandler, async (req, res) => {
  const videoFile  = req.files?.video?.[0];
  const posterFile = req.files?.poster?.[0] || null;
  if (!videoFile) return res.status(400).json({ error: 'champ "video" requis' });

  const meta     = parseMetadataBody(req.body?.metadata);
  const filename = (videoFile.originalname || 'video').slice(0, 200);

  const client = await pool.connect();
  let videoId = null;
  try {
    await client.query('BEGIN');
    const ins = await client.query(`
      INSERT INTO user_videos
        (uploader_id, filename, content_type, size_bytes, duration_seconds, width, height, has_poster)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      req.cvatUser.id, filename, videoFile.mimetype, videoFile.size,
      meta.duration_seconds, meta.width, meta.height, !!posterFile,
    ]);
    videoId = ins.rows[0].id;

    await client.query(`
      INSERT INTO media_moderation (media_kind, video_id, uploader_id, status)
      VALUES ('video', $1, $2, 'pending')
    `, [videoId, req.cvatUser.id]);

    await ensureVideoDir(videoId);
    await fs.promises.rename(videoFile.path, videoPath(videoId, videoFile.mimetype));
    if (posterFile) {
      await fs.promises.rename(posterFile.path, posterPath(videoId));
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    try { await fs.promises.unlink(videoFile.path); } catch {}
    if (posterFile) { try { await fs.promises.unlink(posterFile.path); } catch {} }
    if (videoId) await deleteVideoFiles(videoId);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }

  recordAction(req.cvatUser.id, 'video.uploaded', {
    targetType: 'video', targetId: videoId,
    payload: { filename, size_bytes: videoFile.size, content_type: videoFile.mimetype },
  });

  res.status(201).json({
    id: videoId, filename,
    content_type: videoFile.mimetype, size_bytes: videoFile.size,
    duration_seconds: meta.duration_seconds, width: meta.width, height: meta.height,
    has_poster: !!posterFile,
  });
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT v.id, v.filename, v.content_type, v.size_bytes, v.duration_seconds,
             v.width, v.height, v.has_poster, v.uploaded_at,
             m.status         AS moderation_status,
             m.review_comment AS moderation_review_comment,
             m.reviewed_at    AS moderation_reviewed_at,
             EXISTS (
               SELECT 1 FROM moderation_contestations c
               WHERE c.media_kind = 'video' AND c.video_id = v.id AND c.resolved_at IS NULL
             ) AS contestation_pending
      FROM user_videos v
      LEFT JOIN media_moderation m
        ON m.media_kind = 'video' AND m.video_id = v.id
      WHERE v.uploader_id = $1 AND v.deleted_at IS NULL
      ORDER BY v.uploaded_at DESC
      LIMIT 200
    `, [req.cvatUser.id]);
    res.json({ results: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function loadVideo(videoId) {
  const { rows } = await pool.query(
    'SELECT * FROM user_videos WHERE id = $1 AND deleted_at IS NULL',
    [videoId]
  );
  return rows[0] || null;
}

async function authorizeRead(req, res, videoId) {
  const video = await loadVideo(videoId);
  if (!video) { res.status(404).json({ error: 'not found' }); return null; }
  const isUploader = video.uploader_id === req.cvatUser.id;
  if (isUploader) return video;
  if (await isModeratorOrAbove(req.cvatUser)) return video;
  res.status(403).json({ error: 'forbidden' });
  return null;
}

router.get('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  const video = await authorizeRead(req, res, id);
  if (!video) return;
  res.json(video);
});

router.get('/:id/stream', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  const video = await authorizeRead(req, res, id);
  if (!video) return;

  const filePath = videoPath(id, video.content_type);
  let stat;
  try { stat = await fs.promises.stat(filePath); }
  catch { return res.status(404).json({ error: 'file missing' }); }

  const size = stat.size;
  const range = req.headers.range;

  res.setHeader('Content-Type', video.content_type);
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

router.get('/:id/poster', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  const video = await authorizeRead(req, res, id);
  if (!video) return;
  if (!video.has_poster) return res.status(404).json({ error: 'no poster' });
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  fs.createReadStream(posterPath(id)).pipe(res);
});

router.delete('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

  const video = await loadVideo(id);
  if (!video) return res.status(404).json({ error: 'not found' });
  if (video.uploader_id !== req.cvatUser.id && !(await isModeratorOrAbove(req.cvatUser))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    await pool.query('UPDATE user_videos SET deleted_at = NOW() WHERE id = $1', [id]);
    await deleteVideoFiles(id);
    recordAction(req.cvatUser.id, 'video.deleted', { targetType: 'video', targetId: id });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
