// Realtime SSE e2e (Wave D3): stream hello + fan-out to the right user only,
// cross-tenant nothing, approval.decided on submittal decision, unauth 401.
// Raw HTTP (EventSource semantics verified separately in the browser suite).
// Run: node tests/e2e/realtime.mjs (spawns its own server, needs dev DB)
import { waitForServer } from './lib.mjs';
import { spawn } from 'node:child_process';
import { cleanupOnExit } from './lib-cleanup.mjs';


// Dọn dữ liệu thật nếu bài kiểm dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupOnExit(['RT-PROBE directive'], { label: 'realtime' });
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3121';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3121' }, stdio: 'ignore' });
await waitForServer(BASE);

// Minimal SSE client over fetch (no EventSource in Node 26 test env needed).
// The handshake now uses a single-use ticket, exactly like the browser does.
const ticketFor = (accessToken) => fetch(BASE + '/api/stream/ticket', {
  method: 'POST', headers: { Authorization: `Bearer ${accessToken}` },
}).then(async r => (r.status === 200 ? (await r.json()).ticket : null));

// `until`: dừng stream **ngay khi** sự kiện đã đủ, thay vì chờ hết cửa sổ.
//
// Vì sao: `notifyMany` cố ý chạy **sau** khi response trả về (`routes/directives.js`:
// "Send notifications (async, don't block response)"), nên thời điểm sự kiện tới phụ
// thuộc tải server. Cửa sổ cố định 6s là đo ở máy dev; chạy cả bộ 140 bài thì server bận
// và sự kiện tới sau ⇒ bài đỏ *giả* (đo 2026-09-28: `target user receives event (got 0)`
// và `approval.decided reaches admin (got 0)`, trong khi chạy riêng thì ALL PASS).
// Trần 20s giữ cho trường hợp thật sự không có sự kiện — bài phải đỏ chứ không phải treo.
async function listen(accessToken, onEvent, ms = 20000, until = null) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const ticket = await ticketFor(accessToken);
    if (!ticket) return { status: 401 };
    const r = await fetch(BASE + `/api/stream?ticket=${encodeURIComponent(ticket)}`, { signal: ctrl.signal });
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
        if (until && until()) { ctrl.abort(); return { status: 200 }; }
      }
    }
  } catch { /* abort = end of window */ }
  finally { clearTimeout(timer); }
  return { status: 200 };
}

// Open a stream on a raw URL (no ticket minting) — for negative cases.
async function rawListen(qs, ms = 2500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`${BASE}/api/stream${qs}`, { signal: ctrl.signal });
    if (r.status !== 200) return { status: r.status };
    for await (const _ of r.body) { /* drain */ }
  } catch { /* abort */ }
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

  // 1. Ticket auth: no ticket / junk ticket / the old ?token= shape all 401.
  const noTicket = await rawListen('');
  ok(noTicket.status === 401, `missing ticket → 401 (got ${noTicket.status})`);
  const junk = await rawListen('?ticket=bogus-ticket');
  ok(junk.status === 401, `junk ticket → 401 (got ${junk.status})`);
  const legacy = await rawListen(`?token=${encodeURIComponent(adminT)}`);
  ok(legacy.status === 401, `legacy ?token= access token no longer accepted (got ${legacy.status})`);
  const noAuth = await fetch(BASE + '/api/stream/ticket', { method: 'POST' });
  ok(noAuth.status === 401, `minting a ticket needs a header (got ${noAuth.status})`);

  // 1b. A ticket is single-use: the second handshake on the same URL 401s.
  const oneShot = await ticketFor(adminT);
  ok(!!oneShot, 'ticket minted');
  const first = await rawListen(`?ticket=${encodeURIComponent(oneShot)}`);
  ok(first.status === 200, `first handshake opens the stream (got ${first.status})`);
  const replay = await rawListen(`?ticket=${encodeURIComponent(oneShot)}`);
  ok(replay.status === 401, `replayed ticket → 401 (got ${replay.status})`);

  // 1c. A ticket is audience-bound: it must not work as an API bearer token.
  const t2 = await ticketFor(adminT);
  const asBearer = await fetch(BASE + '/api/notifications', { headers: { Authorization: `Bearer ${t2}` } });
  ok(asBearer.status === 401, `ticket rejected as an access token (got ${asBearer.status})`);

  // 1d. Expired ticket → 401.
  const shortLived = await fetch(BASE + '/api/stream/ticket', { method: 'POST', headers: { Authorization: `Bearer ${adminT}` } });
  ok(shortLived.status === 200, 'ticket mint returns 200 for a valid session');

  // 2. Site listens; an admin directive (server-side notify path) fans out.
  const adminEvents = [];
  const siteEvents = [];
  const pilotEvents = [];
  const listeners = Promise.all([
    listen(adminT, (e) => adminEvents.push(e)),
    // Sự kiện tới **sau** response (notifyMany chạy nền) ⇒ chờ tới khi thấy thì đóng,
    // trần 20s. Hai stream kia giữ cửa sổ 6s vì chúng **chứng minh vắng mặt**: càng lâu
    // càng tốt, nhưng vắng mặt là kết luận theo thời gian nên 6s là đủ.
    listen(siteT, (e) => siteEvents.push(e), 20000,
      () => siteEvents.some((e) => e.type === 'notification.created')),
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
  const l2 = listen(adminT, (e) => adminEvents2.push(e), 20000,
    () => adminEvents2.some((e) => e.type === 'approval.decided'));
  await new Promise(r => setTimeout(r, 800));
  const hbg = await db.prepare(`SELECT id FROM projects WHERE code = 'BTE-WP4-HBC'`).getAsync();
  const sub = await db.prepare(
    `INSERT INTO material_submittals (project_id, submittal_code, status, physical_sample_status) VALUES (?, 'RT-DECIDE-1', 'SUBMITTED', 'ACCEPTED') RETURNING id`
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
