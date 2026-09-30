#!/usr/bin/env bash
# Cài bản demo nội bộ trên **chính máy này**, không Docker.
#
# Chạy:  bash deploy/single-machine/install.sh
#
# Script này **không** cần `sudo`: nó đăng ký systemd *user* unit, sinh bí mật, và bật
# dịch vụ. Phần cần `sudo` (mount `UPLOADS_DIR` riêng) nó in ra cuối output thay vì im
# lặng bỏ qua — xem README.md mục "Còn phải làm gì bằng tay".
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY="$ROOT/deploy/single-machine"
ENV_FILE="$DEPLOY/pmo.env"
LOGS="$DEPLOY/logs"

say()  { printf '  %s\n' "$*"; }
step() { printf '\n▸ %s\n' "$*"; }

mkdir -p "$LOGS"

# ── 1. Bí mật ────────────────────────────────────────────────────────────────
# Sinh cục bộ nếu file env chưa có, để chạy lại script không làm mất phiên đăng nhập
# và không xoá dữ liệu mã hoá của `users.mfa_secret` / `workers.phone` /
# `vendors.contact` (đổi `DATA_ENC_KEY` làm các cột đó **đọc không được**).
#
# `production-readiness.weakSecret()` loại giá trị <32 ký tự **và** giá trị chứa
# `change_me` / `dev-only` / `secret` (không phân biệt hoa thường) — nên bí mật ở đây
# tránh chữ "secret" và tránh ký tự gạch dưới ở từ dễ đoán.
step "Bí mật"
if [ -f "$ENV_FILE" ]; then
  say "đã có $ENV_FILE — giữ nguyên (đổi DATA_ENC_KEY sẽ làm dữ liệu mã hoá cũ đọc không được)"
else
  gen() { node -e "const c=require('node:crypto');process.stdout.write(c.randomBytes($1).toString('base64url'))"; }
  umask 077
  cat > "$ENV_FILE" <<EOF
# Sinh bởi deploy/single-machine/install.sh — KHÔNG commit (xem .gitignore).
# Quyền file: 600 (umask 077 lúc sinh).
#
# Vì sao không nằm trong backend/.env: backend/src/db/index.js:49 cố ý bỏ qua
# backend/.env khi NODE_ENV=production. File này là nơi duy nhất production đọc env.

NODE_ENV=production
PORT=3000
LOGIN_RATE_MAX=1000
CORS_ORIGIN=http://127.0.0.1:3000
TRUST_PROXY=0

# ── Cơ sở dữ liệu ──────────────────────────────────────────────────────────
# Nhóm owner (migrate/seed) và nhóm app role (request pool) là hai vai khác nhau;
# app role KHÔNG phải superuser (superuser bypass RLS).
DATABASE_URL=postgresql://pmo_user:__OWNER_PWD__@127.0.0.1:5433/pmo
APP_DB_USER=pmo_app
APP_DB_PASSWORD=__APP_PWD__
# Role sao lưu: BYPASSRLS + SELECT trên bảng & sequence. Không có nó thì
# POST /api/admin/backups/run trả 503 vì RLS chặn pg_dump.
BACKUP_DATABASE_URL=postgresql://pmo_backup:__BACKUP_PWD__@127.0.0.1:5433/pmo

# ── Khoá ───────────────────────────────────────────────────────────────────
JWT_SECRET=__JWT__
DATA_ENC_KEY=__DATAKEY__

# ── Tính năng ──────────────────────────────────────────────────────────────
UPLOADS_DIR=__UPLOADS__
BACKUP_DIR=__BACKUPDIR__
STORAGE_DRIVER=local
LOGIN_RATE_MAX_WINDOW_MS=60000
ACCESS_TTL_SEC=86400
REFRESH_TTL_DAYS=30
AUDIT_RETENTION_DAYS=365
RETENTION_MIN_ROWS=10000
BACKUP_KEEP_COUNT=7
CLEANUP_DEMO=0

# ── Ngoại lệ ĐÃ BIẾT cho phạm vi demo (xem README.md) ──────────────────────
# Giữ mật khẩu demo admin123 để người trình diễn đăng nhập được ngay. Sản phẩm ở
# chế độ production chặn admin123 trừ khi cờ này bật.
ALLOW_DEV_PASSWORD=1
# Để ON thì backend từ chối boot khi còn mục readiness mức fail. Không bật vì còn
# 3 sai lệch demo (uploads_volume / shared_password_users / strong_auth).
PRODUCTION_ENFORCE_READINESS=0

# ── AI (không bắt buộc) ────────────────────────────────────────────────────
# Bỏ trống thì các route AI trả 503 thay vì trả lời sai.
OPENROUTER_API_KEY=
EOF
  # APP_DB_PASSWORD phải khớp role `pmo_app` trong Postgres, nên không sinh ngẫu nhiên:
  # lấy từ backend/.env (đã tạo ở đợt trước). Không có thì hỏi rõ thay vì đoán.
  APP_PWD="$(grep -E '^APP_DB_PASSWORD=' "$ROOT/backend/.env" | cut -d= -f2- || true)"
  [ -n "$APP_PWD" ] || { say "THIẾU APP_DB_PASSWORD trong backend/.env — xem README mục 'Tạo app role'."; exit 1; }
  BAK_PWD="$(grep -E '^BACKUP_DATABASE_URL=' "$ROOT/backend/.env" | cut -d= -f2- | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#' || true)"
  OWN_PWD="$(grep -E '^DATABASE_URL=' "$ROOT/backend/.env" | cut -d= -f2- | sed -E 's#.*://[^:]+:([^@]+)@.*#\1#' || true)"
  [ -n "$BAK_PWD" ] || { say "THIẾU BACKUP_DATABASE_URL trong backend/.env — chạy deploy/production/00-backup-role.sh trước."; exit 1; }

  perl -0pi -e "s/__APP_PWD__/\Q$APP_PWD\E/g"      "$ENV_FILE"
  perl -0pi -e "s/__BACKUP_PWD__/\Q$BAK_PWD\E/g"  "$ENV_FILE"
  perl -0pi -e "s/__OWNER_PWD__/\Q$OWN_PWD\E/g"   "$ENV_FILE"
  perl -0pi -e "s/__JWT__/$(gen 48)/g"             "$ENV_FILE"
  # DATA_ENC_KEY: 32 byte base64 (lib/crypto.js chấp nhận base64 32B hoặc 64-hex).
  perl -0pi -e "s/__DATAKEY__/$(gen 32)/g"         "$ENV_FILE"
  perl -0pi -e "s#__UPLOADS__#$ROOT/backend/uploads#g"  "$ENV_FILE"
  perl -0pi -e "s#__BACKUPDIR__#$ROOT/data/backups#g"    "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  say "đã sinh $ENV_FILE (quyền 600)"
fi

# ── 1b. Căn chỉnh id trước khi mở cửa cho người dùng ──────────────────────────
# Vì sao: `audit_log` cố ý **không** có khoá ngoại tới bảng nghiệp vụ, nên khi một dòng bị
# xoá (bài kiểm dọn dữ liệu thử, `cleanup-demo.mjs`, …) thì dòng audit của nó vẫn còn và
# vẫn trỏ tới `id` đó. Nếu sequence bị cuộn về dưới mốc đó thì `nextval` cấp lại đúng
# `id` ấy và lịch sử kiểm toán mất khả năng truy vết (xem `CODEBASE_BUG_AUDIT.md` 11.27.9).
#
# `init.js` đã sửa để **chỉ đẩy** sequence lên, và tính cả mốc `audit_log`; nó idempotent
# nên chạy ở đây là an toàn. Đo 2026-09-29: sau một lần quét 133 bài e2e, 4/66 bảng ở
# tình trạng có nguy cơ — và `init.js` một lần là đủ.
step "Căn chỉnh id"
(cd "$ROOT" && node backend/src/db/init.js 2>&1 | grep -E '^✓ Sequences' | sed 's/^/  /')
if (cd "$ROOT" && node scripts/check-id-reuse.mjs | sed 's/^/  /'); then
  say "id an toàn: không sequence nào sắp cấp lại id mà audit_log đã dùng"
else
  say "CẢNH BÁO: còn sequence có nguy cơ cấp lại id — xem node scripts/check-id-reuse.mjs"
fi

# ── 2. Bản dựng frontend ────────────────────────────────────────────────────
step "Bản dựng frontend"
if [ -f "$ROOT/frontend/dist/index.html" ] && [ -z "${REBUILD:-}" ]; then
  say "đã có frontend/dist — đặt REBUILD=1 để dựng lại"
else
  (cd "$ROOT" && npm run build --workspace=frontend >/dev/null 2>&1)
  say "đã dựng frontend/dist"
fi

# ── 3. systemd user unit ────────────────────────────────────────────────────
step "systemd (user)"
export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
UNIT_DIR="$XDG_CONFIG_HOME/systemd/user"
mkdir -p "$UNIT_DIR"
install -m 644 "$DEPLOY/pmo-db.service"       "$UNIT_DIR/"
install -m 644 "$DEPLOY/pmo-api.service"      "$UNIT_DIR/"
install -m 644 "$DEPLOY/pmo-watchdog.service" "$UNIT_DIR/"
install -m 644 "$DEPLOY/pmo-watchdog.timer"   "$UNIT_DIR/"
systemctl --user daemon-reload
# Postgres phải lên TRƯỚC app. Không có unit này thì reboot máy là mất demo cho tới
# khi có người chạy `pg-ctl.sh start` bằng tay (đo 2026-09-30).
systemctl --user enable --now pmo-db.service
systemctl --user enable --now pmo-watchdog.timer
say "đã bật pmo-watchdog.timer (gọi /api/ready mỗi 30s)"

systemctl --user restart pmo-api.service
sleep 6
if systemctl --user is-active --quiet pmo-api.service; then
  say "pmo-api.service: đang chạy"
else
  say "pmo-api.service: KHÔNG chạy — xem $LOGS/api.log"
  systemctl --user status --no-pager pmo-api.service | tail -12 || true
  exit 1
fi

# ── 4. Kiểm tra ─────────────────────────────────────────────────────────────
step "Kiểm tra"
code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health || true)"
say "/api/health → $code"
code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/ready || true)"
say "/api/ready  → $code  (503 nghĩa là Postgres chưa sẵn sàng)"
say "/            → $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/ || true)"

cat <<'EOF'

▸ Còn phải làm bằng tay (cần sudo — máy này chưa cấp quyền cho agent)

  1. UPLOADS_DIR nằm trên filesystem riêng  →  mục readiness `uploads_volume` đang đỏ.
     Lý do: hiện toàn bộ máy chỉ có một filesystem (/dev/sdd ext4), nên không thể tách
     mà không mount. Khi thay image/đổi ứng dụng, file tải lên sẽ mất theo.
       sudo mkdir -p /var/lib/pmo/uploads /mnt/pmo-uploads
       sudo mount /dev/sdd5 /mnt/pmo-uploads        # (thay bằng fs thật của bạn)
       sudo chown -R vutun:vutun /mnt/pmo-uploads
       # rồi sửa UPLOADS_DIR=/mnt/pmo-uploads trong deploy/single-machine/pmo.env
       # và: systemctl --user restart pmo-api.service

  2. Tự khởi động lại sau khi reboot — ĐÃ XONG trên máy này:
         loginctl show-user vutun --property=Linger   # => Linger=yes (đo 2026-09-30)
       Chỉ cần chạy lệnh dưới đây trên máy KHÁC:
         sudo loginctl enable-linger vutun

  3. Đóng 3 sai lệch demo còn lại (xem README.md mục "Sai lệch đã chấp nhận") thì mới
     bật được PRODUCTION_ENFORCE_READINESS=1 — lúc đó backend từ chối boot nếu còn
     mục readiness đỏ, tức checklist trở thành rào chắn thật.
EOF
