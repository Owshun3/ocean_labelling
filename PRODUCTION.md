# PRODUCTION.md — Déploiement VM

**Mettre à jour ce fichier à chaque nouvelle fonctionnalité ajoutée en dev.**

---

## Procédure après chaque `git pull` sur la VM

Ordre strict à respecter.

```bash
# 1. Récupérer les changements
git pull

# 2. Reconstruire app-api si des fichiers ont changé dans app-api/
#    (l'image est buildée, il n'y a pas de volume source en prod)
docker compose build app-api

# 3. Redémarrer tous les services (CVAT inclus via include)
docker compose up -d

# 4. Vérifier que tout est opérationnel
docker compose ps
docker compose logs app-api --tail 30
./scripts/test-appapi.sh admin <CVAT_ADMIN_PASS>
```

> Pour ne redémarrer que les services applicatifs (CVAT déjà opérationnel) :
> `docker compose up -d app-api gateway`

> Si une migration SQL est nécessaire (ALTER TABLE, nouvelle table) :
> exécuter le script avant le `docker compose up` — voir section Base de données.

> Si une migration SQL est nécessaire (ALTER TABLE, nouvelle table) :
> exécuter le script avant le `docker compose up` — voir section Base de données.

---

## Créer le fichier `.env` sur la VM (première installation ou après rotation)

Le `.env` n'est pas commité. À créer manuellement sur la VM :

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

---

## Checklist sécurité — obligatoire avant tout accès public

- [ ] Définir `POSTGRES_PASSWORD` dans `.env` avec un mot de passe fort
- [ ] Définir `CVAT_ADMIN_PASS` dans `.env` — doit correspondre au superuser CVAT
- [ ] Configurer HTTPS sur le NGINX gateway — Certbot + Let's Encrypt ou certificat universitaire
- [ ] Remplacer `$http_origin` dans `nginx/nginx.conf` par l'origine exacte du frontend en production
- [ ] Ajouter rate limiting NGINX sur `/api/auth/login` (brute-force)
- [ ] Bloquer le port 8080 CVAT au niveau firewall VM (pas iptables — inefficace sous WSL2/Docker Desktop)

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

*Dernière mise à jour : 2026-05-04 — Docker Compose unifié (include CVAT + nos services), start.sh supprimé*
