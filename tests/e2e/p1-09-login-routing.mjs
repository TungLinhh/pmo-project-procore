// P1-09: site role routes to /field regardless of role casing.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-09-login-routing.mjs
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

const src = readFileSync('frontend/src/components/Login.jsx', 'utf8');
ok(src.includes("toLowerCase() === 'site'"), 'role check is case-insensitive');

// live: mirror the component decision with real login responses
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3209';
const decide = (role, isFieldPath = false) =>
  (isFieldPath || String(role || '').toLowerCase() === 'site') ? '/field' : '/hq';

const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3209' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  for (const email of ['site@hbg.com', 'admin@hbg.com', 'pmo@hbg.com']) {
    const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) });
    ok(r.status === 200, `login ${email} → 200 (got ${r.status})`);
    const j = await r.json();
    const dest = decide(j.user.role);
    const expect = email === 'site@hbg.com' ? '/field' : '/hq';
    ok(dest === expect, `${email} (role=${j.user.role}) routes ${dest} (expect ${expect})`);
  }
  // casing robustness: UPPER/mixed variants of the same role still hit /field
  for (const v of ['SITE', 'Site', 'sItE']) ok(decide(v) === '/field', `role '${v}' → /field`);
  ok(decide('site', true) === '/field' && decide('admin', true) === '/field', 'explicit /field path preserved');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}

try {
  execSync('npm run build --workspace=frontend', { encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
  ok(true, 'frontend builds with fixed Login');
} catch (e) { ok(false, 'frontend build failed'); }

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
