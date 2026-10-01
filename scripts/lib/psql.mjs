// Chạy `psql` với **đúng** cấu hình kết nối mà ứng dụng đang dùng.
//
// ── Vì sao không ghim `-h/-p/-U/-d` trong từng script ───────────────────────────────
// Bản đầu `load-demo-seed.mjs` và `export-demo-seed.mjs` ghim cứng
// `-d pmo -U pmo_user -p 5433`. Người review đặt tên DB khác (rất dễ — `DB_NAME=...`)
// thì hai script đó trỏ vào database khác với app, và lỗi hiện ra là "0 hạng mục" chứ
// không phải "sai database" ⇒ rất khó chẩn đoán.
//
// Nên: lấy cấu hình từ chính `buildDatabaseUrl()` của app, rồi truyền cho `psql`.
// `DATABASE_URL` và `DB_*` vẫn ưu tiên đúng như lúc chạy server.
import { execFileSync } from 'node:child_process';
import { buildDatabaseUrl } from '../../backend/src/db/index.js';

/** Phân tích `buildDatabaseUrl()` thành tham số cho `psql`. */
export function psqlArgs(extra = []) {
  const url = new URL(buildDatabaseUrl());
  const args = [
    '-h', decodeURIComponent(url.hostname),
    '-p', url.port || '5432',
    '-U', decodeURIComponent(url.username || ''),
    '-d', decodeURIComponent(url.pathname.replace(/^\//, '')),
    ...extra,
  ];
  const password = decodeURIComponent(url.password || '');
  return { args, password };
}

/** `psql` chạy một câu lệnh, trả về stdout. */
export function psqlQuery(sql, extra = []) {
  const { args, password } = psqlArgs(['-t', '-A', '-c', sql]);
  return execFileSync('psql', args, {
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: password },
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** `psql` chạy một file (dùng cho nạp seed: cần `ON_ERROR_STOP` và rollback). */
export function psqlFile(file, extra = []) {
  const { args, password } = psqlArgs(['-v', 'ON_ERROR_STOP=1', '-q', '-f', file]);
  return execFileSync('psql', args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, PGPASSWORD: password },
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * `COPY (…) TO STDOUT` — trả text sẵn dùng cho `COPY … FROM stdin`.
 *
 * Dùng `psql` chứ không dùng driver: `pg` không có `COPY TO STDOUT` qua `prepare()`, và
 * dựng SQL thủ công cho từng giá trị thì dễ sai escape ở cột có dấu nháy/xuống dòng.
 *
 * Lưu ý: `psql -c` **không** nội suy `$1` — nó gửi nguyên văn lên server. Nên ở đây
 * phải nội suy giá trị thật; `inlines` là số nguyên ta ép kiểu trước khi truyền.
 */
export function psqlCopy(selectSql) {
  const { args, password } = psqlArgs(['-t', '-A', '-c', `${selectSql} TO STDOUT WITH (FORMAT text, HEADER false)`]);
  return execFileSync('psql', args, {
    encoding: 'utf8',
    env: { ...process.env, PGPASSWORD: password },
    maxBuffer: 64 * 1024 * 1024,
  });
}
