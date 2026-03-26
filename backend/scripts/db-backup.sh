#!/usr/bin/env bash
set -euo pipefail

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Error: pg_dump is required." >&2
  exit 1
fi

DATABASE_URL_VALUE="${DATABASE_URL:-}"
if [[ -z "$DATABASE_URL_VALUE" ]]; then
  echo "Error: DATABASE_URL is not set." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_PREFIX="${BACKUP_PREFIX:-smartirri}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUTPUT_FILE="${BACKUP_FILE:-${BACKUP_DIR}/${BACKUP_PREFIX}-${TIMESTAMP}.dump}"
DRY_RUN="${DRY_RUN:-false}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-0}"

mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "Creating PostgreSQL backup: $OUTPUT_FILE"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "DRY_RUN=true: skipping pg_dump execution"
  : > "$OUTPUT_FILE"
else
  pg_dump \
    --format=custom \
    --no-owner \
    --no-privileges \
    --dbname="$DATABASE_URL_VALUE" \
    --file="$OUTPUT_FILE"
fi

if [[ "$BACKUP_RETENTION_DAYS" =~ ^[0-9]+$ ]] && [[ "$BACKUP_RETENTION_DAYS" -gt 0 ]]; then
  echo "Pruning backups older than ${BACKUP_RETENTION_DAYS} days in $(dirname "$OUTPUT_FILE")"
  find "$(dirname "$OUTPUT_FILE")" \
    -type f \
    -name "${BACKUP_PREFIX}-*.dump" \
    -mtime "+${BACKUP_RETENTION_DAYS}" \
    -delete
fi

echo "Backup completed: $OUTPUT_FILE"
