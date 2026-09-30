// FAST + webhooks e2e (Wave D4): connector profiles, FAST push/pull against a
// local HTTP stub (asserts Bearer auth + body), webhook ping with HMAC verify,
// retry-then-log on dead endpoint, event fan-out on payment approval.
// Self-cleaning (profiles + logs removed). No real network beyond localhost.
// Run: node tests/e2e/erp-fast-webhook.mjs (spawns its own server, needs dev DB)
import { waitForServer } from './lib.mjs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3122';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3122', TEST_FAST_SECRET: 'fast-test-token', TEST_WH_SECRET: 'wh-test-secret' }, stdio: 'ignore' });
await waitForServer(BASE);

// Local stubs: FAST API (Bearer check) + webhook receiver (HMAC verify).
const seen = { fast: [], webhooks: [] };
const stub = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.url === '/api/prs') {
      seen.fast.push({ auth: req.headers.authorization, body: JSON.parse(body || '{}') });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (req.url === '/api/vendors') {
      seen.fast.push({ auth: req.headers.authorization, vendors: true });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ vendors: [{ name: 'FAST Vendor A', tax_id: '0309990001' }] }));
    }
    if (req.url === '/hook') {
      const sig = req.headers['x-pmo-signature'];
      const good = sig === createHmac('sha256', 'wh-test-secret').update(body).digest('hex');
      seen.webhooks.push({ event: req.headers['x-pmo-event'], good, body: JSON.parse(body || '{}') });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true }));
    }
    res.writeHead(404);
    res.end();
  });
});
await new Promise((r) => stub.listen(0, '127.0.0.1', r));
const stubPort = stub.address().port;

const created = { profiles: [] };
try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const adminT = await loginAs('admin@hbg.com');
  const acctT = await loginAs('accounting@hbg.com');
  ok(!!adminT && !!acctT, 'admin + accounting login');
  const JH = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
  const H = (t) => ({ Authorization: `Bearer ${t}` });

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const hbg = await db.prepare(`SELECT id FROM projects WHERE code = 'BTE-WP4-HBC'`).getAsync();

  const mkProfile = async (body) => fetch(BASE + '/api/erp/profiles', { method: 'POST', headers: JH(adminT), body: JSON.stringify(body) }).then(async r => ({ s: r.status, j: await r.json() }));

  // 1. FAST profile validation.
  const bad1 = await mkProfile({ name: 'FW1', connector: 'fast', secret_env: 'TEST_FAST_SECRET', config: {} });
  ok(bad1.s === 400, `fast needs base_url (got ${bad1.s})`);
  const bad2 = await mkProfile({ name: 'FW2', connector: 'webhook', secret_env: 'TEST_WH_SECRET', config: {} });
  ok(bad2.s === 400, `webhook needs url (got ${bad2.s})`);
  const fp = await mkProfile({ name: 'FAST-TEST', connector: 'fast', secret_env: 'TEST_FAST_SECRET', config: { base_url: `http://127.0.0.1:${stubPort}`, app_id: 'pmotest' } });
  ok(fp.s === 201, `fast profile created (got ${fp.s})`);
  created.profiles.push(fp.j.id);

  // 2. FAST push via jobs endpoint (mocked transport not needed — stub is real HTTP).
  const push = await fetch(BASE + '/api/jobs/erp-push', { method: 'POST', headers: JH(acctT), body: JSON.stringify({ profile_id: fp.j.id, project_id: hbg.id }) }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(push.s === 200 && push.j.ok === true && push.j.pushed >= 0, `fast push ok (got ${push.s})`);
  ok(seen.fast.some((f) => f.auth === 'Bearer fast-test-token'), 'stub saw Bearer token');
  const sent = seen.fast.find((f) => f.body?.payment_requests);
  ok(sent && Array.isArray(sent.body.payment_requests), 'stub received PR payload');

  // 3. FAST vendor pull (suggest-only shape).
  const pull = await fetch(BASE + `/api/erp/fast/vendors?profile_id=${fp.j.id}`, { headers: H(acctT) }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(pull.s === 200 && pull.j.vendors?.[0]?.name === 'FAST Vendor A' && 'match' in pull.j.vendors[0], 'pull returns matchable vendors');

  // 4. Webhook profile + ping with HMAC verify.
  const wp = await mkProfile({ name: 'WH-TEST', connector: 'webhook', secret_env: 'TEST_WH_SECRET', config: { url: `http://127.0.0.1:${stubPort}/hook`, events: ['ping', 'payment_request.approved'] } });
  ok(wp.s === 201, `webhook profile created (got ${wp.s})`);
  created.profiles.push(wp.j.id);
  const ping = await fetch(BASE + '/api/erp/webhooks/test', { method: 'POST', headers: JH(adminT), body: JSON.stringify({ profile_id: wp.j.id }) }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(ping.s === 200 && ping.j.ok === true, `ping delivered (got ${ping.s})`);
  await new Promise(r => setTimeout(r, 300));
  ok(seen.webhooks.length >= 1 && seen.webhooks[0].good === true && seen.webhooks[0].event === 'ping', 'HMAC verifies, event header correct');

  // 5. Real fan-out: approve a PR → webhook fires (scratch PR chain).
  const pr = await db.prepare(`SELECT id, invoice_id FROM payment_requests WHERE status = 'PENDING' ORDER BY id LIMIT 1`).getAsync();
  if (pr) {
    await fetch(BASE + `/api/payment-requests/${pr.id}`, { method: 'PUT', headers: JH(adminT), body: JSON.stringify({ status: 'APPROVED' }) });
    await new Promise(r => setTimeout(r, 500));
    const fired = seen.webhooks.filter((w) => w.event === 'payment_request.approved');
    ok(fired.length >= 1 && fired[0].good === true, 'approval fans out signed event');
    await db.prepare(`UPDATE payment_requests SET status = 'PENDING', approved_by = NULL, approved_date = NULL WHERE id = ?`).runAsync(pr.id);
  } else {
    ok(true, 'no PENDING PR to approve (skipped fan-out check)');
  }

  // 6. Dead endpoint → 502 + failed log row (fast, local closed port).
  const dead = await mkProfile({ name: 'WH-DEAD', connector: 'webhook', secret_env: 'TEST_WH_SECRET', config: { url: 'http://127.0.0.1:9/hook', events: ['ping'] } });
  created.profiles.push(dead.j.id);
  const dp = await fetch(BASE + '/api/erp/webhooks/test', { method: 'POST', headers: JH(adminT), body: JSON.stringify({ profile_id: dead.j.id }) }).then(r => r.status);
  ok(dp === 502, `dead endpoint → 502 after retries (got ${dp})`);
  const logged = await db.prepare(`SELECT status FROM erp_push_log WHERE profile_id = ? ORDER BY id DESC LIMIT 1`).getAsync(dead.j.id);
  ok(logged?.status === 'failed', 'failure logged');
} finally {
  if (created.profiles.length) {
    const { getDb } = await import('../../backend/src/db/index.js');
    const db = getDb();
    for (const id of created.profiles) {
      await db.prepare('DELETE FROM erp_push_log WHERE profile_id = ?').runAsync(id).catch(() => {});
      await db.prepare('DELETE FROM erp_profiles WHERE id = ?').runAsync(id).catch(() => {});
    }
  }
  srv.kill('SIGTERM');
  stub.close();
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
