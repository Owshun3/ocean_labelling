# Guide de déploiement

Procédure générique de mise en production d'une instance Ora te Fenua. Ce document est public et utilise des placeholders pour les valeurs spécifiques (domaine, IP, email).

> ℹ️ Les procédures spécifiques à une instance particulière (IP de la VM cible, comptes système, contacts DSI, scripts internes) ne figurent pas ici et restent dans des notes privées hors du repo.

## Sommaire

1. [Pré-requis externes](#1-pré-requis-externes)
2. [Configuration de l'environnement](#2-configuration-de-lenvironnement)
3. [Lancer la stack en HTTP (LAN ou test)](#3-lancer-la-stack-en-http-lan-ou-test)
4. [Activer HTTPS avec Let's Encrypt](#4-activer-https-avec-lets-encrypt)
5. [Faire tourner Expo en permanence](#5-faire-tourner-expo-en-permanence)
6. [Sauvegardes et rotation des secrets](#6-sauvegardes-et-rotation-des-secrets)
7. [Mise à jour après `git pull`](#7-mise-à-jour-après-git-pull)
8. [Mettre à jour CVAT](#8-mettre-à-jour-cvat)
9. [Dépannage](#9-dépannage)

---

## 1. Pré-requis externes

Avant de toucher au code, valider que les éléments suivants sont en place :

- **VM Linux** dédiée (Ubuntu 22.04 LTS ou équivalent recommandé). Idéalement 2 vCPU, 4 Go RAM, 50 Go disque.
- **Docker Engine** ≥ 24 et **Docker Compose** v2.
- **Node.js** ≥ 20 + **npm** (uniquement nécessaire si on lance le serveur de dev Expo Metro ; non requis pour servir un bundle statique).
- **Nom de domaine** pointant vers l'IP publique de la VM (A record). Par exemple `annot.exemple.org`. Indispensable pour Let's Encrypt — les IPs nues ne sont pas certifiables.
- **Ports ouverts au firewall** :
  - `443/tcp` (HTTPS prod)
  - `80/tcp` (challenge ACME Let's Encrypt et redirection vers HTTPS)
  - Optionnel : `8888/tcp` pour fallback HTTP en LAN
- **Ports à NE PAS exposer** publiquement :
  - `8080` — Traefik interne de CVAT. Tout doit passer par le gateway sur `8888/443`.
  - `5432` — PostgreSQL.
  - `3000` — app-api direct.

## 2. Configuration de l'environnement

### Variables d'environnement

```bash
git clone https://github.com/Owshun3/ocean_labelling.git
cd ocean_labelling
cp .env.example .env
```

Éditer `.env` (gitignored) :

```env
# Mot de passe Postgres pour le user 'ocean' (base 'ocean_labelling')
POSTGRES_PASSWORD=<générer_un_mdp_fort>

# Superuser CVAT — utilisé par app-api pour les actions admin
CVAT_ADMIN_USER=admin
CVAT_ADMIN_PASS=<générer_un_mdp_fort>

# Origines acceptées par Django CSRF
# En LAN HTTP : http://<ip-vm>:8081,http://<ip-vm>:8888
# En HTTPS prod : https://<domaine>
CSRF_TRUSTED_ORIGINS=https://<domaine>
```

> ⚠️ `POSTGRES_PASSWORD` n'est appliqué qu'à l'initialisation du volume `pg_data`. Si vous changez cette valeur après le premier démarrage, recréer le container postgres : `docker compose up -d --force-recreate postgres`.

### Logo bundlé par défaut

Le fichier `app-api/assets/default-logo.png` est livré dans l'image Docker. Au premier démarrage, il est copié dans le volume `ocean_videos` comme logo de plateforme. Pour personnaliser : remplacer ce fichier avant `docker compose build`, ou téléverser un autre logo via le panneau admin une fois la plateforme en ligne.

## 3. Lancer la stack en HTTP (LAN ou test)

Première mise en route — utile pour valider que l'infrastructure répond avant de passer en HTTPS.

```bash
docker compose up -d

# Premier démarrage : créer le superuser CVAT
# Le mot de passe doit correspondre EXACTEMENT à CVAT_ADMIN_PASS dans .env
docker exec -it cvat_server python /home/django/manage.py createsuperuser

# Vérifier la santé
docker compose ps
curl http://localhost:8888/app-api/health
```

### Frontend en dev (Expo Metro)

```bash
cd frontend
npm install
npx expo start -c --web
```

Ouvrir `http://<ip-vm>:8081/`. Le bundle dérive l'URL API du `window.location` — pas de rebuild quand on change de host (cf. [runtimeUrls.ts](frontend/src/services/api/runtimeUrls.ts)).

### Frontend en bundle statique (recommandé en prod)

Pour servir le frontend via NGINX et supprimer la dépendance au port 8081 :

```bash
cd frontend
npx expo export -p web -o dist/
```

Puis monter `dist/` dans le gateway et ajouter une `location /` dans NGINX qui sert `dist/` (cf. exemple plus bas).

## 4. Activer HTTPS avec Let's Encrypt

### 4.1 Préparer `docker-compose.yml`

Modifier le service `gateway` pour exposer 80 + 443 et monter les certificats :

```yaml
gateway:
  image: nginx:alpine
  ports:
    - "8888:8080"
    - "80:80"
    - "443:443"
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - ./nginx/static:/etc/nginx/ocean-static:ro
    - ./frontend/dist:/usr/share/nginx/ocean-dist:ro
    - /etc/letsencrypt:/etc/letsencrypt:ro
    - /var/www/certbot:/var/www/certbot:ro
```

### 4.2 Émettre le premier certificat (mode standalone)

```bash
sudo mkdir -p /var/www/certbot /etc/letsencrypt

# Libérer le port 80 le temps de la validation
docker compose stop gateway

# Certbot standalone (durée ~15s)
sudo docker run --rm -p 80:80 \
  -v /etc/letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --standalone \
  -d <domaine> \
  --agree-tos -m <email_admin> --non-interactive

# Vérifier l'émission
sudo ls /etc/letsencrypt/live/<domaine>/
# attendu: cert.pem, chain.pem, fullchain.pem, privkey.pem
```

### 4.3 Activer la configuration NGINX HTTPS

Le fichier `nginx/nginx-https.conf` est un template prêt à l'emploi. Il contient des placeholders `YOUR_DOMAIN.TLD` à remplacer (3 occurrences).

```bash
# Sauvegarder la config HTTP courante
cp nginx/nginx.conf nginx/nginx.conf.http-backup

# Personnaliser le template HTTPS avec votre domaine
sed -i 's/YOUR_DOMAIN.TLD/<domaine>/g' nginx/nginx-https.conf

# Activer
cp nginx/nginx-https.conf nginx/nginx.conf
docker compose up -d --force-recreate gateway
```

### 4.4 Activer les flags `Secure` côté Django et Express

Éditer `cvat-extras/ocean.py` — ajouter à la fin :

```python
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
```

> 💡 `SECURE_PROXY_SSL_HEADER` est crucial : NGINX termine TLS et proxifie en HTTP clair en interne. Sans ce header, Django croit recevoir du HTTP plain et redirige en boucle.

Dans `docker-compose.yml`, passer app-api en mode production (active `Secure` sur le cookie de session) :

```yaml
app-api:
  environment:
    - NODE_ENV=production
    # ... autres variables existantes
```

Recréer les services impactés :

```bash
docker compose up -d --force-recreate cvat_server app-api
```

### 4.5 Vérifications HTTPS

```bash
# DNS résolu
getent hosts <domaine>

# Certificat valide
openssl s_client -connect <domaine>:443 -servername <domaine> </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates

# Redirection HTTP → HTTPS
curl -sI http://<domaine>/ | head -3
# attendu: HTTP/1.1 301 / Location: https://<domaine>/

# APIs joignables
curl -sI https://<domaine>/api/server/about
curl -sI -X POST https://<domaine>/app-api/auth/login
```

### 4.6 Renouvellement automatique du certificat

Let's Encrypt expire à 90 jours. Cron hebdomadaire (mode standalone, interruption gateway ~20s) :

```bash
sudo crontab -e
```

Ajouter :

```
0 3 * * 1 cd <chemin/repo> && docker compose stop gateway && docker run --rm -p 80:80 -v /etc/letsencrypt:/etc/letsencrypt certbot/certbot renew --quiet && docker compose start gateway
```

Certbot ne renouvelle réellement que si le certificat expire dans moins de 30 jours.

### Variante DNS-01 (port 80 inaccessible)

Si le port 80 est strictement filtré, basculer sur le challenge DNS-01 :

```bash
sudo docker run --rm -it \
  -v /etc/letsencrypt:/etc/letsencrypt \
  certbot/certbot certonly --manual --preferred-challenges dns \
  -d <domaine> --agree-tos -m <email_admin>
```

Certbot affiche un record TXT à publier dans la zone DNS. Le renouvellement est manuel tous les 90 jours.

### Variante certificat auto-signé (test interne, sans DNS public)

Si le domaine n'est résolu QUE par un DNS interne (typique LAN université sans publication publique) :  Let's Encrypt ne peut pas valider et la PKI interne UPF n'est pas disponible. Un certificat auto-signé permet quand même d'activer HTTPS pour tester l'application en interne (login Secure cookies, upload image en secure context).

```bash
mkdir -p nginx/certs

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout nginx/certs/<domaine>.key \
  -out    nginx/certs/<domaine>.crt \
  -subj "/CN=<domaine>" \
  -addext "subjectAltName=DNS:<domaine>,IP:<ip>" \
  -days 365

chmod 600 nginx/certs/<domaine>.key
```

Activer la config NGINX HTTPS comme en §4.3 (remplacer `YOUR_DOMAIN.TLD` dans `nginx/nginx-https.conf` par `<domaine>`, copier sur `nginx.conf`, `docker compose restart gateway`).

⚠ **Précautions auto-signé** :
- Les navigateurs affichent un avertissement « connexion non privée » au premier accès. L'utilisateur doit cliquer « Avancé » → « Continuer ». Une fois l'exception accordée, les visites suivantes sont silencieuses.
- **HSTS doit rester désactivé** tant qu'on est en auto-signé. Le template `nginx-https.conf` le commente déjà. Sinon, après acceptation du warning + envoi de HSTS, le navigateur refuse définitivement tout futur bypass.
- Les certs `.crt` / `.key` ne doivent **jamais** être commit. Le `.gitignore` du repo les exclut.
- À remplacer par un vrai certificat (Let's Encrypt ou PKI interne) dès que disponible. La transition est triviale : juste écraser `.crt` / `.key` + décommenter HSTS dans `nginx.conf` + reload gateway.

## 5. Faire tourner Expo en permanence

Tant que le frontend n'est pas en bundle statique, Expo Metro doit tourner en arrière-plan. Deux options.

### Option A — `tmux` (dev rapide, ne survit pas au reboot)

```bash
tmux new -s expo
cd frontend && npx expo start --web
# Ctrl-B puis D → détache
# tmux attach -t expo → revient
```

### Option B — `systemd --user` (recommandé pour prod intermédiaire)

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/expo.service << 'EOF'
[Unit]
Description=Ora te Fenua — Expo Web dev server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=<chemin/repo>/frontend
ExecStart=/usr/bin/npx expo start --web --no-open
Restart=on-failure
RestartSec=5
StandardOutput=append:<chemin/repo>/frontend/expo.log
StandardError=append:<chemin/repo>/frontend/expo.log

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now expo

# Indispensable : permet au service de survivre à la déconnexion SSH
sudo loginctl enable-linger <username>
```

Commandes utiles :

```bash
systemctl --user status expo
systemctl --user restart expo     # après modif frontend/.env ou package.json
journalctl --user -u expo -f      # tail des logs
```

> ⚠️ Sans `loginctl enable-linger`, le service `--user` est tué dès la déconnexion SSH.

### Bascule définitive en bundle statique

Quand le frontend ne change plus quotidiennement :

```bash
cd frontend && npx expo export -p web -o dist/
systemctl --user disable --now expo
```

Et monter `dist/` dans le container gateway (cf. section HTTPS).

## 6. Sauvegardes et rotation des secrets

### Sauvegardes PostgreSQL

Cron quotidien avec rotation 30 jours :

```bash
sudo crontab -e
```

```
0 2 * * * docker exec $(docker compose ps -q postgres) pg_dump -U ocean ocean_labelling | gzip > /backup/pg-$(date +\%F).sql.gz && find /backup -name 'pg-*.sql.gz' -mtime +30 -delete
```

Pousser hors VM (rsync, rclone, S3).

### Sauvegardes vidéos

Le volume `ocean_videos` peut atteindre plusieurs centaines de Go. Privilégier `tar` avec compression, push hors VM :

```bash
docker run --rm \
  -v ocean_videos:/data:ro \
  -v /backup:/backup \
  alpine tar czf /backup/videos-$(date +%F).tar.gz -C /data .
```

### Rotation `POSTGRES_PASSWORD`

`POSTGRES_PASSWORD` n'est appliqué qu'à l'init du volume `pg_data`. Pour changer après coup :

```bash
# Mettre à jour .env, puis :
docker compose up -d --force-recreate postgres
docker compose restart app-api
```

### Réinitialiser le superuser CVAT

```bash
docker exec -it cvat_server python /home/django/manage.py changepassword admin
# Puis mettre à jour CVAT_ADMIN_PASS dans .env
docker compose up -d --force-recreate app-api
```

## 7. Mise à jour après `git pull`

```bash
git pull

# Si frontend/package.json a changé
cd frontend && npm install && cd ..

# Si app-api/ a changé (toujours rebuild — pas de volume source en prod)
docker compose build app-api

# Si docker-compose.yml ou cvat-extras/ocean.py a changé
docker compose up -d --force-recreate cvat_server

# Redémarrer tous les services applicatifs
docker compose up -d

# Si nginx/ a changé
docker compose restart gateway

# Relancer Expo avec cache Metro vidé
cd frontend && npx expo start -c --web
# OU si systemd : systemctl --user restart expo
```

## 8. Mettre à jour CVAT

La source CVAT est **figée dans ce repo** (dossier `cvat-core/`, ~120 Mo). Cela garantit que tout cloneur récupère la version exacte testée avec le reste du code. La customisation Ocean passe **uniquement** par `cvat-extras/ocean.py` et `nginx/`, jamais par des modifications à `cvat-core/`.

Pour mettre à jour vers une nouvelle version CVAT :

```bash
# 1. Sauvegarder la base CVAT et le volume vidéos
docker exec $(docker compose ps -q postgres) pg_dump -U ocean ocean_labelling \
  | gzip > /backup/pre-cvat-upgrade-$(date +%F).sql.gz

# 2. Récupérer la nouvelle version CVAT
rm -rf cvat-core
git clone --depth 1 -b <tag_cvat_cible> https://github.com/cvat-ai/cvat.git cvat-core
rm -rf cvat-core/.git

# 3. Rebuild les images CVAT et redémarrer
docker compose build cvat_server cvat_ui
docker compose up -d --force-recreate cvat_server cvat_ui

# 4. Vérifier les migrations CVAT (s'exécutent automatiquement au démarrage du container)
docker compose logs cvat_server | grep -i "migrat\|error" | tail -50

# 5. Smoke test : login admin, accès panneau admin, upload média
# 6. Si OK, commit la nouvelle version
git add cvat-core/
git commit -m "chore: mise à jour CVAT vers <tag_cvat_cible>"
```

> ⚠️ Avant toute mise à jour CVAT, **lire les release notes** de la version cible. Les changements de schéma DB ou d'API peuvent casser app-api. Tester d'abord sur une instance de dev.

## 9. Dépannage

| Symptôme | Cause probable | Correctif |
|---|---|---|
| `password authentication failed for user "ocean"` | `POSTGRES_PASSWORD` changé après init du volume | Recréer le container postgres (cf. §6) |
| `404 sur /app-api/<route_recente>` | Image app-api antérieure au commit | `docker compose build app-api && docker compose up -d app-api` |
| `ERR_CONNECTION_REFUSED` sur 8888 depuis VS Code Remote | Le forwarding de port ne couvre que 8081 | Panneau PORTS de VS Code → Forward a Port → `8888` |
| Cookie de session non transmis en HTTPS | `NODE_ENV=production` absent dans app-api | Ajouter la variable et recreate (cf. §4.4) |
| Upload de photos cassé | Pas en secure context (HTTP plain hors localhost) | Activer HTTPS — `expo-image-picker` exige secure context |
| Redirection HTTP → HTTPS infinie | `SECURE_PROXY_SSL_HEADER` manquant côté Django | Ajouter dans `cvat-extras/ocean.py` (cf. §4.4) |
| Maintenance mode verrouille tout le site | Bug : route `/auth/login` bloquée aussi | Désactiver le mode via `psql` direct sur `app_settings` |
