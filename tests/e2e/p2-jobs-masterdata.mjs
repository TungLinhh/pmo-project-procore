// P2-13: jobs escalate locked to admin/ceo (+NULL deadlines never match),
// master-data writes validated per resource with server-side tenant. Real PG + server.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p2-jobs-masterdata.mjs
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3107';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3107' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const siteT = await loginAs('site@hbg.com');
  const adminT = await loginAs('admin@hbg.com');
  const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
  const post = (t, p, b) => fetch(BASE + p, { method: 'POST', headers: H(t), body: JSON.stringify(b) }).then(async r => ({ s: r.status, j: await r.json().catch(() => ({})) }));

  // jobs: site cannot trigger escalation, admin can (0 overdue on demo → count 0, no spam)
  const denied = await post(siteT, '/api/jobs/escalate-tvgs', {});
  ok(denied.s === 403, `site denied escalate trigger (got ${denied.s})`);
  const ran = await post(adminT, '/api/jobs/escalate-tvgs', {});
  ok(ran.s === 200 && typeof ran.j.escalated_count === 'number', `admin triggers escalate (got ${ran.s}/${ran.j.escalated_count})`);
  const st = await fetch(BASE + '/api/jobs/escalate-tvgs/status', { headers: H(adminT) }).then(r => r.json());
  ok(!!st.last_run, 'escalate status tracked');

  // master-data: validation per resource
  const noName = await post(adminT, '/api/master-data/vendors', { code: 'X' });
  ok(noName.s === 400 && /requires: name/.test(noName.j.error || ''), `vendor without name → 400 with hint (got ${noName.s})`);
  const unk = await post(adminT, '/api/master-data/nope', { name: 'x' });
  ok(unk.s === 404, 'unknown resource → 404');
  const v = await post(adminT, '/api/master-data/vendors', { code: `V-${Date.now()}`, name: 'P2-13 Vendor', tenant_id: 999 });
  ok(v.s === 200 && Number(v.j.tenant_id) === 1, `vendor created, tenant forced from user (got ${v.j.tenant_id})`);
  const w = await post(adminT, '/api/master-data/workers', { code: 'W1' });
  ok(w.s === 400 && /requires: full_name/.test(w.j.error || ''), 'worker without full_name → 400');

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  if (v.j?.id) await db.prepare('DELETE FROM vendors WHERE id = ?').runAsync(v.j.id);
  // escalate run notifies real PMs/CEOs — remove the test-run spam (escalated_at marks stay, preventing re-spam)
  if (Array.isArray(ran.j.items) && ran.j.items.length) {
    const ids = ran.j.items.map(i => i.id);
    await db.prepare(`DELETE FROM notifications WHERE resource_type = 'material_submittal' AND resource_id IN (${ids.map(() => '?').join(',')})`).runAsync(...ids);
    ok(true, `escalation spam cleaned (${ids.length} submittals)`);
  }
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
