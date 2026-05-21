'use strict';

const fs   = require('fs');
const path = require('path');

const HELP_DIR = path.join(process.env.VIDEO_STORAGE_ROOT || '/data/videos', '.help');

const ALLOWED_VIDEO_MIME = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

function extForMime(mime) {
  if (mime === 'video/mp4')       return 'mp4';
  if (mime === 'video/webm')      return 'webm';
  if (mime === 'video/quicktime') return 'mov';
  return null;
}

function mimeForExt(filename) {
  const m = /\.([^.]+)$/.exec(filename || '');
  const ext = m?.[1]?.toLowerCase();
  if (ext === 'mp4')  return 'video/mp4';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mov')  return 'video/quicktime';
  return 'application/octet-stream';
}

function helpVideoPath(filename) {
  const safe = path.basename(filename);
  return path.join(HELP_DIR, safe);
}

function ensureHelpDirSync() {
  fs.mkdirSync(HELP_DIR, { recursive: true });
}

async function removeAllHelpVideos() {
  try {
    const files = await fs.promises.readdir(HELP_DIR);
    await Promise.all(files.map((f) => fs.promises.unlink(path.join(HELP_DIR, f)).catch(() => {})));
  } catch (err) { if (err.code !== 'ENOENT') throw err; }
}

module.exports = {
  HELP_DIR,
  ALLOWED_VIDEO_MIME,
  extForMime, mimeForExt,
  helpVideoPath, ensureHelpDirSync, removeAllHelpVideos,
};
