# Ora te Fenua !

Plateforme d'annotation collaborative de la biodiversité polynésienne.

## Contexte

Projet développé par **SHAN YAN Océan** dans le cadre du **stage de Licence 3 Informatique de l'Université de la Polynésie Française (UPF), promotion 2026**.

- **Tuteur de stage** : Sébastien CHABRIER
- **Encadrement** : Bryan DALLEST
- **Partenaires** :
  - **DRM** — Direction des Ressources Marines (Polynésie française)
  - **UPF** — Université de la Polynésie Française
  - **GePaSud** — laboratoire de recherche de l'UPF

La plateforme outille la collecte et l'annotation collaborative de données photo/vidéo sur les espèces marines et terrestres polynésiennes. Elle vise à constituer des jeux de données scientifiques exportables (format Datumaro) pour la recherche et la conservation.

## Architecture

```
   ┌──────────────┐
   │  Expo Web    │     React Native + react-native-web (TS strict)
   │  port 8081   │     Stack cross-platform (web + iOS + Android)
   └──────┬───────┘
          │
   ┌──────▼───────┐     reverse proxy + CORS + bloqueur d'URL CVAT
   │ NGINX Gateway│     stratégie : seul point d'entrée HTTP/HTTPS
   │  port 8888   │
   └──────┬───────┘
   ┌──────┴──────┬──────────────┐
   │             │              │
   ▼             ▼              ▼
 ┌─────────┐ ┌─────────┐  ┌─────────────────┐
 │ app-api │ │  CVAT   │  │ /app-api/static │
 │ Node    │ │ Django  │  │  bundle Expo    │
 │ Express │ │ Postgres│  │  (mode prod)    │
 │ + pg    │ │ + Redis │  └─────────────────┘
 │ port 3K │ │ ↔ pg int│
 └────┬────┘ └─────────┘
      │
 ┌────▼────────┐
 │ PostgreSQL  │   tables app-api : user_roles, app_sessions, media_moderation,
 │ pg_data vol │   user_videos, species, curator_certifications, app_settings,
 └─────────────┘   admin_actions, user_bans, etc.
```

Détails techniques étendus : [CLAUDE.md](CLAUDE.md). Procédures de déploiement : [PRODUCTION.md](PRODUCTION.md).

## Workflow utilisateur

```
                                  curator
                                   (3+)
 annotateur                         │
   (1+)                            ▼
    │      modérateur          curation   admin
    │       (4+)                   │      export
    ▼          │                   ▼        ▼
 ┌──────┐  ┌───────────┐    ┌────────────┐  ┌────────────┐
 │upload│─▶│modération │───▶│ annotation │─▶│ certification │
 └──────┘  │valide/rej │    │ N jobs/    │  │ curator       │
           └───────────┘    │ replicas   │  └──────┬────────┘
                            └────────────┘         │
                                                   ▼
                                            ┌───────────────┐
                                            │ Export        │
                                            │ Datumaro      │
                                            │ (chercheur)   │
                                            └───────────────┘
```

Rôles (du moins privilégié au plus) :

| Rôle | Capacités |
|---|---|
| `guest` | Mur communautaire en lecture (futur) |
| `annotator` | Upload, annotation, contestation de ses rejets |
| `chercheur` | Annotateur + droit de demande d'export Datumaro filtré |
| `curator` | Validation finale des annotations, édition des fiches d'espèces |
| `moderator` | Validation/rejet des uploads, bannissements jusqu'au rôle annotator |
| `admin` | Tout (compte unique, lié au superuser CVAT) |

---

## Installation locale (développement)

### Pré-requis

- **Docker Engine** ≥ 24 et **Docker Compose** v2 (`docker compose ...`)
- **Node.js** ≥ 20 + **npm** ≥ 10 (pour le serveur de développement Expo)
- **Linux** ou **macOS** (testé sur Linux, WSL2 OK). Windows natif non testé.
- Ports libres : `8888` (gateway), `8081` (Expo Metro). Le port `8080` est utilisé par Traefik CVAT en interne — **ne pas l'exposer publiquement**.

### Étapes

```bash
# 1. Cloner le repo
git clone https://github.com/Owshun3/ocean_labelling.git
cd ocean_labelling

# 2. Préparer le fichier .env racine (gitignored)
cp .env.example .env
```

Éditer `.env` avec des mots de passe forts :

```env
POSTGRES_PASSWORD=<mdp_postgres_fort>
CVAT_ADMIN_USER=admin
CVAT_ADMIN_PASS=<mdp_admin_cvat_fort>
# CSRF_TRUSTED_ORIGINS reste vide en dev local (le défaut localhost s'applique)
```

> 💡 `CVAT_ADMIN_PASS` doit correspondre au superuser CVAT — défini lors de la première initialisation du container CVAT (voir étape 5).

```bash
# 3. (Optionnel) frontend/.env si tu veux pointer ailleurs que localhost
#    En dev local : aucun fichier à créer. Le bundle dérive l'URL au runtime.
cp frontend/.env.example frontend/.env  # uniquement si override nécessaire

# 4. Démarrer toute la stack (CVAT + postgres + app-api + gateway)
docker compose up -d

# 5. Premier démarrage CVAT : créer le superuser admin
#    Le mot de passe que tu saisis ICI doit être le même que CVAT_ADMIN_PASS dans .env
docker exec -it cvat_server python /home/django/manage.py createsuperuser

# 6. Installer les dépendances + démarrer le frontend
cd frontend
npm install
npx expo start -c --web
```

Ouvrir `http://localhost:8081/` dans le navigateur. Le bundle dérive l'URL API depuis `window.location` (cf. [runtimeUrls.ts](frontend/src/services/api/runtimeUrls.ts)) → API sur `http://localhost:8888/app-api`.

### Vérifier le bon démarrage

```bash
docker compose ps                       # tous les services doivent être healthy/up
docker compose logs app-api --tail 30   # app-api écoute sur :3000
docker compose logs gateway --tail 10   # NGINX écoute sur :8080 (mappé en 8888)
curl http://localhost:8888/app-api/health  # → {"status":"ok","service":"ocean-app-api"}
```

### Connexion initiale

1. Ouvrir `http://localhost:8081/`
2. Login : `admin` / `<CVAT_ADMIN_PASS>` du `.env`
3. Tu arrives sur le tableau de bord, panneau admin accessible.

---

## Variables d'environnement — récapitulatif

### `.env` racine (lu par `docker-compose.yml`)

| Variable | Obligatoire | Défaut | Description |
|---|---|---|---|
| `POSTGRES_PASSWORD` | ✅ | — | Mot de passe du user `ocean` sur la base `ocean_labelling`. Posé à l'init du volume `pg_data`. |
| `CVAT_ADMIN_USER` | ✅ | `admin` | Identifiant du superuser CVAT. |
| `CVAT_ADMIN_PASS` | ✅ | — | Mot de passe du superuser CVAT. Utilisé par app-api pour proxifier les actions admin (lister tous les users, modération CVAT-side). |
| `CSRF_TRUSTED_ORIGINS` | ❌ | `http://localhost:{8081,8888}` | Origines acceptées par Django CSRF. Surcharger sur VM/HTTPS avec l'URL de prod. |

### `frontend/.env` (lu par Expo Metro au bundling)

| Variable | Obligatoire | Description |
|---|---|---|
| `EXPO_PUBLIC_APP_API_URL` | ❌ | Override de l'URL API (cas tunnel ngrok, dev distribué, prod statique sans Metro). En dev local, l'URL est dérivée automatiquement de `window.location`. |

> ⚠️ Les valeurs `EXPO_PUBLIC_*` sont **inlinées au bundling**. Après toute modification, relancer Expo avec `-c` pour vider le cache Metro.

---

## Configuration post-installation

### Premier accès admin

1. Connecte-toi avec `admin` / `CVAT_ADMIN_PASS`.
2. Va sur `/admin/settings` (menu admin).

### Paramètres clés à régler dans le panneau admin

Tous éditables sans redéploiement via `/admin/settings`. Search bar disponible.

| Setting | Défaut | À régler |
|---|---|---|
| `platform.name` | « Ora te Fenua ! » | Nom affiché dans header + onglet navigateur. |
| `platform.logo_filename` | `logo.png` (DRM + UPF bundlé) | Téléverser un logo personnalisé via le widget « Logo » du group Branding. |
| `platform.welcome_message` | « Bienvenue… » | Affiché à la première connexion d'un nouvel utilisateur. |
| `platform.privacy_policy` | Politique RGPD bundlée | Adapter au contexte juridique réel (DRM/UPF). Markdown léger : `##` titres, `-` listes, `[texte](url)`, `**gras**`. |
| `platform.contact_email` | vide | Email RGPD/support affiché au pied de page. |
| `platform.contact_phone/hours/address` | vides | Optionnels, complètent le pied de page. |
| `upload_max_bytes` | 200 Mo | Taille max d'un upload (photo ou vidéo unitaire). |
| `consensus_replicas_default` | 2 | Nombre de jobs CVAT créés par task (annotation multi-annotateurs). Détermine le seuil minimum d'annotations avant curation. |
| `raw_exif_retention_days` | 90 | Délai après lequel le blob EXIF brut est purgé (RGPD minimisation). |
| `media_retention_rejected_days` | 30 | Délai avant suppression définitive des médias rejetés non contestés. |
| `platform.public_registration` | `true` | Inscription publique ouverte. Si désactivé, seul l'admin peut créer des comptes. |
| `platform.maintenance_mode` | `false` | Bascule l'accès en lecture seule (sauf admin). Page maintenance s'affiche pour tous les autres. |

### Créer des comptes

- **Inscription publique** : depuis `/login` → « Créer un compte » (si `public_registration=true`).
- **Création par l'admin** : `/admin/accounts` → bouton « + Créer un compte » (assigne un rôle directement).
- **Rôle modifiable a posteriori** : depuis `/admin/accounts`, sauf pour le superuser CVAT (rôle admin verrouillé).

### Logo par défaut bundlé

Le logo DRM + UPF est livré dans `app-api/assets/default-logo.png`. Au premier démarrage de `app-api` sur un volume `ocean_videos` vide, il est automatiquement copié dans `/data/videos/.logo/logo.png` et le setting `platform.logo_filename` est seedé (voir [defaultLogoBootstrap.js](app-api/src/lib/defaultLogoBootstrap.js)). Pour remplacer le logo, utiliser le widget admin (l'asset bundlé n'est jamais re-écrasé après le premier boot).

---

## Mise en production (déploiement réel HTTPS)

Procédure complète et détaillée : **[PRODUCTION.md](PRODUCTION.md)**.

Synthèse des étapes principales :

### 1. Pré-requis externes

- **VM Linux** avec Docker installé.
- **Sous-domaine** pointant vers l'IP de la VM (ex. `otf.upf.pf` → A record côté DSI).
- **Ports ouverts** côté firewall :
  - `443` (HTTPS prod)
  - `80` (challenge ACME Let's Encrypt)
  - `8888` (optionnel, fallback HTTP)
- **NE PAS exposer** : `8080` (Traefik CVAT interne), `5432` (postgres).

### 2. Bundler le frontend en statique

```bash
cd frontend
npx expo export -p web -o dist/
```

### 3. Émettre le certificat Let's Encrypt

```bash
docker compose stop gateway
sudo docker run --rm -p 80:80 \
  -v /etc/letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d otf.upf.pf --agree-tos -m <email> --non-interactive
```

### 4. Configurer NGINX HTTPS

- Monter `dist/` + certs dans le service `gateway` (`docker-compose.yml`).
- Activer la config `nginx/nginx-https.conf` (terminaison TLS + redirect HTTP→HTTPS).
- Activer le rate-limiting sur `/auth/login`.

### 5. Activer les flags `Secure` côté CVAT + app-api

- `.env` racine : `CSRF_TRUSTED_ORIGINS=https://otf.upf.pf`
- `cvat-extras/ocean.py` : `SESSION_COOKIE_SECURE = True`, `CSRF_COOKIE_SECURE = True`, `SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')`
- `docker-compose.yml` : `app-api → NODE_ENV=production` (active `Secure` sur le cookie session)

### 6. Sauvegardes automatisées

À mettre en place avant la mise en ligne publique :

- **Postgres** : cron quotidien `pg_dump` du volume `pg_data`, rotation 30 jours, stockage hors VM.
- **Vidéos** : cron quotidien `tar czf` du volume `ocean_videos`.
- **Renouvellement certbot** : cron hebdomadaire (cf. PRODUCTION.md).

### 7. Tests pré-ouverture

Liste de vérification dans PRODUCTION.md : login, upload photo (test critique HTTPS — secure context obligatoire), studio annotation, modération, contestation, vidéo extractor, EXIF strip, etc.

---

## Mise à jour après `git pull`

Procédure stricte (voir PRODUCTION.md pour le détail) :

```bash
git pull

# Si frontend/package.json a changé
cd frontend && npm install && cd ..

# Si app-api/ a changé (toujours rebuild — pas de volume source en prod)
docker compose build app-api

# Si docker-compose.yml ou cvat-extras/ocean.py a changé
docker compose up -d --force-recreate cvat_server

# Tous les services
docker compose up -d

# Si nginx/ a changé
docker compose restart gateway

# Relancer Expo (cache Metro vidé)
cd frontend && npx expo start -c --web
# OU si tu utilises systemd : systemctl --user restart expo
```

---

## Stack technique

| Couche | Techno | Rationale |
|---|---|---|
| **Frontend** | Expo Web + React Native + TS strict | Stack cross-platform unique (web + iOS + Android), réutilisation maximale du code |
| **Routing** | expo-router | File-system based, types stricts |
| **Rendu canvas annotation** | react-native-svg + gesture-handler + reanimated | Cross-platform, alternative à Konva (qui était web-only) |
| **Backend app-api** | Node.js 20 + Express + pg | Léger, async-friendly, ORM-less pour requêtes complexes |
| **Annotation engine** | CVAT v2.62.1 (boîte noire) | Mature, ouvert, supporte consensus replicas |
| **Stockage relationnel** | PostgreSQL 15 | Standards SQL + JSONB pour metadata flexible |
| **Stockage médias** | Volume Docker `ocean_videos` | Local-first, à externaliser vers S3/B2 à terme |
| **Reverse proxy** | NGINX | Bloque accès direct UI CVAT, gère HTTPS, cache statique |
| **Export scientifique** | Format Datumaro 1.0 | Standard CV/ML, supporté nativement par CVAT et la plupart des frameworks |
| **Auth** | Session cookie HttpOnly UUID | Pas de JWT côté client (XSS-safe), CVAT token caché côté serveur (cf. ADR-012) |

---

## Documentation interne

- **[CLAUDE.md](CLAUDE.md)** — décisions architecturales détaillées, gotchas CVAT API, conventions de code.
- **[PRODUCTION.md](PRODUCTION.md)** — procédures de déploiement, rotation de secrets, HTTPS, sauvegardes.

---

## Contact

- Pour les questions de stage : Sébastien CHABRIER (tuteur UPF) ou Bryan DALLEST (encadrement).
- Pour les questions RGPD côté plateforme : email configurable dans `/admin/settings` → `platform.contact_email`, affiché dans le pied de page et la page « Politique de confidentialité ».
