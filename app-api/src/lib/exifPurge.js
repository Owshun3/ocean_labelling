'use strict';

const { pool } = require('../db');

const DEFAULT_RETENTION_DAYS = 90;

async function getRetentionDays() {
  try {
    const { rows } = await pool.query(
      "SELECT value FROM app_settings WHERE key = 'raw_exif_retention_days'"
    );
    const n = Number(rows[0]?.value);
    if (!Number.isInteger(n) || n < 0) return DEFAULT_RETENTION_DAYS;
    return n;
  } catch {
    return DEFAULT_RETENTION_DAYS;
  }
}

// Conserve uniquement les colonnes structurées (lat/lng/taken_at/camera/...)
// nécessaires aux exports scientifiques et à l'UI curator. Le blob `raw_exif`
// JSONB est mis à NULL après expiration : il peut contenir des champs sensibles
// (numéro de série appareil photo, logiciels, etc.) dont la conservation longue
// durée n'a pas de finalité métier justifiée (RGPD art. 5.1.e — minimisation).
async function runExifPurge() {
  const days = await getRetentionDays();
  if (days === 0) return { purged: 0, retentionDays: 0 };
  const { rowCount } = await pool.query(`
    UPDATE media_metadata
       SET raw_exif = NULL
     WHERE raw_exif IS NOT NULL
       AND created_at < NOW() - ($1 || ' days')::interval
  `, [String(days)]);
  return { purged: rowCount ?? 0, retentionDays: days };
}

let intervalHandle = null;
function startScheduler(intervalMs = 24 * 60 * 60 * 1000) {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    runExifPurge()
      .then((r) => { if (r.purged > 0) console.log('[exifPurge] cleared raw_exif on', r.purged, 'rows (retention', r.retentionDays, 'days)'); })
      .catch((err) => console.warn('[exifPurge] scheduled run failed:', err.message));
  }, intervalMs);
  setTimeout(() => {
    runExifPurge()
      .then((r) => console.log('[exifPurge] initial run:', r))
      .catch((err) => console.warn('[exifPurge] initial run failed:', err.message));
  }, 90_000);
}

module.exports = { runExifPurge, startScheduler };
