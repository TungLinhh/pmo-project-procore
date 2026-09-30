# Triển khai MỘT MÁY — demo nội bộ tạm thời

Bản này **không dùng Docker**. Chạy trực tiếp Node trên chính máy này, phục vụ demo
nội bộ. Mọi thứ nằm trong `deploy/single-machine/`.

> Không phải bản production. Xem mục [Sai lệch đã chấp nhận](#sai-lệch-đã-chấp-nhận) —
> có 3 mục readiness mức `fail` cố ý để mở, và **1 mục phải làm bằng `sudo`**.

## Cài đặt

```bash
bash deploy/single-machine/install.sh
```

Script: sinh bí mật (nếu chưa có) → dựng `frontend/dist` → đăng ký systemd **user** unit →
bật timer canh gác → khởi động dịch vụ → báo kết quả kiểm tra.

Chạy lại script **không** làm mất phiên đăng nhập và **không** phá dữ liệu mã hoá: file
`pmo.env` chỉ được sinh khi chưa tồn tại. (Đổi `DATA_ENC_KEY` làm `users.mfa_secret`,
`workers.phone`, `vendors.contact` **đọc không được**.)

## Vận hành

```bash
systemctl --user status  pmo-api.service          # trạng thái
systemctl --user restart pmo-api.service          # khởi động lại
systemctl --user stop    pmo-api.service
tail -f deploy/single-machine/logs/api.log       # log
systemctl --user list-timers pmo-watchdog.timer   # canh gác DB
```

Địa chỉ: `http://127.0.0.1:3000` (API **và** giao diện — backend phục vụ `frontend/dist`).

Tài khoản demo: xem `docs/USER_GUIDE_VI.md`. Mật khẩu `admin123` — cần bật
`ALLOW_DEV_PASSWORD=1` (xem sai lệch #1).

## Vì sao systemd *user* unit chứ không phải system unit

Máy này không cấp quyền `sudo` không mật khẩu cho tiến trình agent, nên không tạo được
system unit. User unit chạy được ngay. Đổi lại nó chỉ sống trong phiên đăng nhập; muốn nó
tự lên sau khi reboot thì cần **một lần**:

```bash
sudo loginctl enable-linger vutun
```

## Vì sao env nằm ở `pmo.env` chứ không phải `backend/.env`

`backend/src/db/index.js:49` cố ý **không** nạp `backend/.env` khi `NODE_ENV=production`:

> Never do this in production: an image that shipped a baked `backend/.env` would silently
> connect to a developer's database when the real DB env is missing.

Nên production phải cấp env tường minh qua `EnvironmentFile` (systemd), còn
`backend/.env` giữ nguyên làm cấu hình **dev + test** — 126 bài e2e dựa vào nó.

`pmo.env` có quyền 600 và nằm trong `.gitignore`.

## Ba lớp vai trò cơ sở dữ liệu

| Biến | Vai | Cần cho |
|---|---|---|
| `DATABASE_URL` | **owner** (`pmo_user`) | migrate/seed. **Không** dùng trong route |
| `APP_DB_USER` / `APP_DB_PASSWORD` | **app role** (`pmo_app`) | request pool. Không superuser — superuser bypass RLS |
| `BACKUP_DATABASE_URL` | **role sao lưu** (`pmo_backup`) | `pg_dump`. `BYPASSRLS` + `SELECT` trên bảng & sequence |

Cấp quyền cho `pmo_backup`: `bash deploy/production/00-backup-role.sh` (cần superuser).
Đã chạy trên máy này, dump thử ra **20.261.634 byte / 1.097 TOC entry**, `pg_restore -l`
đọc được.

## Sai lệch đã chấp nhận (phạm vi demo)

Đo 2026-09-28 sau khi cài: `GET /api/admin/production-readiness` → **8/13 đạt**.

| # | Mục đỏ | Vì sao chấp nhận | Cách đóng |
|---|---|---|---|
| 1 | `dev_password` | `ALLOW_DEV_PASSWORD=1` để người trình diễn đăng nhập bằng `admin123` mà không cần đổi mật khẩu 8 tài khoản | Bỏ cờ, rồi đặt mật khẩu riêng cho từng tài khoản |
| 2 | `shared_password_users` | 8/8 tài khoản dùng `admin123`. Đổi thì tài liệu demo và bộ e2e (126 bài đăng nhập `admin123`) phải sửa theo | Như trên |
| 3 | `strong_auth` | admin/CEO **chưa** bật MFA. Đã thử bật và **đo được** hậu quả: `POST /api/auth/login` trả `401 MFA_REQUIRED`, tức cả demo lẫn 126 bài e2e đều không đăng nhập được. Chấp nhận demo hơn là đỏ hàng loạt | `node deploy/single-machine/enable-mfa.mjs` — script in secret TOTP ra `logs/mfa-secrets.txt` (quyền 600) để nhập vào ứng dụng xác thực, rồi **xoá file** |
| 4 | `mfa_others` (warn) | 6 tài khoản vận hành chưa bật MFA. Cùng lý do với #3 | Như #3, thêm email vào `MFA_ACCOUNTS` |
| 5 | `uploads_volume` | **Không phải chọn lựa — là giới hạn máy.** Cả máy chỉ có một filesystem (`/dev/sdd` ext4); tách `UPLOADS_DIR` cần mount ⇒ cần `sudo` | Xem bên dưới |

Vì sao `PRODUCTION_ENFORCE_READINESS=0`: cờ đó làm backend **từ chối boot** khi còn mục
readiness mức `fail`. Bật lên bây giờ thì dịch vụ không dậy nổi. Nó chỉ nên bật **sau khi**
đóng #1–#3, tức khi checklist trở thành rào chắn thật chứ không phải trang trí.

## Lịch demo là TƯƠNG ĐỐI với ngày chạy

Dữ liệu demo lấy từ hồ sơ BTE thật, nên lịch gốc nằm ở 2019-03 → 2020-02. Để demo nhìn
như công trình **đang chạy**, `scripts/rebase-demo-dates.mjs` dời **một hằng số** mọi cột
ngày gắn dự án (23 bảng, 66 207 dòng). Dời hằng số nên **mọi khoảng cách giữ nguyên** —
một khoản phải trả sau 30 ngày vẫn là 30 ngày — chỉ có vị trí tuyệt đối thay đổi.

Offset được **ghim** trong bảng `demo_date_rebase`, nên chạy lại không trôi ngày. Đo được:
`BTE-WP4-HBC` 2019-03-13 → 2020-02-20 trở thành 2026-01-19 → 2026-12-29; thời lượng trung
bình giữ nguyên 22,2 ngày.

```bash
node scripts/rebase-demo-dates.mjs --dry-run       # xem kế hoạch, không ghi
node scripts/rebase-demo-dates.mjs --fix-inverted  # chuẩn hoá khoảng bị đảo (end < start)
node scripts/rebase-demo-dates.mjs --reset         # hoàn tác về lịch gốc
TAIL_DAYS=180 node scripts/rebase-demo-dates.mjs   # muốn dự án kéo dài hơn (mặc định 90)
```

Hai điều **không** dời, có chủ đích:

- **Ô đang ở hiện tại.** `attention_digest_runs.digest_date` (lịch sử cron) và
  `projects.end_date` của BTE đã là 2026/2027. Dời 2504 ngày là chúng thành 2033 ⇒ cron
  tưởng hôm nay chưa chạy digest. Công cụ chỉ dời ô còn nằm trong quá khứ.
- **Cột thời gian hệ thống** (`created_at`, `updated_at`, `sent_at`) — là dấu vết thao tác,
  dời chúng làm sai nhật ký kiểm toán.

Sau khi đổi lịch, `schedule-compress` **vẫn cần** mục tiêu xa: `mapToCalendar` dàn hạng mục
chưa làm ra từ `todayStr()`, nên `calendar_end` luôn là hôm nay + đường găng còn lại. Vì vậy
mọi response không khả thi đều kèm `earliest_feasible_target` — ngày đích nhỏ nhất dùng
được, tìm bằng quét bước rồi nhị phân (đo 2026-09-30: gợi ý 2027-07-24, dùng vào thật sự
khả thi).

## Còn phải làm bằng tay (cần `sudo`)

**`UPLOADS_DIR` trên filesystem riêng** — mục `uploads_volume` đỏ vì lý do thật: khi thay
image hoặc đổi cây ứng dụng, toàn bộ file tải lên sẽ mất theo. Máy này chỉ có một
filesystem nên không tách được nếu không mount.

```bash
# 1. Tạo filesystem riêng (thay /dev/sdd5 bằng phân vùng thật của bạn)
sudo mkfs.ext4 -L pmo-uploads /dev/sdd5
sudo mkdir -p /mnt/pmo-uploads
sudo mount /dev/sdd5 /mnt/pmo-uploads
sudo chown -R vutun:vutun /mnt/pmo-uploads

# 2. Ghi vào /etc/fstab để mount lại sau reboot
echo '/dev/sdd5 /mnt/pmo-uploads ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab

# 3. Trỏ UPLOADS_DIR vào đó rồi khởi động lại
sed -i 's#^UPLOADS_DIR=.*#UPLOADS_DIR=/mnt/pmo-uploads#' deploy/single-machine/pmo.env
cp -a backend/uploads/. /mnt/pmo-uploads/
systemctl --user restart pmo-api.service
```

Sau đó đo lại: `curl -s -H "Authorization: Bearer $TOKEN" localhost:3000/api/admin/production-readiness`

## Canh gác

`pmo-watchdog.timer` gọi `/api/ready` **mỗi 30 giây**. Phải dùng `/api/ready`, không dùng
`/api/health`: `health` là liveness-only và **không** chạm DB, nên nó vẫn trả 200 khi
Postgres đã chết.

Đã xảy ra đúng tình huống đó (ghi trong `scripts/db-watchdog.mjs`): PostgreSQL bị kill lúc
07:55 UTC, phát hiện lúc 19:38 ⇒ demo hỏng **im lặng** gần 12 giờ.

```bash
node scripts/db-watchdog.mjs          # kiểm một lần (exit 1 nếu chưa sẵn sàng)
node scripts/db-watchdog.mjs --watch 30
```

## Sao lưu

App tự chạy cron sao lưu hằng ngày (log `daily backup scheduled`). Chạy tay:

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" localhost:3000/api/admin/backups/run
ls -la data/backups/     # giữ BACKUP_KEEP_COUNT=7 bản gần nhất
```

Không có `BACKUP_DATABASE_URL` thì route trả **503** vì RLS chặn `pg_dump` — đó chính là
lý do cần riêng role `pmo_backup`.

## Cổng 3000 thuộc về dịch vụ này

Bản triển khai này **giữ cổng 3000**. Nếu bạn khởi động server bằng tay (`node
src/index.js`, hay bài kiểm spawn) mà quên dừng dịch vụ, thì:

- server của bạn **chiếm cổng trước** và dịch vụ systemd **không dậy được** — nó lặp
  `Restart=always` nên cứ thử lại mãi, mỗi lần đều `EADDRINUSE`.
- Đo được 2026-09-29: `systemctl --user is-active` báo `activating` vô tận trong khi
  `/api/health` vẫn trả 200 — nhưng là **của server tay**, nên dễ tưởng dịch vụ đang chạy.
  Đo `production-readiness` cũng ra 5/13 thay vì 8/13, vì server tay không có
  `NODE_ENV=production`/`JWT_SECRET`. Ba tín hiệu khác nhau, cùng một nguyên nhân.

```bash
fuser -k 3000/tcp        # giải phóng cổng
systemctl --user restart pmo-api.service
```

Ngược lại, khi chạy bộ kiểm thử thì **dừng dịch vụ trước** — `scripts/run-all-e2e.mjs` tự
bật server dùng chung của riêng nó, và hai cái cùng tranh `:3000`:

```bash
systemctl --user stop pmo-api.service
env -u DATABASE_URL -u BASE_URL node scripts/run-all-e2e.mjs
systemctl --user start pmo-api.service
```
