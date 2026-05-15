'use strict';

const REGISTRY = [
  // Branding
  {
    key: 'platform.name', type: 'string', default: 'Ocean Labelling', is_public: true,
    group_name: 'branding', label: 'Nom de la plateforme',
    description: 'Affiché dans le header, le titre de l\'onglet, la page de connexion.',
  },
  {
    key: 'platform.welcome_message', type: 'string',
    default: 'Bienvenue sur la plateforme d\'annotation collaborative de biodiversité marine.',
    is_public: true, group_name: 'branding', label: 'Message d\'accueil (première connexion)',
    description: 'Affiché à la première connexion d\'un nouvel utilisateur.',
  },

  // Contact
  {
    key: 'platform.contact_email', type: 'string', default: '', is_public: true,
    group_name: 'contact', label: 'Email de contact',
    description: 'Affiché en pied de page et page de connexion.',
  },
  {
    key: 'platform.contact_phone', type: 'string', default: '', is_public: true,
    group_name: 'contact', label: 'Téléphone', description: '',
  },
  {
    key: 'platform.contact_hours', type: 'string', default: '', is_public: true,
    group_name: 'contact', label: 'Horaires', description: 'Ex : « Lun-Ven 8h-17h ».',
  },
  {
    key: 'platform.contact_address', type: 'string', default: '', is_public: true,
    group_name: 'contact', label: 'Adresse postale', description: '',
  },

  // Maintenance
  {
    key: 'platform.maintenance_mode', type: 'bool', default: 'false', is_public: true,
    group_name: 'maintenance', label: 'Mode maintenance',
    description: 'Si activé, le site est indisponible aux non-administrateurs (redirection vers la page de maintenance).',
  },
  {
    key: 'platform.maintenance_message', type: 'string',
    default: 'Maintenance en cours, merci de revenir plus tard.', is_public: true,
    group_name: 'maintenance', label: 'Message affiché en mode maintenance', description: '',
  },

  // Accès
  {
    key: 'platform.public_registration', type: 'bool', default: 'true', is_public: true,
    group_name: 'access', label: 'Inscriptions ouvertes au public',
    description: 'Désactivé, le formulaire d\'inscription est bloqué (utile pour figer la base d\'utilisateurs).',
  },

  // Upload
  {
    key: 'upload_max_bytes', type: 'int', default: '209715200', is_public: false,
    group_name: 'upload', label: 'Taille maximale par lot (Mo)',
    description: 'Limite globale par téléversement, en mégaoctets.',
  },

  // Politiques
  {
    key: 'consensus_replicas_default', type: 'int', default: '2', is_public: false,
    group_name: 'policies', label: 'Replicas de consensus par nouvelle tâche',
    description: 'Nombre de jobs créés par tâche pour permettre la curation. Minimum 2 (contrainte CVAT). Paramètre non rétroactif : ne touche que les nouveaux uploads.',
    min: 2,
  },
  {
    key: 'username_change_cooldown_days', type: 'int', default: '30', is_public: false,
    group_name: 'policies', label: 'Délai entre deux changements d\'identifiant (jours)',
    description: '',
  },
  {
    key: 'media_retention_rejected_days', type: 'int', default: '30', is_public: false,
    group_name: 'policies', label: 'Délai avant suppression des médias rejetés non contestés (jours)',
    description: 'Réglage du futur job de nettoyage automatique des médias rejetés sans contestation.',
  },

  // Apparence des rangs (médailles affichées un peu partout — fiche profil,
  // listes d'utilisateurs, propositions d'annotations…). Les seuils restent
  // figés dans `frontend/src/shared/ranks.ts` ; seuls le libellé et la couleur
  // sont ajustables sans redéploiement.
  ...rankAppearanceEntries(),
];

function rankAppearanceEntries() {
  const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
  const DEFAULTS = [
    { id: 'debutant', label: 'Débutant', color: '#9ca3af' },
    { id: 'bronze',   label: 'Bronze',   color: '#cd7f32' },
    { id: 'argent',   label: 'Argent',   color: '#c0c0c0' },
    { id: 'or',       label: 'Or',       color: '#f59e0b' },
    { id: 'platine',  label: 'Platine',  color: '#06b6d4' },
  ];
  const out = [];
  for (const r of DEFAULTS) {
    out.push({
      key: `rank.${r.id}.label`, type: 'string', default: r.label, is_public: true,
      group_name: 'ranks', label: `Rang ${r.label} — libellé`,
      description: 'Texte affiché sur la médaille.',
    });
    out.push({
      key: `rank.${r.id}.color`, type: 'string', default: r.color, is_public: true,
      group_name: 'ranks', label: `Rang ${r.label} — couleur`,
      description: 'Code hexadécimal #RRGGBB (ex : #f59e0b).',
      pattern: COLOR_PATTERN, pattern_error: 'attendu : #RRGGBB',
    });
  }
  return out;
}

const REGISTRY_BY_KEY = Object.fromEntries(REGISTRY.map((r) => [r.key, r]));

const GROUP_LABELS = {
  branding:    'Branding',
  contact:     'Contact',
  maintenance: 'Maintenance',
  access:      'Accès',
  upload:      'Téléversement',
  policies:    'Politiques',
  ranks:       'Apparence des rangs',
};

function coerceFromString(type, str) {
  if (type === 'int') {
    const n = Number(str);
    if (!Number.isInteger(n)) throw new Error('valeur entière attendue');
    return n;
  }
  if (type === 'bool') {
    if (str === 'true' || str === 'false') return str === 'true';
    throw new Error('valeur booléenne attendue (true/false)');
  }
  return String(str);
}

function validateForType(type, raw, meta) {
  // raw is whatever the client sent: bool, number or string
  if (type === 'int') {
    if (typeof raw === 'string') raw = raw.trim();
    const n = Number(raw);
    if (!Number.isInteger(n)) throw new Error('valeur entière attendue');
    if (n < 0) throw new Error('valeur positive ou nulle requise');
    if (meta && Number.isInteger(meta.min) && n < meta.min) {
      throw new Error(`valeur minimum : ${meta.min}`);
    }
    if (meta && Number.isInteger(meta.max) && n > meta.max) {
      throw new Error(`valeur maximum : ${meta.max}`);
    }
    return String(n);
  }
  if (type === 'bool') {
    if (typeof raw === 'boolean') return raw ? 'true' : 'false';
    if (raw === 'true' || raw === 'false') return raw;
    throw new Error('valeur booléenne attendue');
  }
  if (typeof raw !== 'string') throw new Error('valeur texte attendue');
  if (meta && meta.pattern instanceof RegExp && !meta.pattern.test(raw)) {
    throw new Error(meta.pattern_error || 'format invalide');
  }
  return raw;
}

async function ensureSchema(pool) {
  await pool.query(`
    ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS type        TEXT NOT NULL DEFAULT 'string';
    ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS label       TEXT NOT NULL DEFAULT '';
    ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
    ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS group_name  TEXT NOT NULL DEFAULT 'misc';
    ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS is_public   BOOLEAN NOT NULL DEFAULT FALSE;
  `);
  // Upsert registry: metadata always refreshed from code, value preserved on existing rows.
  for (const r of REGISTRY) {
    await pool.query(`
      INSERT INTO app_settings (key, value, type, label, description, group_name, is_public)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (key) DO UPDATE SET
        type = EXCLUDED.type,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        group_name = EXCLUDED.group_name,
        is_public = EXCLUDED.is_public
    `, [r.key, r.default, r.type, r.label, r.description, r.group_name, r.is_public]);
  }
}

module.exports = {
  REGISTRY, REGISTRY_BY_KEY, GROUP_LABELS,
  coerceFromString, validateForType, ensureSchema,
};
