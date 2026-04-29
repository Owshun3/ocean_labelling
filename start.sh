#!/bin/bash
set -e

echo "[1/3] Démarrage de CVAT..."
docker compose -f cvat-core/docker-compose.yml -f cvat-core/docker-compose.override.yml up -d

echo "[2/3] Démarrage du gateway NGINX..."
docker compose up -d

echo "[3/3] Blocage de l'accès direct au port 8080 (Traefik CVAT)..."
if grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
  echo "  ⚠  WSL2 détecté : Docker Desktop gère le NAT au niveau Windows."
  echo "     iptables n'a pas d'effet ici — port 8080 reste accessible côté Windows."
  echo "     Pour bloquer définitivement : ajouter une règle Windows Defender Firewall"
  echo "     (Inbound rule, port 8080, action Block)."
else
  iptables -C INPUT -p tcp --dport 8080 -j REJECT 2>/dev/null || \
    iptables -I INPUT -p tcp --dport 8080 -j REJECT 2>/dev/null && \
    echo "  Port 8080 bloqué — studio d'annotation accessible uniquement via http://localhost:8888" || \
    echo "  Note: iptables non disponible, port 8080 toujours accessible directement."
fi

echo ""
echo "Stack prête. Vérification du gateway..."
sleep 2
curl -sf http://localhost:8888/api/server/about > /dev/null \
  && echo "Gateway OK → http://localhost:8888" \
  || echo "Gateway pas encore prêt, attendre quelques secondes."
