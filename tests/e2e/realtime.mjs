// Realtime SSE e2e (Wave D3): stream hello + fan-out to the right user only,
// cross-tenant nothing, approval.decided on submittal decision, unauth 401.
// Raw HTTP (EventSource semantics verified separately in the browser suite).
// Run: node tests/e2e/realtime.mjs (spawns its own server, needs dev DB)
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3121';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3121' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

// Minimal SSE client over fetch (no EventSource in Node 26 test env needed).
async function listen(token, onEvent, ms = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(BASE + `/api/stream?token=${encodeURIComponent(token)}`, { signal: ctrl.signal });
    if (r.status !== 200) return { status: r.status };
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (!raw.trim() || raw.trim().startsWith(':')) continue; // heartbeat/comment
        const type = (/^event: (.*)$/m.exec(raw) || [])[1] || 'message';
        const data = (/^data: (.*)$/m.exec(raw) || [])[1] || '';
        if (type === 'hello') continue;
        onEvent({ type, data: JSON.parse(data || '{}') });
      }
    }
  } catch { /* abort = end of window */ }
  finally { clearTimeout(timer); }
  return { status: 200 };
}

try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const adminT = await loginAs('admin@hbg.com');
  const siteT = await loginAs('site@hbg.com');
  const pilotT = await loginAs('admin@pilot.test');
  ok(!!adminT && !!siteT && !!pilotT, 'three logins');
  const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

  // 1. Unauthenticated stream → 401.
  const u = await listen('bogus-token', () => {}, 2000);
  ok(u.status === 401, `bad token → 401 (got ${u.status})`);

  // 2. Site listens; an admin directive (server-side notify path) fans out.
  const adminEvents = [];
  const siteEvents = [];
  const pilotEvents = [];
  const listeners = Promise.all([
    listen(adminT, (e) => adminEvents.push(e)),
    listen(siteT, (e) => siteEvents.push(e)),
    listen(pilotT, (e) => pilotEvents.push(e)),
  ]);
  await new Promise(r => setTimeout(r, 1200)); // let streams attach
  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const siteUser = await db.prepare(`SELECT id FROM users WHERE email = 'site@hbg.com'`).getAsync();
  const hbgProj = await db.prepare(`SELECT id FROM projects WHERE code = 'BTE-WP4-HBC'`).getAsync();
  const Hadmin = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminT}` };
  const dir = await fetch(BASE + '/api/directives', {
    method: 'POST', headers: Hadmin,
    body: JSON.stringify({ project_id: hbgProj.id, body: 'RT-PROBE directive', notify_to_user_ids: [siteUser.id] }),
  }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));
  const directiveId = dir.j?.id;
  await listeners;

  const adminGot = adminEvents.filter((e) => e.type === 'notification.created');
  const siteGot = siteEvents.filter((e) => e.type === 'notification.created');
  ok(siteGot.length >= 1, `target user receives event (got ${siteGot.length})`);
  ok(adminGot.length === 0, `non-target HBG admin gets nothing (got ${adminGot.length})`);
  ok(pilotEvents.length === 0, `cross-tenant gets nothing (got ${pilotEvents.length})`);
  if (directiveId) await db.prepare('DELETE FROM directives WHERE id = ?').runAsync(directiveId).catch(() => {});
  await db.prepare(`DELETE FROM notifications WHERE body = 'RT-PROBE directive'`).runAsync().catch(() => {});

  // 3. Approval decision fans out to tenant admins (scratch submittal).
  const adminEvents2 = [];
  const l2 = listen(adminT, (e) => adminEvents2.push(e));
  await new Promise(r => setTimeout(r, 800));
  const hbg = await db.prepare(`SELECT id FROM projects WHERE code = 'BTE-WP4-HBC'`).getAsync();
  const sub = await db.prepare(
    `INSERT INTO material_submittals (project_id, submittal_code, status) VALUES (?, 'RT-DECIDE-1', 'SUBMITTED') RETURNING id`
  ).runAsync(hbg.id);
  const subId = Number(sub.lastInsertRowid);
  await fetch(BASE + `/api/material-submittals/${subId}/approve`, { method: 'POST', headers: H(adminT) });
  await l2;
  const decided = adminEvents2.filter((e) => e.type === 'approval.decided');
  ok(decided.length >= 1 && decided[0].data.decision === 'APPROVED', `approval.decided reaches admin (got ${decided.length})`);
  await db.prepare('DELETE FROM material_submittals WHERE id = ?').runAsync(subId).catch(() => {});
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
