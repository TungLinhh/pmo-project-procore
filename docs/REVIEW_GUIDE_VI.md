# Hướng dẫn kiểm duyệt — bản demo nội bộ trên máy này

Tài liệu này **không** kể lại đã sửa gì. Nó chỉ trả lời: **ngồi xem chỗ nào, và tự kiểm
bằng lệnh nào** để biết chỗ đó thật sự đúng.

> **Quy ước đường dẫn trong tài liệu này:** `lib/x.js` = `backend/src/lib/x.js`;
> `services/ingest/x.js` = `backend/src/services/ingest/x.js`; `install.sh` =
> `deploy/single-machine/install.sh`; `pmo.env` = `deploy/single-machine/pmo.env`.
> Chỉ khi cần mới viết đủ đường dẫn.

Bốn mức rủi ro, xếp theo hậu quả nếu sai:

| Mức | Nghĩa là gì nếu hỏng | Bao nhiêu mục |
|---|---|---|
| **P0** | Demo không lên, hoặc không ai đăng nhập được | 7 |
| **P1** | Rò dữ liệu giữa các công ty, hoặc lộ chi tiết hệ thống ra ngoài | 7 |
| **P2** | Sai nghiệp vụ hoặc sai quyền — chạy được nhưng làm sai | 6 |
| **P3** | Vận hành: sao lưu, canh gác, container, id | 6 |

Đọc theo thứ tự từ P0 xuống. Mỗi mục có **Vì sao đáng soi** và **Tự kiểm** — lệnh đó
chạy trên máy này được ngay, không cần môi trường khác.

---

## P0 — Hỏng demo ngay

### P0-0. Postgres có tự quay lại không — đo trước khi tin bất cứ điều gì khác

Đây là mắt xích đã hỏng thật. Đo 2026-09-30, sáng sau khi bản demo "đã triển khai" chạy
một đêm: `pmo-api.service` báo `active`, `/api/health` trả **200**, còn `/api/ready` trả
**503** vì Postgres đã chết từ tối hôm trước. Tệ hơn: `pg-ctl.sh start` in *"PG already
running"* rồi `pg_isready` trả *"no response"* — **lệnh khôi phục trong runbook không chạy
được**, vì nó tin `postmaster.pid` thay vì hỏi cổng.

Nay có `pmo-db.service` (systemd bật Postgres) và watchdog `--heal` (tự phục hồi). Đo lại
bằng cách giết thật:

```bash
kill -9 $(head -1 data/pgdata/postmaster.pid)
sleep 20 && curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/ready
# đo được 2026-09-30: giết 21:09:06 → 200 lúc 21:09:20. Gián đoạn 14 giây, không cần người.
```

```bash
node tests/e2e/deploy-recovery.mjs     # ALL PASS — 7 phép thử âm tính
```

Hai lỗi ở đây đáng nhớ vì chúng **không hỏng, chúng nói dối**: `pg-ctl.sh` báo thành công
khi Postgres chết, và `/api/health` trả 200 khi mọi truy vấn đều hỏng. Cùng kiểu: watchdog
bản đầu *phát hiện* rồi *đứng yên* — nhật ký đầy mà không ai sửa, tệ hơn là không có canh gác.

### P0-1. Dịch vụ có sống không, và ai giữ cổng 3000

Mọi thứ đi qua một tiến trình Node do **systemd user unit** giữ: `deploy/single-machine/pmo-api.service`.
Điểm dễ sai nhất: **cổng 3000 thuộc về dịch vụ này**. Nếu bạn bật server bằng tay mà quên
dừng dịch vụ, server tay chiếm cổng trước, dịch vụ lặp `Restart=always` với `EADDRINUSE`,
mà `/api/health` **vẫn trả 200** nên dễ tưởng dịch vụ đang chạy.

Đo được 2026-09-29: `is-active` báo `activating` vô tận, và `production-readiness` rớt từ
**8/13 xuống 5/13** vì server tay không có `NODE_ENV=production`.

**Tự kiểm**
```bash
systemctl --user is-active pmo-api.service          # phải là "active"
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/health   # 200
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/ready    # 200
```

### P0-2. Ba vai trò cơ sở dữ liệu, và vì sao phải tách

Đây là ranh giới bảo mật quan trọng nhất của cả hệ thống. Cần ba tài khoản Postgres:

| Tài khoản | Đặc tính | Dùng để làm gì | Nơi khai |
|---|---|---|---|
| `pmo_user` | thường | migrate + seed | `DATABASE_URL` |
| `pmo_app` | **không superuser, KHÔNG BYPASSRLS** | **mọi request** | `APP_DB_USER` / `APP_DB_PASSWORD` |
| `pmo_backup` | `BYPASSRLS` | `pg_dump` | `BACKUP_DATABASE_URL` |

Đo: `pmo_app` = `rolsuper f · rolbypassrls f`. Đó là điều kiện để RLS có tác dụng — một app
role là superuser thì mọi chính sách RLS bị bỏ qua mà không có dấu vết nào.

**Vì sao đáng soi:** `buildAppDatabaseUrl()` (`backend/src/db/index.js:95`) dựng URL cho
request pool. Đợt 16 từng có lỗi ở đây: `DATABASE_URL` được kiểm **trước** `APP_DB_USER`,
nên đặt `APP_DB_USER` xong pool vẫn chạy bằng owner ⇒ **mất RLS** mà không báo lỗi nào.

**Tự kiểm**
```bash
PGPASSWORD=... psql -h 127.0.0.1 -p 5433 -U pmo_user -d pmo -c \
 "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname LIKE 'pmo%'"
# pmo_app phải là  f | f
```

### P0-3. RLS thật sự bật trên mọi bảng có `tenant_id`

Đo: **32 bảng** có cột `tenant_id`, và cả 32 đều `rowsecurity = true`.

Policy dùng `app_tenant_unset() OR tenant_id = app_current_tenant()`, còn GUC được đặt qua
`applyTenantGuc()` (`backend/src/lib/tenant.js:27`) trong `requireAuth`.

**Vì sao đáng soi:** chỗ này từng hỏng theo kiểu âm thầm. `current_setting(...)` trả NULL
khi GUC **chưa từng** được SET — đúng trường hợp của cron — nên một viết sai làm job âm
thầm không ghi được gì. Migration `9999as` đã sửa hai bảng theo đúng lý do đó.

**Tự kiểm**
```bash
PGPASSWORD=... psql -h 127.0.0.1 -p 5433 -U pmo_user -d pmo -c \
 "SELECT count(*) FILTER (WHERE t.rowsecurity) AS co_rls, count(*) AS co_tenant_id
  FROM pg_tables t JOIN information_schema.columns c
    ON c.table_name=t.tablename AND c.table_schema='public' AND c.column_name='tenant_id'
  WHERE t.schemaname='public'"
# hai số phải BẰNG NHAU
```

### P0-4. Đăng nhập và vòng đời phiên

`rotateRefresh()` (`backend/src/lib/auth.js:50`) là chốt chặn dùng lại refresh token: phát
hiện token bị phát lại ⇒ đốt cả **họ token** (`family_id`) + tăng `token_version` nên mọi
phiên cũ chết ngay.

Bảo hiểm sớm: `REFRESH_REUSE_GRACE_MS` (mặc định 10s) để hai tab cùng refresh không bị
đánh nhầm là tấn công.

**Tự kiểm** — bài này chạy độc lập, không cần dịch vụ:
```bash
node tests/e2e/refresh-reuse.mjs      # kỳ vọng ALL PASS
```

### P0-5. Người dùng bị khóa đúng lúc

`requireAuth` nạp lại dòng user **mỗi request** — nên thay vai trò, thu hồi quyền, `logout-all`
có hiệu lực ngay, không cần chờ token hết hạn (24h mặc định).

**Tự kiểm:** `node tests/e2e/api.mjs` và `node tests/e2e/p2-authz-matrix.mjs`.

### P0-6. Cổng 3000 và thứ tự gắn route trong `index.js`

`backend/src/index.js` gắn route theo thứ tự **có ý nghĩa**: `/api/stream` (SSE) trước,
router `/api/me` riêng tư trước `meRouter`, `/api/projects/:id/kpi-targets` trước
`/api/projects`, các tiền tố tĩnh (`/review|/batch|/classify`) trước `/:id`; và mọi
`/api/*` lạ trả JSON 404 chứ không bao giờ trả HTML của SPA.

**Vì sao đáng soi:** gọi `/api/upload/:id/configure` mà `/:id` bị bắt trước sẽ cho kết quả
rất khó hiểu. `backend/src/index.js` có comment giải thích từng lý do — đó là thứ đáng
đọc trước khi thêm route mới.

---

## P1 — Rò dữ liệu và lộ thông tin hệ thống

### P1-1. Thân của mọi lỗi 5xx (vừa sửa, 104 chỗ)

`backend/src/lib/error-body.js:11`. Nguyên tắc: **4xx thì giữ nguyên thông điệp** (ta tự
viết, hữu ích cho người dùng); **5xx thì ở production phải che**, vì thông điệp đó đến từ
Postgres hoặc mã nội bộ và chứa tên bảng, tên cột, ràng buộc, đôi khi cả giá trị dòng.

Đo được trước khi sửa, ở `NODE_ENV=production`:
```
POST /api/master-data/suppliers  {"category":"A"×200}     (cột varchar(100))
→ 500 {"error":"value too long for type character varying(100)"}
```

Cùng một dòng còn làm **mất mã lỗi**: `lib/baseline.js` / `lib/erp-fast.js` cố ý ném
`Object.assign(new Error(…), { status: 409 })`, bọc trong `res.status(500)` là 409 thành
500 — mất đúng thông tin để client hành động.

**Tự kiểm**
```bash
node scripts/check-5xx-bodies.mjs     # phải in "104 chỗ … không nội suy .message"
```
Bộ đo này **trong release gate**. Nó bắt theo `.message` trong câu lệnh chứ không theo tên
biến, và khớp **mọi** biểu thức trạng thái có thể ra 5xx — vì bản đầu chỉ khớp
`res.status(500)` nên đã **bỏ lọt 47 chỗ**. Nếu bạn thêm route mới, đừng tin rằng
"không có `e.message` nên chắc ổn".

### P1-2. Bí mật nằm ở đâu

| File | Nội dung | Gitignore? |
|---|---|---|
| `backend/.env` | cấu hình dev + test (không có bí mật thật) | có — `.gitignore:21` |
| `deploy/single-machine/pmo.env` | **bí mật thật**: `JWT_SECRET`, `DATA_ENC_KEY`, mật khẩu DB | có — `.gitignore:85`, quyền 600 |
| `.env.example` | hình dạng biến, không có giá trị | nằm trong repo (đúng) |

`.dockerignore` loại `.env`, `**/.env`, `**/.env.*`, `*.pem`, `*.key`, `*.p12`,
`credentials.json`, `secrets.json` — và có chú thích giải thích *tại sao* cần mẫu `**/`:
mẫu `.env` trần **không** phủ file lồng nhau, mà `COPY backend/ ./backend/` sẽ lấy
`backend/.env` vào image.

**Tự kiểm**
```bash
git check-ignore -v .env backend/.env deploy/single-machine/pmo.env
node tests/e2e/p4-docker.mjs | grep gitignore     # kỳ vọng PASS cho cả ba
```

### P1-3. `DATA_ENC_KEY` — đổi là mất dữ liệu mã hoá

`lib/crypto.js` mã hoá AES-256-GCM cho `users.mfa_secret`, `users.zalo_user_id`,
`workers.phone`, `vendors.contact`. Cột `vendors.tax_id` **cố ý** để plaintext.

**Vì sao đáng soi:** `install.sh` chỉ sinh `pmo.env` khi file **chưa có**, và nói rõ lý do
— đổi `DATA_ENC_KEY` làm các cột đó **đọc không được**. Tức chạy lại `install.sh` là an toàn,
sửa tay `pmo.env` thì không.

**Tự kiểm:** `curl -s localhost:3000/api/admin/security-status` (cần token admin).

### P1-4. Phân trang

`lib/pagination.js:33` — `readPage()`. Mọi route phải dùng nó. Bẫy đã gặp:
`Math.min(parseInt(limit) || 25, 200)` **không kẹp dưới** ⇒ `?limit=-1` thành `LIMIT -1`
⇒ Postgres lỗi ⇒ 500.

**Tự kiểm**
```bash
node scripts/check-paged-endpoints.mjs     # thử 8 giá trị rác trên 13 endpoint, trong gate
```

### P1-5. Chuyển trạng thái

Mọi đổi trạng thái đi qua `checkTransition()` (`lib/transitions.js:37`) — chuyển lệ luật
trả **422**, kèm `withAudit` ghi nghiệp vụ + `audit_log` trong **một** transaction.

**Vì sao đáng soi:** nơi nào ghi vào `audit_log` riêng (ngoài `withAudit`) là nơi dễ mất tính
nguyên tử — nghiệp vụ thành công thì audit không có.

### P1-6. File tải lên

`lib/storage.js:96` — `STORAGE_DRIVER=local` (mặc định) hoặc `s3`. Nội dung được đánh địa
chứa `sha256.ext`. `s3Bucket()` **ném lỗi** nếu thiếu `S3_BUCKET` thay vì đoán.

**Điểm còn đỏ:** `UPLOADS_DIR` chưa nằm trên filesystem riêng (mục `uploads_volume`) —
xem P3-5.

### P1-7. Hạn mức nhà cung cấp AI

`lib/ai/providers.js:273` đọc `AI_MONTHLY_CAP_USD`. Nguyên tắc: **lỗi hạn mức phải là
`BLOCKED`, không bao giờ là `PASS` phát hành** — nếu không thì một lần AI hết tiền sẽ biến
thành "release đạt".

**Tự kiểm:** `node tests/e2e/demo-real-ai.mjs` (ALL PASS, $0 vì model free-tier) và
`node tests/e2e/ai-srs-evaluation.mjs` (8/8 câu hỏi). Cả hai cần `OPENROUTER_API_KEY`.

---

## P2 — Quyền và nghiệp vụ

### P2-1. Ma trận quyền là chuẩn, nhưng chưa phủ hết

`lib/permissions.js:19` — `PERMISSION_MATRIX`, 16 module × 3 hành động × 4 phạm vi.
`canAccess()` là nơi quyết định; phạm vi tính cả `project_members` chứ không chỉ `pm_user_id`.

**Điểm cần biết:** `requireRole()` **không** gọi `canAccess()` — nó chỉ kiểm đúng tập role
rồi `next()`. Nên route nào chỉ chốt bằng `requireRole` là nằm ngoài ma trận.
`node scripts/list-unmatrixed-writes.mjs` cho ra: **117 route ghi** không qua ma trận, trong
đó 28 mở cho `ceo`, trong khi ma trận chỉ cho CEO ghi ở `directive` / `approval` / `control`.

**Đây là mục 16 trong `docs/DATA_DECISIONS_REQUIRED.md`, chưa có ai ký.** Ba phương án A/B/C
đã ghi sẵn kèm đánh đổi.

### P2-2. Hai chỗ còn mâu thuẫn về quyền CEO

| Mục | Vấn đề |
|---|---|
| 15 | `lib/permissions.js` nói CEO không ghi lịch; `routes/schedule-links.js:59,113,141` lại mở cho `ceo`. Đo: CEO tạo được link (HTTP 400, tức qua được lớp quyền) |
| 16 | Ma trận chỉ phủ 16/25 module; `bim`/`ai`/`erp`/`jobs`/`holidays` chỉ có `requireRole` |

Cả hai **cố ý để nguyên** vì là quyết định nghiệp vụ, không phải lỗi kỹ thuật.

### P2-3. Nạp dữ liệu Excel

Wizard: `configure → preview → commit`. `commit` là **upsert idempotent**, chạy lại không
nhân bản.

Có ba bẫy đã sửa và rất dễ tái phát:
- `undefined` trong SQL là NULL — và phải **giống nhau** ở cả `withClientTx` lẫn pool, nếu
  không thì cùng một câu chạy được ngoài transaction mà hỏng bên trong.
- Bắt lỗi từng dòng trong transaction là **vô dụng** — một dòng hỏng thì Postgres hỏng cả
  transaction. Phải `db.savepoint()`.
- `detectDocType` phải đổi cả `_` lẫn `-` thành khoảng trắng, và `đ`→`d`. Đo: trước đó
  `tien-do.xlsx`, `ban-ve-shop.xlsx`, `vat-tu-thang9.xlsx` đều ra `unknown`.

**Tự kiểm**
```bash
node tests/e2e/step1-01-shop-golden.mjs     # tự dựng workbook
node tests/e2e/step1-02-schedule-golden.mjs
node tests/e2e/step1-03-crosscheck.mjs      # dữ liệu THẬT trong reference_sheets/
node tests/e2e/step1-04-msa-golden.mjs      # dữ liệu THẬT
node tests/e2e/detect-doc-type.mjs          # 20 tên thực tế + 8 tên dự án demo
```

### P2-4. `id` không được cấp lại (ảnh hưởng truy vết kiểm toán)

`audit_log` **cố ý không có** khoá ngoại tới bảng nghiệp vụ, vì audit phải sống sót cùng
resource. Nhưng hệ quả: dòng bị xoá thì `resource_id` trong audit vẫn trỏ tới id đó. Nếu
sequence bị cuộn lùi, `nextval` cấp lại đúng id ấy ⇒ *"chuyện gì đã xảy ra với hợp đồng
358"* không còn trả lời được.

Đo 2026-09-29: `init.js` từng làm sequence rơi từ **67 về 28**. Nay `init.js`
(`backend/src/db/init.js:317`) chỉ **đẩy** lên, và lấy mốc cao nhất từ cả ba nguồn:
`last_value`, `MAX(id)`, và `MAX(audit_log.resource_id)`.

**Tự kiểm**
```bash
node scripts/check-id-reuse.mjs      # phải in "✓ … bảng: không sequence nào sắp cấp lại id"
```
Chạy lại sau **mỗi** lần dọn dữ liệu lớn — mốc chỉ đúng tại lúc nó được đo.
`install.sh` đã chạy sẵn bước này trước khi bật dịch vụ.

### P2-5. Chuyển tiếp revision của material submittal

Chuỗi là **tuyến tính** (`revision = parent.revision + 1`), nên một bản gối chỉ có một bản
sửa ⇒ phải khoá `FOR UPDATE` rồi trả **409**, không phải cấp số kế tiếp. Index unique
`material_submittals_parent_revision_uq` là lưới an toàn cuối.

**Tự kiểm:** `node tests/e2e/concurrency.mjs` — 6 request song song, kỳ vọng đúng một bản
sửa và 5 lần 409.

### P2-6. Tiền không được đoán bằng 0

`sp_ap.js` giữ `null` cho số tiền chưa biết, để **chưa trả ≠ đã trả nhầm**. Chuỗi
hợp đồng → hóa đơn → payment request → payment được kiểm bằng `JOIN` chứ không bằng đếm.

**Tự kiểm:** `node tests/e2e/p5-money.mjs`, `node tests/e2e/payment-sla.mjs`.

---

## P3 — Vận hành

### P3-1. Sao lưu

`POST /api/admin/backups/run` cần `BACKUP_DATABASE_URL` trỏ tới role `BYPASSRLS`. Không có
thì trả **503** — đúng thiết kế, vì RLS sẽ chặn `pg_dump`.

Đo: dump **20.261.634 byte / 1.097 TOC entry**, `pg_restore -l` đọc được. Giữ
`BACKUP_KEEP_COUNT=7` bản.

Cấp quyền: `bash deploy/production/00-backup-role.sh` (cần superuser). Trên máy này
superuser local là `psql -h /tmp -p 5433 -U vutun`.

### P3-2. Canh gác Postgres

`pmo-watchdog.timer` gọi **`/api/ready`**, không phải `/api/health`. Lý do: `health` là
liveness-only và **không chạm DB**, nên vẫn trả 200 khi Postgres đã chết.

Điều này không phải lý thuyết: Postgres bị kill lúc 07:55 UTC, phát hiện lúc 19:38 ⇒ demo
hỏng **im lặng** gần 12 giờ.

**Tự kiểm:** `systemctl --user list-timers | grep pmo-watchdog` — phải có mốc chạy kế tiếp.

### P3-3. Bốn bài "Docker" không cần Docker

Điều này gây hiểu lầm vì tên bài. Cả bốn đều kiểm **tĩnh**, và chính chúng đã ghi ở dòng
đầu:
- `p0-08-docker-context` — COPY source trong build context, lockfile hợp lệ
- `p2-01-docker-build` — cấu trúc multi-stage, mọi `COPY` resolve được, `npm ci` có
  lockfile, mọi lệnh ngoài mà entrypoint dùng đều được cài trong image
- `p4-docker` — entrypoint, compose, `.dockerignore`, `buildDatabaseUrl`/`buildAppDatabaseUrl`
- `p4-docker-verify` — cần **ứng dụng** ở :3000 + Postgres, không cần container (27/27)

**Tự kiểm**
```bash
node tests/e2e/p2-01-docker-build.mjs
node tests/e2e/p4-docker.mjs
# p4-docker-verify cần server sống:
node tests/e2e/p4-docker-verify.mjs
```

Hai điều đáng biết trong `Dockerfile`:
- `HEALTHCHECK` dùng `node -e`, **không** dùng `wget`/`curl` — vì `node:22-slim` không cài
  chúng. `p4-docker-verify` **chạy thật** lệnh đó, kiểm cả hai chiều (cổng mở ⇒ 0, cổng
  đóng ⇒ khác 0).
- `ENTRYPOINT` chạy `tini` rồi `docker-entrypoint.sh`, và `USER node` — không chạy root.
  Entrypoint chờ Postgres bằng `psql`, nên `postgresql-client` **phải** nằm trong
  `apt-get install`; thiếu thì container không bao giờ khởi động. `p2-01` kiểm điều này.

### P3-4. Bản demo này cố ý giữ `admin123`

`lib/mfa.js:59` — ở chế độ production, `admin123` bị chặn trừ khi `ALLOW_DEV_PASSWORD=1`.
Bản triển khai bật cờ đó **có chủ đích** để người trình diễn vào được ngay. Hậu quả là hai
mục readiness đỏ (`dev_password`, `shared_password_users`).

Mở khoá ngay lúc nào thật sự cần: `node deploy/single-machine/enable-mfa.mjs` sẽ bật MFA cho
admin + CEO và in secret TOTP ra `logs/mfa-secrets.txt` (quyền 600) để nhập vào ứng dụng
xác thực, rồi **xoá file**.

**Đo được trước khi làm:** bật MFA ⇒ `POST /api/auth/login` trả `401 MFA_REQUIRED` ⇒ cả
demo lẫn 133 bài e2e đều không đăng nhập được. Đó là lý do tôi tắt lại.

### P3-5. Còn đỏ vì giới hạn máy, không phải lỗi

`GET /api/admin/production-readiness` hiện **8/13 đạt**. Bốn mục đỏ:

| Mục | Vì sao |
|---|---|
| `dev_password` | cố ý bật `ALLOW_DEV_PASSWORD=1` (xem P3-4) |
| `shared_password_users` | 8/8 tài khoản dùng `admin123` |
| `strong_auth` | hệ quả của P3-4 |
| `uploads_volume` | **giới hạn máy**: cả máy chỉ có một filesystem (`/dev/sdd` ext4), tách `UPLOADS_DIR` cần `mount` ⇒ cần `sudo`, mà `sudo -n` thất bại |

Lệnh cho `uploads_volume` nằm sẵn trong `deploy/single-machine/README.md` mục "Còn phải làm
bằng tay".

`PRODUCTION_ENFORCE_READINESS` để **0**: bật lên thì backend **từ chối boot** khi còn mục
readiness mức fail, tức dịch vụ không dậy nổi. Nó chỉ nên bật sau khi đóng ba mục kia.

---

## Còn thiếu gì để nói là "xong hẳn"

| Việc | Cần gì |
|---|---|
| `step1-05`, `step1-06` | **sổ S&P của khách hàng** — file có bảng kê vật tư *và* cột thanh toán **có số thật**. Đo: cả 14 file `Vật tư *.xlsx` trên máy đều có cột nhưng ô rỗng ⇒ `sp_ap.parse` ra `batches: 0`. Bỏ file vào `SP_FILE` là chạy ngay |
| Container thật | Máy này không có Docker. Muốn thì phải cài runtime + `docker build`/`compose up`; hiện 4 bài "Docker" chỉ phủ phần tĩnh |
| Tách `UPLOADS_DIR` | Một lệnh `sudo` (xem P3-5). Đây là **mục readiness đỏ duy nhất còn do giới hạn máy**; 3 mục kia cố ý giữ cho demo |
| **435 file chưa commit** | Không phải kỹ thuật, nhưng là rủi ro lớn nhất còn lại: toàn bộ 9 đợt sửa nằm trong working tree, một `git checkout` là mất hết. Cần chốt ít nhất một checkpoint |
| 16 mục quyết định | `docs/DATA_DECISIONS_REQUIRED.md`. Ưu tiên **mục 13** — lịch dự án demo nằm ở 2019-2020 trong khi "hôm nay" là 2026, nên `schedule-compress` và `deadline-replan` **luôn không khả thi** ⇒ chặn UAT nếu UAT cần demo nén lịch |

---

## Tự kiểm toàn bộ

```bash
# 1) Dịch vụ
systemctl --user is-active pmo-api.service
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/ready

# 2) Cổng phải do dịch vụ giữ
systemctl --user stop pmo-api.service      # rồi mới chạy bộ kiểm thử
env -u DATABASE_URL -u BASE_URL node scripts/run-all-e2e.mjs
systemctl --user start pmo-api.service

# 3) Cổng phát hành
LOGIN_RATE_MAX=1000 node scripts/release-gate.mjs
```

**Đừng** `export DATABASE_URL` khi chạy bộ kiểm: biến đó làm `db/index.js` bỏ qua
`backend/.env`, mất `APP_DB_USER`, và pool request chạy bằng owner ⇒ **mất RLS**.

Bộ kiểm thử tự bật server dùng chung ở `:3000` với `LOGIN_RATE_MAX=1000` và tự xoá
`DATABASE_URL` khỏi môi trường server, nên chạy nó **không** cần thao tác thủ công gì thêm.
