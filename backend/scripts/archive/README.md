# Archive - migration scripts (one-time use)

Các script này đã chạy xong trong quá trình migrate SQLite → PostgreSQL (2026-08-29).
**Không cần chạy lại** — chỉ giữ để trace lịch sử.

- `migrate-sqlite-to-pg.mjs` — copy 1005 records từ SQLite sang PG (36 tables ban đầu)
- `migrate-zones-to-area-hierarchy.mjs` — map 19 zones + 2 projects vào area_hierarchy (mục 43.8)
- `reinit-db.mjs` — chạy schema.sql mới vào SQLite để thêm 4 bảng (issues, notifications, audit_log, directives)

Nếu cần reset database → xem `drizzle/0000_naive_nick_fury.sql` (full schema mới nhất).
