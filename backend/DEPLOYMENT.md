# Backend Deployment Guide (Render)

This runbook describes a concrete production deployment target for SmartIrri backend on Render.

## 1) Create Services on Render

1. Create a PostgreSQL instance.
2. Create a new Web Service from this repository.
3. Set root directory to `backend`.
4. Set build command to `npm ci`.
5. Set start command to `npm start`.

## 2) Configure Environment Variables

Required:

- `NODE_ENV=production`
- `DATABASE_URL` (from Render PostgreSQL)
- `JWT_ACCESS_SECRET` (>= 32 chars)
- `JWT_REFRESH_SECRET` (>= 32 chars)
- `DEVICE_SHARED_KEY` (>= 16 chars)
- `CORS_ORIGIN` (must be your real frontend origin, never `*`)

Recommended:

- `TRUST_PROXY=true`
- `LOG_HTTP_REQUESTS=true`
- `LOG_STARTUP_BANNER=true`
- `API_VERSION=v1`
- `API_DEPRECATION=false`
- `API_SUNSET=TBD`
- `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS=900000`
- `AUTH_LOGIN_RATE_LIMIT_MAX=10`
- `AUTH_REFRESH_RATE_LIMIT_WINDOW_MS=900000`
- `AUTH_REFRESH_RATE_LIMIT_MAX=30`
- `AUTH_LOGIN_MAX_FAILED_ATTEMPTS=5`
- `AUTH_LOGIN_LOCKOUT_SECONDS=900`
- `AUTH_LOGIN_BACKOFF_BASE_SECONDS=2`
- `AUTH_LOGIN_BACKOFF_MAX_SECONDS=30`

Security notes:

- Keep `TRUST_PROXY=true` when deployed behind Render proxy/load balancer so IP-based lockout keying uses client IP.
- Review `auth_audit_events` periodically for repeated `login_locked` patterns (credential stuffing signals).

Notes:

- Render sets `PORT` automatically.
- App startup will fail fast if production constraints are invalid.

## 3) Health Checks

Use these paths in Render health configuration:

- Liveness: `/health`
- Readiness: `/ready`

Expected behavior:

- `/health` returns `200` when process is up.
- `/ready` returns `200` only if PostgreSQL connectivity is available.

## 4) Pre-Deploy Verification (Local)

Run before shipping:

```bash
cd backend
npm run test:local-ci
```

Run frontend smoke tests:

```bash
cd ..
npm run test:e2e:local
```

CI requirements before merge:

- `backend-tests` passes
- `production-config-check` passes
- `frontend-e2e-smoke` passes
- `ops-scripts-check` passes

## 5) Database Migration Strategy

When schema changes are included:

1. Take a backup (`npm run backup:db`).
2. Deploy application.
3. Run migration (`npm run migrate`) using production environment.
4. Validate `/ready` and key API calls.

Avoid running `npm run seed` in production unless explicitly required.

## 6) Backup and Retention Policy

Recommended baseline:

- Frequency: daily full backup
- Retention: 14 daily backups + 8 weekly backups
- Storage: encrypted off-host object storage
- Ownership: one primary owner + one backup owner

Backup command:

```bash
cd backend
npm run backup:db
```

Optional environment variables:

- `BACKUP_DIR` (default `./backups`)
- `BACKUP_PREFIX` (default `smartirri`)
- `BACKUP_FILE` (explicit output path)
- `BACKUP_RETENTION_DAYS` (default `0`, disabled)
- `DRY_RUN=true` (validate workflow without DB operation)

Example with retention:

```bash
cd backend
BACKUP_RETENTION_DAYS=14 npm run backup:db
```

## 7) Restore Drill (Monthly)

Run a restore drill at least once per month:

1. Create a temporary restore database.
2. Restore from the latest backup file.
3. Run backend smoke checks against restored DB.
4. Record recovery time and issues.

Automation available:

- GitHub Actions workflow: `.github/workflows/restore-drill.yml`
- Local report command: `npm run drill:restore`

The script writes a markdown report in `backend/restore-drills/` with:

- backup dry-run duration
- restore dry-run duration
- total drill duration
- RTO pass/fail status based on `RTO_TARGET_MINUTES` (default `30`)

It also writes a machine-readable JSON report alongside the markdown file.

In CI (`.github/workflows/restore-drill.yml`):

- the latest JSON report is summarized in the workflow job summary
- `RESTORE_DRILL_ENFORCE_RTO=true` makes the job fail when the drill exceeds the RTO threshold

Restore command:

```bash
cd backend
npm run restore:db -- /path/to/backup.dump
```

Alternative input:

```bash
cd backend
BACKUP_FILE=/path/to/backup.dump npm run restore:db
```

## 8) Post-Deploy Smoke Checks

After every production deploy:

1. `GET /health` returns `200`
2. `GET /ready` returns `200`
3. `POST /api/v1/auth/login` returns tokens for test user
4. `GET /api/v1/dashboard/summary` returns data with Bearer token
5. Frontend login and dashboard page load successfully
