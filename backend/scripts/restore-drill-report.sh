#!/usr/bin/env bash
set -euo pipefail

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "Error: pg_dump is required." >&2
  exit 1
fi

if ! command -v pg_restore >/dev/null 2>&1; then
  echo "Error: pg_restore is required." >&2
  exit 1
fi

DATABASE_URL_VALUE="${DATABASE_URL:-}"
if [[ -z "$DATABASE_URL_VALUE" ]]; then
  echo "Error: DATABASE_URL is not set." >&2
  exit 1
fi

REPORTS_DIR="${RESTORE_DRILL_REPORT_DIR:-./restore-drills}"
BACKUP_DIR="${RESTORE_DRILL_BACKUP_DIR:-.restore-drill-tmp}"
RTO_TARGET_MINUTES="${RTO_TARGET_MINUTES:-30}"
ENFORCE_RTO="${RESTORE_DRILL_ENFORCE_RTO:-false}"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%SZ)"
REPORT_FILE="${REPORTS_DIR}/restore-drill-${TIMESTAMP}.md"
REPORT_JSON_FILE="${REPORTS_DIR}/restore-drill-${TIMESTAMP}.json"

mkdir -p "$REPORTS_DIR"
rm -rf "$BACKUP_DIR"
mkdir -p "$BACKUP_DIR"

start_epoch="$(date +%s)"
start_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

backup_start="$(date +%s)"
DRY_RUN=true BACKUP_DIR="$BACKUP_DIR" BACKUP_PREFIX="restore-drill" bash scripts/db-backup.sh
backup_end="$(date +%s)"

backup_file="$(ls "$BACKUP_DIR"/restore-drill-*.dump | head -n 1)"

restore_start="$(date +%s)"
DRY_RUN=true bash scripts/db-restore.sh "$backup_file"
restore_end="$(date +%s)"

end_epoch="$(date +%s)"
end_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

backup_seconds="$((backup_end - backup_start))"
restore_seconds="$((restore_end - restore_start))"
total_seconds="$((end_epoch - start_epoch))"
rto_target_seconds="$((RTO_TARGET_MINUTES * 60))"

if [[ "$total_seconds" -le "$rto_target_seconds" ]]; then
  rto_status="PASS"
else
  rto_status="FAIL"
fi

cat > "$REPORT_FILE" <<EOF
# Restore Drill Report

- Timestamp (UTC): ${TIMESTAMP}
- Start (UTC): ${start_utc}
- End (UTC): ${end_utc}
- Backup file: ${backup_file}

## Measurements

- Backup dry-run duration (s): ${backup_seconds}
- Restore dry-run duration (s): ${restore_seconds}
- Total drill duration (s): ${total_seconds}
- RTO target (min): ${RTO_TARGET_MINUTES}
- RTO status: ${rto_status}

## Notes

- This drill is non-destructive (DRY_RUN=true).
- Update RTO_TARGET_MINUTES to align with your SLO.
- For a full destructive drill, restore to an isolated temporary database.
EOF

cat > "$REPORT_JSON_FILE" <<EOF
{
  "timestampUtc": "${TIMESTAMP}",
  "startUtc": "${start_utc}",
  "endUtc": "${end_utc}",
  "backupFile": "${backup_file}",
  "backupDryRunSeconds": ${backup_seconds},
  "restoreDryRunSeconds": ${restore_seconds},
  "totalSeconds": ${total_seconds},
  "rtoTargetMinutes": ${RTO_TARGET_MINUTES},
  "rtoTargetSeconds": ${rto_target_seconds},
  "rtoStatus": "${rto_status}",
  "dryRun": true
}
EOF

echo "Restore drill report generated: ${REPORT_FILE}"
echo "Restore drill JSON generated: ${REPORT_JSON_FILE}"

if [[ "$ENFORCE_RTO" == "true" ]] && [[ "$rto_status" != "PASS" ]]; then
  echo "Restore drill failed RTO threshold (${total_seconds}s > ${rto_target_seconds}s)." >&2
  rm -rf "$BACKUP_DIR"
  exit 1
fi

rm -rf "$BACKUP_DIR"
