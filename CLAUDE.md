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
Aucune fonctionnalité native CVAT ne couvre la modération de contenu : ni queue de validation pré-publication, ni signalement, ni workflow de bannissement avec motif/durée. Le seul levier proche est le flag Django `is_active=false`, qui n'est pas un outil de modération mais un interrupteur admin. Toute la logique est donc **à construire** côté app-api (tables de signalements et bannissements, endpoints dédiés).

Env app-api : `CVAT_ADMIN_USER` / `CVAT_ADMIN_PASS` (définis dans `.env`) — utilisés pour fetcher la liste complète des users CVAT (seul un superuser CVAT peut le faire). Token caché en mémoire avec refresh auto sur 401.

Services frontend :
- `AppApiService.ts` — client app-api (axios séparé, lit token localStorage)
- `authStorage.ts` — `saveUserProfile` / `getUserProfile` / `clearUserProfile` (post-login, pré-logout)
- `CvatAuthService.login()` — appelle `/users/self` + `/app-api/users/me` pour stocker `appRole` localement
- `Header.tsx` — lit `appRole` au mount, affiche selon hiérarchie des rôles
- Gardes de route : `admin.tsx` (admin only), `media/annotate/upload.tsx` (pas guest)

## Studio d'annotation — fichiers injectés via NGINX
```
nginx/static/
  ocean-theme.css   # AUTO-GÉNÉRÉ — ne pas éditer. Source : frontend/src/shared/theme/
  ocean-studio.css  # Layout barre bas, sélecteurs masquage header CVAT — utilise var(--ocean-*)
  ocean-studio.js   # IIFE : barre top/validation/label live/nav blocker
scripts/
  generate-studio-theme.js  # Génère ocean-theme.css depuis les thèmes TS
```
**⚠ Après toute modification de `frontend/src/shared/theme/*.ts` :**
```bash
node scripts/generate-studio-theme.js
```
`ocean-theme.css` est commité (volume NGINX), pas de build step nécessaire en prod.

## Structure frontend (fichiers clés)
```
app/(main)/media.tsx → MediaListScreen    app/(main)/upload.tsx → UploadScreen
app/(main)/annotate.tsx → AnnotationHubScreen
src/services/api/
  axiosClient.ts         # axios instance — PAS de Content-Type global
  CvatAuthService.ts     # login, register, logout
  CvatMediaService.ts    # uploadMedia, getTasks, deleteTask, getFirstJobId, getSelf, assignJob
src/shared/components/images/
  AuthenticatedImage.tsx # GET image via token Bearer → base64
  ImageLightbox.tsx      # modal plein écran (utilisé dans MediaListScreen)
```
Orphelins (non utilisés) : `MediaCard.tsx`, `useMediaQueue.ts`

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
