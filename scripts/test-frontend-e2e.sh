#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is required." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker daemon is not running. Start Docker Desktop first." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "Error: python3 is required to serve frontend files." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

DB_CONTAINER="${E2E_DB_CONTAINER:-smartirri-e2e-db}"
DB_PORT="${E2E_DB_PORT:-54331}"
DB_NAME="${E2E_DB_NAME:-smartirri}"
DB_USER="${E2E_DB_USER:-postgres}"
DB_PASSWORD="${E2E_DB_PASSWORD:-postgres}"
API_PORT="${E2E_API_PORT:-4000}"
FRONTEND_PORT="${E2E_FRONTEND_PORT:-5500}"

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  if [[ -n "$BACKEND_PID" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi

  if [[ -n "$FRONTEND_PID" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
    wait "$FRONTEND_PID" 2>/dev/null || true
  fi

  docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true
}

trap cleanup EXIT

docker rm -f "$DB_CONTAINER" >/dev/null 2>&1 || true

echo "[1/10] Starting PostgreSQL container..."
docker run -d \
  --name "$DB_CONTAINER" \
  -e POSTGRES_DB="$DB_NAME" \
  -e POSTGRES_USER="$DB_USER" \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \
  -p "${DB_PORT}:5432" \
  postgres:14 >/dev/null

echo "[2/10] Waiting for PostgreSQL readiness..."
for _ in {1..40}; do
  if docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1

export PORT="$API_PORT"
export NODE_ENV="test"
export DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}"
export JWT_ACCESS_SECRET="frontend-e2e-access-secret"
export JWT_REFRESH_SECRET="frontend-e2e-refresh-secret"
export JWT_ACCESS_EXPIRES_IN="15m"
export JWT_REFRESH_EXPIRES_IN="7d"
export DEVICE_SHARED_KEY="frontend-e2e-device-key"
export CORS_ORIGIN="http://localhost:${FRONTEND_PORT}"
export TRUST_PROXY="false"
export LOG_HTTP_REQUESTS="false"
export LOG_STARTUP_BANNER="false"

echo "[3/10] Running backend migrations..."
cd "$BACKEND_DIR"
npm run migrate

echo "[4/10] Seeding backend data..."
npm run seed

echo "[5/10] Starting backend API..."
npm start > "$ROOT_DIR/backend-e2e.log" 2>&1 &
BACKEND_PID=$!

echo "[6/10] Waiting for backend health/readiness..."
for _ in {1..40}; do
  if curl -fsS "http://localhost:${API_PORT}/health" >/dev/null 2>&1 && curl -fsS "http://localhost:${API_PORT}/ready" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://localhost:${API_PORT}/health" >/dev/null 2>&1
curl -fsS "http://localhost:${API_PORT}/ready" >/dev/null 2>&1

echo "[7/10] Starting frontend static server..."
cd "$ROOT_DIR"
python3 -m http.server "$FRONTEND_PORT" > "$ROOT_DIR/frontend-e2e.log" 2>&1 &
FRONTEND_PID=$!

echo "[8/10] Waiting for frontend availability..."
for _ in {1..30}; do
  if curl -fsS "http://localhost:${FRONTEND_PORT}/login.html" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS "http://localhost:${FRONTEND_PORT}/login.html" >/dev/null 2>&1

echo "[9/10] Installing Playwright browser (Chromium)..."
npx playwright install chromium >/dev/null

echo "[10/10] Running frontend e2e tests..."
PLAYWRIGHT_ARGS_VALUE="${PLAYWRIGHT_ARGS:-}"
if [[ -n "$PLAYWRIGHT_ARGS_VALUE" ]]; then
  # shellcheck disable=SC2206
  PLAYWRIGHT_ARGS_ARRAY=( $PLAYWRIGHT_ARGS_VALUE )
  echo "Using Playwright args: $PLAYWRIGHT_ARGS_VALUE"
else
  PLAYWRIGHT_ARGS_ARRAY=()
fi

FRONTEND_URL="http://localhost:${FRONTEND_PORT}" npx playwright test "${PLAYWRIGHT_ARGS_ARRAY[@]}"

echo "OK Frontend e2e smoke tests passed."
