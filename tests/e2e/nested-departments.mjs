// Nested departments e2e (Wave D2): parent assignment, bottom-up chain
// resolution, child override wins, cycle 422, cross-tenant parent 404.
// Scratch HBG departments, fully cleaned in finally.
// Run: node tests/e2e/nested-departments.mjs (spawns its own server, needs dev DB)
import { waitForServer } from './lib.mjs';
import { cleanupRowsOnExit } from './lib-cleanup.mjs';
import { spawn } from 'node:child_process';


// Bài này tạo PARENT/CHILD và **không** dọn: chạy 2 lần là 4 cặp dòng, và
// `p5-golden.mjs` kiểm đúng số bộ phận của tenant hbg nên đỏ theo.
cleanupRowsOnExit([
  ['departments', "code LIKE 'PARENT-%'"],
  ['departments', "code LIKE 'CHILD-%'"],
], { label: 'nested-departments' });
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3120';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3120' }, stdio: 'ignore' });
await waitForServer(BASE);

const stamp = Date.now();
const created = { depts: [], chains: [] };
try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const adminT = await loginAs('admin@hbg.com');
  ok(!!adminT, 'admin login');
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminT}` };
  const call = (m, p, b) => fetch(BASE + p, { method: m, headers: H, body: b ? JSON.stringify(b) : undefined }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const mk = async (code, parent = null) => {
    const r = await call('POST', '/api/master-data/departments', { code: `${code}-${stamp}`, name_vi: code, parent_id: parent });
    if (r.s === 200 && r.j?.id) created.depts.push(r.j.id);
    return r;
  };

  // 1. Parent + child creation. Tạo mới trả **201** (`routes/master-data.js:174`)
  // — bản cũ kỳ vọng 200 nên đỏ 2 khẳng định mà không báo lý do.
  const par = await mk('PARENT');
  ok(par.s === 201, `parent created (got ${par.s})`);
  const chi = await mk('CHILD', par.j.id);
  ok(chi.s === 201, `child with parent (got ${chi.s})`);
  // 2. Cross-tenant parent → 404 (pilot KT department).
  const pilotDept = await db.prepare(`SELECT id FROM departments WHERE tenant_id = (SELECT id FROM tenants WHERE code = 'PILOT') ORDER BY id LIMIT 1`).getAsync();
  const x = await mk('XEN', pilotDept.id);
  ok(x.s === 404, `cross-tenant parent → 404 (got ${x.s})`);
  // 3. Self-parent + cycle → 422.
  const s1 = await call('PATCH', `/api/master-data/departments/${chi.j.id}`, { parent_id: chi.j.id });
  ok(s1.s === 422, `self-parent → 422 (got ${s1.s})`);
  const cyc = await call('PATCH', `/api/master-data/departments/${par.j.id}`, { parent_id: chi.j.id });
  ok(cyc.s === 422 && /cycle/i.test(cyc.j?.error || ''), `cycle names path (got ${cyc.s}: ${cyc.j?.error})`);
  // 4. Chain on parent only → child project resolves it (bottom-up).
  const ch1 = await call('POST', '/api/approval-chains', { department_id: par.j.id, resource_type: 'shop_drawing', levels: [{ level: 1, role: 'PM', label: '' }] });
  ok(ch1.s === 200, `chain on parent (got ${ch1.s})`);
  created.chains.push(ch1.j.id);
  const { resolveChain } = await import('../../backend/src/lib/approval.js');
  // Simulate: project in child dept resolves parent chain (direct lib call).
  const proj = await db.prepare(`SELECT id FROM projects WHERE code = 'BTE-WP4-HBC'`).getAsync();
  const origDept = await db.prepare('SELECT department_id FROM projects WHERE id = ?').getAsync(proj.id);
  await db.prepare('UPDATE projects SET department_id = ? WHERE id = ?').runAsync(chi.j.id, proj.id);
  const got = await resolveChain(db, 1, proj.id, 'shop_drawing');
  ok(Array.isArray(got) && got.length === 1 && got[0].role === 'PM', 'child inherits parent chain');
  // 5. Child override wins over parent.
  const ch2 = await call('POST', '/api/approval-chains', { department_id: chi.j.id, resource_type: 'shop_drawing', levels: [{ level: 1, role: 'ADMIN', label: '' }] });
  created.chains.push(ch2.j.id);
  const got2 = await resolveChain(db, 1, proj.id, 'shop_drawing');
  ok(got2[0].role === 'ADMIN', 'child override wins');
  await db.prepare('UPDATE projects SET department_id = ? WHERE id = ?').runAsync(origDept.department_id, proj.id);
  // 6. Detach to root.
  const det = await call('PATCH', `/api/master-data/departments/${chi.j.id}`, { parent_id: null });
  ok(det.s === 200 && det.j.parent_id === null, 'detach to root');
} finally {
  if (created.chains.length || created.depts.length) {
    const { getDb } = await import('../../backend/src/db/index.js');
    const db = getDb();
    for (const id of created.chains) await db.prepare('DELETE FROM approval_chains WHERE id = ?').runAsync(id).catch(() => {});
    for (const id of [...created.depts].reverse()) await db.prepare('DELETE FROM departments WHERE id = ?').runAsync(id).catch(() => {});
  }
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
