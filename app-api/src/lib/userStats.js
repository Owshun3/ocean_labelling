'use strict';

const { pool } = require('../db');

// actions_validated_total = annotations review-mode retenues par un curator +
// médias validés en modération. Calcul cohérent avec /users/me/profile (rang).
async function fetchActionsTotals(userIds) {
  const map = {};
  if (!Array.isArray(userIds) || userIds.length === 0) return map;
  const ids = [...new Set(userIds.filter((n) => Number.isInteger(n)))];
  if (ids.length === 0) return map;

  const { rows } = await pool.query(`
    WITH ids AS (SELECT unnest($1::int[]) AS user_id),
    annot AS (
      SELECT chosen_bbox_annotator_id AS user_id, COUNT(*)::int AS n
      FROM curator_certifications
      WHERE chosen_bbox_annotator_id = ANY($1) AND mode = 'review'
      GROUP BY chosen_bbox_annotator_id
    ),
    media AS (
      SELECT uploader_id AS user_id, COUNT(*)::int AS n
      FROM media_moderation
      WHERE uploader_id = ANY($1) AND status = 'validated'
      GROUP BY uploader_id
    )
    SELECT ids.user_id,
           COALESCE(annot.n, 0) + COALESCE(media.n, 0) AS actions_validated_total
    FROM ids
    LEFT JOIN annot ON annot.user_id = ids.user_id
    LEFT JOIN media ON media.user_id = ids.user_id
  `, [ids]);

  rows.forEach((r) => { map[r.user_id] = Number(r.actions_validated_total) || 0; });
  return map;
}

module.exports = { fetchActionsTotals };
