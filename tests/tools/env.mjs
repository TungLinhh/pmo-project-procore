// Shared test env: CI runners and dev machines differ — never hardcode hosts,
// ports, passwords, or store-specific psql paths here. Override via env:
//   PGHOST (default 127.0.0.1), PGPORT (default 5433), PGUSER (default pmo_user),
//   PGPASSWORD (default pmo_dev_pwd), PGDATABASE (default pmo),
//   BASE_URL (default http://localhost:3000), PSQL_BIN (default `psql` from PATH).
import { execSync } from 'node:child_process';

export const PG = {
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || '5433',
  user: process.env.PGUSER || 'pmo_user',
  password: process.env.PGPASSWORD || 'pmo_dev_pwd',
  database: process.env.PGDATABASE || 'pmo',
};
const PSQL_BIN = process.env.PSQL_BIN || 'psql';

export function psqlQuery(sql, { tuplesOnly = true } = {}) {
  const t = tuplesOnly ? '-tA' : '';
  return execSync(
    `${PSQL_BIN} -h ${PG.host} -p ${PG.port} -U ${PG.user} -d ${PG.database} ${t} -c "${sql.replace(/"/g, '\\"')}"`,
    { env: { ...process.env, PGPASSWORD: PG.password }, encoding: 'utf8' },
  ).trim();
}

export function apiBase() {
  return (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
}

/**
 * `psql` chạy bằng **superuser** — cần cho `CREATE/DROP DATABASE` (mà `PGUSER` thường thì
 * không có quyền đó).
 *
 * Vì sao có helper này: ba bài (`p3-ledger`, `p3-sequences`, `p3-txaudit`) trước đây ghi
 * cứng `psql -h /tmp -p … -U <tên máy tác giả>`. Tên đó chỉ đúng trên **một** máy, và
 * `p2-02-test-portability.mjs` **không bắt** được vì nó chỉ dò `/home/`, `/Users/`, `C:\` —
 * mà socket `/tmp` và tên người dùng thì không nằm trong danh sách đó.
 *
 * Ghi đè bằng `PGUSER_ADMIN` (+ `PGHOST_ADMIN` / `PGPORT_ADMIN`), hoặc bỏ trống `PGUSER_ADMIN`
 * để dùng tên đăng nhập hệ điều hành (`process.env.USER`) qua socket cục bộ — đó là cách
 * `pipeline-guard.mjs` đã làm từ trước.
 */
export function adminPsql(sql, { db = 'postgres' } = {}) {
  const user = process.env.PGUSER_ADMIN
    || (process.env.PGUSER ? undefined : (process.env.USER || process.env.LOGNAME))
    || 'postgres';
  const host = process.env.PGHOST_ADMIN || (process.env.PGUSER ? PG.host : '/tmp');
  const port = process.env.PGPORT_ADMIN || PG.port;
  const pass = process.env.PGPASSWORD_ADMIN || process.env.PGPASSWORD;
  const auth = user === 'postgres' || pass ? `PGPASSWORD=${pass ?? ''} ` : '';
  return execSync(
    `${auth}${process.env.PSQL_BIN || 'psql'} -h ${host} -p ${port} -U ${user} -d ${db} -t -A -c "${String(sql).replace(/"/g, '\\"')}"`,
    { encoding: 'utf8' },
  ).trim();
}
