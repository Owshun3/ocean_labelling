#!/usr/bin/env bash
# Usage: ./scripts/test-upload.sh <username> <password> <image_path>
# Example: ./scripts/test-upload.sh admin password /tmp/test.jpg
set -e

USER="${1:?Usage: $0 <username> <password> <image_path>}"
PASS="${2:?}"
IMG="${3:?}"
API="http://localhost:8888/api"

echo "=== 1. Login ==="
TOKEN=$(curl -sf -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$USER\",\"password\":\"$PASS\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['key'])")
echo "Token: ${TOKEN:0:10}..."

echo "=== 2. Create task ==="
TASK_ID=$(curl -sf -X POST "$API/tasks" \
  -H "Authorization: Token $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test_curl_upload","labels":[{"name":"item"}]}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Task ID: $TASK_ID"

echo "=== 3. Upload file ==="
HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/tasks/$TASK_ID/data" \
  -H "Authorization: Token $TOKEN" \
  -F "image_quality=70" \
  -F "client_files[0]=@$IMG")
echo "Upload status: $HTTP (attendu: 202)"
[[ "$HTTP" != "202" ]] && echo "ERREUR: upload a échoué" && exit 1

echo "=== 4. Attente worker (max 15s) ==="
for i in $(seq 1 10); do
  sleep 1.5
  CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Token $TOKEN" \
    "$API/tasks/$TASK_ID/preview")
  echo "  tentative $i: preview → $CODE"
  if [[ "$CODE" == "200" ]]; then
    echo "=== SUCCÈS: preview 200 OK, worker a traité les fichiers ==="
    echo "Nettoyage tâche $TASK_ID..."
    curl -sf -X DELETE "$API/tasks/$TASK_ID" -H "Authorization: Token $TOKEN"
    exit 0
  fi
done

echo "=== ÉCHEC: preview toujours pas 200 après 15s ==="
echo "Vérifier: docker logs cvat_worker_import --tail 30"
exit 1
