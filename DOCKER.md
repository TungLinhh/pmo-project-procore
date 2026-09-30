# DOCKER.md — PMO local demo and production container

> **Phạm vi đã chốt (2026-09-26): triển khai nội bộ, KHÔNG dùng Docker.**
> Tài liệu đường đã chọn là `docs/DEPLOY_INTERNAL_RUNBOOK.md` (Node + PostgreSQL
> trực tiếp). File này giữ lại để dành cho khi chuyển sang container, và phần
> *Production deployment* bên dưới **chưa từng chạy** — chỉ kiểm bằng tĩnh vì máy
> dự án không có Docker.

## Deliverables

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: `node:22-slim` → frontend build → backend runtime |
| `docker-compose.yml` | Local demo stack with PostgreSQL, MinIO and shared demo credentials |
| `docker-compose.prod.yml` | Production stack with required secrets, private S3, one-shot init and no owner credentials in the app process |
| `deploy/production/00-backup-role.sh` | Creates the dedicated `pmo_backup` role used by `pg_dump` |
| `docker-entrypoint.sh` | Waits for PG and initializes in demo mode; production uses `SKIP_DB_INIT=1` after the init job |
| `.dockerignore` | Excludes `data/`, `node_modules`, `.git`, `tests/`, `docs/`, `/tmp`, `reference_sheets/` |

## Runtime modes

The image contains no database password. Compose supplies configuration at runtime.

- Local demo uses `docker-compose.yml`. The compose file explicitly sets `ALLOW_DEV_PASSWORD=1` for the local-only demo; do not copy that override into `docker-compose.prod.yml`.
- Production uses `docker-compose.prod.yml`. A one-shot `init` container receives the owner connection, applies migrations, creates `pmo_app`, and exits. The long-running app receives only `APP_DB_*`, so it cannot own schema or bypass RLS.
- The image runs as the unprivileged `node` user. Production also enables a read-only root filesystem, dropped Linux capabilities, and separate upload/backup volumes.

## Local backup rehearsal

Use a dedicated PostgreSQL role with `BYPASSRLS` for the dump. Do not put its password in the command line; pass it through `BACKUP_DATABASE_URL` and let `runBackup()` remove it from the child `pg_dump` arguments.

```bash
BACKUP_DIR=/tmp/pmo-backups \
BACKUP_DATABASE_URL='postgresql://pmo_backup:...@127.0.0.1:5433/pmo' \
node --input-type=module -e "import { runBackup } from './backend/src/lib/backup.js'; console.log(await runBackup())"
node backend/scripts/verify-backup.js /tmp/pmo-backups/<archive>.dump
```

Restore rehearsal must target a disposable database, never the demo database. The local check in `docs/SRS_ACCEPTANCE_EXECUTION_PLAN.md` used a temporary `BYPASSRLS` role and a scratch database.

## Local demo quick start

```bash
# From the repo root:
docker compose up --build

# Then verify:
curl http://localhost:3000/api/health   # liveness: tiến trình còn sống, KHÔNG chạm DB
# → {"status":"ok","timestamp":"...","uptime_s":12,"authenticated":false,"user":null}
curl http://localhost:3000/api/ready    # readiness: DB còn trả lời không (503 = chết)
# → {"status":"ok","db":{"ok":true,"latency_ms":3},"timestamp":"..."}

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
  │       └─ seeds tenant 1, admin@hbg.com, role users and demo data outside production
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
| `JWT_SECRET` | (required) | host secret |
| `DATA_ENC_KEY` | (required) | host secret, 32 bytes base64/hex |
| `BACKUP_DATABASE_URL` | (required for backup) | dedicated role with `BYPASSRLS` |
| `PRODUCTION_ENFORCE_READINESS` | `1` | host/compose |
| `TRUST_PROXY` | `1` behind one reverse proxy | host/compose |

## What's NOT Baked Into the Image

- `backend/.env` — secrets stay on host, read from env at runtime
- `data/pgdata/` — PG data volume (`pgdata:` named volume)
- `data/test-fixtures/` — BTE Excels ingested via UI at runtime
- `reference_sheets/` — large PDFs, not needed in image
- `tests/` — dev-only, not needed at runtime
- `node_modules/` — built fresh in each `docker compose build`
- `/tmp/` — runtime scratch (demo zips)

## Production deployment

Set these values in the host secret store or a protected Compose environment:

- `DB_PASSWORD`, `APP_DB_PASSWORD`, `BACKUP_DB_PASSWORD`
- `BACKUP_DATABASE_URL` for the same `pmo_backup` password
- `JWT_SECRET` with at least 32 random characters
- `DATA_ENC_KEY` containing exactly 32 random bytes in base64 or hex form
- `ADMIN_INITIAL_PASSWORD` for the first boot only
- `PUBLIC_BASE_URL`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- At least one configured AI provider key if AI is enabled for the tenant

Generate secrets instead of reusing examples:

```bash
openssl rand -hex 32       # JWT_SECRET
openssl rand -base64 32    # DATA_ENC_KEY
openssl rand -hex 32       # each database or S3 password
```

Start and inspect the production stack:

```bash
docker compose --env-file /secure/path/pmo.env \
  -f docker-compose.prod.yml config --quiet

docker compose --env-file /secure/path/pmo.env \
  -f docker-compose.prod.yml up -d --build

docker compose --env-file /secure/path/pmo.env \
  -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:3000/api/ready   # compose healthcheck dùng endpoint này
```

After the first successful login, remove `ADMIN_INITIAL_PASSWORD` from the runtime environment. Future init runs leave the existing bcrypt hash unchanged.

Terminate TLS at one trusted reverse proxy and forward the original host/protocol headers. Keep `TRUST_PROXY` equal to the exact number of proxy hops. Do not expose PostgreSQL publicly.

Run a backup and prove that it can be restored before go-live:

```bash
docker compose --env-file /secure/path/pmo.env \
  -f docker-compose.prod.yml exec app \
  node backend/scripts/run-backup.js

node backend/scripts/verify-backup.js <archive produced by the backup job>
```

The restore command must target an isolated scratch database in the release rehearsal. A successful `pg_dump` alone is not restore evidence.

## Stop & Clean

```bash
docker compose down -v    # remove containers + named volumes (pgdata)
docker compose down       # remove containers only (keep pgdata)
docker system prune       # remove dangling images
---

## Trạng thái triển khai (đo 2026-09-26)

### Đã kiểm chứng được trên máy này

Ứng dụng **chạy được ở chế độ production** — đây là rủi ro lớn nhất vì trước đó
`NODE_ENV=production` chưa từng được bật ở bất kỳ lần chạy nào.

```bash
NODE_ENV=production \
DATABASE_URL='postgres://…' \
JWT_SECRET="$(openssl rand -hex 32)" \
DATA_ENC_KEY="$(openssl rand -hex 32)" \
UPLOADS_DIR=… BACKUP_DIR=… TRUST_PROXY=0 \
node backend/src/index.js
```

Kết quả: khởi động không lỗi, `/api/health` **200**, `/api/ready` **200**, và các
endpoint thật đều trả 200 — `/api/me`, `/api/projects`, `control-summary`,
`jobs/attention`, `dashboard/portfolio-kpi`, `upload/doc-types`, `notifications`.
SPA phục vụ tại `/`.

Phần hạ tầng container cũng đã kiểm bằng tĩnh: lockfile cho cả hai workspace có
mặt (`npm ci` cần), `docker-entrypoint.sh` **không** bị `.dockerignore` loại (thiếu nó
thì image build hỏng), không có dependency nào nằm cả `dependencies` lẫn
`devDependencies` (`npm ci --omit=dev` dễ vỡ khi trùng), và entrypoint qua được
kiểm tra cú pháp bash.

### Chưa làm được trên máy này

**Docker chưa cài** (`docker: command not found`), nên **chưa build được image thật**.
Toàn bộ phần container ở trên mới được kiểm bằng tĩnh, chưa từng chạy. Bước đầu tiên
khi triển khai là cài Docker và chạy `docker compose -f docker-compose.prod.yml build`.

### Còn chặn (7 mục readiness, đo ở chế độ production)

| Mục | Cần làm gì | Ai quyết |
|---|---|---|
| `dev_password` | bỏ `ALLOW_DEV_PASSWORD=1`; đặt `ADMIN_INITIAL_PASSWORD` cho lần khởi động đầu | kỹ thuật |
| `app_db_user` / `app_db_password` | tạo `pmo_app`, để app chạy bằng role **không** bypass RLS | kỹ thuật |
| `backup_url` | tạo role `pmo_backup` (`BYPASSRLS`) bằng `deploy/production/00-backup-role.sh` | kỹ thuật |
| `uploads_volume` | `UPLOADS_DIR` phải là **volume riêng**, không chung filesystem với cây ứng dụng | kỹ thuật |
| `shared_password_users` | 8/8 tài khoản demo dùng chung `admin123` | **PMO/CEO** |
| `strong_auth` | 2 tài khoản còn `must_change_password` | **PMO/CEO** |
| `mfa_others` | 6 tài khoản chưa bật MFA | **PMO/CEO** |

Bốn mục cuối là quyết định của con người, không phải việc kỹ thuật. Chúng được giữ ở
chế độ cảnh báo khi hệ thống còn là demo; `getProductionReadiness()` **không** tự
đóng — nếu muốn bỏ qua, sửa bảng quyết định trong `docs/RELEASE_GATE.md`, đừng sửa
mã readiness.

### Điều kiện nghiệm thu chưa đạt

`docs/DATA_DECISIONS_REQUIRED.md` còn **9 mục chờ ký** và biên bản UAT vẫn
`SIGNED: false`. Triển khai cho **nội bộ demo** không cần hai điều đó; triển khai cho
người ngoài thì phải ký trước, vì 9 mục đó gồm quy tắc nghiệp vụ quyết định dữ liệu
được ghi thế nào.
