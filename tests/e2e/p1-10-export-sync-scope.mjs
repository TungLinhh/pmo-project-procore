// P1-10: scope call — xlsx export HIDDEN (no dead downloads), offline-sync VISIBLE (works).
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-10-export-sync-scope.mjs
import { spawn, execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

// --- export: flag off + all 4 buttons guarded + no backend route to repair-blind
const api = readFileSync('frontend/src/api/index.js', 'utf8');
ok(api.includes('ENABLED: false'), 'exportApi.ENABLED is false');
for (const f of ['ControlCenter', 'ProgressDetail', 'ShopList', 'ProjectOverview']) {
  const src = readFileSync(`frontend/src/hq/${f}.jsx`, 'utf8');
  ok(src.includes('exportApi.ENABLED &&'), `${f} export button guarded by flag`);
}
const index = readFileSync('backend/src/index.js', 'utf8');
ok(!index.includes('/api/export'), 'backend mounts no /api/export routes (nothing half-wired)');

// --- offline-sync: kept visible because queue + resolve work (verified in p1-02)
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3210';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3210' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const H = { Authorization: `Bearer ${token}` };
  const q = await fetch(BASE + '/api/sync/queue', { headers: H });
  ok(q.status === 200 && Array.isArray(await q.json()), 'sync queue view-source works (stays visible)');
  const fs = readFileSync('frontend/src/field/FieldStubs.jsx', 'utf8');
  ok(fs.includes('FieldSync') && fs.includes('/api/sync/queue'), 'FieldSync view still wired to working endpoint');
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
