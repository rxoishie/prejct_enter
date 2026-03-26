# SmartIrriPro

Full-stack smart irrigation project with:

- Static frontend pages (HTML/CSS/JS)
- Node.js + Express backend API
- PostgreSQL database

## 1) Prerequisites

- Node.js 18+
- PostgreSQL 14+
- One static file server for the frontend:
	- VS Code Live Server extension, or
	- Python (`python3 -m http.server`)

## 2) Project Structure

- Frontend (root): `index.html`, `dashboard.html`, `zone1.html`, `zone2.html`, `zone3.html`, `historique.html`, `Parametres.html`, `frontend-api.js`
- Backend: `backend/`

## 3) Quick Start (Local)

### Step A: Configure backend environment

```bash
cd backend
cp .env.example .env
```

Then edit `backend/.env` as needed. Required variables:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `DEVICE_SHARED_KEY`

Important for local frontend calls:

- `CORS_ORIGIN=http://localhost:5500` if you use Live Server default port 5500.

### Step B: Install and initialize backend

```bash
cd backend
npm install
npm run migrate
npm run seed
```

### Step C: Start backend API

```bash
cd backend
npm run dev
```

Backend URL:

- `http://localhost:4000`
- Health check: `http://localhost:4000/health`

### Step D: Start frontend

Option 1 (recommended): VS Code Live Server on `http://localhost:5500`

Option 2:

```bash
cd ..
python3 -m http.server 5500
```

Open:

- `http://localhost:5500/index.html`

The frontend API client uses this default base URL from `frontend-api.js`:

- `http://localhost:4000/api/v1`

## 4) Demo Credentials

After seed:

- Email: `aishatou@example.com`
- Username: `Aishatou`
- Password: `password123`

## 5) Validate the API Quickly

With backend running:

```bash
cd backend
npm run smoke
```

Optional variables:

- `BASE_URL` (default: `http://localhost:4000/api/v1`)
- `SMOKE_USERNAME` (default: `Aishatou`)
- `SMOKE_PASSWORD` (default: `password123`)
- `DEVICE_SHARED_KEY` (to test `/sensors/ingest`)

## 6) Run Integration Test

With backend running and DB initialized:

```bash
cd backend
npm run test:api
```

## 7) Frontend E2E Smoke Tests (Playwright)

A frontend E2E suite validates key flows against a temporary local stack:

- Failed login error path
- Zone navigation from dashboard
- Zone manual irrigation start/stop
- Zone schedule persistence after reload
- History page data rendering consistency
- History status filter request + table consistency
- Settings password modal validation
- Settings password change success path
- Settings notifications preference persistence

Run everything with one command from the repository root:

```bash
npm run test:e2e:local
```

What this command does:

1. Starts a temporary PostgreSQL container
2. Runs backend migrations + seed
3. Starts backend API
4. Starts a static frontend server
5. Runs Playwright smoke tests in Chromium
6. Cleans up all temporary processes

If you want to run tests only (assuming services are already up):

```bash
npm run test:e2e
```

CI automation:

- GitHub Actions workflow `Frontend E2E` runs this suite on frontend, e2e, and backend-impacting changes.
- CI runs with `npm run test:e2e:ci` (enables Playwright CI retries/workers tuning).
- CI splits execution into 2 parallel groups for faster feedback:
	- `core`: auth/settings/navigation
	- `operations`: zone-operations/history
- The Playwright suite is split into focused spec files (`auth`, `settings`, `navigation`, `zone-operations`, `history`) for clearer CI failure localization.

Optional local targeting (same stack orchestration):

- `PLAYWRIGHT_ARGS="e2e/auth.spec.js e2e/settings.spec.js" npm run test:e2e:ci`

## 8) Troubleshooting

- CORS error in browser:
	- Make sure `backend/.env` has `CORS_ORIGIN` matching your frontend origin.
	- Example: `http://localhost:5500`.
- `Missing required environment variable`:
	- Verify `backend/.env` exists and includes all required keys.
- `ECONNREFUSED` from frontend:
	- Ensure backend is running on port 4000.
- Empty zones or failed dashboard data:
	- Re-run `npm run migrate` and `npm run seed` in `backend`.

## 9) Backend Reference

Detailed backend route and script documentation is in:

- `backend/README.md`