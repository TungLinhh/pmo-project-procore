# DOCKER.md — PMO Demo Container

## Deliverables

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: `node:22-slim` → frontend build → backend runtime |
| `docker-compose.yml` | `postgres:16-alpine` (port 5433) + `init` (one-shot) + `app` (port 3000) |
| `docker-entrypoint.sh` | Wait PG → `node backend/src/db/init.js` → `exec CMD` |
| `.dockerignore` | Excludes `data/`, `node_modules`, `.git`, `tests/`, `docs/`, `/tmp`, `reference_sheets/` |

## No App-Code Changes Required

The existing code already reads DB config from environment with sensible defaults:

```js
// backend/src/db/index.js — buildDatabaseUrl()
export function buildDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = process.env.DB_USER || 'pmo_user';
  const pass = process.env.DB_PASSWORD || 'pmo_dev_pwd';
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = process.env.DB_PORT || '5433';
  const name = process.env.DB_NAME || 'pmo';
  return `postgresql://${encodeURIComponent(user)}:***@${host}:${port}/${name}`;
}
```

The Dockerfile/compose set `DB_HOST=postgres` (compose service name), `DB_PORT=5432` (container PG port), and the defaults match. No code diff needed.

## Quick Start

```bash
# From the repo root:
docker compose up --build

# Then verify:
curl http://localhost:3000/api/health
# → {"status":"ok","timestamp":"...","authenticated":false,"user":null}

# Login (admin@hbg.com / admin123):
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hbg.com","password":"admin123"}' | jq -r '.token'

# Projects (should return BTE-WP4-HBC):
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hbg.com","password":"admin123"}' | jq -r '.token')
curl -s http://localhost:3000/api/projects -H "Authorization: Bearer $TOKEN" | jq '.[0].code'
# → "BTE-WP4-HBC"
```

## Service Lifecycle

```
docker compose up --build
  │
  ├─ postgres:16-alpine
  │   └─ healthcheck: pg_isready -U pmo_user -d pmo (every 10s)
  │
  ├─ init (one-shot)
  │   └─ node backend/src/db/init.js
  │       ├─ orderedMigrationFiles(): 9999 before 9998
  │       ├─ applies drizzle/*.sql (idempotent IF NOT EXISTS)
  │       └─ seeds tenant 1, admin@hbg.com, 6 role users, demo projects
  │       └─ exits 0
  │
  └─ app
      └─ docker-entrypoint.sh → node backend/src/index.js
          └─ Express on :3000, serves API + frontend/dist
```

## Environment Variables

| Var | Default | Source |
|-----|---------|--------|
| `DATABASE_URL` | (built from DB_*) | compose |
| `DB_HOST` | `postgres` | compose (service name) |
| `DB_PORT` | `5432` | compose (container PG port) |
| `DB_NAME` | `pmo` | compose |
| `DB_USER` | `pmo_user` | compose |
| `DB_PASSWORD` | `pmo_dev_pwd` | compose |
| `PORT` | `3000` | compose |
| `NODE_ENV` | `production` | compose |

## What's NOT Baked Into the Image

- `backend/.env` — secrets stay on host, read from env at runtime
- `data/pgdata/` — PG data volume (`pgdata:` named volume)
- `data/test-fixtures/` — BTE Excels ingested via UI at runtime
- `reference_sheets/` — large PDFs, not needed in image
- `tests/` — dev-only, not needed at runtime
- `node_modules/` — built fresh in each `docker compose build`
- `/tmp/` — runtime scratch (demo zips)

## Stop & Clean

```bash
docker compose down -v    # remove containers + named volumes (pgdata)
docker compose down       # remove containers only (keep pgdata)
docker system prune       # remove dangling images