// Rate-limit progressif des tentatives de login, par username (per-account).
//
// Pourquoi pas per-IP : sur le LAN UPF les IPs sont partagees (NAT, salles TP),
// per-IP genererait trop de faux positifs. Per-account = on bloque le compte
// Bob s'il y a trop d'echecs sur lui, peu importe l'IP source. Tradeoff : un
// attaquant peut volontairement locker un compte connu (DoS). Risque accepte
// vu la petite echelle interne ; l'admin peut reset un compte via DELETE en BD
// si besoin.
//
// Schedule : on n'enclenche pas de lockout dur sous 5 echecs (laisse le user
// honnete se reprendre). A partir de 5, on bloque par paliers exponentiels.

const { pool } = require('../db');

const LOCKOUT_SCHEDULE = [
  // [seuil cumule de fails, duree du lockout]
  [5,   30 * 1000],         // 30s
  [10,  5  * 60 * 1000],    // 5 min
  [15,  30 * 60 * 1000],    // 30 min
  [20,  60 * 60 * 1000],    // 1h
];

function lockoutDurationFor(attempts) {
  let duration = 0;
  for (const [threshold, ms] of LOCKOUT_SCHEDULE) {
    if (attempts >= threshold) duration = ms;
  }
  return duration;
}

async function getLockoutState(username) {
  const { rows } = await pool.query(
    'SELECT failed_attempts, locked_until FROM login_lockouts WHERE username = $1',
    [username],
  );
  if (rows.length === 0) return { attempts: 0, retryAfterMs: 0 };
  const row = rows[0];
  const lockedUntilMs = row.locked_until ? new Date(row.locked_until).getTime() : 0;
  const retryAfterMs = Math.max(0, lockedUntilMs - Date.now());
  return { attempts: row.failed_attempts, retryAfterMs };
}

async function recordFailure(username) {
  const res = await pool.query(
    `INSERT INTO login_lockouts (username, failed_attempts, last_failed_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (username) DO UPDATE
       SET failed_attempts = login_lockouts.failed_attempts + 1,
           last_failed_at  = NOW()
     RETURNING failed_attempts`,
    [username],
  );
  const newCount = res.rows[0].failed_attempts;
  const lockMs = lockoutDurationFor(newCount);
  if (lockMs > 0) {
    await pool.query(
      `UPDATE login_lockouts
         SET locked_until = NOW() + ($1 || ' milliseconds')::INTERVAL
       WHERE username = $2`,
      [lockMs, username],
    );
  }
  return { attempts: newCount, retryAfterMs: lockMs };
}

async function clearFailures(username) {
  await pool.query('DELETE FROM login_lockouts WHERE username = $1', [username]);
}

module.exports = {
  getLockoutState,
  recordFailure,
  clearFailures,
  LOCKOUT_SCHEDULE,
};
