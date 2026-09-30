# Triển khai nội bộ — không dùng Docker

> **Quyết định (2026-09-26):** triển khai trên **một máy nội bộ**, chạy trực tiếp bằng
> Node + PostgreSQL, **không dùng Docker**. Phạm vi **demo nội bộ**. Chưa triển khai, và
> **không vội**.
>
> Tài liệu này mô tả đường đi đã được kiểm chứng để sẵn sàng khi bạn quyết triển khai.
> Nó **không** thay thế `DOCKER.md` cho trường hợp sau này chuyển sang container.

## Vì sao có tài liệu này

`DOCKER.md` và `.env.example` đều viết cho container. Đường đã chọn thì không có tài
liệu nào — mà đây chính là đường sẽ dùng.

## Yêu cầu

| Thành phần | Yêu cầu | Ghi chú |
|---|---|---|
| Node | 22 trở lên | máy hiện tại v26.7.0, đã chạy thật |
| PostgreSQL | 16 + extension `vector` | máy hiện tại 16.15, vector 0.8.6 |
| `psql` | trong `PATH` | `backend/scripts/pg-ctl.sh` có `PGBIN=` để ghi đè |
| RAM | đủ cho Node build + Postgres | build Vite là bước nặng nhất |

Cài pgvector: `CREATE EXTENSION vector;` cần superuser.

## Các bước

### 1. PostgreSQL

Dùng PostgreSQL sẵn có, hoặc PostgreSQL cục bộ của repo:

```bash
./backend/scripts/pg-ctl.sh start     # port 5433, dữ liệu ở data/pgdata
```

Cần tạo cơ sở dữ liệu và extension:

```bash
createdb -h 127.0.0.1 -p 5433 pmo
psql -h 127.0.0.1 -p 5433 -d pmo -c 'CREATE EXTENSION vector;'
```

### 2. Biến môi trường

```bash
cp .env.example .env      # .env đã nằm trong .gitignore
```

Đặt tối thiểu những biến sau (xem mục "Biến bắt buộc" bên dưới):

```bash
DATABASE_URL='postgres://pmo_user:<mật-khẩu>@127.0.0.1:5433/pmo'
NODE_ENV=production
JWT_SECRET="$(openssl rand -hex 32)"
DATA_ENC_KEY="$(openssl rand -hex 32)"
UPLOADS_DIR=/var/lib/pmo/uploads      # volume riêng, xem mục dưới
BACKUP_DIR=/var/lib/pmo/backups
```

Sinh khoá bằng lệnh trên thay vì dùng lại giá trị ví dụ trong `.env.example`.

### 3. Cài phụ thuộc và build

```bash
npm install
npm run build --workspace=frontend      # sinh frontend/dist
```

Không có bước `npm ci --omit=dev` như container: chạy trực tiếp thì giữ dev dependency
được, đổi lại bạn có `node --check` và oxlint ngay trên máy.

### 4. Nạp migration + seed

```bash
node backend/src/db/init.js
```

Idempotent — chạy lại nhiều lần được. In ra số migration đã chạy và số đã có sẵn.

### 5. Chạy

```bash
node backend/src/index.js
```

Một tiến trình phục vụ cả API và `frontend/dist` — không cần reverse proxy riêng cho SPA.

Chạy nền:

```bash
nohup node backend/src/index.js > /var/log/pmo/app.log 2>&1 &
```

Hoặc bằng systemd:

```ini
[Unit]
Description=O-NEXUS PMO
After=network.target postgresql.service

[Service]
WorkingDirectory=/srv/pmo
EnvironmentFile=/srv/pmo/.env
ExecStart=/usr/bin/node backend/src/index.js
Restart=always
# Không chạy bằng root
User=pmo

[Install]
WantedBy=multi-user.target
```

### 6. Kiểm tra

```bash
curl -fsS http://127.0.0.1:3000/api/health   # sống
curl -fsS http://127.0.0.1:3000/api/ready    # sẵn sàng nhận việc
```

`/api/health` **không** chạm cơ sở dữ liệu (liveness). `/api/ready` **có** truy vấn thật
và trả 503 khi DB chết — đây mới là endpoint dùng cho cảnh báo.

Sau đó mở trình duyệt và đăng nhập bằng tài khoản demo.

## Theo dõi cơ sở dữ liệu — phần dễ bỏ sót nhất

Container có compose healthcheck gọi `/api/ready` mỗi 30 giây. **Chạy trực tiếp
thì không có gì gọi cả.** Đã xảy ra hậu quả thật trên chính máy này: PostgreSQL bị
kill lúc 07:55 UTC, phát hiện lúc 19:38 — demo hỏng im lặng gần 12 giờ, trong khi
`/api/health` vẫn trả 200 suốt (đúng thiết kế: liveness không chạm DB).

Dùng script có sẵn:

```bash
node scripts/db-watchdog.mjs                # kiểm một lần, exit 1 nếu chưa sẵn sàng
node scripts/db-watchdog.mjs --watch 30     # lặp 30 giây, chỉ in khi trạng thái đổi
```

Lặp bằng systemd timer:

```ini
# /etc/systemd/system/pmo-dbcheck.service
[Unit]
Description=PMO DB readiness probe

[Service]
Type=oneshot
WorkingDirectory=/srv/pmo
EnvironmentFile=/srv/pmo/.env
ExecStart=/usr/bin/node scripts/db-watchdog.mjs
```

```ini
# /etc/systemd/system/pmo-dbcheck.timer
[Unit]
Description=Canh DB PMO mỗi 5 phút

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

```bash
systemctl enable --now pmo-dbcheck.timer
```

Muốn cảnh báo thì gắn `OnFailure=` vào một unit gửi thông báo. Chỉ cần biết cơ sở
dữ liệu đã chết cũng đủ để khởi động lại trước khi ai hỏi "sao hôm nay không vào
được".

## Biến bắt buộc ở chế độ production

Nếu thiếu, server **từ chối khởi động** khi bật `PRODUCTION_ENFORCE_READINESS=1`:

| Biến | Vì sao |
|---|---|
| `JWT_SECRET` | không có thì mọi phiên đăng nhập dùng chung khoá mặc định |
| `DATA_ENC_KEY` | dữ liệu mã hoá (MST, SĐT, khoá MFA) không giải được nếu thiếu |
| `DATABASE_URL` hoặc `DB_*` | không đoán được cơ sở dữ liệu |
| `ADMIN_INITIAL_PASSWORD` | lần khởi động đầu, ≥12 ký tự |

## Đo tải — đã đo trên máy này, và giới hạn của phép đo

```bash
node scripts/load-probe.mjs                                    # 30 request, 5 song song
REQUESTS=120 CONCURRENCY=10 node scripts/load-probe.mjs      # nặng hơn
```

Kết quả đo được ngày 2026-09-27 trên chính máy này (Postgres 16.15 cục bộ, dữ liệu
demo, 1 tiến trình Node):

| Endpoint | Số request | Trung bình |
|---|---|---|
| `/api/ready` | 20 | 10 ms |
| `/api/audit?limit=25` | 20 | 57 ms |
| `/api/projects/1/issues?limit=25` | 20 | 51 ms |
| `/api/projects/1/construction-schedule?limit=200` | 20 | 60 ms |
| `/api/projects/1/shop-drawings?limit=25` | 20 | 57 ms |
| `/api/dashboard/portfolio-kpi` | 20 | 82 ms |

120 request, 10 đồng thời: **p50 51 ms · p95 93 ms · max 187 ms · 0 lỗi**.

**Đường ghi** (`POST /api/sync/enqueue` — đúng đường mỗi lần công nhân lưu việc ngoài
tuyến, và nó có `withAudit` nên đo được cả chi phí ghi nhật ký chứ không chỉ INSERT):

| Số lần ghi | p50 | p95 | max | Lỗi |
|---|---|---|---|---|
| 30 | 92 ms | 115 ms | 118 ms | 0/30 |
| 100 | 56 ms | 105 ms | 113 ms | 0/100 |

Không suy giảm theo lượng ở mức này. Probe **tự dọn** đúng số dòng nó tạo (theo tiền
tố `client_id`), và kiểm tra lại không còn dòng nào sót — nếu còn thì exit 1.

⚠️ Probe phải chạy bằng **admin**. Chạy bằng `ceo` thì `403`, mà 403 trả về rất nhanh
nên ra số thời gian đẹp mà thực tế chẳng ghi gì — đo sai mà không báo lỗi. Đây là bẫy
đã mắc một lần trong lúc làm.

**Giới hạn phải nói rõ, không được bỏ:**

- Đây là máy dev, một tiến trình Node, dữ liệu demo. Số này **không** nói được
  gì về máy chủ thật. Không dùng làm cam kết hiệu năng.
- Chưa đo khi nhiều người dùng thật cùng ghi. Các đường ghi (duyệt, chi payment,
  nạp Excel) chưa từng được đo tải.
- Chưa đo thời gian dài, nên chưa biết trí nhớ có rò không.

Nếu lên máy thật, chạy lại script này trên chính máy đó và lưu lại kết quả cùng
số phiên bản. Đo lại là việc làm được, không phải việc phải tin.

## Bốn việc vẫn cần làm dù là demo nội bộ

Đây là những mục không phải quyết định kinh doanh, chỉ là cấu hình:

1. **Không dùng `ALLOW_DEV_PASSWORD=1`.** Cờ này cho phép mật khẩu demo `admin123`. Đặt
   `ADMIN_INITIAL_PASSWORD` rồi xoá sau lần đăng nhập đầu tiên.
2. **Role DB riêng cho app.** Để trống `APP_DB_*` thì app dùng owner, và owner
   `BYPASSRLS` — tức mọi phân quyền theo tenant bị vô hiệu. Đây là điều kiện an toàn,
   không phải tối ưu hiệu năng.
3. **Role sao lưu riêng** (`deploy/production/00-backup-role.sh`) + `BACKUP_DATABASE_URL`.
   Không có thì sao lưu sẽ hỏng vì RLS chặn owner.
4. **`UPLOADS_DIR` là thư mục riêng**, không nằm chung filesystem với cây ứng dụng —
   để sao lưu hoặc cập nhật mã không xóa nhầm file người dùng.

Kiểm tra cả bốn sau khi lên: `GET /api/admin/production-readiness` (quản trị hoặc CEO).

## Chấp nhận được ở mức demo nội bộ

Bốn mục sau **cố ý chưa làm** vì phạm vi là demo nội bộ — đã chốt, không phải quên:

| Mục | Vì sao chấp nhận được | Khi nào phải làm |
|---|---|---|
| 8/8 tài khoản dùng chung `admin123` | không có dữ liệu thật, chỉ người trong nội bộ | trước khi có người ngoài |
| 2 tài khoản `must_change_password` | sẽ tự bắt đổi ở lần đăng nhập đầu | khi phát tài khoản thật |
| 6 tài khoản chưa bật MFA | không có dữ liệu nhạy cảm | trước khi có dữ liệu thật |
| `getProductionReadiness()` = `ready: false` | đúng như thiết kế ở mức demo | khi chuẩn bị ra ngoài |

`docs/RELEASE_GATE.md` ghi điều kiện theo từng mục. Danh sách này **không tự đóng** —
khi quyết định đảo ngược, sửa bảng đó, đừng sửa mã readiness.

## Chưa được kiểm chứng

Nêu thẳng để không ai hiểu nhầm là đã xong:

- **Chưa chạy qua TLS.** Hiện nghe trên HTTP. Nếu chỉ trong mạng nội bộ thì chấp nhận
  được; nếu cần truy cập từ ngoài thì phải đặt reverse proxy và đặt `TRUST_PROXY` đúng
  bằng số hop.
- **Chưa diễn tập khôi phục sao lưu.** `pg_dump` thành công **không** phải bằng chứng
  khôi phục được. Phải thử `pg_restore` vào một cơ sở dữ liệu tạm.
- **Chưa build image container** — máy này không có Docker. `DOCKER.md` mới chỉ được
  kiểm bằng tĩnh.
- **Đo tải mới ở mức một tiến trình, một người.** Xem mục "Đo tải" ngay trên: đã đo
  cả đọc lẫn ghi trên máy này, nhưng **chưa** đo nhiều người dùng thật cùng lúc,
  **chưa** đo thời gian dài nên chưa biết có rò bộ nhớ hay không, và **chưa** đo các
  đường ghi nặng (duyệt chuỗi nhiều cấp, chi payment, commit upload). Số đo trên máy
  dev không chuyển được sang máy thật.

## Điều kiện nghiệm thu

`docs/DATA_DECISIONS_REQUIRED.md` còn 9 mục chờ ký, biên bản UAT `SIGNED: false`.

**Demo nội bộ thì không cần.** Cả hai chỉ chặn khi có dữ liệu thật hoặc người ngoài —
vì 9 mục đó gồm quy tắc quyết định dữ liệu được ghi thế nào.
