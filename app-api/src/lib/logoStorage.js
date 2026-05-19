'use strict';

const fs   = require('fs');
const path = require('path');

const LOGO_DIR = path.join(process.env.VIDEO_STORAGE_ROOT || '/data/videos', '.logo');

const ALLOWED_LOGO_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
]);

function extForMime(mime) {
  if (mime === 'image/png')      return 'png';
  if (mime === 'image/jpeg')     return 'jpg';
  if (mime === 'image/webp')     return 'webp';
  if (mime === 'image/svg+xml')  return 'svg';
  return null;
}

function mimeForExt(filename) {
  const m = /\.([^.]+)$/.exec(filename || '');
  const ext = m?.[1]?.toLowerCase();
  if (ext === 'png')  return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'svg')  return 'image/svg+xml';
  return 'application/octet-stream';
}

function logoPath(filename) {
  const safe = path.basename(filename);
  return path.join(LOGO_DIR, safe);
}

function ensureLogoDirSync() {
  fs.mkdirSync(LOGO_DIR, { recursive: true });
}

async function removeAllLogos() {
  try {
    const files = await fs.promises.readdir(LOGO_DIR);
    await Promise.all(files.map((f) => fs.promises.unlink(path.join(LOGO_DIR, f)).catch(() => {})));
  } catch (err) { if (err.code !== 'ENOENT') throw err; }
}

module.exports = {
  LOGO_DIR,
  ALLOWED_LOGO_MIME,
  extForMime, mimeForExt,
  logoPath, ensureLogoDirSync, removeAllLogos,
};
