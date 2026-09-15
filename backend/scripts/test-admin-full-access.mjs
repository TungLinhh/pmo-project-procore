// Test admin/CEO: gọi được MỌI endpoint với MỌI project_id
// Chạy: node scripts/test-admin-full-access.mjs
import { getDb } from '../src/db/index.js';

const BASE = 'http://localhost:3000';
const db = getDb();

// Lấy tất cả project_id
const projects = db.prepare('SELECT id, code, name_vi FROM projects ORDER BY id').all();
console.log(`Found ${projects.length} projects:`, projects.map(p => p.id).join(', '));

// Login 2 accounts
async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  }).then(r => r.json());
  if (!r.token) throw new Error('Login failed: ' + email);
  return r;
}

const admin = await login('admin@hbg.com', 'admin123');
const ceo = await login('ceo@hbg.com', 'ceo123');
console.log(`\nLogged in admin (role=${admin.user.role}, is_ceo=${admin.user.is_ceo}) + ceo (role=${ceo.user.role}, is_ceo=${ceo.user.is_ceo})`);

// 30+ endpoints để test - bao quát cả GET/POST/PUT
const endpoints = [
  // READ
  { method: 'GET', path: '/api/projects', expectedStatus: 200 },
  { method: 'GET', path: '/api/master-data/subcontractors', expectedStatus: 200 },
  { method: 'GET', path: '/api/master-data/suppliers', expectedStatus: 200 },
  { method: 'GET', path: '/api/master-data/business-processes', expectedStatus: 200 },
  { method: 'GET', path: '/api/notifications', expectedStatus: 200 },
  { method: 'GET', path: '/api/issues?status=OPEN', expectedStatus: 200 },
  { method: 'GET', path: '/api/uploads', expectedStatus: 200 },
  // PER-PROJECT READ (test với mọi project_id)
  { method: 'GET', path: '/api/projects/{id}/shop-drawings?limit=5', expectedStatus: 200 },
  { method: 'GET', path: '/api/projects/{id}/construction-schedule?limit=5', expectedStatus: 200 },
  { method: 'GET', path: '/api/projects/{id}/materials?limit=5', expectedStatus: 200 },
  { method: 'GET', path: '/api/projects/{id}/payments', expectedStatus: 200 },
  { method: 'GET', path: '/api/projects/{id}/contracts', expectedStatus: 200 },
  { method: 'GET', path: '/api/projects/{id}/issues?status=OPEN', expectedStatus: 200 },
  { method: 'GET', path: '/api/projects/{id}/material-submittals', expectedStatus: 200 },
  { method: 'GET', path: '/api/projects/{id}/payment-requests?status=PENDING', expectedStatus: 200 },
  { method: 'GET', path: '/api/projects/{id}/kpi-targets', expectedStatus: 200 },
  { method: 'GET', path: '/api/projects/{id}/export/construction-schedule.xlsx', expectedStatus: 200 },
  // WRITE
  { method: 'POST', path: '/api/projects/{id}/materials', body: { material_code: 'TEST-FULL-{id}-{ts}', name_vi: 'Test full access' }, expectedStatus: [200, 422] },
  { method: 'POST', path: '/api/projects/{id}/issues', body: { title: 'Test full access issue {id}-{ts}', category: 'PROGRESS', severity: 'MEDIUM' }, expectedStatus: 200 },
];

let totalTests = 0, passed = 0, failed = 0;
const failures = [];

for (const acct of [{ name: 'admin', user: admin.user, token: admin.token }, { name: 'ceo', user: ceo.user, token: ceo.token }]) {
  console.log(`\n=== Test account: ${acct.name} (${acct.user.email}) ===`);
  for (const p of projects) {
    for (const ep of endpoints) {
      totalTests++;
      const path = ep.path.replace('{id}', p.id);
      const url = BASE + path;
      const init = { method: ep.method, headers: { Authorization: 'Bearer ' + acct.token } };
      if (ep.body) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(
          Object.fromEntries(Object.entries(ep.body).map(([k, v]) => [k, typeof v === 'string' ? v.replace('{id}', p.id).replace('{ts}', Date.now()) : v]))
        );
      }
      try {
        const r = await fetch(url, init);
        const status = r.status;
        const expected = Array.isArray(ep.expectedStatus) ? ep.expectedStatus : [ep.expectedStatus];
        if (expected.includes(status)) {
        passed++;
      } else {
        failed++;
        const text = await r.text();
        failures.push({ account: acct.name, project: p.code, method: ep.method, path, expected: expected.join('/'), got: status, body: text.slice(0, 150) });
      }
      } catch (e) {
        failed++;
        failures.push({ account: acct.name, project: p.code, method: ep.method, path, error: e.message });
      }
    }
  }
}

console.log(`\n=== RESULT ===`);
console.log(`Total: ${totalTests}, Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
  console.log(`\nFailures (first 20):`);
  for (const f of failures.slice(0, 20)) {
    console.log(`  ${f.account} @ ${f.project} ${f.method} ${f.path}: expected ${f.expected} got ${f.got}`);
    if (f.body) console.log(`    body: ${f.body}`);
  }
  process.exit(1);
} else {
  console.log('✅ ALL TESTS PASSED - admin/CEO có FULL ACCESS mọi endpoint với mọi project_id');
}
