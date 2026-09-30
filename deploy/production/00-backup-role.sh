#!/bin/sh
set -eu

: "${BACKUP_DB_PASSWORD:?BACKUP_DB_PASSWORD is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

# `BYPASSRLS` **không** cấp quyền đọc bảng — nó chỉ bỏ qua policy. `pg_dump` vẫn cần
# `SELECT` trên mọi bảng và `USAGE` trên schema, nên role chỉ có `CONNECT` sẽ hỏng
# với `permission denied for table …` (đo 2026-09-28: `pg_dump` dừng ngay ở
# `LOCK TABLE public.area_hierarchy, …` với dump 0 byte). Triệu chứng khi đó dễ bị
# chẩn đoán nhầm thành "RLS chặn", vì `lib/backup.js` bắt chữ `row-level security`
# trong thông điệp rồi trả 503 kèm lời nhắc sai hướng.
psql --set=ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=database_name="$POSTGRES_DB" \
  --set=backup_password="$BACKUP_DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE pmo_backup LOGIN BYPASSRLS PASSWORD %L', :'backup_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pmo_backup') \gexec
SELECT format('ALTER ROLE pmo_backup LOGIN BYPASSRLS PASSWORD %L', :'backup_password') \gexec
GRANT CONNECT ON DATABASE :"database_name" TO pmo_backup;
GRANT USAGE ON SCHEMA public TO pmo_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pmo_backup;
-- `pg_dump` còn đọc `last_value` của mọi sequence để ghi lại `setval` — thiếu grant
-- này thì nó dừng ở `permission denied for sequence ai_calls_id_seq` (đo 2026-09-28).
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO pmo_backup;
-- Bảng tạo sau này (mỗi đợt migrate thêm bảng) cũng phải đọc được, nếu không
-- sao lưu sẽ hỏng đúng lúc thêm bảng mới. `FORCE ROW LEVEL SECURITY` không ảnh
-- hưởng vì `pmo_backup` đã có `BYPASSRLS`.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO pmo_backup;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO pmo_backup;
SQL
