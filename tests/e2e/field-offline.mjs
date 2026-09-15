// Field offline outbox e2e (Wave 2 B1–B2): enqueue validation + idempotency,
// flush via resolve (CLIENT/SERVER winners), conflict transparency, ownership.
// The browser outbox (localStorage) is thin over this endpoint — covered here.
// Run: node tests/e2e/field-offline.mjs (spawns its own server, needs dev DB)
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3116';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3116' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

const qids = [];
try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const siteT = await loginAs('site@hbg.com');
  const pmT = await loginAs('pm@hbg.com');
  ok(!!siteT && !!pmT, 'site + pm login');
  const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
  const call = (t, m, p, b) => fetch(BASE + p, { method: m, headers: H(t), body: b ? JSON.stringify(b) : undefined }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const item = await db.prepare(
    `SELECT id, progress_pct FROM construction_schedule_items WHERE project_id = 1 AND (progress_pct IS NULL OR progress_pct < 1) ORDER BY id LIMIT 1`
  ).getAsync();
  const beforePct = item.progress_pct;
  const cid = (n) => `field-offline-${Date.now()}-${n}`;

  // 1. Enqueue valid edit → 201 PENDING.
  const e1 = await call(siteT, 'POST', '/api/sync/enqueue', {
    client_id: cid(1), resource_type: 'construction_schedule_item',
    server_record_id: item.id, resource_json: { progress_pct: 0.5 },
  });
  ok(e1.s === 201 && e1.j.status === 'PENDING', `enqueue 201 PENDING (got ${e1.s})`);
  qids.push(e1.j.id);
  // 2. Replay same client_id → deduped, no new row.
  const e2 = await call(siteT, 'POST', '/api/sync/enqueue', {
    client_id: e1.j.client_id, resource_type: 'construction_schedule_item',
    server_record_id: item.id, resource_json: { progress_pct: 0.5 },
  });
  ok(e2.s === 200 && e2.j.deduped === true && e2.j.id === e1.j.id, 'replay dedupes');
  // 3. Shape rejections (shared allowlist — same verdicts as apply path).
  const b1 = await call(siteT, 'POST', '/api/sync/enqueue', { client_id: cid(2), resource_type: 'payments', server_record_id: 1, resource_json: { amount: 5 } });
  ok(b1.s === 422, `off-allowlist type → 422 (got ${b1.s})`);
  const b2 = await call(siteT, 'POST', '/api/sync/enqueue', { client_id: cid(3), resource_type: 'construction_schedule_item', server_record_id: item.id, resource_json: { progress_pct: 5 } });
  ok(b2.s === 422, `bad value → 422 (got ${b2.s})`);
  const b3 = await call(siteT, 'POST', '/api/sync/enqueue', { resource_type: 'construction_schedule_item', server_record_id: item.id, resource_json: { progress_pct: 0.5 } });
  ok(b3.s === 400, `missing client_id → 400 (got ${b3.s})`);
  const b4 = await call(siteT, 'POST', '/api/sync/enqueue', { client_id: cid(4), resource_type: 'construction_schedule_item', server_record_id: item.id, resource_json: { note: 'not allowlisted' } });
  ok(b4.s === 400, `no appliable fields → 400 (got ${b4.s})`);
  // 4. Flush via CLIENT winner → server updated.
  const r1 = await call(siteT, 'POST', '/api/sync/resolve', { queue_id: e1.j.id, winner: 'CLIENT' });
  ok(r1.s === 200, `resolve CLIENT (got ${r1.s})`);
  const cur = await db.prepare('SELECT progress_pct FROM construction_schedule_items WHERE id = ?').getAsync(item.id);
  ok(Number(cur.progress_pct) === 0.5, `server shows offline value (got ${cur.progress_pct})`);
  // 5. Conflict transparency: online moves to 0.7, offline said 0.6.
  await db.prepare('UPDATE construction_schedule_items SET progress_pct = 0.7 WHERE id = ?').runAsync(item.id);
  const e3 = await call(siteT, 'POST', '/api/sync/enqueue', {
    client_id: cid(5), resource_type: 'construction_schedule_item',
    server_record_id: item.id, resource_json: { progress_pct: 0.6 },
  });
  qids.push(e3.j.id);
  const r2 = await call(siteT, 'POST', '/api/sync/resolve', { queue_id: e3.j.id, winner: 'CLIENT' });
  const cur2 = await db.prepare('SELECT progress_pct FROM construction_schedule_items WHERE id = ?').getAsync(item.id);
  ok(r2.s === 200 && Number(cur2.progress_pct) === 0.6, 'explicit CLIENT winner overwrites (last-write-wins, visible)');
  const e4 = await call(siteT, 'POST', '/api/sync/enqueue', {
    client_id: cid(6), resource_type: 'construction_schedule_item',
    server_record_id: item.id, resource_json: { progress_pct: 0.9 },
  });
  qids.push(e4.j.id);
  const r3 = await call(siteT, 'POST', '/api/sync/resolve', { queue_id: e4.j.id, winner: 'SERVER' });
  const cur3 = await db.prepare('SELECT progress_pct FROM construction_schedule_items WHERE id = ?').getAsync(item.id);
  ok(r3.s === 200 && Number(cur3.progress_pct) === 0.6, 'SERVER winner keeps server value');
  // 6. Ownership: site cannot resolve pm's item.
  const e5 = await call(pmT, 'POST', '/api/sync/enqueue', {
    client_id: cid(7), resource_type: 'construction_schedule_item',
    server_record_id: item.id, resource_json: { progress_pct: 0.1 },
  });
  qids.push(e5.j.id);
  const r4 = await call(siteT, 'POST', '/api/sync/resolve', { queue_id: e5.j.id, winner: 'CLIENT' });
  ok(r4.s === 403, `foreign resolve → 403 (got ${r4.s})`);
  // 7. Queue lists own pendings.
  const q = await call(siteT, 'GET', '/api/sync/queue');
  ok(q.s === 200 && Array.isArray(q.j), 'queue lists');
  // Restore fixture progress.
  await db.prepare('UPDATE construction_schedule_items SET progress_pct = ? WHERE id = ?').runAsync(beforePct, item.id);
} finally {
  if (qids.length) {
    const { getDb } = await import('../../backend/src/db/index.js');
    const db = getDb();
    for (const id of qids) await db.prepare('DELETE FROM offline_sync_queue WHERE id = ?').runAsync(id).catch(() => {});
  }
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
