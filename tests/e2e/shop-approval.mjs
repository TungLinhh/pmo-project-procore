// E2E test L1-L5 (no process.exit) — env-driven (BASE_URL, PGHOST/PGPORT/…/PSQL_BIN)
import { psqlQuery, apiBase } from '../tools/env.mjs';

const BASE = apiBase();
let pass = 0, fail = 0;
function ok(name, detail) { pass++; console.log(`  ✅ ${name}: ${detail}`); }
function ng(name, detail) { fail++; console.log(`  ❌ ${name}: ${detail}`); }

async function api(token, path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(BASE + path, { ...opts, headers });
  const t = await r.text();
  let data; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data };
}

function exec(sql) {
  return psqlQuery(sql);
}

console.log('=== Login ===');
const login = await api(null, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
console.log('login status:', login.status, 'has token:', !!login.data?.token);
const T = login.data?.token;
if (!T) { console.log('NO TOKEN'); process.exit(1); }
ok('login', 'admin@hbg.com');

console.log('\n=== L1-L5 Shop Approval ===');
try {
  const projectId = 1; // project 1 có zones
  const zoneId = parseInt(exec(`SELECT id FROM zones WHERE project_id = ${projectId} LIMIT 1`));
  console.log('zoneId:', zoneId);

  const createSd = await api(T, `/api/shop-drawings`, { method: 'POST', body: JSON.stringify({
    project_id: projectId, zone_id: zoneId, drawing_code: `TEST-L5-${Date.now()}`, name_vi: 'Test L5'
  }) });
  console.log('create status:', createSd.status, 'data:', JSON.stringify(createSd.data).slice(0, 200));
  ok('create', `id=${createSd.data?.id}`);
  const sdId = createSd.data?.id;
  if (!sdId) throw new Error('no sdId');

  const submit = await api(T, `/api/shop-drawings/${sdId}/transition`, { method: 'POST', body: JSON.stringify({ to_status: 'SUBMITTED' }) });
  console.log('submit status:', submit.status);
  ok('submit', `status=${submit.data?.status}`);

  for (let lvl = 1; lvl <= 5; lvl++) {
    const r = await api(T, `/api/shop-drawings/${sdId}/approve-level`, { method: 'POST', body: JSON.stringify({ level: lvl, response: 'P' }) });
    console.log(`L${lvl} status:`, r.status, JSON.stringify(r.data).slice(0, 150));
    if (lvl === 5 && r.data?.status === 'APPROVED') ok(`L${lvl} final`, `APPROVED`);
    else if (r.status === 200) ok(`L${lvl}`, `pass`);
    else ng(`L${lvl}`, JSON.stringify(r.data).slice(0, 100));
  }

  const state = await api(T, `/api/shop-drawings/${sdId}/approval-state`);
  console.log('state:', JSON.stringify(state.data).slice(0, 300));
  const passedCount = state.data?.levels?.filter(l => l.response === 'P').length || 0;
  ok('approval-state', `passed=${passedCount}/5 fully=${state.data?.is_fully_approved}`);
} catch (e) {
  ng('L1-L5 block', e.message);
  console.error('Stack:', e.stack);
}

console.log('\n=== TVGS Escalation ===');
try {  const projectId = 1;
  const yesterday = new Date(Date.now() - 86400000 * 5).toISOString().slice(0, 10);

  const msCreate = await api(T, `/api/material-submittals`, { method: 'POST', body: JSON.stringify({
    project_id: projectId, submittal_code: `TEST-ESC-${Date.now()}`, sla_days: 7, supervisor_approval_days: 3
  }) });
  console.log('msCreate status:', msCreate.status, 'data:', JSON.stringify(msCreate.data).slice(0, 150));
  const msId = msCreate.data?.id;
  ok('create submittal', `id=${msId}`);

  if (msId) {
    await api(T, `/api/material-submittals/${msId}/submit`, { method: 'POST' });
    exec(`UPDATE material_submittals SET supervisor_deadline = '${yesterday}', escalated_at = NULL WHERE id = ${msId}`);

    const esc = await api(T, `/api/jobs/escalate-tvgs`, { method: 'POST' });
    console.log('escalation:', JSON.stringify(esc.data).slice(0, 300));
    ok('run escalation', `count=${esc.data?.escalated_count}`);

    const isEsc = exec(`SELECT escalated_at IS NOT NULL FROM material_submittals WHERE id = ${msId}`) === 't';
    ok('marked escalated', isEsc ? 'yes' : 'no');

    const esc2 = await api(T, `/api/jobs/escalate-tvgs`, { method: 'POST' });
    ok('idempotency', `2nd count=${esc2.data?.escalated_count}`);
  }
} catch (e) {
  ng('escalation block', e.message);
  console.error('Stack:', e.stack);
}

console.log(`\n=== Results: ${pass}/${pass + fail} PASS ===`);

// Cleanup: throwaways live on real project 1 — remove by code pattern.
try {
  exec(`DELETE FROM notifications WHERE resource_type = 'material_submittal' AND resource_id IN (SELECT id FROM material_submittals WHERE submittal_code LIKE 'TEST-ESC-%');`);
  exec(`DELETE FROM shop_drawings WHERE drawing_code LIKE 'TEST-L5-%';`);
  exec(`DELETE FROM material_submittals WHERE submittal_code LIKE 'TEST-ESC-%';`);
  console.log('cleanup: TEST-L5/TEST-ESC rows + escalation spam removed');
} catch (e) { console.log('cleanup failed:', e.message.slice(0, 100)); }
process.exit(fail === 0 ? 0 : 1);
