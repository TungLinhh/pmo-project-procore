// P1-06: list filters honored; business-processes list works; Approval queues hit real endpoints.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-06-filters.mjs
import { spawn, execSync } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3206';
const PSQL = 'PGPASSWORD=pmo_dev_pwd /home/linuxbrew/.linuxbrew/bin/psql -h 127.0.0.1 -p 5433 -U pmo_user -d pmo -t -A';
const psql = (sql) => execSync(`${PSQL} -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim();

const stamp = Date.now();
const pcode = `P1-06-${stamp}`;
psql(`INSERT INTO projects (tenant_id, code, name_vi) VALUES (1, '${pcode}', 'filter test') ON CONFLICT DO NOTHING;`);
const pid = psql(`SELECT id FROM projects WHERE tenant_id=1 AND code='${pcode}';`);
const zid = psql(`INSERT INTO zones (project_id, code, name_en) VALUES (${pid}, 'F1', 'f1') RETURNING id;`).split('\n')[0];
// schedule: 2 zones, searchable names, distinct statuses
psql(`INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, status, plan_end_date) VALUES
 (${pid}, ${zid}, 's', 1, 'unique-wall-p106', 'ACTIVE', CURRENT_DATE),
 (${pid}, ${zid}, 's', 2, 'other slab', 'DONE', CURRENT_DATE);`);
const zid2 = psql(`INSERT INTO zones (project_id, code, name_en) VALUES (${pid}, 'F2', 'f2') RETURNING id;`).split('\n')[0];
psql(`INSERT INTO construction_schedule_items (project_id, zone_id, source_sheet, ordinal, name_vi, status) VALUES (${pid}, ${zid2}, 's', 3, 'third item', 'ACTIVE');`);
// shop: DRAFT + SUBMITTED with same prefix
const sd = `P106-${stamp}`;
psql(`INSERT INTO shop_drawings (project_id, zone_id, drawing_code, name_vi, status) VALUES (${pid}, ${zid}, '${sd}-D', 'draft dw', 'DRAFT'), (${pid}, ${zid}, '${sd}-S', 'sent dw', 'SUBMITTED');`);
// issues with severities/categories
psql(`INSERT INTO issues (tenant_id, project_id, title, severity, status, category) VALUES (1, ${pid}, 'i-crit', 'CRITICAL', 'OPEN', 'safety'), (1, ${pid}, 'i-low', 'LOW', 'OPEN', 'quality'), (1, ${pid}, 'i-closed', 'LOW', 'CLOSED', 'safety');`);
// submittal SUBMITTED + payment PENDING chain
const msid = psql(`INSERT INTO material_submittals (project_id, submittal_code, status) VALUES (${pid}, 'MS-P106-${stamp}', 'SUBMITTED') RETURNING id;`).split('\n')[0];
const coid = psql(`INSERT INTO contracts (project_id, contract_no) VALUES (${pid}, 'CT-P106-${stamp}') RETURNING id;`).split('\n')[0];
const invid = psql(`INSERT INTO invoices (contract_id, invoice_no, amount, status) VALUES (${coid}, 'INV-P106-${stamp}', 1000, 'SUBMITTED') RETURNING id;`).split('\n')[0];
const prid = psql(`INSERT INTO payment_requests (invoice_id, request_no, amount, status) VALUES (${invid}, 'PR-P106-${stamp}', 1000, 'PENDING') RETURNING id;`).split('\n')[0];

const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3206' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const H = { Authorization: `Bearer ${token}` };
  const get = (p) => fetch(BASE + p, { headers: H }).then(r => r.json());

  const schedSearch = await get(`/api/projects/${pid}/construction-schedule?search=unique-wall-p106`);
  ok(schedSearch.length === 1, `schedule search filters (got ${schedSearch.length})`);
  const schedZone = await get(`/api/projects/${pid}/construction-schedule?zone=F2`);
  ok(schedZone.length === 1 && schedZone[0].zone_code === 'F2', `schedule zone filters (got ${schedZone.length})`);
  const schedStatus = await get(`/api/projects/${pid}/construction-schedule?status=DONE`);
  ok(schedStatus.length === 1, `schedule status filters (got ${schedStatus.length})`);

  const shopF = await get(`/api/projects/${pid}/shop-drawings?status=SUBMITTED`);
  ok(shopF.length === 1 && shopF[0].drawing_code === `${sd}-S`, `shop status filters (got ${shopF.length})`);
  const shopS = await get(`/api/projects/${pid}/shop-drawings?search=${sd}-D`);
  ok(shopS.length === 1, `shop search filters (got ${shopS.length})`);
  const shopG = await get(`/api/shop-drawings?project_id=${pid}&status=SUBMITTED`);
  ok(shopG.length === 1, `global shop queue endpoint works (got ${shopG.length})`);

  const issSev = await get(`/api/projects/${pid}/issues?severity=CRITICAL`);
  ok(issSev.length === 1, `issues severity filters (got ${issSev.length})`);
  const issCat = await get(`/api/projects/${pid}/issues?category=safety`);
  ok(issCat.length === 2, `issues category filters (got ${issCat.length})`);
  const issSt = await get(`/api/projects/${pid}/issues?status=CLOSED`);
  ok(issSt.length === 1, `issues status filters (got ${issSt.length})`);

  const msF = await get(`/api/material-submittals?project_id=${pid}&status=SUBMITTED`);
  ok(msF.length === 1, `submittal queue endpoint works (got ${msF.length})`);
  const ms400 = await fetch(BASE + '/api/material-submittals', { headers: H });
  ok(ms400.status === 400, `submittal list without project_id → 400 (got ${ms400.status})`);

  const prF = await get(`/api/projects/${pid}/payment-requests?status=PENDING`);
  ok(prF.length === 1 && String(prF[0].id) === String(prid), `payment queue endpoint works (got ${prF.length})`);

  const bp = await get('/api/master-data/business-processes');
  ok(Array.isArray(bp), `business-processes list → 200 array (got ${Array.isArray(bp) ? bp.length : typeof bp})`);

  const mat = await get(`/api/projects/${pid}/materials?limit=1`);
  ok(Array.isArray(mat), 'materials limit honored without crash');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
  psql(`DELETE FROM payment_requests WHERE id=${prid}; DELETE FROM invoices WHERE id=${invid}; DELETE FROM contracts WHERE id=${coid}; DELETE FROM material_submittals WHERE id=${msid}; DELETE FROM issues WHERE project_id=${pid}; DELETE FROM shop_drawings WHERE project_id=${pid}; DELETE FROM construction_schedule_items WHERE project_id=${pid}; DELETE FROM zones WHERE id IN (${zid},${zid2}); DELETE FROM projects WHERE id=${pid};`);
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
