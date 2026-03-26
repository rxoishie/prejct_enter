#!/usr/bin/env bash
set -euo pipefail

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "Error: pg_restore is required." >&2
  exit 1
fi

DATABASE_URL_VALUE="${DATABASE_URL:-}"
if [[ -z "$DATABASE_URL_VALUE" ]]; then
  echo "Error: DATABASE_URL is not set." >&2
  exit 1
fi

DRY_RUN="${DRY_RUN:-false}"

BACKUP_FILE_INPUT="${1:-${BACKUP_FILE:-}}"
if [[ -z "$BACKUP_FILE_INPUT" ]]; then
  echo "Usage: $0 <backup-file.dump>" >&2
  echo "Or set BACKUP_FILE environment variable." >&2
  exit 1
fi

if [[ ! -f "$BACKUP_FILE_INPUT" ]]; then
  echo "Error: backup file not found: $BACKUP_FILE_INPUT" >&2
  exit 1
fi

echo "Restoring PostgreSQL backup from: $BACKUP_FILE_INPUT"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "DRY_RUN=true: skipping pg_restore execution"
else
  pg_restore \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --dbname="$DATABASE_URL_VALUE" \
    "$BACKUP_FILE_INPUT"
fi

echo "Restore completed."
