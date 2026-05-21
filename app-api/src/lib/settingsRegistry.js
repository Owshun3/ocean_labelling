'use strict';

const DEFAULT_PRIVACY_POLICY = `## Politique de confidentialité

Cette plateforme est dédiée à la collecte et l'annotation collaborative de données scientifiques sur la biodiversité polynésienne. Cette politique décrit les données collectées, leur usage et les droits dont tu disposes en application du Règlement Général sur la Protection des Données (RGPD).

## Données collectées

- **Identité** : nom d'utilisateur, adresse e-mail, mot de passe (haché), date d'inscription.
- **Session** : un cookie d'authentification HttpOnly est posé à la connexion ; les sessions expirées sont purgées quotidiennement.
- **Contenus déposés** : photos et vidéos téléversées par tes soins, et leurs métadonnées (date de prise de vue, position GPS, modèle d'appareil), lorsque tu choisis de les fournir.
- **Annotations** : les boîtes englobantes et les espèces que tu poses sur les médias.
- **Journaux d'audit** : les actions administratives (validations, bannissements, modifications de rôle) sont historisées à des fins de traçabilité.

## Finalités

Les données sont utilisées pour les finalités suivantes :

- Annotation collaborative et validation par des curators.
- Constitution de jeux de données scientifiques exportables au format Datumaro à destination de chercheurs accrédités, après approbation de l'administrateur.
- Modération des contenus et des comportements (lutte contre le spam et les contenus inappropriés).

## Confidentialité des coordonnées GPS

Les coordonnées GPS et la date de prise de vue extraites des métadonnées ne sont jamais exposées aux autres annotateurs, quelle que soit l'espèce représentée. Elles restent accessibles uniquement aux modérateurs, curators, administrateurs et aux chercheurs accrédités via les exports approuvés. Cette mesure protège notamment les espèces sensibles contre le braconnage.

## Destinataires et sous-traitants

- **CVAT** : moteur d'annotation auto-hébergé, héberge les images et les annotations sur le même serveur que la plateforme.
- **Chercheurs accrédités** : reçoivent des extraits Datumaro après demande explicite et approbation administrative.
- Aucune donnée n'est transférée à des tiers commerciaux. Aucun transfert hors Union européenne n'est effectué sans information préalable.

## Conservation des données

- **Sessions** : purgées dès expiration (durée idle 30 minutes, durée absolue 12 heures, prolongée à 30 jours si « se souvenir de moi » coché).
- **Médias rejetés** : les binaires sont supprimés après le délai paramétré par l'administrateur (par défaut 30 jours après modération, sauf contestation en cours).
- **Comptes inactifs** : tu peux à tout moment demander la suppression de ton compte auprès de l'administrateur.
- **Journaux d'audit** : conservés pour la durée nécessaire au respect des obligations légales de traçabilité.

## Tes droits

Conformément aux articles 15 à 22 du RGPD, tu disposes des droits suivants :

- Droit d'accès à tes données.
- Droit de rectification.
- Droit à l'effacement (« droit à l'oubli »).
- Droit à la limitation du traitement.
- Droit à la portabilité.
- Droit d'opposition.

Pour exercer ces droits, contacte l'administrateur via l'adresse de contact affichée en pied de page.

## Sécurité

Les mots de passe sont hachés. Les cookies de session sont HttpOnly, Secure (en production HTTPS), SameSite=Lax. Les données EXIF des images sont retirées du binaire avant stockage côté serveur.

## Modification de cette politique

Le contenu de cette page peut être mis à jour par l'administrateur. La date de dernière mise à jour est affichée en bas de page.`;

const REGISTRY = [
  {
    key: 'platform.name', type: 'string', default: 'Ora te Fenua !', is_public: true,
    group_name: 'branding', label: 'Nom de la plateforme',
    description: 'Affiché dans le header, le titre de l\'onglet, la page de connexion.',
  },
  {
    key: 'platform.welcome_message', type: 'string',
    default: 'Bienvenue sur la plateforme d\'annotation collaborative de biodiversité marine.',
    is_public: true, group_name: 'branding', label: 'Message d\'accueil (première connexion)',
    description: 'Affiché à la première connexion d\'un nouvel utilisateur.',
  },

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

  // Logo + vidéo d'aide : binaires stockés sous /data/videos/.logo et .help
  // (volume ocean_videos partagé). Settings gérés via POST /admin/logo et
  // /admin/help-video, pas via la PATCH générique.
  {
    key: 'platform.logo_filename', type: 'string', default: '', is_public: true,
    group_name: 'branding', label: 'Logo (nom du fichier)',
    description: 'Géré via la section dédiée plus bas — vide = aucun logo, le nom seul s\'affiche.',
  },

  {
    key: 'platform.help_video_filename', type: 'string', default: '', is_public: true,
    group_name: 'help', label: 'Vidéo explicative (nom du fichier)',
    description: 'Géré via la section dédiée plus bas — vide = aucune vidéo.',
  },

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

  {
    key: 'platform.public_registration', type: 'bool', default: 'true', is_public: true,
    group_name: 'access', label: 'Inscriptions ouvertes au public',
    description: 'Désactivé, le formulaire d\'inscription est bloqué (utile pour figer la base d\'utilisateurs).',
  },

  {
    key: 'upload_max_bytes', type: 'int', default: '209715200', is_public: false,
    group_name: 'upload', label: 'Taille maximale par lot (Mo)',
    description: 'Limite globale par téléversement, en mégaoctets.',
  },

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
  {
    key: 'raw_exif_retention_days', type: 'int', default: '90', is_public: false,
    group_name: 'policies', label: 'Délai avant purge du blob EXIF brut (jours)',
    description: 'Minimisation RGPD. Au-delà du délai, la colonne raw_exif est mise à NULL. 0 = désactiver (déconseillé). Les champs GPS/date/camera extraits restent intacts.',
  },

  {
    key: 'platform.privacy_policy', type: 'string', is_public: true,
    group_name: 'legal', label: 'Politique de confidentialité',
    description: 'Texte affiché sur la page /privacy, accessible depuis le pied de page. Markdown léger supporté (titres ##, listes -, liens [texte](url)).',
    default: DEFAULT_PRIVACY_POLICY,
  },

  // Apparence des rangs (libellé + couleur ajustables sans redéploiement) ;
  // les seuils restent figés dans frontend/src/shared/ranks.ts.
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
  help:        'Aide',
  maintenance: 'Maintenance',
  access:      'Accès',
  upload:      'Téléversement',
  policies:    'Politiques',
  legal:       'Mentions légales',
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
