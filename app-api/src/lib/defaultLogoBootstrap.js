'use strict';

const fs   = require('fs');
const path = require('path');
const { pool } = require('../db');
const {
  LOGO_DIR, ensureLogoDirSync, logoPath, mimeForExt, ALLOWED_LOGO_MIME,
} = require('./logoStorage');

const ASSETS_DIR = path.resolve(__dirname, '../../assets');

// Cherche un fichier `default-logo.<ext>` dans /app/assets (committé dans le repo,
// copié dans l'image par le Dockerfile). Retourne le nom de fichier ou null.
function findBundledDefaultLogo() {
  try {
    const files = fs.readdirSync(ASSETS_DIR);
    return files.find((f) => /^default-logo\.(png|jpe?g|webp|svg)$/i.test(f)) || null;
  } catch {
    return null;
  }
}

// Au premier démarrage (fresh install), copie le logo bundlé vers le volume
// persistant `/data/videos/.logo/` et renseigne le setting `platform.logo_filename`.
// Idempotent : ne touche à rien si un logo a déjà été configuré par l'admin.
async function seedDefaultLogo() {
  const bundled = findBundledDefaultLogo();
  if (!bundled) return;

  const ext = path.extname(bundled).slice(1).toLowerCase();
  const mime = mimeForExt(`x.${ext}`);
  if (!ALLOWED_LOGO_MIME.has(mime)) return;

  ensureLogoDirSync();

  // Si l'admin a déjà configuré un logo (setting non-vide OU fichier déjà présent),
  // on ne touche à rien : ses choix sont prioritaires sur le default bundlé.
  const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'platform.logo_filename'`);
  const currentSetting = rows[0]?.value;
  if (currentSetting && currentSetting.trim().length > 0) return;

  const existing = fs.readdirSync(LOGO_DIR).filter((f) => !f.startsWith('.'));
  if (existing.length > 0) return;

  const targetName = `logo.${ext}`;
  const dest = logoPath(targetName);
  fs.copyFileSync(path.join(ASSETS_DIR, bundled), dest);

  await pool.query(`
    INSERT INTO app_settings (key, value) VALUES ('platform.logo_filename', $1)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [targetName]);

  console.log(`[app-api] default logo seeded: ${bundled} -> ${targetName}`);
}

module.exports = { seedDefaultLogo };
