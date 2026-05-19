'use strict';

const { pool } = require('../db');

// Charge groupes + définitions actives, structurés pour validation et UI.
async function loadDefinitions(client = pool) {
  const { rows: groups } = await client.query(`
    SELECT id, key, label, is_required, is_exclusive, sort_order
    FROM species_tag_groups
    ORDER BY sort_order ASC, id ASC
  `);
  const { rows: defs } = await client.query(`
    SELECT id, group_id, value, label, sort_order, archived_at
    FROM species_tag_definitions
    WHERE archived_at IS NULL
    ORDER BY sort_order ASC, id ASC
  `);
  const byGroup = new Map(groups.map((g) => [g.id, { ...g, definitions: [] }]));
  for (const d of defs) {
    const g = byGroup.get(d.group_id);
    if (g) g.definitions.push(d);
  }
  return Array.from(byGroup.values());
}

// Valide un set de tags contre la taxonomie : retourne { ok, error }.
// - Tous les tags doivent référencer une valeur active.
// - Les groupes is_required → au moins 1 valeur dans tags.
// - Les groupes is_exclusive → au plus 1 valeur dans tags.
async function validateTags(tags, client = pool) {
  if (!Array.isArray(tags)) return { ok: false, error: 'tags doit être un tableau' };
  const groups = await loadDefinitions(client);

  // Map value → groupKey pour lookup rapide
  const valueToGroup = new Map();
  for (const g of groups) {
    for (const d of g.definitions) valueToGroup.set(d.value, g);
  }

  // 1. Tags inconnus
  const unknown = tags.filter((t) => !valueToGroup.has(t));
  if (unknown.length > 0) {
    return { ok: false, error: `Tags inconnus ou archivés : ${unknown.join(', ')}` };
  }

  // 2. Compte par groupe
  const countByGroup = new Map();
  for (const t of tags) {
    const g = valueToGroup.get(t);
    countByGroup.set(g.id, (countByGroup.get(g.id) || 0) + 1);
  }

  // 3. is_required + is_exclusive
  for (const g of groups) {
    const n = countByGroup.get(g.id) || 0;
    if (g.is_required && n === 0) {
      return { ok: false, error: `Le groupe « ${g.label} » est obligatoire — choisis au moins une valeur.` };
    }
    if (g.is_exclusive && n > 1) {
      return { ok: false, error: `Le groupe « ${g.label} » est exclusif — une seule valeur autorisée.` };
    }
  }

  return { ok: true };
}

module.exports = { loadDefinitions, validateTags };
