#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Erreur: Docker est requis pour exécuter ce script." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Erreur: Docker est installé mais le daemon n'est pas démarré." >&2
  echo "Démarrez Docker Desktop puis relancez la commande." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Erreur: curl est requis pour vérifier la santé de l'API." >&2
  exit 1
fi

CONTAINER_NAME="${CI_DB_CONTAINER:-smartirri-test-db}"
DB_PORT="${CI_DB_PORT:-54329}"
DB_NAME="${CI_DB_NAME:-smartirri}"
DB_USER="${CI_DB_USER:-postgres}"
DB_PASSWORD="${CI_DB_PASSWORD:-postgres}"
API_PORT="${CI_API_PORT:-4000}"

SERVER_PID=""

cleanup() {
  if [[ -n "$SERVER_PID" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
}

trap cleanup EXIT

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

echo "[1/7] Démarrage PostgreSQL (${CONTAINER_NAME})..."
docker run -d \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \
  -p "${DB_PORT}:5432" \
  postgres:14 >/dev/null

echo "[2/7] Attente de la disponibilité de PostgreSQL..."
for i in {1..40}; do
  if docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "$CONTAINER_NAME" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
  echo "Erreur: PostgreSQL n'est pas prêt à temps." >&2
  exit 1
fi

export PORT="$API_PORT"
export NODE_ENV="test"
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}"
export JWT_ACCESS_SECRET="local-ci-access-secret"
export JWT_REFRESH_SECRET="local-ci-refresh-secret"
export JWT_ACCESS_EXPIRES_IN="15m"
export JWT_REFRESH_EXPIRES_IN="7d"
export DEVICE_SHARED_KEY="local-ci-device-key"
export CORS_ORIGIN="http://localhost:5500"
export TRUST_PROXY="true"
export AUTH_LOGIN_RATE_LIMIT_WINDOW_MS="900000"
export AUTH_LOGIN_RATE_LIMIT_MAX="200"
export AUTH_REFRESH_RATE_LIMIT_WINDOW_MS="900000"
export AUTH_REFRESH_RATE_LIMIT_MAX="200"
export AUTH_LOGIN_MAX_FAILED_ATTEMPTS="3"
export AUTH_LOGIN_LOCKOUT_SECONDS="120"
export AUTH_LOGIN_BACKOFF_BASE_SECONDS="0"
export AUTH_LOGIN_BACKOFF_MAX_SECONDS="30"
export BASE_URL="http://localhost:${API_PORT}/api/v1"
export SMOKE_USERNAME="Aishatou"
export SMOKE_PASSWORD="password123"

echo "[3/7] Migrations..."
npm run migrate

echo "[4/7] Seed..."
npm run seed

echo "[5/7] Démarrage backend..."
npm start > ../backend-local-ci.log 2>&1 &
SERVER_PID=$!

echo "[6/7] Vérification /health..."
for i in {1..40}; do
  if curl -fsS "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://localhost:${API_PORT}/health" >/dev/null 2>&1; then
  echo "Erreur: le backend ne répond pas sur /health." >&2
  echo "Consultez ../backend-local-ci.log" >&2
  exit 1
fi

echo "[7/7] Smoke + tests d'intégration..."
npm run smoke
npm run test:api

echo "✅ Vérification locale type CI terminée avec succès."
