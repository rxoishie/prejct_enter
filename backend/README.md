# SmartIrri Backend

Node.js + Express + PostgreSQL backend for the SmartIrriPro frontend.

## 1) Prerequisites

- Node.js 18+
- PostgreSQL 14+

## 2) Setup

1. Copy `.env.example` to `.env` and adjust values.
2. Install dependencies:
   - `npm install`
3. Run migrations:
   - `npm run migrate`
4. Seed demo data:
   - `npm run seed`
5. Start server:
   - `npm run dev`

Server URL: `http://localhost:4000`

Health endpoints:

- `GET /health` (liveness)
- `GET /ready` (readiness + PostgreSQL check)

Au demarrage, le serveur affiche aussi un resume de configuration sanitisee
(mode, port, proxy, logs HTTP, cible DB sans credentials, URLs health/readiness).

## 3) Main Endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `PATCH /api/v1/auth/profile`
- `POST /api/v1/auth/change-password`

- `GET /api/v1/zones`
- `GET /api/v1/zones/:zoneId`
- `PATCH /api/v1/zones/:zoneId`
- `POST /api/v1/zones/:zoneId/start`
- `POST /api/v1/zones/:zoneId/stop`

- `GET /api/v1/schedules`
- `POST /api/v1/schedules`
- `PATCH /api/v1/schedules/:scheduleId`
- `DELETE /api/v1/schedules/:scheduleId`

- `GET /api/v1/irrigation-events`
- `POST /api/v1/sensors/ingest` (requires header `x-device-key`)
- `GET /api/v1/notifications`
- `PATCH /api/v1/notifications/:notificationId/read`
- `GET /api/v1/dashboard/summary`

## 3.1) Production Environment Notes

En production:

- `CORS_ORIGIN` ne doit pas etre `*`
- `JWT_ACCESS_SECRET` doit contenir au moins 32 caracteres
- `JWT_REFRESH_SECRET` doit contenir au moins 32 caracteres
- `DEVICE_SHARED_KEY` doit contenir au moins 16 caracteres

Option utile derriere un reverse proxy (Nginx/Render/Heroku):

- `TRUST_PROXY=true`

Logs HTTP structures (JSON):

- `LOG_HTTP_REQUESTS=true` (active par defaut en `NODE_ENV=production`)
- Chaque reponse inclut `X-Request-Id` (propage celui du client si fourni, sinon genere un UUID)

Rate limiting API (`/api/*`):

- `API_RATE_LIMIT_WINDOW_MS` (defaut `900000`, soit 15 min)
- `API_RATE_LIMIT_MAX` (defaut `1000` requetes par fenetre)

Rate limiting Auth (`/api/v1/auth/login`, `/api/v1/auth/refresh`):

- `AUTH_LOGIN_RATE_LIMIT_WINDOW_MS` (defaut `900000`)
- `AUTH_LOGIN_RATE_LIMIT_MAX` (defaut `10`)
- `AUTH_REFRESH_RATE_LIMIT_WINDOW_MS` (defaut `900000`)
- `AUTH_REFRESH_RATE_LIMIT_MAX` (defaut `30`)

Protection anti-bruteforce login:

- `AUTH_LOGIN_MAX_FAILED_ATTEMPTS` (defaut `5`)
- `AUTH_LOGIN_LOCKOUT_SECONDS` (defaut `900`)
- `AUTH_LOGIN_BACKOFF_BASE_SECONDS` (defaut `2`, peut etre `0` pour des tests rapides)
- `AUTH_LOGIN_BACKOFF_MAX_SECONDS` (defaut `30`)

Quand le seuil est atteint, `POST /api/v1/auth/login` renvoie HTTP `429` et le header `Retry-After`.

Le verrouillage est applique sur deux cles simultanement:

- identite (email/username)
- IP cliente (derriere proxy si `TRUST_PROXY=true`)

Audit auth:

- les evenements login (`login_success`, `login_failed`, `login_locked`) sont persistes dans la table `auth_audit_events`
- metadata utile: scope de verrouillage, `retryAfterSeconds`, nombre d'echecs par scope

Banniere de demarrage:

- `LOG_STARTUP_BANNER=true` (mettre `false` pour des logs plus discrets)

## 3.2) API Versioning Policy

The backend serves routes under `/api/v1` and includes response headers for version governance:

- `X-API-Version: v1`
- `Deprecation: false`
- `Sunset: TBD`

These headers are configurable through environment variables:

- `API_VERSION` (default `v1`)
- `API_DEPRECATION` (default `false`)
- `API_SUNSET` (default `TBD`)

Deprecation rules:

1. Breaking changes must ship in a new versioned path (example: `/api/v2`).
2. Deprecated versions should set `Deprecation: true` and a concrete `Sunset` date.
3. Keep at least one stable overlapping period between old and new versions.

## 4) Seed Credentials

- Email: `aishatou@example.com`
- Username: `Aishatou`
- Password: `password123`

## 5) Smoke Test API

Une fois le serveur démarré, vous pouvez valider rapidement les routes principales:

- `npm run smoke`

Variables utiles pour personnaliser le test:

- `BASE_URL` (défaut: `http://localhost:4000/api/v1`)
- `SMOKE_USERNAME` (défaut: `Aishatou`)
- `SMOKE_PASSWORD` (défaut: `password123`)
- `DEVICE_SHARED_KEY` (pour tester `POST /sensors/ingest`)

Exemple:

- `DEVICE_SHARED_KEY=ma_cle npm run smoke`

## 6) Tests d'intégration API (Node)

Un test d'intégration minimal est disponible pour vérifier les formats de réponse des routes principales.

- `npm run test:api`

La suite couvre aussi la protection brute-force login (verrouillage temporaire apres echecs consecutifs).

Pré-requis:

1. Backend démarré (`npm run dev`)
2. Base migrée et seedée (`npm run migrate && npm run seed`)

Variables optionnelles:

- `BASE_URL` (défaut: `http://localhost:4000/api/v1`)
- `SMOKE_USERNAME` (défaut: `Aishatou`)
- `SMOKE_PASSWORD` (défaut: `password123`)

Exemple:

- `BASE_URL=http://localhost:4000/api/v1 npm run test:api`

Test dedie rate limiting:

- `npm run test:rate-limit`

Ce test valide qu'en depassant le quota configure, l'API retourne:

- HTTP `429 Too Many Requests`
- header `Retry-After`

## 7) Vérification locale type CI (avec PostgreSQL Docker temporaire)

Pour lancer un cycle complet en local (PostgreSQL temporaire + migrations + seed + smoke + tests d'intégration):

- `npm run test:local-ci`

Ce script:

1. Démarre un conteneur PostgreSQL 14 temporaire
2. Exporte les variables d'environnement nécessaires
3. Exécute `npm run migrate` puis `npm run seed`
4. Démarre le backend
5. Exécute `npm run smoke` puis `npm run test:api`
6. Arrête le backend et supprime le conteneur automatiquement

Variables optionnelles:

- `CI_DB_CONTAINER` (défaut: `smartirri-test-db`)
- `CI_DB_PORT` (défaut: `54329`)
- `CI_DB_NAME` (défaut: `smartirri`)
- `CI_DB_USER` (défaut: `postgres`)
- `CI_DB_PASSWORD` (défaut: `postgres`)
- `CI_API_PORT` (défaut: `4000`)

Exemple:

- `CI_DB_PORT=55432 CI_API_PORT=4100 npm run test:local-ci`

## 8) Deploiement

Checklist complete de preparation/deploiement:

- `backend/DEPLOYMENT.md`

Commandes utiles (base de donnees):

- `npm run backup:db`
- `npm run restore:db -- /path/to/backup.dump`
- `npm run drill:restore` (genere un rapport de restore drill non-destructif)

Options utiles:

- `DRY_RUN=true` (valide le flux sans executer `pg_dump`/`pg_restore`)
- `BACKUP_RETENTION_DAYS=<n>` (supprime les backups `.dump` plus anciens que `n` jours)
- `RTO_TARGET_MINUTES=<n>` (seuil de validation du drill, defaut `30`)
- `RESTORE_DRILL_ENFORCE_RTO=true` (fait echouer la commande si le RTO est depasse)

Sorties du drill:

- Markdown: `restore-drills/restore-drill-<timestamp>.md`
- JSON: `restore-drills/restore-drill-<timestamp>.json`
