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

Hiérarchie des rôles (haut → bas) : `admin` > `moderator` > `curator` > `annotator` > `guest`.
Stockage : table `user_roles(cvat_user_id PK, role)`. Utilisateurs non présents = `annotator` par défaut.

**Rôle curator — détail :**
Reçoit un **batch de médias annotés à valider, fourni individuellement** à chaque curator par l'admin ou par un algorithme d'assignation (à construire).
Son travail : vérifier la qualité, voir tous les labels et étiquettes (noms d'espèces) proposés par les différents annotateurs, puis fusionner les annotations, choisir la meilleure, ou réannoter lui-même. Valide pour usage/export.

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
- `moderation_contestations(id, cvat_task_id, contester_id, message, created_at, resolved_at, resolved_by, resolution upheld|overturned)` — déposée par l'uploadeur sur ses médias rejetés. Côté UI uploadeur : ✅ **construit** (page « Mes Médias », sélection multi-rejetés → ContestModal). Côté admin/modérateur : ⏳ **À construire** — file de contestations ouvertes, lecture du message, résolution `overturned` (re-validation, repasser le `media_moderation.status` à `validated` + `released_at` du ban éventuel) ou `upheld` (clore sans changer).

Ban d'un utilisateur :
1. INSERT `user_bans` (transactionnel avec UPDATE cascade des médias `pending` → `rejected`).
2. PATCH CVAT `is_active=false` (le user ne peut plus s'authentifier — DRF renvoie `{"detail":"User inactive or deleted."}` 401 sur ses requêtes).
3. **Auto-réactivation** : sur `GET /users` (panneau admin) et `GET /moderation/bans/check` (login), pour chaque user `is_active=false` dont le dernier ban a `expires_at <= NOW() AND released_at IS NULL` → PATCH CVAT `is_active=true`. Pas de cron, c'est lazy à l'accès.
4. Levée manuelle (admin clique « Activé ») : UPDATE `user_bans SET released_at=NOW(), released_by=admin` sur tout ban actif + PATCH CVAT.

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

## Studio d'annotation custom (ADR-007)

**Décision architecturale** : les studios annotateur et curator sont des **pages Expo natives** indépendantes de cvat-ui. Aucun `sub_filter`, aucun scraping de classes CSS CVAT, aucune dépendance au DOM CVAT. Les deux studios consomment les endpoints REST publics CVAT (lecture frame, écriture annotations) via un proxy app-api.

Routes Expo :
| Route | Écran | Rôle requis |
|---|---|---|
| `/studio/select` | `StudioSelectScreen` (deux sections : Mes médias / Flux communautaire) | annotator+ |
| `/studio/[taskId]/[jobId]` | `StudioScreen` (canvas Konva + outils) | annotator+ |
| `/curator/studio/[taskId]/[jobId]` | `CuratorStudioScreen` (coquille — overlay multi-annotateur à construire) | curator+ |

Le studio injecté NGINX (`ocean-studio.{js,css}`, route `/tasks/{id}/jobs/{j}`) reste en place comme **fallback admin** pendant la transition. Voir ADR-006 vs ADR-007.

**Stack rendu** : `react-konva@19.0.10` + `konva` (web only — `Platform.OS !== 'web'` affiche un fallback). Stage Konva avec image fit-to-canvas, Group scaled pour les coordonnées, Transformer pour drag/resize, ghost rect dashed pendant le tracé.

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
| GET  | `/species?q=` | requireAuth | Autocomplete tri `LOWER(name) ASC` (pas de tri par usage_count — anti-biais), gate frontend ≥1 lettre |
| POST | `/species {name}` | requireAuth | Création idempotente, status='pending' |
| PATCH | `/species/:id/approve` | requireCuratorOrAbove | Curator validation |
| POST | `/species/:id/increment-usage` | requireAuth | Incrémente compteur (frontend l'appelle au validate, mais ne l'affiche pas) |

**Anti-biais autocomplete** : aucune suggestion tant que < 1 lettre tapée. `usage_count` jamais affiché côté UI. Tri alphabétique pour ne pas véhiculer la popularité par l'ordre.

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

**CVAT permission task owner :** le owner d'une tâche (= uploader CVAT) a accès à TOUS les jobs de sa tâche, contournant l'isolement par assignee. Pour bloquer ça (cas où l'uploader ne doit pas voir les annotations des autres annotateurs sur SA tâche), passer par un proxy app-api qui vérifie strictement `job.assignee.id === cvatUser.id`. Modèle utilisé pour `/app-api/studio/jobs/:id/annotations`.
