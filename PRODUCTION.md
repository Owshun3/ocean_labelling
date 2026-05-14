# PRODUCTION.md — Déploiement VM

**Mettre à jour ce fichier à chaque nouvelle fonctionnalité ajoutée en dev.**

---

## Procédure après chaque `git pull` sur la VM

Ordre strict à respecter.

```bash
# 1. Récupérer les changements
git pull

# 2. Installer les nouvelles dépendances frontend si frontend/package.json a changé
#    (lit package-lock.json — pas besoin de spécifier les paquets à la main)
cd frontend && npm install && cd ..

# 3. Reconstruire app-api si des fichiers ont changé dans app-api/
#    (l'image est buildée, il n'y a pas de volume source en prod)
docker compose build app-api

# 4. Si docker-compose.yml ou cvat-extras/ocean.py a changé : recréer cvat_server
docker compose up -d --force-recreate cvat_server

# 5. Redémarrer tous les services applicatifs
docker compose up -d

# 6. Si nginx/static/ ou nginx/nginx.conf a changé : reload du gateway
docker compose restart gateway

# 7. Relancer Expo avec -c (vide le cache Metro pour prendre les nouvelles deps + .env)
#    Si Expo tourne déjà via systemd/tmux : voir section "Faire tourner Expo en permanence"
cd frontend && npx expo start -c --web

# 8. Vérifier que tout est opérationnel
docker compose ps
docker compose logs app-api --tail 30
./scripts/test-appapi.sh admin <CVAT_ADMIN_PASS>
```

> Pour ne redémarrer que les services applicatifs (CVAT déjà opérationnel) :
> `docker compose up -d app-api gateway`

> Si une migration SQL est nécessaire (ALTER TABLE, nouvelle table) :
> exécuter le script avant le `docker compose up` — voir section Base de données.

> **Symptôme « 404 sur `/app-api/studio/feed` ou autre route récente »** :
> L'image app-api du container est antérieure au commit qui a ajouté la route. C'est l'oubli typique de l'étape 3. Vérifier ce qui tourne dans le container :
> `docker exec $(docker compose ps -q app-api) ls src/routes/` — la route manquante n'y figure pas. Refaire `docker compose build app-api && docker compose up -d app-api`.

---

## Créer le fichier `.env` sur la VM (première installation ou après rotation)

**Deux fichiers `.env` sont à créer** — tous les deux gitignorés (`*.env`), donc absents après un `git pull` sur une VM neuve. Sans eux, `docker compose up` échoue (POSTGRES_PASSWORD manquant) et le frontend tombe sur un fallback `localhost:8000` qui n'existe pas.

**1. `.env` racine** — backend (postgres, app-api, cvat) :

```bash
cat > .env << 'EOF'
POSTGRES_PASSWORD=<mot_de_passe_fort>
CVAT_ADMIN_USER=admin
CVAT_ADMIN_PASS=<mot_de_passe_cvat_admin>
EOF
chmod 600 .env
```

`CVAT_ADMIN_PASS` doit correspondre exactement au mot de passe du superuser CVAT
(créé lors du premier démarrage CVAT ou modifié via `docker exec`).

**2. `frontend/.env`** — URLs API utilisées par le bundle Expo Web :

```bash
cp frontend/.env.example frontend/.env
# Adapter les URLs si besoin (domaine de prod, IP de la VM, etc.)
```

Les valeurs `EXPO_PUBLIC_*` sont **inlinées au bundling** par Metro, pas lues à runtime. Donc après toute modification de `frontend/.env`, **redémarrer Expo avec `-c`** pour vider le cache Metro :

```bash
cd frontend && npx expo start -c --web
```

Sinon le bundle continue de servir les anciennes valeurs (ou le fallback hardcodé `http://localhost:8000/api` dans `axiosClient.ts:13`).

---

## Rotation de `POSTGRES_PASSWORD` après premier démarrage

Postgres n'applique `POSTGRES_PASSWORD` **qu'à l'initialisation** du volume `pg_data`. Si tu changes la valeur dans `.env` après que postgres a démarré au moins une fois, le user `ocean` garde l'ancien mot de passe et app-api ne peut plus se connecter (`password authentication failed for user "ocean"`).

Deux options :

**A) Aligner postgres sur la nouvelle valeur (garde les données)** — recréer le container postgres force la lecture du nouveau `POSTGRES_PASSWORD` au boot, le volume `pg_data` est préservé :

```bash
docker compose up -d --force-recreate postgres
docker compose restart app-api
```

> Note : un `ALTER USER ocean WITH PASSWORD` via `psql` en isolation ne suffit pas toujours à débloquer app-api — préférer la recréation du container, qui aligne tout d'un coup.

**B) Repartir de zéro (perd les données app-api : roles, bans, modération)** :

```bash
docker compose down
docker volume rm cvat_pg_data
docker compose up -d
```

La base CVAT (`cvat_db_data`) n'est pas concernée — seul notre volume `pg_data` est touché.

---

## Réinitialiser le mot de passe admin CVAT

Le hash PBKDF2 stocké dans `auth_user` est irréversible — impossible de récupérer un mot de passe oublié, mais on peut le remplacer sans toucher aux données :

```bash
docker exec -it cvat_server python /home/django/manage.py changepassword admin
```

> ⚠ Le `~` est expansé côté host avant `docker exec`. Toujours utiliser le chemin absolu `/home/django/manage.py`, pas `~/manage.py`.

Après réinitialisation, **mettre à jour `CVAT_ADMIN_PASS` dans `.env`** pour qu'app-api puisse continuer à s'authentifier auprès de CVAT (sinon le panneau admin et la modération sont cassés). Recréer app-api pour qu'il relise l'env :

```bash
docker compose up -d --force-recreate app-api
```

---

## Accès depuis un poste distant via VS Code Remote-SSH

VS Code Remote-SSH ne forwarde automatiquement que les ports qu'il **détecte dans la sortie d'un terminal VS Code** (typiquement le 8081 quand Expo affiche `Metro waiting on port 8081`). Les ports ouverts par Docker en amont (8888 du gateway) ne sont **pas** détectés, donc le browser sur le laptop tombe sur `ERR_CONNECTION_REFUSED`.

À faire à chaque session :

1. Panneau **PORTS** (barre du bas, à côté de TERMINAL) → bouton **Forward a Port** → taper `8888` → Entrée.
2. Vérifier que `8081` (Expo) est aussi listé. L'ajouter sinon.

Pour rendre les forwards persistants entre sessions, clic-droit sur la ligne 8888 dans le panneau PORTS → **Forward Port** sticky, ou ajouter à la config Remote-SSH workspace.

---

## Faire tourner Expo en permanence sur la VM

`npx expo start --web` est le serveur de **développement** Metro — pratique tant que la plateforme évolue, à remplacer par un export statique (voir « Bascule en prod web statique » plus bas) le jour du déploiement final.

Pour qu'il tourne en permanence sur la VM (et survive à la déconnexion SSH / au reboot), deux options. Choisir une seule.

### Option A — `tmux` (simple, manuel, ne survit pas au reboot)

Pour les sessions de dev où tu veux juste détacher/rattacher :

```bash
tmux new -s expo
cd frontend && npx expo start --web
# Ctrl-B puis D → détache (Expo continue à tourner en arrière-plan)
# tmux attach -t expo → revient sur la session
# tmux kill-session -t expo → stoppe Expo proprement
```

Si la VM reboote, la session `tmux` est perdue → faut relancer à la main.

### Option B — `systemd --user` (recommandé pour le stage, survit aux reboots)

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/expo.service << 'EOF'
[Unit]
Description=Ocean Labelling — Expo Web dev server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/home/stage/ocean_labelling/frontend
ExecStart=/usr/bin/npx expo start --web --no-open
Restart=on-failure
RestartSec=5
StandardOutput=append:/home/stage/ocean_labelling/frontend/expo.log
StandardError=append:/home/stage/ocean_labelling/frontend/expo.log

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now expo

# CRUCIAL : sans linger, le service s'arrête quand l'utilisateur stage se déconnecte
sudo loginctl enable-linger stage
```

Commandes utiles :

```bash
systemctl --user status expo            # état
systemctl --user restart expo           # après git pull + .env / package.json modifié
journalctl --user -u expo -f            # tail des logs Expo
systemctl --user stop expo              # arrêt manuel (ex : pour un build statique en parallèle)
```

> ⚠ Après tout changement de `frontend/.env` ou `frontend/package.json`, faire `systemctl --user restart expo` — le `--no-open` de la commande remplace le `-c` interactif, mais Expo recharge le cache Metro à chaque start.

> ⚠ `loginctl enable-linger` est indispensable. Sans ça, le service `--user` est **terminé dès la déconnexion SSH**, même s'il est `enabled`. C'est l'erreur classique.

### Bascule en prod web statique (à faire en fin de stage, pas avant)

Quand l'app sera figée, supprimer Expo Metro de la VM et servir le bundle via le gateway :

```bash
# 1. Build statique
cd frontend && npx expo export --platform web
# → génère frontend/dist/

# 2. Stopper le service Metro
systemctl --user disable --now expo

# 3. Monter dist/ dans le container gateway (à ajouter dans docker-compose.yml,
#    service gateway, volumes :
#       - ./frontend/dist:/etc/nginx/expo-dist:ro
#    et ajouter dans nginx/nginx.conf une location qui sert ces fichiers
#    sans entrer en conflit avec /tasks/, /api/, /app-api/, /static/, /).
```

Ça supprime la dépendance au port 8081 et n'expose plus que 8888.

---

## Découplage des configurations dev local ↔ VM

**Principe** : aucun fichier suivi par git ne contient d'URL ou de mot de passe propre à un environnement. Tout vit dans **deux fichiers `.env` gitignorés** (un par machine) :

| Fichier | Gitignoré ? | Contient |
|---|---|---|
| `.env` (racine) | oui (`*.env`) | `POSTGRES_PASSWORD`, `CVAT_ADMIN_PASS`, `CSRF_TRUSTED_ORIGINS` |
| `frontend/.env` | oui (`*.env`) | les 3 `EXPO_PUBLIC_*` (URLs API et CVAT UI) |

`docker-compose.yml` lit `${CSRF_TRUSTED_ORIGINS}` depuis l'environnement avec un **défaut localhost** : `${CSRF_TRUSTED_ORIGINS:-http://localhost:8081,http://127.0.0.1:8081,http://localhost:8888,http://127.0.0.1:8888}`. Donc en dev, ne **pas** définir la var → fallback localhost automatique. Sur la VM, définir la var dans `.env` → surcharge.

**Conséquence** : `git pull` de chaque côté ne touche jamais aux fichiers `.env` locaux. Pas de réécriture, pas de conflit, pas de procédure manuelle après pull.

### Configuration côté dev local (poste maison)

`.env` racine — laisser tel quel après `cp .env.example .env`. Pas de `CSRF_TRUSTED_ORIGINS` à définir.

`frontend/.env` :
```
EXPO_PUBLIC_API_URL=http://localhost:8888/api
EXPO_PUBLIC_APP_API_URL=http://localhost:8888/app-api
EXPO_PUBLIC_CVAT_UI_URL=http://localhost:8888
```

### Configuration côté VM (réseau université)

`.env` racine — ajouter la dernière ligne :
```
POSTGRES_PASSWORD=<...>
CVAT_ADMIN_USER=admin
CVAT_ADMIN_PASS=<...>
CSRF_TRUSTED_ORIGINS=http://<IP_VM>:8081,http://<IP_VM>:8888
```

`frontend/.env` :
```
EXPO_PUBLIC_API_URL=http://<IP_VM>:8888/api
EXPO_PUBLIC_APP_API_URL=http://<IP_VM>:8888/app-api
EXPO_PUBLIC_CVAT_UI_URL=http://<IP_VM>:8888
```

Après modification de l'un ou l'autre :
```bash
docker compose up -d --force-recreate cvat_server   # si .env racine a changé
systemctl --user restart expo                       # si frontend/.env a changé
```

> Première migration sur la VM (passage de localhost → IP) : la valeur en dur de `CSRF_TRUSTED_ORIGINS` a été retirée de `docker-compose.yml` au commit qui a introduit cette section. Si la VM avait un `.env` sans la nouvelle var → fallback localhost → CVAT rejette les POST depuis l'IP. Ajouter la var dans `.env` puis recreate `cvat_server`.

---

## Passage de localhost à une vraie IP / domaine universitaire

Section à exécuter le jour où on bascule la plateforme du dev (`localhost`) vers une IP/domaine universitaire. **Faire un smoke test d'une demi-journée sur IP HTTP dès le début du stage** pour repérer les casses listées plus bas, puis revenir en `localhost` pour la suite du dev. Le vrai switch n'est à faire qu'en fin de stage, idéalement avec HTTPS.

### Demande DSI — phases de l'ouverture réseau

Étapes à suivre dans l'ordre. Phase 1 = accès LAN basique pour tester, Phase 2 = production publique.

**Phase 1 — ouverture des ports (semaine en cours)**
- Demander à la DSI l'ouverture en entrée sur l'IP de la VM, depuis le réseau interne UPF :
  - `8888` (gateway NGINX — API + studio + proxy CVAT) — **obligatoire**
  - `8081` (Expo dev server — frontend bundle) — **obligatoire tant qu'on n'a pas bundlé statiquement** (voir Phase 2)
  - `8080` (Traefik CVAT) → **JAMAIS** : c'est l'entrée brute de CVAT, censée rester interne. Tout est déjà proxyfié via `/api` sur 8888.
- Sur la VM, avant que d'autres postes puissent se connecter, mettre à jour `frontend/.env` avec l'IP réelle :
  ```env
  EXPO_PUBLIC_API_URL=http://<ip-vm>:8888/api
  EXPO_PUBLIC_APP_API_URL=http://<ip-vm>:8888/app-api
  EXPO_PUBLIC_CVAT_UI_URL=http://<ip-vm>:8888
  ```
  Sinon le bundle servi à un autre poste pointera `localhost` → API injoignable.
- Et `.env` racine : `CSRF_TRUSTED_ORIGINS=http://<ip-vm>:8081,http://<ip-vm>:8888`
- Recreate `cvat_server` + redémarrer Expo (vider cache Metro).
- Cookie session : tant que `NODE_ENV` n'est pas `production` dans le container app-api, le cookie n'a pas le flag `Secure` → fonctionne en HTTP plain. **Login + navigation + lecture marchent**.
- **Ce qui ne marchera PAS en HTTP plain** : `expo-image-picker` (upload), `navigator.clipboard`, `getUserMedia` — bloqués par les navigateurs hors `localhost` / HTTPS (secure context). Le test peut couvrir tout sauf l'upload.

**Phase 2 — domaine + HTTPS (semaine de la mise en prod)**
- Demander à la DSI :
  - **Un sous-domaine** type `ocean.upf.pf` pointant vers l'IP de la VM (un FQDN — un certificat HTTPS s'émet quasi toujours pour un nom DNS, pas pour une IP nue ; Let's Encrypt refuse les IPs).
  - **Un certificat HTTPS** pour ce sous-domaine (PKI interne UPF ou Let's Encrypt si l'hôte est joignable en 80/443).
- À ce moment, **bundler statiquement** le frontend (`npx expo export -p web -o frontend/dist`), faire servir le bundle par nginx sur 8888 → **un seul port à exposer publiquement (443)**, plus besoin de 8081. Suppression du dev server fragile.
- Activer HTTPS — voir sous-section ci-dessous (« Si HTTPS »).
- Activer `NODE_ENV=production` côté app-api pour que le cookie devienne `Secure` (sera transmis uniquement en HTTPS).
- L'upload, la clipboard, etc. fonctionnent à nouveau (secure context restauré).

**Modèle de message DSI** (Phase 1 seule, à recopier/adapter) :

> Bonjour,
>
> Dans le cadre de mon stage, je déploie une plateforme web sur la VM `<nom>` (IP `<x.y.z.w>`). Pour permettre aux autres postes du réseau interne de la tester, j'ai besoin de l'ouverture en entrée des ports `8081` et `8888` sur cette IP, depuis le réseau UPF.
>
> La semaine prochaine, à la mise en production, je vous solliciterai pour un sous-domaine universitaire + certificat HTTPS — sans HTTPS, plusieurs fonctionnalités (notamment l'upload d'images) sont bloquées par les navigateurs.

### Pourquoi c'est risqué de découvrir tard

- **HTTPS-only APIs** : les browsers traitent `localhost` comme « secure context » même en HTTP. Sur une IP en HTTP plain, `expo-image-picker`, `navigator.clipboard`, `getUserMedia` sont **bloqués** par le browser. Donc on bascule en IP **en même temps** qu'on met HTTPS, jamais avant.
- **Cookie `sessionid` CVAT** (mécanisme `withCredentials: true` qui ouvre le studio CVAT pré-authentifié) : sur localhost le browser est tolérant. Sur IP avec HTTP/HTTPS mixte ou `SameSite=None`, peut silencieusement ne plus passer → studio CVAT déco.
- **Hardcodes `localhost` cachés** dans des composants UI (redirections, `Linking.openURL`, textes) ne se révèlent qu'au switch. Un grep préventif règle ça.
- **CORS qui reflète `$http_origin`** dans `nginx/nginx.conf` accepte aujourd'hui n'importe quoi → le jour où on fige l'origine pour la sécurité, on découvre les origines oubliées.

### Variables à changer

Les URLs et CSRF se gèrent via les `.env` de la VM — voir section précédente « Découplage des configurations dev local ↔ VM ». **Aucun fichier suivi par git n'est à modifier au moment du switch.**

Reste un seul fichier de code à toucher pour la prod (recommandé, pas bloquant) :

**`nginx/nginx.conf`** — figer l'origine CORS. Remplacer les `$http_origin` (lignes 17, 25, 36, 44) par l'origine exacte ou une `map` qui whitelist 1-2 valeurs. Aujourd'hui n'importe quelle origine est acceptée → trou de sécurité en prod publique. Cette modif **est** suivie par git mais elle est commune à tout déploiement futur, donc OK à committer.

### Si HTTPS (recommandé sur réseau université)

Ajouter dans `cvat-extras/ocean.py` :

```python
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
```

Et dans `nginx/nginx.conf`, sur tous les `proxy_pass`, ajouter :

```nginx
proxy_set_header X-Forwarded-Proto https;
```

Options pour le certificat :
- Certificat universitaire pour un sous-domaine (le plus simple si dispo).
- Certbot/Let's Encrypt — requiert un FQDN public, pas une IP nue.
- Auto-signé — déconseillé (Chrome bloque par défaut, mauvaise UX utilisateur).

### `ALLOWED_HOSTS` côté CVAT

CVAT v2.62 `cvat.settings.production` met `ALLOWED_HOSTS = ['*']` par défaut → le passage à une IP **passe sans modif**. Si un `DisallowedHost` apparaît un jour dans `docker logs cvat_server`, ajouter dans `ocean.py` :

```python
ALLOWED_HOSTS = ['<IP_OU_DOMAINE>', 'localhost']
```

### Procédure résumée pour basculer (sur la VM uniquement)

```bash
# 1. Mettre à jour les .env locaux à la VM (voir section découplage)
#    - .env racine → ajouter CSRF_TRUSTED_ORIGINS=http://<IP>:8081,http://<IP>:8888
#    - frontend/.env → remplacer localhost par <IP> dans les 3 EXPO_PUBLIC_*

# 2. Recreate les services impactés
docker compose up -d --force-recreate cvat_server

# 3. Relancer Expo (vide le cache Metro pour réinliner les nouvelles URLs)
systemctl --user restart expo

# 4. Smoke test depuis un autre poste du réseau
curl -I http://<IP>:8888/api/server/about
```

### Pièges à NE PAS confondre avec une vraie URL externe

- Les `Host: 'localhost'` dans `app-api/src/routes/*.js` et `middleware/auth.js` — c'est un header **interne** container→container vers `cvat_server:8080` (qui filtre sur Host via son nginx interne). Documenté dans CLAUDE.md, **ne PAS toucher**.
- `frontend/src/services/api/client.js` — code mort, aucun import. À supprimer un jour, n'impacte rien.
- Les fallbacks `'http://localhost:8888/app-api'` dans les services frontend — ne s'appliquent que si la var `EXPO_PUBLIC_*` est `undefined` au bundling. Tant que `frontend/.env` est rempli, ils sont morts.

---

## Checklist sécurité — obligatoire avant tout accès public

- [ ] Définir `POSTGRES_PASSWORD` dans `.env` avec un mot de passe fort
- [ ] Définir `CVAT_ADMIN_PASS` dans `.env` — doit correspondre au superuser CVAT
- [ ] Configurer HTTPS sur le NGINX gateway — Certbot + Let's Encrypt ou certificat universitaire
- [ ] Remplacer `$http_origin` dans `nginx/nginx.conf` par l'origine exacte du frontend en production
- [ ] Ajouter rate limiting NGINX sur `/api/auth/login` (brute-force)
- [ ] Bloquer le port 8080 CVAT au niveau firewall VM (pas iptables — inefficace sous WSL2/Docker Desktop)
- [ ] Bloquer le port 8081 (Expo dev) au niveau firewall une fois le frontend bundlé statiquement servi via 8888
- [ ] Vérifier `NODE_ENV=production` dans le Dockerfile app-api (cookie session devient `Secure`, requiert HTTPS)
- [ ] Tester le mode maintenance en pré-prod : activer depuis l'admin, vérifier que /auth/login reste joignable, désactiver
- [ ] Confirmer que `media_retention_rejected_days` est à la valeur souhaitée — le job de nettoyage tourne toutes les heures et supprime les CVAT tasks rejetées non contestées

---

## Infrastructure

- [ ] Configurer les sauvegardes automatiques PostgreSQL (cron `pg_dump` quotidien + rotation)
- [ ] Vérifier que le volume `pg_data` est sur un disque persistant (pas un tmpfs)
- [ ] Passer `restart: unless-stopped` → `restart: always` sur tous les services
- [ ] Vérifier que Docker et Docker Compose sont installés sur la VM Apache

---

## Configuration applicative

- [ ] Mettre à jour `frontend/.env` avec l'URL de production (remplacer `localhost:8888` par le domaine)
- [ ] Rebuilder le frontend Expo : `npx expo export --platform web` et servir les assets
- [ ] Vérifier que `EXPO_PUBLIC_APP_API_URL` et `EXPO_PUBLIC_CVAT_UI_URL` pointent vers le domaine de prod
- [ ] `NODE_ENV=production` est déjà défini dans le Dockerfile app-api

---

## Base de données

Toute modification de schéma doit être appliquée **avant** le `docker compose up` :

```bash
docker exec -i $(docker compose ps -q postgres) \
  psql -U ocean -d ocean_labelling < scripts/migration_XXX.sql
```

- [ ] Migrations `CREATE TABLE IF NOT EXISTS` : passent proprement au premier démarrage
- [ ] Documenter chaque `ALTER TABLE` dans `app-api/migrations/` (à créer si besoin)

---

## Monitoring & logs

- [ ] Configurer la rotation des logs Docker (`--log-opt max-size=10m --log-opt max-file=3`)
- [ ] Vérifier les logs au premier démarrage : `docker compose logs -f`
- [ ] Tester après chaque déploiement : `./scripts/test-appapi.sh admin <CVAT_ADMIN_PASS>`

---

## Réseau universitaire

- [ ] Vérifier que le port 8888 est ouvert côté firewall université
- [ ] Si proxy université en amont : configurer `X-Forwarded-For` et `X-Real-IP` dans `nginx/nginx.conf`
- [ ] Tester l'accès depuis l'extérieur du réseau université

---

*Dernière mise à jour : 2026-05-07 — Procédure post-pull étoffée + sections « Faire tourner Expo en permanence » et « Passage à une vraie IP » + découplage .env (CSRF_TRUSTED_ORIGINS lu depuis l'env, plus de valeur en dur dans docker-compose.yml)*
