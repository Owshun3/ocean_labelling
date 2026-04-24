#!/bin/bash
set -e

echo "[1/2] Démarrage de CVAT..."
docker compose -f cvat-core/docker-compose.yml -f cvat-core/docker-compose.override.yml up -d

echo "[2/2] Démarrage du gateway NGINX..."
docker compose up -d

echo ""
echo "Stack prête. Vérification du gateway..."
sleep 2
curl -sf http://localhost:8080/api/server/about > /dev/null \
  && echo "Gateway OK → http://localhost:8080" \
  || echo "Gateway pas encore prêt, attendre quelques secondes."
