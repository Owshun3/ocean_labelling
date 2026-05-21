'use strict';

const express = require('express');
const axios = require('axios');
const { pool } = require('../db');
const { requireAuth, requireCuratorOrAbove, requireAdmin, isAppAdmin } = require('../middleware/auth');
const { fetchActionsTotals } = require('../lib/userStats');
const { cvatGet } = require('../lib/cvatAdmin');
const { recordAction } = require('../lib/auditLog');

async function decorateProposers(species) {
  const ids = [...new Set(species.map((s) => s.proposed_by).filter(Boolean))];
  if (ids.length === 0) return species;
  const totals = await fetchActionsTotals(ids);
  const usernames = {};
  await Promise.all(ids.map(async (id) => {
    try {
      const r = await cvatGet(`/users/${id}`);
      usernames[id] = r.data.username;
    } catch { /* ignore */ }
  }));
  return species.map((s) => ({
    ...s,
    proposer: s.proposed_by ? {
      id: s.proposed_by,
      username: usernames[s.proposed_by] ?? null,
      actions_validated_total: totals[s.proposed_by] ?? 0,
    } : null,
  }));
}

const router = express.Router();

const NAME_MAX_LEN = 120;

function normalizeName(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length === 0 || trimmed.length > NAME_MAX_LEN) return null;
  return trimmed;
}

// Annotator/guest ne voient que les espèces approuvées + leurs propres propositions ;
// les rôles ≥ chercheur voient tout (pour la validation/curation).
const PRIVILEGED_ROLES = new Set(['admin', 'moderator', 'curator', 'chercheur']);

router.get('/', requireAuth, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 10;
  try {
    const params = [];
    const conditions = [];

    if (q.length > 0) {
      params.push(`%${q.toLowerCase()}%`);
      conditions.push(`(LOWER(name) LIKE $${params.length}
                    OR LOWER(COALESCE(scientific_name, '')) LIKE $${params.length}
                    OR LOWER(COALESCE(polynesian_name, '')) LIKE $${params.length}
                    OR LOWER(COALESCE(usage_name, ''))      LIKE $${params.length})`);
    }

    const isStaff = req.cvatUser.is_superuser || req.cvatUser.is_staff;
    let isPrivileged = isStaff;
    if (!isStaff) {
      const { rows: roleRow } = await pool.query(
        'SELECT role FROM user_roles WHERE cvat_user_id = $1',
        [req.cvatUser.id],
      );
      const role = roleRow[0]?.role || 'annotator';
      isPrivileged = PRIVILEGED_ROLES.has(role);
    }
    if (!isPrivileged) {
      params.push(req.cvatUser.id);
      conditions.push(`(status = 'approved' OR proposed_by = $${params.length})`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit);
    const { rows } = await pool.query(`
      SELECT id, name, scientific_name, usage_name, polynesian_name, category, tags,
             description, description_source, status, usage_count, proposed_by, created_at
      FROM species
      ${where}
      ORDER BY LOWER(COALESCE(scientific_name, name)) ASC
      LIMIT $${params.length}
    `, params);
    res.json({ results: await decorateProposers(rows) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/search', requireAuth, async (req, res) => {
  const field = String(req.query.field || '').trim();
  const q     = String(req.query.q || '').trim();
  const VALID_FIELDS = { scientific: 'scientific_name', usage: 'usage_name', polynesian: 'polynesian_name' };
  const column = VALID_FIELDS[field];
  if (!column) return res.status(400).json({ error: `field must be one of ${Object.keys(VALID_FIELDS).join(', ')}` });
  if (q.length === 0) return res.json({ results: [] });

  try {
    const { rows } = await pool.query(`
      SELECT id, name, scientific_name, usage_name, polynesian_name, tags,
             description, description_source, status, usage_count, proposed_by
      FROM species
      WHERE LOWER(COALESCE(${column}, '')) LIKE $1
      ORDER BY LOWER(${column}) ASC
      LIMIT 10
    `, [`%${q.toLowerCase()}%`]);
    res.json({ results: await decorateProposers(rows) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/full', requireCuratorOrAbove, async (req, res) => {
  const body = req.body || {};
  const sName = typeof body.scientific_name === 'string' ? body.scientific_name.trim() : '';
  const uName = typeof body.usage_name      === 'string' ? body.usage_name.trim()      : '';
  const pName = typeof body.polynesian_name === 'string' ? body.polynesian_name.trim() : '';
  const tags  = Array.isArray(body.tags) ? body.tags.filter((t) => typeof t === 'string') : [];
  const sourceName = typeof body.source_name === 'string' ? body.source_name.trim() : null;

  if (!sName || !uName || !pName) {
    return res.status(400).json({ error: 'scientific_name, usage_name, polynesian_name required' });
  }

  const { validateTags } = require('../lib/speciesTagValidation');
  const check = await validateTags(tags);
  if (!check.ok) return res.status(400).json({ error: check.error });

  try {
    const match = await pool.query(
      `SELECT * FROM species
       WHERE LOWER(scientific_name) = LOWER($1)
         AND LOWER(usage_name)      = LOWER($2)
         AND LOWER(polynesian_name) = LOWER($3)
       LIMIT 1`,
      [sName, uName, pName],
    );
    if (match.rows.length > 0) {
      const upd = await pool.query(
        `UPDATE species SET tags = $1, status = 'approved', approved_by = COALESCE(approved_by, $2)
         WHERE id = $3 RETURNING *`,
        [tags, req.cvatUser.id, match.rows[0].id],
      );
      return res.json(upd.rows[0]);
    }

    if (sourceName) {
      const legacy = await pool.query(
        `SELECT * FROM species WHERE LOWER(name) = LOWER($1) LIMIT 1`,
        [sourceName],
      );
      if (legacy.rows.length > 0) {
        const upd = await pool.query(
          `UPDATE species SET scientific_name=$1, usage_name=$2, polynesian_name=$3,
                              tags=$4, status='approved', approved_by=COALESCE(approved_by, $5)
           WHERE id=$6 RETURNING *`,
          [sName, uName, pName, tags, req.cvatUser.id, legacy.rows[0].id],
        );
        return res.json(upd.rows[0]);
      }
    }

    const dup = await pool.query(`SELECT * FROM species WHERE LOWER(name) = LOWER($1) LIMIT 1`, [sName]);
    if (dup.rows.length > 0) {
      const upd = await pool.query(
        `UPDATE species
         SET scientific_name=$1, usage_name=$2, polynesian_name=$3, tags=$4,
             status='approved', approved_by=COALESCE(approved_by, $5)
         WHERE id=$6 RETURNING *`,
        [sName, uName, pName, tags, req.cvatUser.id, dup.rows[0].id],
      );
      return res.json(upd.rows[0]);
    }

    const ins = await pool.query(
      `INSERT INTO species (name, scientific_name, usage_name, polynesian_name, tags, status, proposed_by, approved_by)
       VALUES ($1, $2, $3, $4, $5, 'approved', $6, $6)
       RETURNING *`,
      [sName, sName, uName, pName, tags, req.cvatUser.id],
    );
    res.status(201).json(ins.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', requireAuth, async (req, res) => {
  const name = normalizeName(req.body?.name);
  if (!name) return res.status(400).json({ error: 'name required (1-120 chars)' });

  try {
    const existing = await pool.query(
      `SELECT id, name, scientific_name, polynesian_name, category, description, description_source, status, usage_count
       FROM species WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [name],
    );
    if (existing.rows.length > 0) {
      return res.status(200).json(existing.rows[0]);
    }

    const { rows } = await pool.query(`
      INSERT INTO species (name, status, proposed_by)
      VALUES ($1, 'pending', $2)
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, scientific_name, polynesian_name, category, description, description_source, status, usage_count
    `, [name, req.cvatUser.id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const VALID_CATEGORIES = ['terrestrial_fauna', 'marine_fauna', 'flora', 'other'];
const VALID_DESC_SOURCES = ['manual', 'wikipedia', 'annotator_proposal'];

router.patch('/:id', requireCuratorOrAbove, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

  const body = req.body || {};
  const fields = [];
  const params = [];

  const stringField = (key) => {
    if (key in body) {
      const v = body[key];
      if (v !== null && typeof v !== 'string') return false;
      params.push(v === null ? null : v.trim().slice(0, 4000) || null);
      fields.push(`${key} = $${params.length}`);
    }
    return true;
  };

  if (!stringField('scientific_name'))      return res.status(400).json({ error: 'scientific_name must be string|null' });
  if (!stringField('polynesian_name'))      return res.status(400).json({ error: 'polynesian_name must be string|null' });
  if (!stringField('usage_name'))           return res.status(400).json({ error: 'usage_name must be string|null' });
  if (!stringField('description'))          return res.status(400).json({ error: 'description must be string|null' });
  if (!stringField('reference_image_url'))  return res.status(400).json({ error: 'reference_image_url must be string|null' });

  if ('category' in body) {
    const v = body.category;
    if (v !== null && (typeof v !== 'string' || !VALID_CATEGORIES.includes(v))) {
      return res.status(400).json({ error: `category must be null or one of ${VALID_CATEGORIES.join(', ')}` });
    }
    params.push(v);
    fields.push(`category = $${params.length}`);
  }

  if ('description_source' in body) {
    const v = body.description_source;
    if (v !== null && (typeof v !== 'string' || !VALID_DESC_SOURCES.includes(v))) {
      return res.status(400).json({ error: `description_source must be null or one of ${VALID_DESC_SOURCES.join(', ')}` });
    }
    params.push(v);
    fields.push(`description_source = $${params.length}`);
  }

  if ('tags' in body) {
    if (!Array.isArray(body.tags) || body.tags.some((t) => typeof t !== 'string')) {
      return res.status(400).json({ error: 'tags must be string[]' });
    }
    const cleanTags = [...new Set(body.tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0 && t.length <= 40))];
    params.push(cleanTags);
    fields.push(`tags = $${params.length}`);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'no editable fields provided' });

  params.push(id);
  try {
    const { rows: before } = await pool.query(
      `SELECT scientific_name, usage_name, polynesian_name, description, description_source, reference_image_url, tags
       FROM species WHERE id = $1`,
      [id],
    );
    if (before.length === 0) return res.status(404).json({ error: 'species not found' });

    if ('tags' in body) {
      const newTags = body.tags.map((t) => t.trim().toLowerCase()).filter((t) => t.length > 0);
      const curTags = (before[0].tags || []).slice();
      const sameSet = newTags.length === curTags.length && newTags.every((t) => curTags.includes(t));
      if (!sameSet) {
        const { validateTags } = require('../lib/speciesTagValidation');
        const check = await validateTags(newTags);
        if (!check.ok) return res.status(400).json({ error: check.error });
      }
    }

    const { rows } = await pool.query(`
      UPDATE species SET ${fields.join(', ')}
      WHERE id = $${params.length}
      RETURNING id, name, scientific_name, usage_name, polynesian_name, category, tags,
                description, description_source, reference_image_url, status, usage_count
    `, params);
    if (rows.length === 0) return res.status(404).json({ error: 'species not found' });

    recordAction(req.cvatUser.id, 'species.edited', {
      targetType: 'species',
      targetId:   id,
      payload:    { before: before[0], after: rows[0], direct: true },
    });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/approve', requireCuratorOrAbove, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const { rows } = await pool.query(`
      UPDATE species
      SET status = 'approved', approved_by = $1
      WHERE id = $2
      RETURNING id, name, status, usage_count
    `, [req.cvatUser.id, id]);
    if (rows.length === 0) return res.status(404).json({ error: 'species not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const { rows } = await pool.query(`
      SELECT id, name, scientific_name, usage_name, polynesian_name, category, tags,
             description, description_source, reference_image_url, status, usage_count,
             proposed_by, approved_by, created_at
      FROM species WHERE id = $1
    `, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'species not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/wikipedia', requireCuratorOrAbove, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  const lang = ['fr', 'en'].includes(String(req.query.lang)) ? String(req.query.lang) : 'fr';
  try {
    const { rows } = await pool.query(
      'SELECT scientific_name, usage_name, name FROM species WHERE id = $1',
      [id],
    );
    if (rows.length === 0) return res.status(404).json({ error: 'species not found' });
    const candidates = [rows[0].scientific_name, rows[0].usage_name, rows[0].name].filter(Boolean);
    if (candidates.length === 0) return res.status(400).json({ error: 'aucun nom disponible pour la recherche Wikipédia' });

    let summary = null;
    for (const term of candidates) {
      try {
        const resp = await axios.get(
          `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`,
          { timeout: 5000, headers: { 'User-Agent': 'OceanLabelling/1.0' } },
        );
        if (resp.data?.type === 'standard' && resp.data?.extract) {
          summary = {
            term,
            lang,
            title:      resp.data.title,
            extract:    resp.data.extract,
            page_url:   resp.data.content_urls?.desktop?.page ?? null,
            thumbnail:  resp.data.thumbnail?.source ?? null,
          };
          break;
        }
      } catch (err) {
        if (err.response?.status !== 404) {
          console.warn(`[species] wiki lookup failed for "${term}":`, err.message);
        }
      }
    }
    if (!summary) return res.status(404).json({ error: 'aucune page Wikipédia trouvée pour cette espèce' });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/increment-usage', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const { rows } = await pool.query(`
      UPDATE species
      SET usage_count = usage_count + 1
      WHERE id = $1
      RETURNING id, usage_count
    `, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'species not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
