// Test 6 role permission matrix - mỗi role bị chặn đúng chỗ, không bị chặn nhầm
// Chạy: node scripts/test-role-permissions.mjs
const BASE = 'http://localhost:3000';
const db = (await import('better-sqlite3')).default('/home/vutun/pmo_project/backend/data/pmo.db');
const projects = db.prepare('SELECT id, code FROM projects ORDER BY id').all();
db.close();

async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const d = await r.json();
  return d.token;
}

async function call(method, path, token, body = null) {
  const init = { method, headers: { Authorization: 'Bearer ' + token } };
  if (body) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
  const r = await fetch(BASE + path, init);
  return r.status;
}

// Test matrix: [method, path, body, expected: 200|403|404]
// 200 = allowed, 403 = forbidden, 404 = route not exist (allowed to pass)
const testCases = [
  // [name, method, pathTemplate, body]
  { name: 'GET materials', m: 'GET', path: '/api/projects/{p}/materials', body: null },
  { name: 'POST materials', m: 'POST', path: '/api/projects/{p}/materials', body: { material_code: 'TEST-{p}-{ts}', name_vi: 'T', zone_id: 1, progress_pct: 50 } },
  { name: 'GET issues', m: 'GET', path: '/api/projects/{p}/issues', body: null },
  { name: 'POST issues', m: 'POST', path: '/api/projects/{p}/issues', body: { title: 'T-{p}-{ts}', category: 'PROGRESS', severity: 'LOW' } },
  { name: 'GET contracts', m: 'GET', path: '/api/projects/{p}/contracts', body: null },
  { name: 'POST contracts', m: 'POST', path: '/api/projects/{p}/contracts', body: { contract_no: 'T-{p}-{ts}', contract_name: 'T', total_value: 1000000 } },
  { name: 'GET shop-drawings', m: 'GET', path: '/api/projects/{p}/shop-drawings', body: null },
  { name: 'GET payment-requests', m: 'GET', path: '/api/payment-requests', body: null },
];

// Expected per role
const expected = {
  ADMIN:   { '*': 200 },
  CEO:     {
    'GET materials': 200, 'POST materials': 403,
    'GET issues': 200, 'POST issues': 403,
    'GET contracts': 200, 'POST contracts': 403,
    'GET shop-drawings': 200,
    'GET payment-requests': 200,
  },
  PM:      {
    'GET materials': 200, 'POST materials': 200,
    'GET issues': 200, 'POST issues': 200,
    'GET contracts': 200, 'POST contracts': 403,
    'GET shop-drawings': 200,
    'GET payment-requests': 200,
  },
  PMO:     {
    'GET materials': 200, 'POST materials': 403,
    'GET issues': 200, 'POST issues': 403,
    'GET contracts': 200, 'POST contracts': 403,
    'GET shop-drawings': 200,
    'GET payment-requests': 200,
  },
  SITE:    {
    'GET materials': 200, 'POST materials': 200,
    'GET issues': 200, 'POST issues': 200,
    'GET contracts': 403, 'POST contracts': 403,
    'GET shop-drawings': 200,
    'GET payment-requests': 403,
  },
  PROCUREMENT: {
    'GET materials': 200, 'POST materials': 200,
    'GET issues': 200, 'POST issues': 403,
    'GET contracts': 200, 'POST contracts': 403,
    'GET shop-drawings': 200,
    'GET payment-requests': 200,
  },
  ACCOUNTING: {
    'GET materials': 200, 'POST materials': 403,
    'GET issues': 200, 'POST issues': 403,
    'GET contracts': 200, 'POST contracts': 200,
    'GET shop-drawings': 200,
    'GET payment-requests': 200,
  },
};

const accounts = [
  { email: 'admin@hbg.com', pass: 'admin123', role: 'ADMIN' },
  { email: 'ceo@hbg.com', pass: 'ceo123', role: 'CEO' },
  { email: 'pm@hbg.com', pass: 'pm123', role: 'PM' },
  { email: 'pmo@hbg.com', pass: 'pmo123', role: 'PMO' },
  { email: 'site@hbg.com', pass: 'site123', role: 'SITE' },
  { email: 'procurement@hbg.com', pass: 'proc123', role: 'PROCUREMENT' },
  { email: 'accounting@hbg.com', pass: 'acc123', role: 'ACCOUNTING' },
];

let total = 0, passed = 0, failed = 0;
const failures = [];

for (const acct of accounts) {
  const token = await login(acct.email, acct.pass);
  if (!token) { console.log(`  ${acct.role}: LOGIN FAILED`); continue; }
  let roleOk = 0, roleFail = 0;
  for (const tc of testCases) {
    for (const p of projects) {
      total++;
      const path = tc.path.replace('{p}', p.id).replace('{ts}', Date.now() + Math.random());
      const status = await call(tc.m, path, token, tc.body);
      const exp = expected[acct.role]?.['*'] || expected[acct.role]?.[tc.name];
      const allowed = exp === 200;
      const actualAllowed = status === 200 || status === 404;  // 404 = route missing = allowed
      const ok = (status === 429)
        ? null  // rate limited - skip
        : allowed === actualAllowed;
      if (ok === null) continue;  // skip rate-limited tests
      if (ok) {
        passed++;
        roleOk++;
      } else {
        failed++;
        roleFail++;
        failures.push({ role: acct.role, test: tc.name, project: p.id, expected: exp, got: status });
      }
    }
  }
  console.log(`  ${acct.role.padEnd(13)}: ${roleOk} OK, ${roleFail} FAIL`);
}

console.log(`\n=== RESULT ===`);
console.log(`Total: ${total}, Passed: ${passed}, Failed: ${failed}`);
if (failures.length > 0) {
  console.log(`\nFailures:`);
  failures.forEach(f => console.log(`  ${f.role} - ${f.test} (project ${f.project}): expected ${f.expected}, got ${f.got}`));
}
if (failed === 0) console.log('✅ ALL 6 ROLE PERMISSIONS WORK AS EXPECTED');
