// P1-07: /field/wbs no longer crashes — component's data sources load end to end.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-07-field-wbs.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

// static: shadowing + undefined identifier gone
const src = readFileSync('frontend/src/field/FieldStubs.jsx', 'utf8');
ok(!src.includes('projectsApi'), 'no undefined projectsApi reference');
ok(src.includes('projects.list()'), 'WBS step 1 uses the real projects api');

// the exact API calls the WBS page makes on mount + step 2
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3207';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3207' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const H = { Authorization: `Bearer ${token}` };
  const list = await fetch(BASE + '/api/projects', { headers: H }).then(r => r.json());
  ok(Array.isArray(list) && list.length > 0, `step-1 source: projects list non-empty (got ${list.length})`);
  const hier = await fetch(`${BASE}/api/projects/${list[0].id}/area-hierarchy`, { headers: H });
  ok(hier.status === 200, `step-2 source: area-hierarchy → 200 (got ${hier.status})`);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}

// page compiles into the production bundle
try {
  execSync('npm run build --workspace=frontend', { encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
  ok(true, 'frontend builds with fixed FieldStubs');
} catch (e) { ok(false, 'frontend build failed'); }

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
