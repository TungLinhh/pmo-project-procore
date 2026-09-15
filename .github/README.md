# CI/CD Pipeline

## Tổng quan

PMO MVP dùng GitHub Actions cho 2 workflow:

### 1. `ci.yml` — Continuous Integration
- Trigger: mỗi push hoặc pull request vào `main`/`develop`
- 4 job song song:
  - **backend-lint**: syntax check `node --check src/index.js`
  - **backend-tests**: chạy unit test với PG service container
  - **frontend-build**: build Vite + upload artifact
  - **e2e**: chạy API E2E + UI Playwright test

### 2. `deploy.yml` — Production deploy
- Trigger: push vào `main` (loại trừ docs)
- Cần secrets:
  - `PG_PASSWORD`: password PG
  - `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`: SSH vào production server
- Có thể thay bằng Cloudflare Pages + tunnel thay vì SSH tự host

## Local chạy test

```bash
# Backend lint
cd backend && npm run lint

# Backend unit tests
cd backend && npm test

# Frontend build
cd frontend && npm run build

# Full E2E (cần server + PG)
./backend/scripts/pg-ctl.sh start
cd backend && node src/index.js &
node _e2e_test.mjs
node _e2e_ui.mjs
```

## Setup CI trên GitHub

1. Push repo lên GitHub
2. Vào Settings → Secrets and variables → Actions, thêm secrets:
   - `PG_PASSWORD`
   - `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_KEY`
3. Tạo PostgreSQL test service (đã cấu hình trong `ci.yml`)
4. Workflow tự chạy mỗi push

## Tùy chỉnh

- **Thay đổi Node version**: sửa `node-version: '22'`
- **Thay đổi PG version**: sửa `image: postgres:16`
- **Thêm test runner** (Vitest, Jest): update script `test` trong `backend/package.json`
- **Deploy qua Docker**: thay SSH action bằng `docker/build-push-action`

## Status

- ✅ Local: 40/40 test pass (29 API + 11 UI)
- ⚠️ CI: chưa test thực trên GitHub Actions (cần push repo lên)
