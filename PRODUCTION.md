# Checklist passage en production

Actions à effectuer avant / lors du déploiement sur la VM Apache.
**Mettre à jour ce fichier à chaque nouvelle fonctionnalité ajoutée en dev.**

---

## Sécurité — obligatoire avant tout accès public

- [ ] Changer le mot de passe PostgreSQL (`POSTGRES_PASSWORD` dans `.env`, différent du défaut `OceanLabel2026!`)
- [ ] Changer le mot de passe du compte CVAT admin (`admin` / `Admin2026!` → mot de passe fort)
- [ ] Mettre à jour `CVAT_ADMIN_PASS` dans `.env` en conséquence (utilisé par app-api pour fetcher tous les users CVAT)
- [ ] Créer un fichier `.env` sur la VM (non commité) avec tous les secrets
- [ ] Vérifier que `.env` est dans `.gitignore`
- [ ] Configurer HTTPS (certificat SSL) sur le NGINX gateway — Certbot + Let's Encrypt ou certificat universitaire
- [ ] Remplacer `$http_origin` dans `nginx.conf` par l'origine exacte du frontend en production (pas de wildcard)
- [ ] Ajouter rate limiting NGINX sur `/api/auth/login` pour éviter le brute-force
- [ ] Supprimer l'exposition directe du port 8080 CVAT (firewall VM, pas iptables)

## Infrastructure

- [ ] Configurer les sauvegardes automatiques PostgreSQL (cron `pg_dump` quotidien + rotation)
- [ ] Vérifier que le volume `pg_data` est sur un disque persistant (pas un tmpfs)
- [ ] Configurer `restart: always` à la place de `unless-stopped` sur tous les services
- [ ] Configurer un healthcheck sur `app-api` (endpoint `/health` existant)
- [ ] Vérifier que Docker et Docker Compose sont bien installés sur la VM Apache

## Configuration applicative

- [ ] Mettre à jour `frontend/.env` avec l'URL de production (pas `localhost:8888`)
- [ ] Rebuilder le frontend Expo pour le web (`npx expo export --platform web`) et servir les assets statiques
- [ ] Vérifier `EXPO_PUBLIC_APP_API_URL` et `EXPO_PUBLIC_CVAT_UI_URL` pointent vers le domaine de prod
- [ ] Vérifier que `NODE_ENV=production` est bien défini dans l'image app-api (déjà dans le Dockerfile)

## Base de données

- [ ] Vérifier que les migrations `CREATE TABLE IF NOT EXISTS` passent proprement au premier démarrage
- [ ] Pour tout futur `ALTER TABLE` : préparer un script SQL de migration avant le `git pull`
- [ ] Documenter chaque migration dans un dossier `app-api/migrations/` (à créer si besoin)

## Monitoring & logs

- [ ] Configurer la rotation des logs Docker (`--log-opt max-size=10m --log-opt max-file=3`)
- [ ] Vérifier les logs au premier démarrage : `docker compose logs -f`
- [ ] Tester le script `scripts/test-appapi.sh` après chaque déploiement

## Réseau universitaire

- [ ] Vérifier que les ports nécessaires sont ouverts côté firewall université (8888 minimum)
- [ ] Si proxy université en amont : configurer les headers `X-Forwarded-For` et `X-Real-IP` dans nginx.conf
- [ ] Tester l'accès depuis l'extérieur du réseau université si ouverture publique prévue

---

*Dernière mise à jour : 2026-04-29 — Migration SQLite → PostgreSQL, mise en place app-api RBAC*
