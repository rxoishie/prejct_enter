#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000/api/v1}"
USERNAME="${SMOKE_USERNAME:-Aishatou}"
PASSWORD="${SMOKE_PASSWORD:-password123}"
DEVICE_KEY="${DEVICE_SHARED_KEY:-replace_with_ingestion_key}"

if ! command -v curl >/dev/null 2>&1; then
  echo "Erreur: curl est requis pour exécuter le smoke test." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Erreur: python3 est requis pour parser les réponses JSON." >&2
  exit 1
fi

echo "[1/7] Vérification santé serveur..."
curl -fsS "${BASE_URL%/api/v1}/health" >/dev/null

echo "[2/7] Connexion avec l'utilisateur de test..."
LOGIN_RESPONSE="$(curl -fsS -X POST "${BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"emailOrUsername\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}")"

ACCESS_TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["accessToken"])')"

if [[ -z "$ACCESS_TOKEN" ]]; then
  echo "Erreur: access token non reçu." >&2
  exit 1
fi

echo "[3/7] Profil utilisateur..."
curl -fsS "${BASE_URL}/auth/me" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" >/dev/null

echo "[4/7] Récupération des zones..."
ZONES_RESPONSE="$(curl -fsS "${BASE_URL}/zones" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}")"

ZONE_ID="$(printf '%s' "$ZONES_RESPONSE" | python3 -c 'import json,sys; zones=json.load(sys.stdin); print(zones[0]["id"] if zones else "")')"

if [[ -z "$ZONE_ID" ]]; then
  echo "Erreur: aucune zone trouvée. Lancez d'abord les seeds." >&2
  exit 1
fi

echo "[5/7] Lecture dashboard..."
curl -fsS "${BASE_URL}/dashboard/summary" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" >/dev/null

echo "[6/7] Injection capteur (test ingestion)..."
if [[ "$DEVICE_KEY" == "replace_with_ingestion_key" ]]; then
  echo "Avertissement: DEVICE_SHARED_KEY non configurée, étape ingestion ignorée."
else
  curl -fsS -X POST "${BASE_URL}/sensors/ingest" \
    -H "Content-Type: application/json" \
    -H "x-device-key: ${DEVICE_KEY}" \
    -d "{\"zoneId\":\"${ZONE_ID}\",\"humidity\":42,\"temperature\":24,\"valveStatus\":false}" >/dev/null
fi

echo "[7/7] Lecture historique..."
curl -fsS "${BASE_URL}/irrigation-events?zoneId=${ZONE_ID}&limit=5" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" >/dev/null

echo "✅ Smoke test terminé avec succès."
