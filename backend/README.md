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

## 3) Main Endpoints

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `PATCH /api/v1/auth/profile`

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

Pré-requis:

1. Backend démarré (`npm run dev`)
2. Base migrée et seedée (`npm run migrate && npm run seed`)

Variables optionnelles:

- `BASE_URL` (défaut: `http://localhost:4000/api/v1`)
- `SMOKE_USERNAME` (défaut: `Aishatou`)
- `SMOKE_PASSWORD` (défaut: `password123`)

Exemple:

- `BASE_URL=http://localhost:4000/api/v1 npm run test:api`
