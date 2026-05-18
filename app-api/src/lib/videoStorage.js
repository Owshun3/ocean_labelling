'use strict';

const fs = require('fs');
const path = require('path');

const VIDEO_ROOT = process.env.VIDEO_STORAGE_ROOT || '/data/videos';
const TMP_DIR    = path.join(VIDEO_ROOT, '.tmp');

const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);
const POSTER_MIME = 'image/jpeg';
const POSTER_FILENAME = 'poster.jpg';

function extForMime(mime) {
  if (mime === 'video/mp4')       return 'mp4';
  if (mime === 'video/webm')      return 'webm';
  if (mime === 'video/quicktime') return 'mov';
  return 'bin';
}

function videoDir(id)            { return path.join(VIDEO_ROOT, String(id)); }
function videoPath(id, mime)     { return path.join(videoDir(id), `source.${extForMime(mime)}`); }
function posterPath(id)          { return path.join(videoDir(id), POSTER_FILENAME); }

function ensureRootSync() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

async function ensureVideoDir(id) {
  await fs.promises.mkdir(videoDir(id), { recursive: true });
}

async function deleteVideoFiles(id) {
  try { await fs.promises.rm(videoDir(id), { recursive: true, force: true }); }
  catch (err) { console.warn(`[videoStorage] cleanup ${id} failed:`, err.message); }
}

module.exports = {
  VIDEO_ROOT, TMP_DIR,
  ALLOWED_VIDEO_MIME, POSTER_MIME,
  extForMime, videoDir, videoPath, posterPath,
  ensureRootSync, ensureVideoDir, deleteVideoFiles,
};
