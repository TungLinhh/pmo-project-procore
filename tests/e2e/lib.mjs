// Shared E2E helpers — new tests import from here instead of reinventing
// login/fetch/psql. Rules: no absolute paths (use ROOT), no hardcoded ports
// except BASE_URL default, throwaway rows must be cleaned by the test.
//   import { api, loginAs, psql, ok, summary } from '../e2e/lib.mjs';
import { psqlQuery } from '../tools/env.mjs';

export const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
export const BASE = process.env.BASE_URL || 'http://localhost:3000';
export const PG = {
  host: process.env.PGHOST || '127.0.0.1',
  port: process.env.PGPORT || '5433',
  user: process.env.PGUSER || 'pmo_user',
  password: process.env.PGPASSWORD || 'pmo_dev_pwd',
};

let pass = 0, fail = 0;
export const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); cond ? pass++ : fail++; };
export const summary = () => {
  console.log(pass && !fail ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
  process.exit(fail ? 1 : 0);
};

export async function api(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  let data = null;
  try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

export const loginAs = async (email) => (await api('/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'admin123' }),
})).data?.token;

export const auth = (token) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
export const J = (token, body) => ({ headers: auth(token), body: JSON.stringify(body) });

// psql against the target database via env-driven client (PGHOST/PGPORT/
// PGUSER/PGPASSWORD/PGDATABASE/PSQL_BIN). Portable: works on CI runners,
// unlike backend/scripts/pg-ctl.sh which is local-dev only (hardcoded
// Homebrew binary path + dev password). Returns first line of -t -A output
// (strips the 'INSERT 0 1'-style tags psql prints for RETURNING queries).
export const psql = (sql) => psqlQuery(sql).split('\n')[0];

/**
 * Chờ server con thực sự **lên**, thay cho `sleep(3500)` cố định.
 *
 * Vì sao cần: **52 bài** dùng `await new Promise(r => setTimeout(r, 3500))` ngay sau khi
 * spawn `backend/src/index.js`. Ba giây rưỡi là đủ khi máy rảnh, nhưng khi cả bộ 142
 * bài chạy tuần tự thì server mới có thể cần hơn — và bài đỏ với
 * `TypeError: fetch failed / ConnectTimeoutError` trông **giống hỏng sản phẩm** nhưng
 * hoàn toàn là bẫp thời gian. Đo 2026-09-28: `nested-departments.mjs` đỏ đúng kiểu đó
 * (spawn xong 15s sau vẫn không kết nối được ở cổng 3120), trong khi chạy riêng thì xanh.
 *
 * Dò `/api/health` chứ **không** dò `/api/ready`: `health` là liveness-only và không
 * chạm DB, nên không phụ thuộc Postgres hay seed data — đúng thứ ta cần để biết
 * "tiến trình đã lắng nghe".
 *
 * @param {string} base ví dụ `http://localhost:3120`
 * @param {number} [timeoutMs] trần chờ; hết giờ thì **ném** kèm số giây đã chờ
 * @param {number} [stepMs] bước nhảy giữa hai lần dò
 */
export async function waitForServer(base, timeoutMs = 45_000, stepMs = 250) {
  const deadline = Date.now() + timeoutMs;
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(4_000) });
      if (res.ok) return true;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error(
    `server ${base} không lên trong ${Math.round(timeoutMs / 1000)}s (lỗi cuối: ${lastErr?.message || 'không rõ'}).\n` +
    `  Nếu là "ConnectTimeoutError": cổng đã bị chiếm bởi server cũ (bài trước để sót) — ` +
    `xem sweepStrayServers() trong scripts/run-all-e2e.mjs.`,
  );
}
