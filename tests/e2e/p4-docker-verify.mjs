// p4-docker-verify.mjs — Verify PMO Docker container end-to-end
// Tests: health, login, projects, shop, material, payment, OTD, audit, upload, notifications
// Run: node tests/e2e/p4-docker-verify.mjs
// Requires: backend running on localhost:3000, PG on 127.0.0.1:5433

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = 'http://localhost:3000';
const PSQL = process.env.PSQL || '/home/linuxbrew/.linuxbrew/bin/psql';
const PG = { host: '127.0.0.1', port: 5433, user: 'pmo_user', pass: 'pmo_dev_pwd', db: 'pmo' };

let pass = 0, fail = 0;
function ok(label, cond) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

function curl(path, opts = {}) {
  const args = ['-s', '--max-time', '5', `${BASE}${path}`];
  if (opts.method) args.push('-X', opts.method);
  if (opts.body) {
    args.push('-H', 'Content-Type: application/json');
    args.push('-d', JSON.stringify(opts.body));
  }
  if (opts.headers) for (const [k, v] of Object.entries(opts.headers)) args.push('-H', `${k}: ${v}`);
  try {
    const out = execFileSync('curl', args, { encoding: 'utf8', timeout: 10000, maxBuffer: 10 * 1024 * 1024 });
    return JSON.parse(out);
  } catch (e) {
    return { __error: true, message: e.message, stderr: e.stderr?.toString() };
  }
}

function pg(query) {
  try {
    const out = execFileSync(PSQL, [
      '-h', PG.host, '-p', String(PG.port), '-U', PG.user, '-d', PG.db,
      '-tA', '-c', query,
    ], { encoding: 'utf8', timeout: 10000, env: { ...process.env, PGPASSWORD: PG.pass } });
    return out.trim();
  } catch (e) {
    return `__error: ${e.message}`;
  }
}

// ===== Test 1: Health =====
console.log('\n=== 1. Health ===');
const health = curl('/api/health');
ok('health returns 200', health.status === 'ok');
ok('health has timestamp', !!health.timestamp);

// ===== Test 2: Login =====
console.log('\n=== 2. Login ===');
const login = curl('/api/auth/login', {
  method: 'POST',
  body: { email: 'admin@hbg.com', password: 'admin123' },
});
ok('login returns token', !!login.token);
ok('login returns user', !!login.user);
const token = login.token;

// ===== Test 3: Projects (include_closed=1 to see BTE-WP4-HBC which is CLOSED) =====
console.log('\n=== 3. Projects ===');
const projects = curl('/api/projects?include_closed=1', {
  headers: { Authorization: `Bearer ${token}` },
});
ok('projects returns array', Array.isArray(projects));
ok('projects has BTE-WP4-HBC', projects.some(p => p.code === 'BTE-WP4-HBC'));
const bte = projects.find(p => p.code === 'BTE-WP4-HBC');
ok('BTE project has id', !!bte?.id);

// ===== Test 4: Shop Drawings =====
console.log('\n=== 4. Shop Drawings ===');
const shops = curl(`/api/projects/${bte.id}/shop-drawings`, {
  headers: { Authorization: `Bearer ${token}` },
});
ok('shop drawings returns array', Array.isArray(shops));
ok('shop drawings has data', shops.length > 0);

// ===== Test 5: Material Submittals =====
console.log('\n=== 5. Material Submittals ===');
const mats = curl(`/api/projects/${bte.id}/materials`, {
  headers: { Authorization: `Bearer ${token}` },
});
ok('materials returns array', Array.isArray(mats));

// ===== Test 6: Payment =====
console.log('\n=== 6. Payment ===');
const payReqs = curl(`/api/projects/${bte.id}/payment-requests`, {
  headers: { Authorization: `Bearer ${token}` },
});
ok('payment requests returns array', Array.isArray(payReqs));

// ===== Test 7: OTD =====
console.log('\n=== 7. OTD ===');
const otd = curl(`/api/projects/${bte.id}/otd`, {
  headers: { Authorization: `Bearer ${token}` },
});
ok('OTD returns otd_pct', typeof otd.otd_pct === 'number');
ok('OTD has by_zone', Array.isArray(otd.by_zone));
ok('OTD has trend', Array.isArray(otd.trend));

// ===== Test 8: Audit Log =====
console.log('\n=== 8. Audit Log ===');
const audit = curl('/api/audit', {
  headers: { Authorization: `Bearer ${token}` },
});
ok('audit returns array', Array.isArray(audit));
ok('audit has entries', audit.length > 0);

// ===== Test 9: Notifications =====
console.log('\n=== 9. Notifications ===');
const notifs = curl('/api/notifications', {
  headers: { Authorization: `Bearer ${token}` },
});
ok('notifications returns array', Array.isArray(notifs));

// ===== Test 10: Dashboard =====
console.log('\n=== 10. Dashboard ===');
const dash = curl('/api/dashboard', {
  headers: { Authorization: `Bearer ${token}` },
});
ok('dashboard returns projects_active', typeof dash.projects_active === 'number' || typeof dash.projects_active === 'string');
ok('dashboard has issues_open', typeof dash.issues_open === 'number' || typeof dash.issues_open === 'string');

// ===== Test 11: DB Direct =====
console.log('\n=== 11. DB Direct ===');
const projCount = pg('SELECT COUNT(*) FROM projects');
ok('DB has projects', projCount !== '__error' && parseInt(projCount) > 0);
const userCount = pg("SELECT COUNT(*) FROM users WHERE email LIKE '%@hbg.com'");
ok('DB has seeded users', userCount !== '__error' && parseInt(userCount) >= 7);
const shopCount = pg('SELECT COUNT(*) FROM shop_drawings');
ok('DB has shop_drawings', shopCount !== '__error' && parseInt(shopCount) > 0);

// ===== Test 12: Frontend =====
console.log('\n=== 12. Frontend ===');
const frontendExists = existsSync(join(ROOT, 'frontend', 'dist', 'index.html'));
ok('frontend dist exists', frontendExists);

// ===== Summary =====
console.log('\n========================================');
console.log(`  Results: ${pass} passed, ${fail} failed`);
console.log('========================================');
process.exit(fail > 0 ? 1 : 0);
