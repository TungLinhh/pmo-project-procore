// P1-10: scope call — xlsx export HIDDEN (no dead downloads), offline-sync VISIBLE (works).
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-10-export-sync-scope.mjs
import { waitForServer } from './lib.mjs';
import { spawn, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

// --- export: flag off + all 4 buttons guarded + no backend route to repair-blind
const api = readFileSync('frontend/src/api/index.js', 'utf8');
ok(api.includes('ENABLED: false'), 'exportApi.ENABLED is false');
// `ControlCenter` **không** còn nút export bảng AP: nó đã bị gỡ có chủ đích (xem
// `AGENTS.md` — "project report route is separate"), nên không có cờ để bật/tắt.
// Cờ chỉ còn ở 3 màn vẫn dùng nó.
for (const f of ['ProgressDetail', 'ShopList', 'ProjectOverview']) {
  const src = readFileSync(`frontend/src/hq/${f}.jsx`, 'utf8');
  ok(src.includes('exportApi.ENABLED &&'), `${f} export button guarded by flag`);
}
const cc = readFileSync('frontend/src/hq/ControlCenter.jsx', 'utf8');
ok(!cc.includes('exportApi.ENABLED'), 'ControlCenter không còn nút export AP đã gỡ (báo cáo dự án ở route riêng)');

// Endpoint export **đã hoàn chỉnh** và được mount (`backend/src/index.js:204`), bài
// `payment-sla` trong release-gate chạy nó. Khẳng định cũ ("mounts no /api/export")
// viết khi route còn nửa nối nửa treo, nay đảo lại để bắt được việc gỡ nhầm.
const index = readFileSync('backend/src/index.js', 'utf8');
ok(index.includes("app.use('/api/export'"), 'backend mounts /api/export (route hoàn chỉnh)');

// --- offline-sync: kept visible because queue + resolve work (verified in p1-02)
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3210';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3210' }, stdio: 'ignore' });
await waitForServer(BASE);
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const H = { Authorization: `Bearer ${token}` };
  const q = await fetch(BASE + '/api/sync/queue', { headers: H });
  ok(q.status === 200 && Array.isArray(await q.json()), 'sync queue view-source works (stays visible)');
  const fs = readFileSync('frontend/src/field/FieldStubs.jsx', 'utf8');
  // `FieldStubs.jsx` gọi qua helper `request('/sync/queue')` — helper tự tiền tố `/api`.
// Khẳng định cũ đòi chuỗi `/api/sync/queue` nên đỏ dù endpoint vẫn đúng; chấp nhận
// cả hai dạng để không ghim vào cách viết.
ok(fs.includes('FieldSync') && (fs.includes("request('/api/sync/queue')") || fs.includes("request('/sync/queue')")),
  'FieldSync view still wired to working endpoint');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}

try {
  execSync('npm run build --workspace=frontend', { encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
  ok(true, 'frontend builds with export hidden');
} catch (e) { ok(false, 'frontend build failed'); }

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
