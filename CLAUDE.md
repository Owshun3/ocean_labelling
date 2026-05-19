# CLAUDE.md — Ocean Labelling

**Règle:** Ne lire que les fichiers nécessaires à la tâche courante. Mettre à jour ce fichier ET `PRODUCTION.md` après chaque changement majeur.

## Vocabulaire : Ocean ↔ CVAT

La plateforme Ocean **renomme et aplatit** la hiérarchie CVAT côté UI :

| Concept CVAT | Concept Ocean (UI) | Ce qu'on utilise |
|---|---|---|
| Organization | (ignoré, mono-tenant) | aucun |
| Project | (ignoré) | aucun |
| Task | « mon média » / « lot uploadé » | 1 upload = 1 task |
| Job | « ce que j'annote » | 1 task = 1 job (`getFirstJobId`) |
| Label | « étiquette d'espèce » | initialisé à `[{name:'item'}]` |

Les mots CVAT (task, project, job) ne doivent **jamais** apparaître dans l'UI utilisateur. Les routes `/tasks`, `/projects`, `/organizations` sont d'ailleurs bloquées par NGINX (`nginx/nginx.conf:82-85`).

## Stack
Expo Web (RN/TS) → NGINX Gateway :8888 → cvat_server:8080 (NGINX→uvicorn→Django) → réseau Docker `cvat_cvat`. CVAT v2.62.1.
App-API (Node/Express/SQLite) → port interne 3000, proxy via gateway `/app-api/`.

**CVAT = boîte noire absolue. Ne jamais modifier `cvat-core/`, les Dockerfiles CVAT, ni aucun fichier issu du dépôt officiel CVAT. Toute customisation passe exclusivement par NGINX (`sub_filter`, règles de routage) ou par `app-api`.**

## Ports & env
| Service | Port | Notes |
|---|---|---|
| Expo Web | 8081 | `cd frontend && npx expo start -c --web` |
| NGINX Gateway | 8888 | **seul point d'entrée** — API + studio annotation |
| CVAT Traefik | 8080 | iptables bloqué sur Linux — **non bloquable sous WSL2/Docker Desktop** (NAT Windows) |

`frontend/.env` : `EXPO_PUBLIC_API_URL=http://localhost:8888/api` | `EXPO_PUBLIC_CVAT_UI_URL=http://localhost:8888`

**Routage nginx/nginx.conf :** `/api/` → `cvat_server:8080` | `/static/` → `cvat_server:8080` | `/` → `cvat_ui:8000` (SPA + WebSocket)

Démarrage : `docker compose up -d` — lance CVAT + postgres + app-api + gateway en un seul appel. `depends_on` gère l'ordre (CVAT d'abord, puis app-api, puis gateway).
⚠ WSL2/Docker Desktop : le port 8080 (Traefik CVAT) reste accessible côté Windows malgré `iptables`. Pour bloquer : règle "Inbound" Windows Defender Firewall, port 8080, action Block.

## App-API (RBAC)
Service : `app-api/` — Node.js + Express + **PostgreSQL** (pg pool).
DB : service `postgres:15-alpine`, volume nommé `pg_data`, base `ocean_labelling`, user `ocean`.
`DATABASE_URL=postgres://ocean:<POSTGRES_PASSWORD>@postgres:5432/ocean_labelling` (env, défini dans `.env`).
Proxy NGINX : `/app-api/` → `http://app-api:3000/` (strip prefix via trailing slash).
`app-api` démarre seulement après healthcheck postgres (`pg_isready`).

Compte admin : `username=admin`, mot de passe défini dans `.env` → `CVAT_ADMIN_PASS` (CVAT superuser → rôle 'admin' automatique).

Hiérarchie des rôles (haut → bas) : `admin` > `moderator` > `curator` ≥ `chercheur` > `annotator` > `guest`.
Stockage : table `user_roles(cvat_user_id PK, role)`. Utilisateurs non présents = `annotator` par défaut.

**Rôle CVAT par défaut** : tout compte créé via `/auth/register` hérite du groupe CVAT `user` (comportement natif CVAT). On garde ce défaut, on ne descend PAS en `worker`. Raison : depuis ADR-012 le navigateur n'a plus de token CVAT, tous les appels passent par le proxy app-api authentifié par cookie. La défense en profondeur d'un rôle CVAT plus bas n'a donc plus de surface d'attaque utile — le choke point est app-api, pas CVAT. `user` suffit pour empêcher les actions cross-utilisateur côté CVAT.

**Rôle chercheur — détail :**
Profil hybride pour usage scientifique. Peut uploader des médias, annoter, et **agir comme curator** (validation, fusion). **Ne peut pas** modérer. **Export limité** à un périmètre de données autorisé en amont (à définir : table d'autorisations explicites par utilisateur×scope). Cas typique : étudiant chercheur invité qui contribue à un sous-ensemble de données validées par l'admin.
Côté code : middleware `requireCuratorOrAbove` doit accepter `chercheur`. Middleware `requireModeratorOrAbove` l'exclut. Nouveau middleware ou logique d'export contrôle les bornes d'accès aux données.

**Rôle curator — détail :**
Reçoit un **batch de médias annotés à valider, fourni individuellement** à chaque curator par l'admin ou par un algorithme d'assignation (à construire).
Son travail : vérifier la qualité, voir tous les labels et étiquettes (noms d'espèces) proposés par les différents annotateurs, puis fusionner les annotations, choisir la meilleure, ou réannoter lui-même. Valide pour usage/export.
**Responsabilité espèces** : quand un annotateur propose une nouvelle espèce avec une description, le curator peut (1) valider la description proposée, (2) l'importer depuis Wikipédia, (3) la remplir manuellement. Il **harmonise** les noms (scientifique / usage français / usage polynésien) — garant de la cohérence du catalogue d'espèces. La description finale est stockée en base et affichée côté guest dans un encadré sur la fiche espèce (ex. « vini vini : cliquez ici pour une description plus détaillée »).

**Prérequis technique du curator (Consensus Replicas) :**
Pour qu'une tâche puisse être curée, elle DOIT avoir été créée avec `consensus_replicas >= 2` au moment du `POST /api/tasks`. Ce paramètre ne peut PAS être ajouté rétroactivement (contrainte CVAT — source : docs.cvat.ai/docs/qa-analytics/consensus/).
Paramétrage actif : constantes globales en tête de `src/services/api/CvatMediaService.ts` — `CONSENSUS_REPLICAS = 2` (valeur effective, clampée par `CONSENSUS_REPLICAS_MAX = 50`). Le paramètre est intentionnellement **non exposé dans l'UI** — c'est une donnée de configuration commune à tous les uploads, pas un choix par utilisateur. La borne haute (50) est arbitraire fonctionnelle, pas une contrainte CVAT — elle existe pour cadrer une future page admin de paramètres globaux.
Évolution prévue : si admin doit pouvoir ajuster sans redéploiement, créer une page de paramètres globaux + table `app_settings` postgres et remplacer la constante par un fetch au démarrage. Tant que cette page n'existe pas, modifier la valeur = changement de code + redéploiement.
Les tâches créées avec `consensus_replicas = 1` (avant cette feature) sont mono-annotateur et hors du périmètre du curator — pas de rétro-compat possible, elles doivent être ré-uploadées.
CVAT propose nativement : `POST /api/consensus/merges` (fusion IoU multi-jobs, async), `PATCH /api/consensus/settings/{id}` (seuil IoU par tâche), `POST /api/quality/reports` + `GET /api/quality/conflicts` (rapport qualité et conflits entre annotateurs).
Fonctionnalités attendues du studio curator (UI custom à construire) :
- Affichage simultané des annotations de plusieurs annotateurs sur la même image, avec opacité variable au survol pour distinguer les sources.
- Sélection d'un label et d'un encadrement existants parmi ceux proposés par les annotateurs sources.
- Fusion des annotations sélectionnées OU création d'une nouvelle annotation par-dessus.
- Validation de l'annotation finale (= passage du job en `stage:'accepted'` côté CVAT).
Le studio curator custom est **à construire** par-dessus ces endpoints — il n'existe pas nativement dans notre app.

**Rôle moderator — détail :**
Modère le contenu uploadé sur la plateforme : retire les médias hors-sujet, choquants, publicitaires ou postés par des bots. Peut bannir des utilisateurs.
N'intervient **pas** sur les annotations elles-mêmes (ce rôle revient au curator).
Aucune fonctionnalité native CVAT ne couvre la modération de contenu : ni queue de validation pré-publication, ni signalement, ni workflow de bannissement avec motif/durée. Toute la logique est construite côté app-api.

## Modération — workflow & tables

Tables app-api (db.js) :
- `media_moderation(cvat_task_id PK, uploader_id, status pending|validated|rejected, reviewed_by, review_comment, created_at, reviewed_at)` — entrée auto-créée à chaque upload (`POST /upload-history` insère `pending`).
- `user_bans(id, cvat_user_id, banned_by, reason, banned_at, expires_at, released_at, released_by)` — `released_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())` = ban actif. Distinguer `released_at` (levé manuellement) de `expires_at <= NOW()` (expiration naturelle) est critique pour l'auto-réactivation.
- `moderation_contestations(id, cvat_task_id, contester_id, message, created_at, resolved_at, resolved_by, resolution upheld|overturned)` — déposée par l'uploadeur sur ses médias rejetés. UI uploadeur ✅, UI admin ✅ via `/admin/requests` onglet Contestations.
- `annotation_contestations(id, cvat_task_id, contester_id, message, created_at, resolved_at, resolved_by, resolution upheld|overturned)` — déposée par n'importe quel annotateur sur une tâche dont l'annotation finale a été validée par le curator (`media_moderation.curator_validated_at IS NOT NULL`). UI uploadeur ✅, UI admin ✅ via `/admin/requests` onglet Contestations.
- `species_edit_requests(id, species_id, proposed_by, proposed_at, proposed_payload JSONB, status pending|approved|rejected, reviewed_by, reviewed_at, review_comment)` — demande d'édition d'une fiche d'espèce soumise par un curator. Index unique partiel sur `species_id` pour empêcher deux demandes en cours sur la même fiche. Résolu via `/admin/requests` onglet Fiches d'espèces (diff côté-à-côté + approve/reject).
- `media_moderation.curator_validated_at TIMESTAMPTZ` + `curator_validated_by INTEGER` — set par le futur curator studio quand le curator valide l'annotation finale fusionnée. Sert de signal pour la sous-section « Validé » de Mes médias et pour autoriser les contestations annotation.

Ban d'un utilisateur :
1. INSERT `user_bans` (transactionnel avec UPDATE cascade des médias `pending` → `rejected`).
2. PATCH CVAT `is_active=false` (le user ne peut plus s'authentifier — DRF renvoie `{"detail":"User inactive or deleted."}` 401 sur ses requêtes).
3. **Auto-réactivation** : sur `GET /users` (panneau admin) et `GET /moderation/bans/check` (login), pour chaque user `is_active=false` dont le dernier ban a `expires_at <= NOW() AND released_at IS NULL` → PATCH CVAT `is_active=true`. Pas de cron, c'est lazy à l'accès.
4. Levée manuelle (admin clique « Activé ») : UPDATE `user_bans SET released_at=NOW(), released_by=admin` sur tout ban actif + PATCH CVAT.

Workflow de rejet (modération) :
- UI : `RejectReasonPicker` propose 5 motifs prédéfinis (spam, bot, non conforme à la charte, politique, contenu pour adultes) + option « Autre » avec champ libre. Le motif final (label preset ou texte libre) est stocké tel quel dans `media_moderation.review_comment`.
- Après un rejet réussi, prompt `window.confirm` proposant le bannissement de l'uploadeur. Si accepté, ouvre `BanModal`. Sinon, retour normal.
- Boutons « Bannir » affichent un hint cascade explicite : « Tous les médias en attente de cet utilisateur seront automatiquement rejetés. » (la cascade est déjà appliquée par `routes/moderation.js:POST /users/:id/ban`).

Paramètre `upload_max_bytes` (table `app_settings`) :
- Defaut 200 Mo (`200 * 1024 * 1024`), seedé au démarrage par `routes/settings.js`.
- Lu côté frontend via `AppApiService.getSettings()` au mount de `UploadScreens`. Le frontend a un fallback constant (200 Mo) si la fetch échoue.
- PATCH `/app-api/settings/:key` (admin only) pour modifier sans redéploiement. UI admin de gestion à construire.

Panneau admin — dropdown 3 états (`AdminScreen.tsx`) :
- `Activé` (vert) → `PATCH /users/:id/active {is_active:true}`
- `Désactivé` (gris, sticky) → `PATCH /users/:id/active {is_active:false}` (pas de ban — l'auto-réactivation NE S'APPLIQUE PAS sans ban naturellement expiré)
- `Banni` (rouge) → ouvre `BanModal` (durée + motif partagé avec la modération)

`banInterceptor` côté frontend détecte tout 401 avec `data.detail` (sauf "Authentication credentials were not provided.") comme session expirée et redirige proprement vers `/login` — couvre le cas `User inactive or deleted.` qu'envoie CVAT après ban.

## CVAT settings override — `cvat-extras/ocean.py`

CVAT v2.62.1 tourne en `cvat.settings.production` qui ne lit **pas** `CSRF_TRUSTED_ORIGINS` depuis l'env. Patch sans toucher la boîte noire :
```python
from cvat.settings.production import *
import os as _os
_csrf_env = _os.environ.get('CSRF_TRUSTED_ORIGINS', '')
CSRF_TRUSTED_ORIGINS = [o.strip() for o in _csrf_env.split(',') if o.strip()]
```
Monté en read-only via volume (`./cvat-extras/ocean.py:/home/django/cvat/settings/ocean.py:ro`) et activé par `DJANGO_SETTINGS_MODULE=cvat.settings.ocean`. **Ne PAS basculer en `cvat.settings.development`** — ça casse OPA (`IAM_OPA_HOST` diffère).

Env app-api : `CVAT_ADMIN_USER` / `CVAT_ADMIN_PASS` (définis dans `.env`) — utilisés pour fetcher la liste complète des users CVAT (seul un superuser CVAT peut le faire). Token caché en mémoire avec refresh auto sur 401.

Services frontend :
- `AppApiService.ts` — client app-api (axios séparé, lit token localStorage)
- `authStorage.ts` — `saveUserProfile` / `getUserProfile` / `clearUserProfile` (post-login, pré-logout)
- `CvatAuthService.login()` — appelle `/users/self` + `/app-api/users/me` pour stocker `appRole` localement
- `Header.tsx` — lit `appRole` au mount, affiche selon hiérarchie des rôles
- Gardes de route : `admin.tsx` (admin only), `media/annotate/upload.tsx` (pas guest)

## Taxonomie des tags d'espèces (admin-éditable)

**Pourquoi cette couche** : les tags d'espèces (`species.tags TEXT[]`) sont la pierre angulaire du filtrage export ET de la classification finale. Le user les distingue entre :
- Tags **obligatoires** (every espèce doit en avoir un — ex : type marine/terrestre)
- Tags **exclusifs** (au plus un du groupe — ex : type)
- Tags **optionnels multi-valeurs** (ex : habitat, statut conservation)

Au lieu de coder en dur ces règles, on les externalise dans une taxonomie éditable par l'admin sans déploiement.

**Schéma** :
```sql
species_tag_groups(id, key UNIQUE, label, is_required, is_exclusive, sort_order, ...)
species_tag_definitions(id, group_id FK, value UNIQUE, label, sort_order, archived_at, ...)
```
La table `species.tags TEXT[]` reste source pour les filtres ; les définitions servent de meta + de validation. Soft-delete via `archived_at` plutôt que DELETE — une valeur peut être référencée par d'anciennes espèces.

**Seed initial** : groupe `type` (Type d'espèce, requis + exclusif) avec `terrestrial_fauna` et `marine_fauna`. L'admin ajoute ensuite ce qu'il veut (habitat, taille, statut, etc.) depuis l'UI sans toucher au code.

**Endpoints** :
| Méthode | Route | But |
|---|---|---|
| GET  | `/species-tags`                            | (auth) lit la taxonomie active — alimente curator + export |
| GET  | `/admin/species-tags`                      | (admin) inclut les archivés |
| POST | `/admin/species-tags/groups`               | crée un groupe (`key`, `label`, `is_required`, `is_exclusive`) |
| PATCH| `/admin/species-tags/groups/:id`           | modifie label / flags / ordre |
| DELETE | `/admin/species-tags/groups/:id`         | supprime (CASCADE sur définitions) |
| POST | `/admin/species-tags/definitions`          | ajoute une valeur dans un groupe |
| PATCH| `/admin/species-tags/definitions/:id`      | modifie label / ordre / `archived: bool` |
| DELETE | `/admin/species-tags/definitions/:id`    | suppression dure (à éviter si déjà référencée) |

**Validation centralisée** : `app-api/src/lib/speciesTagValidation.js` exporte `validateTags(tags)` utilisé par `POST /species/full` ET `POST /curator/tasks/:id/certify`. Trois règles : tags inconnus → 400, groupe requis sans valeur → 400, groupe exclusif avec > 1 valeur → 400.

**UI** :
- **Curator studio** : composant `SpeciesTagPicker` rend une section par groupe (radio si exclusif, chips multi sinon, * si requis). Branché dans `CuratorSidebarRight`. La validation client (`validateSpeciesTags`) bloque le bouton « Certifier » avec un hint explicite si la taxonomie n'est pas respectée.
- **Export admin** : remplace les anciennes constantes hardcodées par les définitions chargées au mount. Chaque groupe exclusif devient un filtre radio (Toutes/valeurs), chaque groupe non-exclusif un multi-chips. Les « tags orphelins » (valeurs présentes sur des espèces mais non rattachées à un groupe) apparaissent en garde-fou pour les nettoyer.
- **Admin** `/admin/species-tags` : page CRUD complète — création groupes + valeurs, toggle des flags `is_required`/`is_exclusive`, archivage soft.

**Visibilité espèces côté annotateur** (`GET /species?q=`) : isolation entre annotateurs — un annotateur ne voit dans son autocomplete que les espèces `status='approved'` OU celles qu'il a proposées lui-même. Il peut re-proposer un nom déjà soumis par un collègue, la réutilisation par `name` UNIQUE est gérée côté backend. Les rôles ≥ chercheur (`PRIVILEGED_ROLES`) voient tout. Évite la pollution par les pending de la communauté avant validation.

**Suggestions ouvertes (non implémentées)** :
- Future « tags obligatoires » comme filtre export distinct (« n'exporte que les espèces qui ont une valeur dans chaque groupe `is_required` »).
- Synonymes / aliases dans `species_tag_definitions` (ex : « fish » → marine_fauna) — utile pour l'autocomplete.
- Tag couleur (hex) pour distinction visuelle dans les listes.

## Demandes d'export chercheur (workflow approbation)

**Décision** : la capacité de demander un export est **exclusive au rôle chercheur** — middleware `requireChercheur` strict (l'admin et le moderator ne passent pas par ce flux, ils ont leurs propres voies). Le chercheur formule une demande avec un périmètre (mêmes filtres qu'admin) + un message de justification + une organisation optionnelle. L'admin approuve ou rejette dans `/admin/requests` onglet « Accès chercheurs ». Une approbation accorde un droit de téléchargement réutilisable jusqu'à `expires_at` (défaut 30 jours, max 365, configurable par l'admin à la résolution).

**Table** : `chercheur_export_requests(id, requester_id, message, organization, scope JSONB, status pending|approved|rejected|withdrawn, reviewed_by, reviewed_at, review_comment, expires_at, created_at)`. Le `scope` JSONB porte un payload `ExportFilters` complet (mêmes champs que `/admin/export/run`).

**Endpoints** :
| Méthode | Route | Auth | But |
|---|---|---|---|
| GET  | `/chercheur/export/facets`           | requireChercheur | Tags distincts pour l'UI filtre |
| POST | `/chercheur/export/preview`          | requireChercheur | Aperçu count avant de soumettre |
| POST | `/chercheur/export-requests`         | requireChercheur | Crée la demande (message ≥ 10 chars) |
| GET  | `/chercheur/export-requests`         | requireChercheur | Mes demandes (tous statuts) |
| DELETE | `/chercheur/export-requests/:id`   | requireChercheur | Annule ma demande pending |
| POST | `/chercheur/export-requests/:id/download` | requireChercheur | Stream zip si approved + non expiré |
| GET  | `/admin/requests/chercheur-exports`  | requireAdmin | Liste pending pour validation |
| POST | `/admin/requests/chercheur-exports/:id/resolve` | requireAdmin | Approve (+ duration_days) ou reject (+ comment obligatoire) |

**Refactor export** : `app-api/src/lib/datumaroExport.js` extrait depuis `routes/admin/export.js` — fonction `streamExportZip(res, filters, actor, originContext)` partagée par admin direct + chercheur post-approbation. `originContext` ∈ `'admin' | 'chercheur-approved'` apparaît dans le README du zip et dans l'audit log `data.export`. Permet de tracer qui a téléchargé quoi via quel canal.

**Réutilisabilité de l'approbation** : un chercheur peut télécharger plusieurs fois la même demande approuvée tant qu'elle n'est pas expirée. Utile car les nouvelles certifications dans le scope apparaîtront aux téléchargements suivants — pas de single-use forcé. Si l'admin veut bloquer, il peut soit fixer une `expires_at` courte, soit fermer la demande (table actuelle ne supporte pas la révocation, à ajouter si besoin).

**Champs obligatoires à la soumission** :
- `message` (justification) ≥ 10 caractères
- `organization` (affiliation) ≥ 2 caractères — sert à la traçabilité des accès, jamais optionnel

**Durée par défaut à l'approbation** : 7 jours (max 365). Pensée pour un accès court et renouvelable plutôt qu'un droit dormant. L'admin peut ajuster au moment de la résolution (champ « Durée (jours) » dans la carte).

**Routes Expo** :
- `/chercheur/export-requests` (chercheur strict) : formulaire + historique des demandes + bouton « Télécharger » sur les approuvées + bouton « Annuler » sur les pending.
- Hub admin `/admin/requests` : onglet « Accès chercheurs » avec compteur en badge, liste des demandes pending, formulaire inline (commentaire + durée) + boutons Approuver/Rejeter.

**Header** : entrée « Mes exports » visible **uniquement** par les chercheurs.

## Export Datumaro (admin)

Page `/admin/export` (`AdminExportScreen`). Génère un zip Datumaro 1.0 des médias **validés par un curator** (`media_moderation.curator_validated_at IS NOT NULL`). Réservé admin (`requireAdmin` sur `/app-api/admin/*`). Le rôle `chercheur` aura un périmètre restreint via la future table `chercheur_export_scopes` (placeholder dans `/admin/requests`).

**Endpoints app-api** :
| Méthode | Route | But |
|---|---|---|
| GET  | `/admin/export/facets`   | Liste les tags d'espèces déclarés + les uploadeurs ayant ≥ 1 certification (alimente l'UI filtre) |
| POST | `/admin/export/preview`  | Aperçu : `count` + breakdown (photos vs frames vidéo, espèces distinctes, uploadeurs distincts) |
| POST | `/admin/export/run`      | Stream zip Datumaro (axios `responseType: 'blob'` côté client) |

**Filtres acceptés** (body JSON) : `date_from`, `date_to` (sur `curator_validated_at`), `species_ids[]`, `tags[]`, `uploader_ids[]`, `source_type` (`all|image|video_frame`), `include_metadata` (défaut `true`).

**Contenu du zip** :
```
annotations/default.json   # Datumaro 1.0
images/task_<id>.jpg       # binaire original (EXIF stripped à l'upload)
README.md                  # filtres appliqués + count
```

Chaque item porte la bbox curator-certifiée (`curator_certifications.chosen_bbox_data → [x, y, w, h]`), `label_id` indexé dans `categories.label.labels` (nom = `scientific_name || usage_name || species_name`), attributs annotation (mode, curator_id, certified_at, species multi-nom, tags), attributs item (uploader_id, GPS, EXIF, `source_video_id`, `source_frame_time_ms`).

**Robustesse** : tâche introuvable côté CVAT (drift entre `media_moderation` et CVAT) → image skipée, loggée, le zip est quand même livré. Pas de blocage si une seule image manque.

**Stack** : `archiver@7` (npm) côté backend, streaming gzip level 5. Headers `Content-Disposition: attachment` + `Cache-Control: no-store`. Pas de file d'attente async pour v1 — un export sync est OK jusqu'à plusieurs centaines d'images (limite pratique = `proxy_read_timeout 600s` côté NGINX).

**Sécurité Accept header** : la lecture frame CVAT (`GET /tasks/{id}/data?type=frame`) exige `Accept: application/vnd.cvat+json, application/json, text/plain, */*` (sinon 406). Pattern identique au proxy `/moderation/media/:taskId/preview`.

**Conformité Datumaro 1.0** :
- Format = **fichier JSON unique** `annotations/default.json` qui référence toutes les images par leur path relatif `images/task_<id>.jpg`. Pas de fichier d'annotation séparé par image — c'est la norme officielle.
- Chaque item porte `subset: 'default'` (convention Datumaro pour la séparation train/val/test ; on n'en a qu'un seul pour l'instant).
- `items[].annotations[].bbox` est au format `[x, y, w, h]` (origine top-left) — strictement la norme.
- `items[].image.size` est `[height, width]` (ordre Datumaro). Quand `media_metadata.image_width/height` est NULL (uploads anciens sans EXIF), le backend lit les dimensions directement dans les segments SOF du JPEG fetché (zéro dépendance npm, lecture binaire).
- Pour importer : `datum project import -f datumaro_1.0 <dossier-décompressé>` ou via CVAT « Create from dataset → Datumaro 1.0 ».

**Nom de plateforme dynamique** : le titre dans `info.title`, le README et le nom du zip slugifient `platform.name` lu depuis `app_settings`. L'admin renomme depuis Paramètres système → tout l'export est aligné sans déploiement.

## Gestion des comptes (`/admin/accounts`)

**Verrous métier** :
- Le superuser CVAT est administrateur **de fait** : `is_superuser` ⇒ `role='admin'` dans toutes les UIs, dropdown remplacé par un badge « Administrateur (verrouillé) ». Backend `PATCH /users/:id/role` rejette 403 si la cible est `is_superuser` ou `is_staff`.
- Le rôle `admin` n'est **jamais attribuable** via l'UI — `ASSIGNABLE_ROLES = ['moderator', 'curator', 'chercheur', 'annotator']` (côté backend ET frontend). Pour créer un autre administrateur, passer par le shell CVAT (`createsuperuser`).

**Création de compte par l'admin** : bouton « + Créer un compte » en haut de l'écran. `CreateAccountModal` (formulaire similaire à `/register` + dropdown rôle parmi les assignables). Endpoint `POST /app-api/users` (admin only) qui orchestre :
1. `POST /api/auth/register` côté CVAT (CVAT exige une email valide RFC + password ≥ 8).
2. Résolution de l'id CVAT par `/users?search=<username>`.
3. UPSERT dans `user_roles` avec le rôle choisi.
Le password n'est jamais persisté côté app-api ; l'utilisateur le change ensuite depuis son profil. CVAT remonte ses erreurs structurées (`{field: [...]}`) qu'on aplatit en message FR pour le toast.

**Comptage « utilisateurs connectés »** dashboard : passé de `COUNT(*) FROM app_sessions WHERE expires_at > NOW()` (qui comptait les sessions zombies de navigateurs fermés) à :
```sql
SELECT COUNT(DISTINCT cvat_user_id) FROM app_sessions
WHERE expires_at > NOW()
  AND last_seen_at > NOW() - INTERVAL '30 minutes'
```
Aligné sur la politique idle (30 min côté `authenticate`). 1 utilisateur = 1 compte, peu importe le nombre de devices / onglets.

**Indicateur par compte** : la liste `/admin/accounts` affiche désormais une colonne « Session » avec :
- pastille verte « Connecté » + nombre de sessions actives (si plusieurs onglets/devices)
- pastille grise « Hors-ligne » + « dernière activité il y a X min/h/j »

Backend renvoie `active_sessions` (int) + `last_seen_at` (timestamp) sur chaque user dans `GET /users`. La requête JOIN `app_sessions` applique le même filtre idle 30 min que le dashboard.

**Rôles assignables** : `['moderator', 'curator', 'chercheur', 'annotator', 'guest']`. Le rôle `guest` est désormais inclus (le user a confirmé qu'il sera utilisé plus tard pour des accès en lecture seule du mur communautaire). Le rôle `admin` reste exclu — uniquement via CVAT superuser.

## Hub admin /admin/requests

Page unique réunissant toutes les requêtes en attente de validation admin. Trois onglets :
- **Contestations** (badge = `moderation_contestations` + `annotation_contestations` non résolues). Embarque `AdminContestationsListScreen` avec sa propre sous-toggle media/annotation.
- **Fiches d'espèces** (badge = `species_edit_requests.status='pending'`). Diff côte-à-côte : champs textuels en surbrillance jaune/rouge/vert, tags add/removed avec puces colorées. Action approve = applique le payload sur `species` (transaction `SELECT FOR UPDATE` + UPDATE conditionnel). Action reject = motif obligatoire.
- **Accès chercheurs** (placeholder, à connecter sur `chercheur_export_scopes` quand l'export Datumaro existera).

Endpoint compteur : `GET /admin/requests/summary` (un appel, retourne les 3 totaux). Lu au mount du hub et après chaque résolution.

L'ancienne route `/admin/contestations` redirige vers `/admin/requests` (Expo `<Redirect />`). Le détail contestation `/admin/contestations/[userId]` reste fonctionnel (atteint via la liste embarquée).

**Workflow fiche d'espèce** :
- Édition directe par tout rôle `curator+` (curator/chercheur/moderator/admin) via `PATCH /species/:id`. Chaque édition log automatiquement une row `admin_actions(action='species.edited', payload={before, after, direct:true})`.
- Pas de mécanisme de validation admin a priori — choix assumé : le rôle curator est déjà profondément trusté (il certifie les annotations exportées). Demander permission pour corriger une faute de frappe serait inversement proportionnel au risque réel et créerait une friction démotivante.
- L'admin garde un filet de sécurité a posteriori via `/admin/species-history` : liste les 200 dernières éditions, diff avant/après, bouton « Annuler cette modification » qui restaure le snapshot `before` et log un `species.reverted` (référence l'action_id annulée + nouveau snapshot). Une action déjà annulée affiche un badge « Annulée » et le bouton revert est masqué (409 si tentative).
- L'ancien workflow `species_edit_requests` (édition → demande → admin valide) a été retiré (routes drop, table conservée pour historique mais plus alimentée). L'onglet « Fiches d'espèces » du hub `/admin/requests` est supprimé.

## Upload et annotation vidéos (ADR-013)

**Décision** : les vidéos sont stockées dans app-api (volume Docker `ocean_videos` → `/data/videos/<id>/source.<ext>` + `poster.jpg`), **jamais dans CVAT**. Raison : CVAT auto-extrairait les frames côté serveur (lent, lourd) et créerait des tasks parasites visibles dans les workflows curator/modération. Le périmètre annotable reste les images extraites, qui passent par le flux task CVAT existant.

**Table `user_videos`** : `id, uploader_id, filename, content_type, size_bytes, duration_seconds, width, height, has_poster, uploaded_at, deleted_at`. Soft-delete via `deleted_at`. Poster = première frame extraite côté client à l'upload (canvas JPEG q=0.85), persistée à côté de la vidéo.

**Endpoints app-api vidéo** :
| Méthode | Route | But |
|---|---|---|
| POST   | `/app-api/videos`              | multipart : `video` (mp4/webm/mov) + `poster` (jpeg) + `metadata` (JSON) ; insère `media_moderation` `pending` |
| GET    | `/app-api/videos`              | mes vidéos avec statut modération + flag `contestation_pending` |
| GET    | `/app-api/videos/:id`          | détail (uploader ou moderator+) |
| GET    | `/app-api/videos/:id/stream`   | streaming avec **Range** (206 Partial Content) pour lecture progressive |
| GET    | `/app-api/videos/:id/poster`   | poster JPEG (cookies `crossOrigin="use-credentials"` côté `<video>`/`<img>`) |
| DELETE | `/app-api/videos/:id`          | soft-delete + suppression filesystem |

Formats acceptés : `video/mp4`, `video/webm`, `video/quicktime`. Limite globale = `upload_max_bytes` (commun image + vidéo). NGINX `/app-api/` : `client_max_body_size 1G` + `proxy_request_buffering off` pour les vidéos volumineuses.

**Schéma polymorphe modération** : `media_moderation` et `moderation_contestations` portent maintenant un discriminateur `media_kind 'image'|'video'` + `cvat_task_id` (NULL pour vidéos) + `video_id` (NULL pour images) avec `CHECK ((cvat_task_id IS NULL) <> (video_id IS NULL))`. PK migré de `cvat_task_id` vers `id SERIAL`. Index uniques partiels sur chaque FK. `annotation_contestations` reste image-only (vidéos jamais annotées directement, pas de `curator_validated_at` non plus).

**JOIN canonique polymorphe** :
```sql
JOIN media_moderation mm
  ON mm.media_kind = c.media_kind
 AND COALESCE(mm.cvat_task_id, mm.video_id) = COALESCE(c.cvat_task_id, c.video_id)
```

**API modération polymorphe** : les mutations `POST /moderation/media/validate` et `/reject` acceptent `items: [{kind, id}]` (fallback `ids: number[]` = image only). `GET /queue` renvoie `image_count` + `video_count` par uploader. `GET /users/:id/media` renvoie des items discriminés `{kind:'image'|'video', ...}`. Nouvelle route `GET /moderation/video/:videoId` pour détail vidéo. La cascade de ban rejette désormais image ET vidéos pending.

**Cleanup automatique** étendu : `selectEligible` ramène les deux kinds, `runCleanup` route les images vers `cvatDelete /tasks/X` et les vidéos vers `deleteVideoFiles(id)` + `user_videos.deleted_at`.

**EXIF strip universel à l'upload image** (`useMediaUpload.ts → stripExifFromAsset`) : avant push vers CVAT, l'image est re-encodée en JPEG q=0.92 via canvas — les segments EXIF disparaissent en passant. Les métadonnées sont lues par `exifr` AVANT le strip et persistées séparément dans `media_metadata`.
**Why** : espèces protégées + GPS embarqué = lieu de braconnage potentiel. Un `clic droit/enregistrer sous` côté annotateur ne révèle plus la position. Coût : ~200 ms / image.

**Nouvelles colonnes `media_metadata`** : `source_video_id` (FK `user_videos`, ON DELETE SET NULL) + `source_frame_time_ms`. Remplies uniquement pour les frames issues d'extraction. UI fiche média : « Vidéo d'origine » et « Frame » affichent « — » sinon.

**UI annotateur** :
- `UploadScreen` : toggle « Photos | Vidéos » en haut. Le picker vidéo utilise un `<input type="file" accept="video/mp4,video/webm,video/quicktime" multiple>` natif (pas d'expo-document-picker — non installé). Poster + dimensions + durée extraites côté client via offscreen `<video>` + canvas avant POST.
- `MediaListScreen` (Mes médias) : panneau **« Mes vidéos »** (300px) à gauche, suivi du layout 3 colonnes images existant (Validé/En attente/Rejeté). Le panneau vidéos a sa propre sélection multi (shift/ctrl-clic), boutons Supprimer / Contester. **Pas de bouton « Extraire »** ici — l'extraction se fait uniquement depuis l'écran Annotation. Double-clic = lecteur modal (`<video controls crossOrigin="use-credentials" controlsList="nodownload">` avec `oncontextmenu` bloqué).
- `StudioSelectScreen` (Annoter) : même panneau « Mes vidéos » à gauche en mode `studio`. Bouton « Extraire des frames » sur **toute vidéo non rejetée** (pending OU validated) — l'extraction est autorisée avant modération, et les frames extraites suivent leur propre cycle de validation indépendant.
- **Écran extracteur** `/studio/video/[videoId]` (`VideoExtractorScreen`) : player central + barre de marqueurs (frame ticks rouges, bookmark ticks jaunes, click-to-seek) + strip vertical de miniatures à droite. Outils : bouton « 📸 Extraire » (actif en pause), « ← frame » / « frame → » (step 1/30 s — force la pause), « ★ Marquer ». Sauvegarde = chaque frame est uploadée comme image classique via `CvatMediaService.uploadMedia` (JPEG q=0.92), puis `recordUpload` + `media_metadata.set` avec `source_video_id` + `source_frame_time_ms`. Les frames sauvegardées disparaissent du strip et entrent en pipeline modération comme une image normale, peuvent finir sur le mur communautaire si validées.

**Raccourcis VideoExtractorScreen** : `←`/`→` step frame (force la pause), `B` ajoute un bookmark (lecture ou pause), `E` extrait la frame courante (uniquement en pause). Les bookmarks sont une queue de timestamps : bouton « Extraire les N marqueurs » fait un seek+capture séquentiel sur chacun (utile pour repérer les moments d'intérêt en visionnage continu, puis tout exporter d'un coup).

**Vidéo d'origine supprimée** : quand une vidéo est rejetée par modération OU soft-deletée par son uploader, les frames extraites depuis cette vidéo continuent d'exister (elles suivent leur propre cycle modération). Sur leur fiche, les champs « Vidéo d'origine » et « Frame » affichent **« Supprimée »** au lieu du nom de fichier et du timestamp. **Implémentation read-time** (pas de mutation cascade) : la route `GET /media/:taskId/metadata` (et `GET /curator/tasks/:id/proposals`) JOIN `user_videos` + `media_moderation` et expose le flag dérivé `source_video_deleted = (uv.deleted_at IS NOT NULL OR vmm.status = 'rejected')`. Le frontend (`ImageMetadata.tsx`) rend « Supprimée » quand ce flag est `true`. Aucune migration de données nécessaire — pas de colonne ajoutée, pas de trigger cascade à maintenir.

**UI modérateur** :
- `ModerationQueueScreen` : `pending_count` ventilé en `🖼 image_count · 🎥 video_count` par uploader.
- `ModerationUserScreen` : la grille mélange tuiles image et tuiles vidéo. Une tuile vidéo affiche le poster (ou un fallback 🎬), un badge « VIDÉO » et la durée. Double-clic image → page détail. Double-clic vidéo → **modal lecteur** (`<video>` avec stream Range + bloque `oncontextmenu`). Sélection multi clavier multi-kind (clés `image:123` / `video:5`). Validate/Reject envoient le bon shape `items` au backend.
- `AdminContestationDetailScreen` : tuile vidéo (poster + filename + bouton sélectif) à côté des tuiles image. Action `resolve` (upheld pour une vidéo) → `user_videos.deleted_at = NOW()` + `deleteVideoFiles` + `media_moderation.binaries_deleted_at`.

**Vocabulaire** : pour l'instant **les vidéos n'apparaissent PAS sur le mur communautaire d'annotation**. Seules les frames extraites validées y arrivent (via le flux image normal).

## Studio d'annotation custom (ADR-007)

**Décision architecturale** : les studios annotateur et curator sont des **pages Expo natives** indépendantes de cvat-ui. Aucun `sub_filter`, aucun scraping de classes CSS CVAT, aucune dépendance au DOM CVAT. Les deux studios consomment les endpoints REST publics CVAT (lecture frame, écriture annotations) via un proxy app-api.

Routes Expo :
| Route | Écran | Rôle requis |
|---|---|---|
| `/studio/select` | `StudioSelectScreen` (deux sections : Mes médias / Mur communautaire) | annotator+ |
| `/studio/[taskId]/[jobId]` | `StudioScreen` (canvas Konva + outils) | annotator+ |
| `/curator/studio/[taskId]/[jobId]` | `CuratorStudioScreen` (coquille — overlay multi-annotateur à construire) | curator+ |

Le studio injecté NGINX (`ocean-studio.{js,css}`, route `/tasks/{id}/jobs/{j}`) reste en place comme **fallback admin** pendant la transition. Voir ADR-006 vs ADR-007.

## Branding — logo + footer

**Logo de plateforme** : géré comme la vidéo d'aide. Fichier dans `/data/videos/.logo/logo.<ext>` (volume `ocean_videos`, sous-dossier dédié pour ne pas multiplier les mounts). Setting public `platform.logo_filename` pointe sur le nom de fichier ; vide = aucun logo, le nom de la plateforme s'affiche seul dans le header.

Endpoints :
| Méthode | Route | Auth | But |
|---|---|---|---|
| POST   | `/app-api/admin/logo`   | admin | multipart `logo` (PNG/JPEG/WEBP/SVG, max 2 Mo), remplace l'existant, UPSERT setting |
| DELETE | `/app-api/admin/logo`   | admin | supprime fichier + clear setting |
| GET    | `/app-api/logo/stream`  | **public** | sert le logo, `Cache-Control: public, max-age=300` |

Le stream est **non authentifié** (vs help-video qui exige auth) : pure branding, aucun contenu sensible, et autorise l'affichage côté login si besoin futur. Cache-bust côté frontend via `?v=<filename>` dans l'URL — le navigateur cache l'image, mais une upload change le nom de fichier ; le hook `usePublicSettings` force le refresh à la sauvegarde.

`Header.tsx` rend `<Image>` à côté du nom de plateforme quand `platform.logo_filename` est non vide. `AdminSettingsScreen.tsx` expose un widget `LogoSection` dans le groupe `branding` (similaire à `HelpVideoSection`), avec preview + boutons Téléverser / Remplacer / Supprimer. Le champ texte `platform.logo_filename` est filtré du rendu par défaut pour éviter le doublon.

**Footer** : composant `frontend/src/shared/components/layout/Footer.tsx`, layout 3 colonnes wrappable (`flexWrap: 'wrap'`, `minWidth: 220` par colonne) :
- Col 1 — Plateforme : `platform.name`, baseline, copyright année courante + « Open Data Polynésie ».
- Col 2 — Contact (rendue seulement si au moins un champ contact est rempli) : email (`mailto:`), téléphone (`tel:`), horaires, adresse, chacun avec icône Unicode (✉/☎/◷/◉). Email + téléphone sont des `Pressable` qui appellent `Linking.openURL`.
- Col 3 — Liens utiles : « Besoin d'aide ? » → `/help`, « Mon profil » → `/profile`.

Le bloc contacts a été **retiré de `LoginScreen`** — il faisait doublon. Il vit maintenant exclusivement dans le footer.

## Rangs (médailles) — paramétrables

Les seuils restent figés dans [frontend/src/shared/ranks.ts](frontend/src/shared/ranks.ts) (modifier rétroactivement fausserait l'historique). Le **libellé** et la **couleur** de chaque rang (`debutant|bronze|argent|or|platine`) sont des `app_settings` publics dans le groupe `ranks`, modifiables depuis Paramètres système (preview live dans la page admin). `computeRank` lit les valeurs courantes via `getPublicSettings()` au moment de l'appel ; le cache est rafraîchi à chaque save admin via `refreshPublicSettings()`. Validation serveur : `pattern: /^#[0-9a-fA-F]{6}$/` sur les couleurs (settingsRegistry).

**Stack rendu** : `react-konva@19.0.10` + `konva` (web only — `Platform.OS !== 'web'` affiche un fallback). Stage Konva avec image fit-to-canvas, Group scaled pour les coordonnées image, Transformer pour drag/resize, ghost rect dashed pendant le tracé.

**Outils + viewport** : 3 outils — Rect (drag-and-drop pour tracer), Select (Transformer 8 poignées), Déplacer (pan stage). Raccourcis : R / V / P. Zoom : boutons +/− et « Ajuster » dans la colonne outils, raccourcis +/-/0, molette souris centrée sur le curseur. Borne zoom 0.2x à 8x. Le Stage Konva applique le zoom (`scaleX/scaleY`) + position pan ; le Group interne reste en image-fit pour que les coordonnées des shapes restent en pixels image, invariantes au zoom. Tracé d'un rect = mousedown + drag + mouseup (≥ 4px image-coords sinon ignoré).

**Contrainte single-rect** : un seul rectangle par annotation. `addShape` remplace inconditionnellement le shape précédent ; au validate, PUT-replace côté CVAT supprime tout shape qui n'est plus en local.

**Modèle d'isolation** : un job CVAT par annotateur (consensus_replicas=2 par défaut). `/studio/claim` assigne un job libre au demandeur via `PATCH /jobs/{id} {assignee}`. Idempotent : retourne le job déjà assigné si on re-claim. Lecture/écriture des annotations passent par un proxy app-api strict (`/app-api/studio/jobs/:id/annotations` GET et PUT) qui vérifie `job.assignee.id === cvatUser.id` — bypass l'autorité CVAT du task owner. Curator/admin sont traités comme annotateurs ordinaires dans le studio annotation ; leur permission élargie ne s'appliquera que dans le futur studio curator.

Tables app-api dédiées :
- `species(id, name UNIQUE, status pending|approved|rejected, proposed_by, approved_by, usage_count, created_at)` — source de vérité de la liste maître. Pattern hybride : Postgres central, CVAT reçoit le label en miroir lazy au moment du `POST /annotations` via `POST /app-api/studio/labels/sync` (idempotent, sémantique merge confirmée v2.62).
- `annotation_comments(id, cvat_job_id, cvat_shape_client_id, author_id, comment, created_at)` — commentaires libres par bbox, lus par le curator plus tard.

Endpoints app-api studio :
| Méthode | Route | Auth | But |
|---|---|---|---|
| GET  | `/studio/feed` | requireAuth | Liste agrégée mes-médias + flux validé, tri `completed_count ASC` |
| POST | `/studio/claim {task_id}` | requireAuth | Assigne un job libre, idempotent, 409 si complet |
| GET  | `/studio/tasks/:id/preview` | requireAuth | Proxy preview (admin token, contourne 403 owner-only) |
| GET  | `/studio/jobs/:id/annotations` | requireAuth | Proxy lecture + enrichit chaque shape avec `label_name` |
| PUT  | `/studio/jobs/:id/annotations` | requireAuth | Proxy écriture |
| POST | `/studio/labels/sync {task_id, names}` | requireAuth | Append labels manquants au task, retourne mapping `name → label_id` |
| POST | `/studio/comments {cvat_job_id, cvat_shape_id, comment}` | requireAuth | Insert commentaire |
| POST | `/studio/contest-annotation {cvat_task_id, message}` | requireAuth | Contestation de l'annotation finale (rejette si la tâche n'est pas encore `curator_validated_at`) |
| GET  | `/species?q=` | requireAuth | Autocomplete tri `LOWER(name) ASC` (pas de tri par usage_count — anti-biais), gate frontend ≥1 lettre |
| POST | `/species {name}` | requireAuth | Création idempotente, status='pending' |
| PATCH | `/species/:id/approve` | requireCuratorOrAbove | Curator validation |
| POST | `/species/:id/increment-usage` | requireAuth | Incrémente compteur (frontend l'appelle au validate, mais ne l'affiche pas) |

**Anti-biais autocomplete** : aucune suggestion tant que < 1 lettre tapée. `usage_count` jamais affiché côté UI. Tri alphabétique pour ne pas véhiculer la popularité par l'ordre. **Search "contains"** (pas "starts with") pour matcher la frappe partout dans le nom — formellement présenté comme « suggestions » et non « autocomplétion », pour ne pas suggérer une intention contraignante.

**Modèle espèce enrichi** (à implémenter) : `species` doit porter trois noms — `scientific_name` (Latin), `common_name` (français/usage), `polynesian_name` (tahitien d'usage) — affiché « Nom usage (polynesian_name) ». Tag `category` ∈ `terrestrial_fauna | marine_fauna | ...` (radio extensible). Champ `description` libre, rempli par le curator (saisie, Wikipédia, ou validation de la proposition annotateur). La recherche frappe sur les trois noms — l'annotateur tape n'importe lequel, le suggesteur trouve.

**Page de sélection `/studio/select`** : layout horizontal **Mes médias (flex 2) | Mur communautaire (flex 1)**. Mes médias est subdivisé en 3 sous-sections par `annotation_state` : « Non annoté », « Annoté » (≥ 1 shape dans mon job), « Validé par curator » (`media_moderation.curator_validated_at IS NOT NULL`). La section Validé propose un footer « Voir / Contester » sur chaque tuile. « Voir » est un placeholder tant que le studio curator ne produit pas encore d'annotation finale (`Alert` informatif). « Contester » ouvre `ContestModal` partagé avec la modération → POST `/studio/contest-annotation`.

**Vocabulaire** : le terme « flux » est banni de l'UI au profit de **« mur »** (mur communautaire, mur de médias). Le guest verra une version curated du mur (exemples + médias labellisés pour l'attractivité, **sans** exposition complète pour éviter l'aspiration des idées par des tiers).

**Polling post-upload** : `CvatMediaService.waitForTaskData` poll `GET /tasks/{id}` (toujours 200) en attendant `task.size > 0`. **Ne PAS poll `/preview`** : retourne 400 jusqu'à ingestion → console saturée d'erreurs cosmétiques.

## Studio Curator (`/curator/studio/[taskId]/[jobId]`)

**Workflow** : studio unifié (un seul mode UI, deux états internes `review` / `drawing`). Le curator voit toutes les bbox proposées par les annotateurs (replicas du même task), peut en sélectionner une pour la certifier verbatim, ou tracer la sienne propre. **Aucune édition possible sur les bbox annotateurs** (read-only intégral, pas de Transformer). Seule la bbox curator-dessinée (couleur cyan `#06b6d4` distincte, stroke 3px) est éditable.

Layout : sidebar gauche 290 px (outils + zoom + propositions + opacité + color picker + + Nouvelle annotation), canvas central flex, sidebar droite 320 px (3 champs espèce + commentaire + métadonnées + Certifier).

**Couleurs** : toutes les bbox annotateurs ont la **même couleur** (choisie par le curator parmi 6 swatches `ANNOTATOR_PALETTE` dans `utils/annotatorColors.ts`, persistée `localStorage.curator_annotator_color`). L'identité de l'annotateur passe par `AnnotatorBadge` (username + slot rank `TODO`) dans la liste et le tooltip survol. La curator-bbox utilise `CURATOR_COLOR=#06b6d4` non sélectionnable.

**Opacité 3 niveaux** (`OpacityRadio`) : Cachée/Légère/Opaque pilote les bbox **non cochées** dans les 2 modes. Sélectionnées toujours à opacité 1.

**Tables** (cf. db.js) :
- `species` enrichie : `usage_name`, `tags TEXT[]`, `reference_image_url` (posé, non exposé UI). `category` (Lot C, single-value) devient mort-né au profit de `tags`.
- `media_metadata(cvat_task_id PK, gps_*, taken_at, camera_*, image_*, raw_exif JSONB)` : EXIF extraite côté frontend via `exifr` au mount d'upload, POST à `/app-api/media/:taskId/metadata` après `recordUpload`.
- `curator_certifications(id, cvat_task_id, cvat_job_id, curator_id, mode review|create, chosen_bbox_annotator_id, chosen_bbox_data JSONB, rejected_proposals JSONB, species_id, curator_comment, certified_at)` : audit pour calcul futur du rang annotateur (`COUNT WHERE chosen_bbox_annotator_id=X AND mode='review'`).
- `annotation_comments.is_curator_comment BOOLEAN` : distinguer commentaire curator d'un commentaire annotateur.

**Endpoints app-api curator** :
| Méthode | Route | But |
|---|---|---|
| GET  | `/curator/tasks/:id/proposals` | Agrège jobs replicas (assignees + shapes + label_name + species DB joinées) + metadata + moderation row |
| POST | `/curator/tasks/:id/certify`   | Orchestration complète : upsertSpeciesFull → ensure label CVAT → PUT /jobs annotations → UPDATE media_moderation.curator_validated_at → INSERT curator_certifications. Transactionnel sur le bloc DB (CVAT en best-effort) |
| POST | `/species/full`                | Idempotent : match 3 noms → match source_name → INSERT. Statut auto = 'approved' (réservé curator+) |
| GET  | `/species/search?field=…&q=…`  | Single-field autocomplete (scientific|usage|polynesian), contains |
| GET/POST | `/media/:taskId/metadata`  | Upsert EXIF (extrait côté frontend via exifr) |

**Build studio** (en cas de pépin frontend) : Konva via le hook `useStudioFrame` partagé avec l'annotateur. Le curator a ses **propres outils** (Rect/Select/Pan + zoom +/-/Réajuster) mais ne dessine **qu'une seule** curator-bbox ; cliquer "+ Nouvelle annotation" en plein milieu de drawing jette la précédente sans confirmation (anti-frustration).

**Rang annotateur** (`curator_certifications`) : tables prêtes, calcul UI à construire séparément. Composant `AnnotatorBadge.tsx` réserve un slot vertical avec commentaire `// TODO rank badge`.

## Authentification & sessions (ADR-012)

**Décision** : pas de token CVAT côté navigateur. App-api est l'autorité de session, CVAT n'est plus appelé directement depuis le frontend.

**Flux** :
1. `POST /app-api/auth/login {username, password, remember_me}` → app-api appelle `POST /api/auth/login` côté CVAT, récupère le token, INSERT dans `app_sessions(id UUID, cvat_user_id, cvat_token, remember, expires_at, last_seen_at, user_agent, ip)`, émet cookie `ocean_session=<uuid>; HttpOnly; SameSite=Lax; Secure(prod)`.
2. `POST /app-api/auth/logout` → DELETE session row, clear cookie.
3. Middleware `requireAuth` lit le cookie, vérifie idle/expiration, refresh `last_seen_at`, expose `req.cvatUser` + `req.cvatToken`.
4. `*  /app-api/cvat/*` → proxy générique qui forwarde vers `${CVAT_API}/*` en ré-injectant `Authorization: Token <stocké en DB>` côté serveur. Le proxy **doit** être monté avant `express.json()` (`src/index.js`) pour que les bodies multipart (upload) ne soient pas consommés.

**Politiques** :
- Idle 30 min (touché à chaque requête).
- Absolu 12 h sans « se souvenir de moi », 30 j si coché (`REMEMBER_LIFETIME_MS`).
- Cookie session-only (pas de `Max-Age`) si non coché → tombe à la fermeture du navigateur.

**Frontend** :
- `apiClient` (axiosClient.ts) — `baseURL: /app-api/cvat`, `withCredentials: true`, plus aucun interceptor d'auth. Toutes les anciennes routes CVAT en `/api/...` sont remplacées par `/app-api/cvat/...`.
- Tous les services app-api (`AppApiService`, `CuratorService`, `StudioService`, `ModerationService`, `SpeciesService`, `MediaMetadataService`) ont `withCredentials: true` et n'injectent plus de Bearer.
- `authStorage.ts` : ne stocke plus de token. Garde `cvat_user_profile` (nav role) et `ocean_session_alive` (flag non sensible pour multi-onglets).
- Multi-onglets : logout dans un onglet → `clearSessionAlive()` → storage event → autres onglets redirigent vers `/login` (listener dans `app/_layout.tsx`).
- LoginScreen : checkbox « Se souvenir de moi (30 jours) » passe `rememberMe` à `CvatAuthService.login()`.

**banInterceptor** : détecte 401 par `data.hint` (`expired`, `idle_timeout`, `unknown_session`, `cvat_returned_*`) et redirige. Vérifie `isSessionAlive()` plutôt que la présence du token.

**Studio CVAT injecté legacy** (ADR-006) : ne fonctionne plus, car il dépendait du cookie `sessionid` que CVAT mettait directement. Le studio custom (ADR-007) reste pleinement opérationnel via le proxy.

**Sécurité — pourquoi un cookie HttpOnly est le bon choix** :
- Un seul cookie utilisé : `ocean_session`, valeur = UUID opaque (pas de payload). Pas de JWT côté client, pas de token CVAT exposé.
- `HttpOnly` → inaccessible à `document.cookie` / JavaScript → immunisé XSS (contrairement à localStorage qui en serait la cible n°1).
- `SameSite=Lax` → blocage CSRF cross-origin standard. Pour les opérations critiques, on peut durcir à `Strict`.
- `Secure` actif en prod (HTTPS obligatoire). En dev `localhost`, le navigateur ignore la contrainte.
- Tout l'état (token CVAT, expirations, ban, user-agent, IP) vit côté serveur dans `app_sessions` — révocable instantanément (DELETE row → cookie devient inerte).

**Portage mobile (RN natif)** :
- `axios` sur RN utilise NSURLSession (iOS) / OkHttp (Android) qui gèrent les cookies de façon transparente. `withCredentials: true` suffit, pas besoin de `react-native-cookies`.
- `authStorage.ts` bascule automatiquement : `localStorage` sur web, `expo-secure-store` sur mobile. Ne contient que des données non sensibles (profil pour UI role-gating + flag `ocean_session_alive`).
- Storage event multi-onglets : web uniquement (mobile n'a pas la notion d'onglets partagés).

**Production** : NGINX doit forwarder `Cookie` et `Set-Cookie` (par défaut OK). Avec HTTPS, `Secure` cookie automatique côté Express. En dev (`localhost`), les navigateurs ignorent la contrainte `Secure`.

## Studio CVAT injecté (legacy, ADR-006) — coexiste avec ADR-007
```
nginx/static/
  ocean-theme.css   # AUTO-GÉNÉRÉ. Source : frontend/src/shared/theme/
  ocean-studio.css  # Masquage header CVAT — utilise var(--ocean-*)
  ocean-studio.js   # IIFE : barre top/validation/appReturn redirect
scripts/
  generate-studio-theme.js  # Régénère ocean-theme.css depuis les thèmes TS
```
**⚠ Après modif de `frontend/src/shared/theme/*.ts`** : `node scripts/generate-studio-theme.js`. `ocean-theme.css` est commité.

## Structure frontend (fichiers clés)
```
app/(main)/
  media.tsx           → MediaListScreen
  upload.tsx          → UploadScreen
  annotate.tsx        → redirect vers /studio/select (legacy URL)
  studio/index.tsx    → redirect vers /studio/select
  studio/select.tsx   → StudioSelectScreen
  studio/[taskId]/[jobId].tsx                 → StudioScreen (annotateur)
  curator/index.tsx   → CuratorHubScreen
  curator/done.tsx    → CuratorPostValidationScreen
  curator/studio/[taskId]/[jobId].tsx         → CuratorStudioScreen (coquille)
  moderation/...      → modération
src/features/studio/
  screens/StudioScreen.tsx, StudioSelectScreen.tsx
  components/StudioCanvas.tsx, ValidationPanel.tsx, SpeciesAutocomplete.tsx, StudioFeedTile.tsx
  hooks/useStudioFrame.ts (image), useInitialShapes.ts (shapes existants)
  types.ts (StudioShape, StudioTool)
src/services/api/
  axiosClient.ts       # apiClient — pas de Content-Type global
  StudioService.ts     # getFeed, claim, validateAll (PUT-replace via proxy)
  SpeciesService.ts    # search, create, incrementUsage
  CvatAuthService.ts, CvatMediaService.ts, ModerationService.ts, AppApiService.ts
src/shared/components/
  layout/Header.tsx       # nav (entrée "Annotation" → /studio/select)
  layout/Breadcrumb.tsx   # auto-généré depuis usePathname()
  images/AuthenticatedImage.tsx   # GET image authentifiée → base64 ou via client custom
  images/ImageLightbox.tsx
```

## CVAT API v2 — endpoints
| Action | Endpoint |
|---|---|
| Login | `POST /auth/login` → `{ key }` |
| Créer tâche | `POST /tasks` `{name, labels:[{name:"item"}]}` |
| **Upload fichiers** | `POST /tasks/{id}/data` multipart — voir gotchas |
| **Preview miniature** | `GET /tasks/{id}/preview` ← PAS `/data?type=preview` (400) |
| Liste tâches | `GET /tasks?page_size=20` |
| Supprimer tâche | `DELETE /tasks/{id}` |
| **Jobs d'une tâche** | `GET /jobs?task_id={id}` ← PAS `/tasks/{id}/jobs` (404) |
| Utilisateur courant | `GET /users/self` |
| Assigner annoteur | `PATCH /jobs/{id}` `{assignee: userId}` |
| Studio annotation | `http://localhost:8888/tasks/{id}/jobs/{jobId}` (via gateway) |

Auth : `Authorization: Token <key>` — pas de CSRF.

## Gotchas critiques (chaque point = bug réel)

**Upload `client_files` — clé indexée obligatoire :**
DRF parse les fichiers via `parse_html_list`. La clé DOIT être `client_files[0]`, `client_files[1]`… (pas `client_files` sans index).
Sans index → `validated_data['client_files'] = []` → fichiers perdus → worker "No media data found". Le POST retourne quand même 202 OK (trompeur).
```ts
formData.append(`client_files[${i}]`, file.file, fileName); // ✓
formData.append('client_files', file.file, fileName);        // ✗ silencieusement ignoré
```

**Upload File natif (web) :** Utiliser `asset.file` (objet `File` natif expo-image-picker). `fetch(blob_uri)` → blob vide.

**axiosClient — pas de Content-Type global :** Sinon multipart/form-data cassé (boundary non généré). Axios gère automatiquement.

**app-api → cvat_server — `Host: localhost` obligatoire :**
`cvat_server:8080` tourne derrière son propre nginx interne qui vérifie le Host header. Appel direct depuis un container Docker → `Host: cvat_server:8080` → 400. Fix : passer `Host: localhost` dans tous les appels axios du service `app-api`. Concerne `middleware/auth.js` et `routes/users.js`.

**axiosClient — `withCredentials: true` :** Le login (`POST /api/auth/login`) renvoie un cookie `sessionid`. Avec `withCredentials: true`, le navigateur stocke ce cookie pour `localhost`. Quand le studio d'annotation s'ouvre (`window.open localhost:8888`), ce cookie est envoyé → CVAT SPA authentifiée automatiquement. Requiert que nginx renvoie `Access-Control-Allow-Origin: $http_origin` (pas `*`) et `Access-Control-Allow-Credentials: true`.

**Upload async :** POST → 202 immédiat → `cvat_worker_import` traite en background. Preview dispo après ~3s.

**Preview 400 :** `GET /tasks/{id}/preview` retourne 400 si la tâche n'a pas de données (upload raté). Utiliser les logs Docker pour diagnostiquer : `docker logs cvat_worker_import`.

**Alert.alert web :** Callbacks multi-boutons non fiables → `window.confirm()` sur `Platform.OS === 'web'`.

**Accept header axiosClient :** `application/vnd.cvat+json, application/json, text/plain, */*` — le `*/*` couvre les images.

**CVAT 500 sur GET avec `data: null` :** appeler `axios({ method: 'get', url, data: null, ... })` côté serveur fait planter CVAT v2.62 (`AttributeError: 'NoneType'.get` dans leur permission code, ligne `request.data.get("project_id")`). Cause : axios sérialise `data: null` même sur GET, et Django parse ça comme un body JSON. **Toujours utiliser `axios.get(url, { headers })` distinct de `axios.patch/put` côté app-api**, pas un dispatcher générique. Voir `app-api/src/routes/studio.js` (refactor `cvatRequest` → `cvatGet/cvatPatch/cvatPut`).

**Labels CVAT — sémantique merge sur PATCH `/tasks/{id}` :** v2.62 fait merge (append) et non replace ; les labels existants sont conservés. Confirmé par smoke test. Pas besoin de lire d'abord la liste pour append. Pour récupérer le `label_id` du nouveau label : refaire un `GET /labels?task_id=X` après le PATCH (le retour du PATCH ne contient pas inline les labels).

**Annotations format CVAT v2 :** `PUT /jobs/{id}/annotations` body `{ version, tags, shapes, tracks }`. Chaque shape rectangle : `{ type:'rectangle', points:[x1,y1,x2,y2], frame, label_id, occluded:false, outside:false, z_order:0, rotation:0, group:0, source:'manual', attributes:[] }`. Inclure `id` pour update (CVAT préserve), omettre pour create. CVAT alloue/préserve les ids selon présence.

**CVAT `?id__in=` IGNORÉ silencieusement sur `/tasks` :** v2.62 ne filtre PAS par `id__in`, il retourne les `page_size` premières tâches en ordre par défaut (id DESC). Bug silencieux : tant que les IDs demandés sont les plus récents, ça « marche » par hasard. Dès qu'il y a des tâches plus récentes que celles demandées, on récupère les mauvaises et nos `tasksById[id]` deviennent `undefined` → médias filtrés à tort comme orphelins. Toujours faire des `GET /tasks/{id}` individuels en parallèle (`Promise.all`) pour récupérer un set de tâches par IDs.

**CVAT permission task owner :** le owner d'une tâche (= uploader CVAT) a accès à TOUS les jobs de sa tâche, contournant l'isolement par assignee. Pour bloquer ça (cas où l'uploader ne doit pas voir les annotations des autres annotateurs sur SA tâche), passer par un proxy app-api qui vérifie strictement `job.assignee.id === cvatUser.id`. Modèle utilisé pour `/app-api/studio/jobs/:id/annotations`.
