#!/usr/bin/env node
/**
 * Génère nginx/static/ocean-theme.css depuis les fichiers de thème frontend.
 * À relancer après toute modification de :
 *   frontend/src/shared/theme/colors.ts
 *   frontend/src/shared/theme/spacing.ts
 *   frontend/src/shared/theme/typography.ts
 *
 * Usage : node scripts/generate-studio-theme.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(ROOT, 'nginx/static/ocean-theme.css');

/* ── Lecture + nettoyage de la syntaxe TypeScript ──────────────────────────── */
function extractObject(relPath) {
  const src = fs.readFileSync(path.join(ROOT, relPath), 'utf8')
    .replace(/import[^;]+;/g, '')           // import ... ;
    .replace(/:\s*Record<[^>]+>/g, '')       // : Record<K, V>
    .replace(/:\s*TextStyle\b/g, '')         // : TextStyle
    .replace(/\bas\s+const\b/g, '')          // as const
    .replace(/export\s+const\s+\w+\s*=\s*/, 'var _x = ');  // export const X =

  try {
    return new Function(src + '; return _x;')();
  } catch (e) {
    console.error(`Erreur lors du parsing de ${relPath} :`, e.message);
    process.exit(1);
  }
}

/* ── Conversion camelCase → kebab-case ─────────────────────────────────────── */
function toKebab(str) {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/* ── Aplatissement récursif d'un objet en CSS custom properties ────────────── */
function flattenVars(obj, prefix) {
  const vars = {};
  for (const [key, val] of Object.entries(obj)) {
    const cssKey = `${prefix}-${toKebab(key)}`;
    if (val !== null && typeof val === 'object') {
      Object.assign(vars, flattenVars(val, cssKey));
    } else if (typeof val === 'number') {
      vars[cssKey] = `${val}px`;
    } else if (typeof val === 'string') {
      vars[cssKey] = val;
    }
  }
  return vars;
}

/* ── Extraction spécifique de la typographie ────────────────────────────────── */
function extractTypographyVars(typography) {
  const vars = {};
  let fontFamily = null;

  for (const [variant, styles] of Object.entries(typography)) {
    if (styles.fontSize)    vars[`--ocean-font-size-${toKebab(variant)}`]   = `${styles.fontSize}px`;
    if (styles.fontWeight)  vars[`--ocean-font-weight-${toKebab(variant)}`] = String(styles.fontWeight).replace(/'/g, '');
    if (styles.lineHeight)  vars[`--ocean-line-height-${toKebab(variant)}`] = `${styles.lineHeight}px`;
    if (styles.fontFamily && !fontFamily) fontFamily = styles.fontFamily;
  }

  if (fontFamily) {
    vars['--ocean-font-family'] = `'${fontFamily}', -apple-system, BlinkMacSystemFont, sans-serif`;
  }

  return vars;
}

/* ── Assemblage ─────────────────────────────────────────────────────────────── */
const colors     = extractObject('frontend/src/shared/theme/colors.ts');
const spacing    = extractObject('frontend/src/shared/theme/spacing.ts');
const typography = extractObject('frontend/src/shared/theme/typography.ts');

const vars = {
  ...flattenVars(colors,  '--ocean'),
  ...flattenVars(spacing, '--ocean-spacing'),
  ...extractTypographyVars(typography),
};

const lines = [
  '/* AUTO-GÉNÉRÉ — ne pas modifier manuellement.',
  ' * Source : frontend/src/shared/theme/{colors,spacing,typography}.ts',
  ' * Régénérer : node scripts/generate-studio-theme.js',
  ' */',
  ':root {',
  ...Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`),
  '}',
  '',
];

fs.writeFileSync(OUT, lines.join('\n'));
console.log(`✓ ${OUT} — ${Object.keys(vars).length} variables générées`);
