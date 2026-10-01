#!/usr/bin/env bash
# Tạo vai trò + database Postgres cho bản cài local.
#
# ── Vì sao cần script này ───────────────────────────────────────────────────────────
# Đo 2026-10-01 trên clone sạch của `main`: chạy `node backend/src/db/init.js` thất bại
# với `permission denied for schema public`. Lý do: `init.js` **không** tạo database và
# không tạo vai trò — nó chỉ migrate + seed vào một database **đã có sẵn**. Mà trong repo
# **không có script nào** tạo ra database/vai trò đó: `pg-ctl.sh` chỉ khởi động một
# cluster có sẵn, còn `9999h_app_role.sql` chỉ tạo `pmo_app` (vai trò request) chứ không
# tạo `pmo_user` (vai trò owner) mà `init.js` kết nối bằng.
#
# Nên người review phải tự biết tạo gì, bằng đúng user name và đúng port — không có
# chỗ nào nói. Đây là bức tường đầu tiên, và nó không cần thiết.
#
# ── Cần chạy bằng Postgres superuser ────────────────────────────────────────────────
# Không cần `sudo` nếu Postgres chạy bằng chính user của bạn (trường hợp mặc định của
# `pg-ctl.sh`): `initdb` tạo cluster với user hiện tại làm superuser, nên user đó đã đủ
# quyền `CREATEROLE` + `CREATEDB` mà không cần `sudo`.
#
# Dùng:  ./backend/scripts/db-bootstrap.sh
set -euo pipefail

DB_NAME="${DB_NAME:-pmo}"
DB_USER="${DB_USER:-pmo_user}"
DB_PASS="${DB_PASSWORD:-pmo_dev_pwd}"
DB_PORT="${DB_PORT:-5433}"
DB_HOST="${DB_HOST:-127.0.0.1}"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if ! command -v psql >/dev/null 2>&1; then
  echo "❌ Không có psql. Cài PostgreSQL client:  sudo apt install postgresql-client   (hoặc: brew install libpq)"
  exit 1
fi

if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -q 2>/dev/null; then
  echo "❌ Postgres không chạy ở $DB_HOST:$DB_PORT."
  echo "   Khởi động trước:  ./backend/scripts/pg-ctl.sh start"
  exit 1
fi

# `psql` không có `-p` sẵn trong biến môi trường, nên truyền rõ từng tham số.
# Superuser: thử chính user đang chạy trước (không cần sudo trong trường hợp `pg-ctl.sh`).
psql_super() {
  PGUSER="${PGUSER_ADMIN:-$USER}" PGPASSWORD="${PGPASSWORD_ADMIN:-}" \
    psql -h "${PGHOST_ADMIN:-/tmp}" -p "$DB_PORT" -d postgres -v ON_ERROR_STOP=1 "$@"
}

if ! psql_super -t -A -c 'SELECT 1' >/dev/null 2>&1; then
  cat >&2 <<'EOM'
❌ Không kết nối được Postgres superuser qua socket.

Script này cần quyền tạo vai trò và database. Thử theo thứ tự:
  1. Bản `pg-ctl.sh` (Linux/WSL): user hiện tại **đã là** superuser của cluster
     → chạy lại không cần sudo.
  2. Postgres hệ thống (Ubuntu/Debian): dùng user `postgres`
     → đặt PGHOST_ADMIN=/var/run/postgresql PGUSER_ADMIN=postgres
  3. Docker:  docker compose up -d postgres   rồi chạy lại script này
  4. Cần `sudo` (macOS/Homebrew):  sudo -u <user-postgres> ./backend/scripts/db-bootstrap.sh
EOM
  exit 1
fi

echo "→ Tạo vai trò '$DB_USER' (nếu chưa có)"
# `CREATE ROLE` không có `IF NOT EXISTS` ở PG16, nên kiểm tra trước cho idempotent.
psql_super -t -A -c "SELECT 1 FROM pg_roles WHERE rolname = '$DB_USER'" | grep -q 1 \
  || psql_super -c "CREATE ROLE \"$DB_USER\" LOGIN PASSWORD '$DB_PASS' SUPERUSER" >/dev/null

# Vai trò này là **owner** của database nên nó cần `CREATEDB` để `init.js` chạy được trên
# DB sạch, và `SUPERUSER` để `CREATE EXTENSION vector` (extension `pgvector`) cài được.
# Đo 2026-10-01: thiếu `SUPERUSER` thì `init.js` dừng ở bước tạo extension, và đó là lỗi
# khó chẩn đoán vì thông báo không nói "cần superuser".
psql_super -c "ALTER ROLE \"$DB_USER\" LOGIN SUPERUSER CREATEDB PASSWORD '$DB_PASS'" >/dev/null
echo "  ✓ $DB_USER: LOGIN SUPERUSER CREATEDB"

echo "→ Tạo database '$DB_NAME' (nếu chưa có)"
exists=$(psql_super -t -A -c "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'")
if [ "$exists" != "1" ]; then
  psql_super -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\" ENCODING 'UTF8'" >/dev/null
  echo "  ✓ $DB_NAME đã tạo (owner: $DB_USER)"
else
  echo "  · $DB_NAME đã tồn tại — giữ nguyên dữ liệu"
fi

echo
echo "✅ Sẵn sàng. Tiếp theo:"
echo "   npm install"
echo "   node backend/src/db/init.js"
echo "   node scripts/load-demo-seed.mjs        # nạp dữ liệu dự án demo"
echo
echo "   Kết nối: postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
