#!/bin/bash
# Usage: ./scripts/test-appapi.sh <admin_user> <admin_password>
set -e

ADMIN_USER="${1:-admin}"
ADMIN_PASS="${2:-Admin2026!}"
BASE="http://localhost:8888"
PASS=true

fail() { echo "  ✗ $1"; PASS=false; }
ok()   { echo "  ✓ $1"; }

echo "=== Test app-api ==="

# 1. Health check
STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/app-api/health")
[ "$STATUS" = "200" ] && ok "Health check" || fail "Health check (HTTP $STATUS)"

# 2. Login → get token
echo ""
echo "[1/4] Authentification admin..."
TOKEN=$(curl -sf -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}" | grep -o '"key":"[^"]*"' | cut -d'"' -f4)

[ -n "$TOKEN" ] && ok "Login ($ADMIN_USER)" || { fail "Login échoué"; exit 1; }

AUTH="Token $TOKEN"

# 3. List users
echo ""
echo "[2/4] Liste des utilisateurs..."
USERS_JSON=$(curl -sf -H "Authorization: $AUTH" "$BASE/app-api/users")
COUNT=$(echo "$USERS_JSON" | grep -o '"count":[0-9]*' | cut -d: -f2)
[ -n "$COUNT" ] && ok "GET /app-api/users ($COUNT utilisateurs)" || fail "GET /app-api/users"

# 4. Assign role to first non-admin user (if exists)
echo ""
echo "[3/4] Attribution de rôle..."
FIRST_ID=$(echo "$USERS_JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
users = [u for u in data['results'] if not u['is_superuser']]
print(users[0]['id'] if users else '')
" 2>/dev/null)

if [ -n "$FIRST_ID" ]; then
  STATUS=$(curl -sf -o /dev/null -w "%{http_code}" -X PATCH "$BASE/app-api/users/$FIRST_ID/role" \
    -H "Authorization: $AUTH" -H "Content-Type: application/json" \
    -d '{"role":"annotator"}')
  [ "$STATUS" = "200" ] && ok "PATCH /app-api/users/$FIRST_ID/role → annotator" || fail "PATCH role (HTTP $STATUS)"
else
  ok "Aucun utilisateur non-admin à tester (normal au premier lancement)"
fi

# 5. Reject non-admin access
echo ""
echo "[4/4] Contrôle d'accès (sans token)..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/app-api/users")
[ "$STATUS" = "401" ] && ok "401 sans token" || fail "Attendu 401, obtenu $STATUS"

echo ""
if $PASS; then
  echo "Tous les tests sont passés ✓"
  exit 0
else
  echo "Des tests ont échoué."
  exit 1
fi
