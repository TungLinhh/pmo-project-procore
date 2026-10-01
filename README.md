# PMO — Hệ thống quản lý dự án thi công

> Quản lý tiến độ, bản vẽ thi công, vật tư, thanh toán và nhân lực cho các dự án xây dựng nhiều khu vực (zones). Nhập trực tiếp từ file Excel công trường → bảng điều khiển 4 trụ cột theo thời gian thực.

**[📖 Hướng dẫn cài và dùng](docs/GUIDE_VI.md)** — bốn lệnh, không cần biết lập trình.

```bash
git clone https://github.com/TungLinhh/pmo-project-procore.git && cd pmo-project-procore
npm install && npm run setup
npm run dev     # http://localhost:5173 — đăng nhập admin@hbg.com / admin123
```

> **Dữ liệu mẫu:** `npm run setup` nạp sẵn một dự án mẫu (864 hạng mục lịch, 200 hồ sơ bản vẽ,
> 77 hợp đồng) và **tự chỉnh ngày về hôm nay** nên luôn thấy dự án đang chạy. Tên công ty
> trong dữ liệu mẫu đã được che — hồ sơ gốc của khách hàng không nằm trong repo này.

---

## 1. Cài đặt (chi tiết kỹ thuật)

**Yêu cầu:** Node.js 22+ · npm 10+ · PostgreSQL 16+ (kèm `psql`, `pg_isready` trong PATH).

### 1.1 Nhanh nhất — ba lệnh

```bash
git clone <repo-url> && cd pmo_project
npm install
npm run setup      # Postgres → vai trò+database → schema → dữ liệu demo
npm run dev        # http://localhost:5173
```

Đăng nhập: **`admin@hbg.com`** / **`admin123`** (bảng vai trò ở mục 2).

`npm run setup` làm đúng bốn việc, **mỗi việc chạy lại được** (nên cài nửa vời rồi chạy lại vẫn an toàn):

| Bước | Việc | Ghi chú |
|---|---|---|
| 1 | Bật Postgres ở `127.0.0.1:5433` | Tự gọi `pg-ctl.sh` (Linux/WSL). macOS/Windows: bật Postgres sẵn có rồi chạy lại |
| 2 | Tạo vai trò `pmo_user` + database `pmo` | Cần Postgres superuser — xem [1.3](#13-khi-npm-run-setup-báo-lỗi) |
| 3 | Chạy migration + seed danh mục | `backend/src/db/init.js`, idempotent |
| 4 | Nạp dữ liệu dự án demo + neo lịch về ngày chạy | 864 hạng mục lịch · 200 shop drawing · 77 hợp đồng |

Bước 4 **bắt buộc** để thấy dữ liệu: `init.js` chỉ seed tenant/user/vai trò/zone, còn hạng mục
lịch, shop drawing, vật tư, hợp đồng, thanh toán nằm trong
`backend/src/db/seed/demo/demo-project.sql`. Thiếu nó thì app vẫn chạy nhưng **mọi màn
nghiệp vụ đều trống**.

### 1.2 Chạy từng bước (khi cần soi lỗi)

```bash
npm run setup:postgres   # hoặc: bash backend/scripts/db-bootstrap.sh
node backend/src/db/init.js
npm run demo:seed        # hoặc: node scripts/load-demo-seed.mjs
npm run demo:dates       # neo lịch về hôm nay (tự bỏ qua nếu dữ liệu chưa cũ)
```

Sau đó chạy app ở hai cổng (backend `:3000`, Vite `:5173` — Vite tự proxy `/api`):

```bash
npm run dev
```

Chạy production một cổng (backend phục vụ luôn giao diện tĩnh ở `:3000`):

```bash
npm install && npm run build && npm start
```

### 1.3 Khi `npm run setup` báo lỗi

**`permission denied for schema public` hoặc `role "pmo_user" does not exist`**
→ bước 2 chưa có vai trò/database. Chạy `npm run setup:postgres`. Script cần Postgres
superuser; theo thứ tự thử:

```bash
# Linux/WSL — user hiện tại đã là superuser của cluster do pg-ctl.sh tạo
npm run setup:postgres

# Postgres hệ thống (Ubuntu/Debian)
PGHOST_ADMIN=/var/run/postgresql PGUSER_ADMIN=postgres npm run setup:postgres

# Docker
docker compose up -d postgres && npm run setup:postgres

# Homebrew (macOS) — Postgres chạy dưới user khác
sudo -u <user-postgres> npm run setup:postgres
```

**`Postgres không chạy ở 127.0.0.1:5433`** → khởi động Postgres rồi chạy lại
`npm run setup`. Muốn dùng cổng khác: `DB_PORT=5432 npm run setup`.

**`relation "..." does not exist` khi nạp seed** → schema lệch. Chạy lại
`node backend/src/db/init.js` rồi `npm run demo:seed`.

**`EADDRINUSE :::3000`** → cổng 3000 đã bị chiếm (thường là service cũ còn chạy).
`PORT=3100 npm run dev`.

### 1.4 Dữ liệu demo trong repo

`backend/src/db/seed/demo/demo-project.sql` (8228 dòng, ~770 KB) là **kết quả đã nạp**
từ hồ sơ dự án BTE — mã hạng mục, số lượng, giá trị hợp đồng. Hồ sơ gốc
(`reference_sheets/`) **không** commit vì là tài liệu khách hàng.

- Sửa dữ liệu demo trong DB rồi cập nhật lại file: `npm run demo:export`
- Muốn repo không kèm dữ liệu mẫu: xoá thư mục đó; app vẫn chạy, chỉ trống.
- Cột `upload_id` xuất thành `NULL` vì file upload không có trong repo (giữ id sẽ tạo
  nút tải file trả 404).

### 1.5 Docker

```bash
git clone <repo-url> && cd pmo_project
docker compose up --build     # http://localhost:3000 — Postgres ở 5433, tự migrate + seed
```

Image build từ `Dockerfile` (multi-stage, `node:22-slim`). Biến môi trường cho Coolify/VPS:

```bash
DATABASE_URL=postgresql://user:pass@host:5432/pmo   # hoặc DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME
JWT_SECRET=chuoi-bi-mat-32-ky-tu-tro-len            # BẮT BUỘC ở production
UPLOADS_DIR=/app/backend/uploads                    # mount volume bền vững
```

Xem mẫu đầy đủ: `.env.example`. Entrypoint tự chờ Postgres → migrate → seed rồi mới boot.

---

## 2. Đăng nhập demo

Tất cả tài khoản dùng chung mật khẩu dev: **`admin123`**.

| Email | Vai trò |
|-------|---------|
| `admin@hbg.com` | Admin — toàn quyền |
| `ceo@hbg.com` | CEO — xem portfolio, duyệt, đóng dự án |
| `pm@hbg.com` | PM — quản lý dự án được giao, duyệt shop/vật tư |
| `pmo@hbg.com` | PMO — giám sát đa dự án, master data, KPI |
| `site@hbg.com` | Site — báo cáo ngày, ảnh, vật tư, nhân lực (mobile) |
| `procurement@hbg.com` | Procurement — vật tư, hợp đồng |
| `accounting@hbg.com` | Accounting — chuỗi thanh toán |
| `technical@hbg.com` | Technical — shopdrawing và hạng mục được giao |

Tenant pilot (gói Small, để kiểm chứng đa tenant) được tạo khi cần bằng lệnh `node backend/scripts/provision-tenant.mjs --code PILOT --plan small --admin-email admin@pilot.test --project PILOT-001`. Tài khoản **`admin@pilot.test`** / **`admin123`** chỉ thấy project `PILOT-001`, không có AR, không cấu hình chain, không bulk import.

## 2b. Gói Small / Mid / Enterprise (4 trụ cột)

| Khả năng | Small | Mid | Enterprise |
|---|---|---|---|
| P1 tiến độ %, báo cáo ngày + ảnh, OTD cơ bản | ✅ | ✅ | ✅ |
| P2 shop single-step | ✅ | ✅ | ✅ + chain L1-L5 tùy biến |
| P3 vật tư + submittal | ✅ cơ bản | ✅ + SLA 7d / TVGS 3d | ✅ |
| P4 AP 4-step (hợp đồng → invoice → PR → chi) | ✅ (không AR) | ✅ + đọc AR | ✅ + AR full |
| Nén tiến độ (Enterprise) | — | — | ✅ preview → apply → rollback |
| Trợ lý AI (Enterprise) | — | — | ✅ hỏi đáp trích dẫn + đề xuất SLA |
| Thư viện BIM (Enterprise) | — | — | ✅ lưu IFC + metadata + viewer web-ifc |
| ERP round-trip (Enterprise) | — | — | ✅ xuất AP CSV + đối soát NCC + đẩy SFTP |
| Issues / directives | ✅ issues | ✅ + directives | ✅ |
| Portfolio, audit export, bulk Excel, KPI targets | — | portfolio đọc | ✅ |

Gói lưu ở `tenants.plan` (`GET /api/me/entitlements`); thiếu quyền → API trả 403.
HBG = Enterprise (đầy đủ, tương thích mọi test cũ).

## 3. Các role làm gì (súc tích)

| Role | Được làm |
|------|----------|
| **Admin** | Mọi thứ: users, departments, chain duyệt, master data |
| **CEO** | Duyệt thanh toán/PR, đóng–mở dự án, xem toàn cảnh, nhận escalate |
| **PM** | Nhập tiến độ, tạo issue/directive, duyệt shop + submittal (dự án mình), nghiệm thu ngày |
| **PMO** | Xem các dự án được giao, KPI targets, governance; không duyệt nghiệp vụ |
| **Site** | Báo cáo ngày + ảnh, cập nhật % tiến độ được giao, dùng vật tư |
| **Procurement** | Nhà cung cấp, vật tư, hợp đồng |
| **Accounting** | Invoice, payment request, thanh toán, công nợ phải thu (AR) |

Phân quyền thực thi ở server (`permissionMiddleware` + membership dự án): sai dự án → 404, sai role → 403. Mọi đổi trạng thái đều qua máy trạng thái tập trung (`lib/transitions.js`) và ghi audit log cùng transaction.

---

## 4. Tính năng

### Pipeline Excel → Dashboard (cốt lõi)
- **Upload** lẻ hoặc cả folder/zip (≤200MB, chống zip-slip, bỏ qua file khóa `~$`).
- **Classify** tự nhận 11+ loại tài liệu (tiến độ, shop, vật tư, S&P, HSTT, MPM, MSA, nhật ký…).
- **Configure → Commit**: preview theo sheet, commit upsert idempotent (chạy lại không trùng).
- **Drill-down**: click mọi con số trên dashboard → truy về dòng Excel gốc + file nguồn.

### 4 trụ cột (Control Center)
1. **Thi công** — tiến độ theo zone, OTD, baseline, quá hạn. Trạng thái suy từ `%` + ngày hoàn thành thực tế, không tin chữ trong file.
2. **Shop drawing** — pipeline DRAFT → SUBMITTED → APPROVED/REJECTED + **chain duyệt linh hoạt theo bộ phận** (VD: L1 Trưởng dự án → L2 Ban TGĐ; tối đa 5 levels, cấu hình ở `/hq/approval-chains`).
3. **Vật tư** — submittal + SLA 7 ngày, TVGS 3 ngày, tự escalate quá hạn (chống spam theo ngày).
4. **Thanh toán** — chuỗi hợp đồng → invoice → payment request → chi tiền; giữ lại retention, VAT; công nợ phải thu (AR) từ file HSTT/MPM theo đợt.

### Vận hành công trường (mobile-first, offline-tolerant)
- Báo cáo ngày: hạng mục, vật tư, nhân lực, nghiệm thu, ảnh (lưu content-addressed).
- Hàng đợi offline: xem + resolve (giữ server / apply bản offline có kiểm soát allowlist).

### Quản trị & kiểm soát
- Audit log mọi hành động (ai/lúc nào/trước–sau).
- Master data: vendors, subcontractors, teams, departments, chains…
- Migration có ledger + checksum (sai lệch schema → từ chối boot).
- Test: `npm test` chạy 4 suite CI; `npm run test:srs` chạy các suite trọng tâm; các suite E2E khác nằm trong `tests/e2e/`.

---

## 5. Cấu trúc project

```
pmo_project/
├── backend/src/
│   ├── index.js            # Express: route composition + static frontend + safe shutdown
│   ├── lib/                # auth, permissions, transitions, audit, storage và các module SRS
│   ├── routes/             # router theo domain
│   ├── services/ingest/    # các parser Excel
│   └── db/                 # pool PG duy nhất, migrate ledger, seed
├── backend/drizzle/        # migration ledger hiện tại
├── frontend/src/
│   ├── hq/                 # các màn hình nghiệp vụ (Control Center, Payment, Shop…)
│   ├── field/              # App công trường
│   ├── governance/         # Approval, Audit, Cấu hình duyệt, Master data
│   └── api/                # client (tự refresh JWT, FormData upload)
├── tests/e2e/              # các suite E2E dùng chung + cleanup-demo.mjs
├── scripts/                # công cụ vận hành: setup, nạp/xuất seed, neo lịch demo
├── docs/                   # tài liệu kỹ thuật + SRS (xem dưới)
├── Dockerfile · docker-compose.yml · docker-entrypoint.sh · .env.example
```

---

## 6. Kiểm thử

```bash
npm test                    # 4 suites CI: api, payment-sla, shop-approval, schema
npm run test:all            # + browser + schema audit
npm run test:release        # release gate (75 mục)
node scripts/run-all-e2e.mjs # TOÀN BỘ 141 bài e2e — tự bật server riêng ở :3000
node tests/e2e/cleanup-demo.mjs     # dọn rác test khỏi DB dev
```

`run-all-e2e.mjs` tự bật/tắt server, nên **dừng service đang giữ cổng 3000 trước**. Nếu đặt
`BASE_URL` thì bộ chạy không tự bật server và dùng luôn `LOGIN_RATE_MAX` của máy.

Backend dev chạy ở `:3000`, Postgres `127.0.0.1:5433`. Mỗi suite tự dọn rác nó tạo; `cleanup-demo.mjs` dọn phần còn sót.

---

## 7. Biến môi trường

| Var | Mặc định | Ghi chú |
|-----|----------|---------|
| `DATABASE_URL` | (dựng từ DB_*) | Ưu tiên cao nhất |
| `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` | `127.0.0.1/5433/pmo_user/pmo_dev_pwd/pmo` | Đổi `DB_PASSWORD` ở prod |
| `JWT_SECRET` | (dev default + warning) | **Bắt buộc** ở production |
| `ACCESS_TTL_SEC` | `86400` | TTL access token |
| `UPLOADS_DIR` | `backend/uploads` | Mount volume ở prod |
| `PG_POOL_MAX` | `10` | Pool Postgres duy nhất |
| `STORAGE_DRIVER` | `local` | `s3` để dành (chưa có SDK) |

Gặp sự cố (`EADDRINUSE`, mất kết nối PG, drift schema): xem Troubleshooting trong tài liệu kỹ thuật.

---

## 8. Tài liệu chi tiết

**[docs/PRODUCT_TECHNICAL_DOCUMENTATION.md](docs/PRODUCT_TECHNICAL_DOCUMENTATION.md)** — đặc tả kỹ thuật đầy đủ, súc tích:
kiến trúc & vòng đời request, data model (bảng và migration hiện tại), tham chiếu backend (router, lib),
frontend, auth & phân quyền, 7 workflow nghiệp vụ, triển khai, backup và API.
Sơ đồ UML (mermaid + PNG): **[docs/srs/](docs/srs/)**.
