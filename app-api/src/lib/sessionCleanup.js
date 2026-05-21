'use strict';

const { pool } = require('../db');

async function runSessionCleanup() {
  const { rowCount } = await pool.query(`DELETE FROM app_sessions WHERE expires_at < NOW()`);
  return { deleted: rowCount ?? 0 };
}

let intervalHandle = null;
function startScheduler(intervalMs = 24 * 60 * 60 * 1000) {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    runSessionCleanup()
      .then((r) => { if (r.deleted > 0) console.log('[sessionCleanup] purged expired sessions:', r); })
      .catch((err) => console.warn('[sessionCleanup] scheduled run failed:', err.message));
  }, intervalMs);
  setTimeout(() => {
    runSessionCleanup()
      .then((r) => console.log('[sessionCleanup] initial run:', r))
      .catch((err) => console.warn('[sessionCleanup] initial run failed:', err.message));
  }, 60_000);
}

module.exports = { runSessionCleanup, startScheduler };
