# PMO — Hệ thống quản lý dự án thi công

> Quản lý tiến độ, shop drawing, vật tư, thanh toán và nhân lực cho các dự án xây dựng nhiều khu vực (zones). Ingest trực tiếp từ file Excel công trường → dashboard 4 trụ cột theo thời gian thực.

---

## 1. Cài đặt

### Yêu cầu
- Node.js 22+ · npm 10+
- PostgreSQL 16+ (local) **hoặc** Docker

### Cách 1 — Docker Compose (khuyên dùng)

```bash
git clone <repo-url>
cd pmo_project
docker compose up --build
# Mở http://localhost:3000 — Postgres chạy ở 5433, DB tự migrate + seed
```

### Cách 2 — Chạy native (dev)

```bash
# 1. Postgres ở 127.0.0.1:5433 (user/pass/db: pmo_user/pmo_dev_pwd/pmo)
./backend/scripts/pg-ctl.sh start        # Linux/WSL — hoặc dùng Postgres sẵn có

# 2. Cài + migrate + chạy
npm install
node backend/src/db/init.js              # migrate (có ledger) + seed demo
npm run dev                              # backend :3000 + frontend :5173 (HMR)
```

### Cách 3 — Production một cổng

```bash
npm install
npm run build                            # build frontend → frontend/dist/
npm start                                # backend phục vụ dist/ ở :3000
```

### Deploy Coolify / VPS

Image build từ `Dockerfile` (multi-stage, `node:22-slim`). Chỉ cần biến môi trường:

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

## 3. Các role làm gì (súc tích)

| Role | Được làm |
|------|----------|
| **Admin** | Mọi thứ: users, departments, chain duyệt, master data |
| **CEO** | Duyệt thanh toán/PR, đóng–mở dự án, xem toàn cảnh, nhận escalate |
| **PM** | Nhập tiến độ, tạo issue/directive, duyệt shop + submittal (dự án mình), nghiệm thu ngày |
| **PMO** | Xem mọi dự án, KPI targets, master data; không duyệt nghiệp vụ |
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
- Test: ~75 suites E2E (`tests/e2e/`), gồm `pipeline-guard` chạy full pipeline trên DB scratch — CI-safe.

---

## 5. Cấu trúc project

```
pmo_project/
├── backend/src/
│   ├── index.js            # Express: 24 routers + static frontend + shutdown an toàn
│   ├── lib/                # 18 helpers (auth JWT, transitions, approval chains,
│   │                       #   permissions, txAudit, storage, sync-apply…)
│   ├── routes/             # 26 files theo domain
│   ├── services/ingest/    # 12 parsers Excel
│   └── db/                 # pool PG duy nhất, migrate ledger, seed
├── backend/drizzle/        # 13 migrations (0000…0003, 9991…9999)
├── frontend/src/
│   ├── hq/                 # 13 màn hình HQ (ControlCenter, Payment, Shop…)
│   ├── field/              # App công trường
│   ├── governance/         # Approval, Audit, Cấu hình duyệt, Master data
│   └── api/                # client (tự refresh JWT, FormData upload)
├── tests/e2e/              # ~75 suites + lib.mjs dùng chung + cleanup-demo.mjs
├── docs/                   # tài liệu kỹ thuật + SRS (xem dưới)
├── Dockerfile · docker-compose.yml · docker-entrypoint.sh · .env.example
```

---

## 6. Kiểm thử

```bash
npm test                    # 4 suites CI: api, payment-sla, shop-approval, schema
node tests/e2e/pipeline-guard.mjs   # full pipeline trên DB scratch (không chạm dev)
node tests/e2e/demo-walkthrough.mjs # 28 checks luồng demo trên dữ liệu thật
node tests/e2e/cleanup-demo.mjs     # dọn rác test khỏi DB dev
```

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
kiến trúc & vòng đời request, data model (51 bảng), tham chiếu backend (24 routers, 18 libs),
frontend, auth & phân quyền, 7 workflow nghiệp vụ, triển khai, backup và API.
Sơ đồ UML (mermaid + PNG): **[docs/srs/](docs/srs/)**.
