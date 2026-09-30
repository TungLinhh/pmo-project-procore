// P2-02: test suite is portable — no personal-machine paths, env-driven everywhere.
// Run: node tests/e2e/p2-02-test-portability.mjs
import { readFileSync, existsSync, readdirSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

ok(existsSync('tests/tools/env.mjs'), 'tests/tools/env.mjs helper exists');
const helper = readFileSync('tests/tools/env.mjs', 'utf8');
for (const v of ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'BASE_URL', 'PSQL_BIN'])
  ok(helper.includes(v), `helper reads ${v}`);

const portables = [
  'tests/e2e/schema.mjs',
  'tests/e2e/payment-sla.mjs',
  'tests/e2e/shop-approval.mjs',
  'tests/e2e/api.mjs',
  'tests/tools/schema-audit.mjs',
];
for (const f of portables) {
  const src = readFileSync(f, 'utf8');
  ok(!src.includes('/home/') && !src.includes('/Users/') && !src.includes('C:\\'), `${f} has no personal absolute paths`);
  ok(src.includes('tools/env.mjs') || src.includes('./env.mjs'), `${f} uses the env helper`);
}
const e2eFiles = readdirSync('tests/e2e')
  .filter((f) => f.endsWith('.mjs') && f !== 'p2-02-test-portability.mjs')
  .map((f) => `tests/e2e/${f}`);
for (const f of e2eFiles) {
  const src = readFileSync(f, 'utf8');
  ok(!src.includes('/home/') && !src.includes('/Users/') && !src.includes('C:\\'), `${f} has no personal absolute paths`);
}
// `scripts/` cũng phải portable.
//
// Vì sao thêm: đo 2026-09-28 bài này quét `tests/e2e/*` + 5 file tên định, **không** quét
// `scripts/`. Nên `scripts/ui-verify-v7-pie.mjs` ghi cứng đường dẫn tuyệt đối của máy tác
// giả (thư mục ảnh chụp) — script chỉ chạy được trên đúng máy đó — mà bài vẫn xanh.
// Đường dẫn cá nhân trong `scripts/` cũng là thứ khiến người khác chạy hộp trên máy khác
// gặp lỗi khó hiểu, nên quét luôn.
//
// Lưu ý khi viết comment trong **chính file này**: vòng quét bên dưới chạy trên toàn bộ
// nội dung file, kể cả comment. File này được loại khỏi vòng `tests/e2e` (dòng
// `f !== 'p2-02-test-portability.mjs'`) nhưng **không** được loại khỏi vòng `scripts/`, nên
// ở đây không được viết lại mẫu đường dẫn mà bài săn — mô tả thay thế như trên.
//
// Ngoại lệ: `deploy/single-machine/*.service` **cố ý** ghi đường dẫn tuyệt đối
// (`EnvironmentFile`, `WorkingDirectory`) — systemd unit không có biến đường dẫn, và
// chúng chỉ nằm trong `deploy/`, không phải mã chạy.
const scriptFiles = readdirSync('scripts')
  .filter((f) => f.endsWith('.mjs'))
  .map((f) => `scripts/${f}`);
for (const f of scriptFiles) {
  const src = readFileSync(f, 'utf8');
  ok(!src.includes('/home/') && !src.includes('/Users/') && !src.includes('C:\\'), `${f} has no personal absolute paths`);
}
// Siêu quyền cũng phải portable: `psql -h /tmp … -U <tên>` ghi cứng tên đăng nhập của máy
// tác giả thì chỉ chạy được trên đúng máy đó.
//
// Đo 2026-09-29: ba bài (`p3-ledger`, `p3-sequences`, `p3-txaudit`) ghi cứng
// `psql -h /tmp -p … -U <tên máy tác giả>` mà vòng quét ở trên **không bắt** — vì nó chỉ
// dò `/home/`, `/Users/`, `C:\`, còn socket `/tmp` và tên người dùng thì không nằm trong
// danh sách đó. Nay dùng `adminPsql()` trong `tests/tools/env.mjs` (ghi đè bằng
// `PGUSER_ADMIN` / `PGHOST_ADMIN` / `PGPORT_ADMIN`).
//
// Ngoại lệ: chính `tests/tools/env.mjs` chứa mẫu trong **comment** để giải thích.
for (const f of e2eFiles) {
  const src = readFileSync(f, 'utf8');
  ok(!/psql\s+-h\s+\/tmp\b/.test(src), `${f} has no hardcoded superuser socket (dùng adminPsql)`);
  ok(!/\/tmp\/[^\s]*psql|psql[^\n]*\s-U\s+(?!\$\{|'?\$\{)[A-Za-z_][\w.-]*/.test(src),
    `${f} hardcodes no superuser name`);
}
// localhost defaults are allowed only as fallbacks behind env vars
for (const f of ['tests/e2e/api.mjs', 'tests/e2e/payment-sla.mjs', 'tests/e2e/shop-approval.mjs']) {
  const src = readFileSync(f, 'utf8');
  ok(!src.includes("BASE = 'http://localhost"), `${f} has no hardcoded BASE`);
}

// browser.mjs is wired: real assertions, exit codes, env base
const b = readFileSync('tests/e2e/browser.mjs', 'utf8');
ok(!b.includes('trycloudflare'), 'browser.mjs has no stale tunnel URL');
ok(b.includes('apiBase') || b.includes('BASE_URL'), 'browser.mjs uses BASE_URL env');
ok(b.includes('process.exit(failures'), 'browser.mjs exits non-zero on failure');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
ok((pkg.scripts['test:all'] || '').includes('test:browser'), 'test:all runs the browser suite');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
