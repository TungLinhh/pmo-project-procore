// P1-02: sync queue reads offline_sync_queue; resolve applies or rejects loudly.
// CLIENT + appliable payload → 200 and the server record changes.
// CLIENT + no record / unknown type → 422 (never silent). Comparison advisory kept.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-02-sync.mjs
import { spawn, execSync } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3202';
const PSQL = 'PGPASSWORD=pmo_dev_pwd /home/linuxbrew/.linuxbrew/bin/psql -h 127.0.0.1 -p 5433 -U pmo_user -d pmo -t -A';
const psql = (sql) => execSync(`${PSQL} -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8' }).trim().split('\n')[0];

const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3202' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token, user } = await login.json();
  const H = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const targetId = psql(`SELECT id FROM construction_schedule_items WHERE project_id = 1 LIMIT 1;`);
  const orig = psql(`SELECT progress_pct FROM construction_schedule_items WHERE id = ${targetId};`);

  // appliable CLIENT payload, old client_timestamp (server receipt newer)
  const qid = psql(`INSERT INTO offline_sync_queue (user_id, resource_type, server_record_id, resource_json, client_timestamp, status) VALUES (${user.id}, 'construction_schedule_item', ${targetId}, '{"progress_pct": 0.5}', now() - INTERVAL '2 hours', 'PENDING') RETURNING id;`);
  const q = await fetch(BASE + '/api/sync/queue', { headers: H }).then(r => r.json());
  ok(Array.isArray(q) && q.some(x => String(x.id) === String(qid)), `queue lists seeded item (got ${q.length} rows)`);

  const res = await fetch(BASE + '/api/sync/resolve', { method: 'POST', headers: H, body: JSON.stringify({ queue_id: Number(qid), winner: 'CLIENT' }) }).then(r => r.json());
  ok(res.ok && res.winner === 'CLIENT', `CLIENT apply ok (got ${JSON.stringify(res).slice(0, 120)})`);
  ok(res.comparison && res.comparison.winner === 'SERVER', `timestamp comparison meaningful, not EQUAL-by-NaN (got ${res.comparison?.winner})`);
  const st = psql(`SELECT status || '/' || conflict_resolution FROM offline_sync_queue WHERE id=${qid};`);
  ok(st === 'RESOLVED/CLIENT_NEWER', `row records explicit winner (got ${st})`);
  ok(Number(psql(`SELECT progress_pct FROM construction_schedule_items WHERE id = ${targetId};`)) === 0.5, 'server record actually changed');

  // CLIENT with nothing to apply onto → loud 422
  const q2 = psql(`INSERT INTO offline_sync_queue (user_id, resource_type, resource_json, client_timestamp, status) VALUES (${user.id}, 'daily_report', '{"a":1}', now(), 'PENDING') RETURNING id;`);
  const loud = await fetch(BASE + '/api/sync/resolve', { method: 'POST', headers: H, body: JSON.stringify({ queue_id: Number(q2), winner: 'CLIENT' }) });
  ok(loud.status === 422, `CLIENT without record → 422 (got ${loud.status})`);

  // validation + 404 paths
  const bad = await fetch(BASE + '/api/sync/resolve', { method: 'POST', headers: H, body: JSON.stringify({}) });
  ok(bad.status === 400, `missing args → 400 (got ${bad.status})`);
  const nf = await fetch(BASE + '/api/sync/resolve', { method: 'POST', headers: H, body: JSON.stringify({ queue_id: 999999999, winner: 'SERVER' }) });
  ok(nf.status === 404, `unknown id → 404 (got ${nf.status})`);

  psql(`UPDATE construction_schedule_items SET progress_pct = ${orig} WHERE id = ${targetId};`);
  psql(`DELETE FROM offline_sync_queue WHERE id IN (${qid}, ${q2}); DELETE FROM audit_log WHERE action = 'SYNC_APPLY' AND resource_id = ${targetId};`);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
