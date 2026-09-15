// ERP round-trip e2e (Wave 3 C2): ledger export golden, vendor import
// suggestions (suggest-only), confirm write, profiles CRUD (no secret leak),
// mocked SFTP push + log. Self-cleaning (scratch vendor/profile/logs removed).
// Run: node tests/e2e/erp-roundtrip.mjs (spawns its own server, needs dev DB)
import { spawn } from 'node:child_process';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3118';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3118', ERP_SFTP_MOCK: '1', TEST_ERP_SECRET: 'mock-secret' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));

const scratch = { vendors: [], profiles: [] };
try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const acctT = await loginAs('accounting@hbg.com');
  const adminT = await loginAs('admin@hbg.com');
  const siteT = await loginAs('site@hbg.com');
  const pilotT = await loginAs('admin@pilot.test');
  ok(!!acctT && !!adminT, 'accounting + admin login');
  const H = (t) => ({ Authorization: `Bearer ${t}` });
  const JH = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const hbg = await db.prepare(`SELECT id FROM projects WHERE code = 'BTE-WP4-HBC'`).getAsync();
  const pilot = await db.prepare(`SELECT id FROM projects WHERE code = 'PILOT-001'`).getAsync();

  // 1. Export golden: byte-stable header, BOM (raw bytes — fetch text() strips it), real rows.
  const exp = await fetch(BASE + `/api/export/ap-ledger.csv?project_id=${hbg.id}`, { headers: H(acctT) });
  const buf = Buffer.from(await exp.arrayBuffer());
  ok(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, 'BOM for Excel VN');
  const lines = buf.toString('utf8').replace(/^\ufeff/, '').split('\n');
  const { AP_LEDGER_COLS } = await import('../../backend/src/routes/export.js');
  ok(exp.status === 200 && lines[0] === AP_LEDGER_COLS.join(','), `golden header (${lines[0].split(',').length} cols)`);
  ok(lines.length > 2 && lines[1].includes('BTE'), `real ledger rows (got ${lines.length - 1})`);
  // 2. Gates: small 403, cross-tenant 404, missing param 400, anon 401.
  const g1 = await fetch(BASE + `/api/export/ap-ledger.csv?project_id=${pilot.id}`, { headers: H(pilotT) }).then(r => r.status);
  ok(g1 === 403, `small export → 403 (got ${g1})`);
  const g2 = await fetch(BASE + `/api/export/ap-ledger.csv?project_id=${pilot.id}`, { headers: H(acctT) }).then(r => r.status);
  ok(g2 === 404, `cross-tenant export → 404 (got ${g2})`);
  const g3 = await fetch(BASE + '/api/export/ap-ledger.csv', { headers: H(acctT) }).then(r => r.status);
  ok(g3 === 400, `missing project → 400 (got ${g3})`);
  const g4 = await fetch(BASE + `/api/export/ap-ledger.csv?project_id=${hbg.id}`).then(r => r.status);
  ok(g4 === 401, `anon → 401 (got ${g4})`);

  // 3. Vendor import suggestions (self-seeded known vendor → similarity 1.0).
  const kv = await db.prepare(`INSERT INTO vendors (tenant_id, name) VALUES (1, 'ERP-KNOWN-VENDOR') RETURNING id`).runAsync();
  scratch.vendors.push(Number(kv.lastInsertRowid));
  const csvInNamed = `name,tax_id\n"ERP-KNOWN-VENDOR",0109998888\n"Nhà Thầu Ma Không Tồn Tại XYZ",0101112223\n`;
  const fd = new FormData();
  fd.append('file', new Blob([csvInNamed], { type: 'text/csv' }), 'vendors.csv');
  const imp = await fetch(BASE + '/api/erp/vendors/import', { method: 'POST', headers: H(acctT), body: fd }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(imp.s === 200 && imp.j.rows === 2, `import parses 2 rows (got ${imp.s})`);
  const [s1, s2] = imp.j.suggestions;
  ok(s1.match && s1.match.similarity === 1 && s1.match.vendor_name === 'ERP-KNOWN-VENDOR', 'exact name matches 1.0');
  ok(!s2.match, 'unknown vendor has no match (suggest-only, nothing written)');
  const siteImp = await fetch(BASE + '/api/erp/vendors/import', { method: 'POST', headers: H(siteT), body: fd }).then(r => r.status);
  ok(siteImp === 403, `site import → 403 (got ${siteImp})`);

  // 4. Confirm writes tax_id on a scratch vendor (audit-logged), then cleanup.
  const v = await db.prepare(`INSERT INTO vendors (tenant_id, name) VALUES (1, 'ERP-TEST-VENDOR') RETURNING id`).runAsync();
  scratch.vendors.push(Number(v.lastInsertRowid));
  const cf = await fetch(BASE + '/api/erp/vendors/confirm', {
    method: 'POST', headers: JH(adminT), body: JSON.stringify({ vendor_id: scratch.vendors[0], tax_id: '0101234567' }),
  }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(cf.s === 200 && cf.j.tax_id === '0101234567', 'confirm writes tax_id');
  const cfBad = await fetch(BASE + '/api/erp/vendors/confirm', {
    method: 'POST', headers: JH(adminT), body: JSON.stringify({ vendor_id: 999999999, tax_id: 'x' }),
  }).then(r => r.status);
  ok(cfBad === 404, `unknown vendor → 404 (got ${cfBad})`);

  // 5. Profiles: secret never leaks; mocked push logs.
  const pf = await fetch(BASE + '/api/erp/profiles', {
    method: 'POST', headers: JH(adminT),
    body: JSON.stringify({ name: 'ERP-TEST', sftp_host: 'sftp.test', sftp_user: 'u', secret_env: 'TEST_ERP_SECRET', remote_path: '/in' }),
  }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(pf.s === 201, `profile created (got ${pf.s})`);
  scratch.profiles.push(pf.j.id);
  ok(!('secret' in pf.j) && !JSON.stringify(pf.j).includes('mock-secret'), 'secret never in response');
  const pl = await fetch(BASE + '/api/erp/profiles', { headers: H(adminT) }).then(r => r.json());
  ok(pl.some((p) => p.id === pf.j.id), 'profile listed');
  const push = await fetch(BASE + '/api/jobs/erp-push', {
    method: 'POST', headers: JH(adminT), body: JSON.stringify({ profile_id: pf.j.id, project_id: hbg.id }),
  }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(push.s === 200 && push.j.ok === true && push.j.mocked === true && push.j.rows > 0, `mocked push ok (got ${push.s})`);
  const log = await fetch(BASE + '/api/erp/push-log', { headers: H(adminT) }).then(r => r.json());
  ok(log.some((l) => l.profile_id === pf.j.id && l.status === 'ok'), 'push logged');
  // Push to unknown project → 404, not a secret error (no leak oracle).
  const push404 = await fetch(BASE + '/api/jobs/erp-push', {
    method: 'POST', headers: JH(adminT), body: JSON.stringify({ profile_id: pf.j.id, project_id: 999999999 }),
  }).then(r => r.status);
  ok(push404 === 404, `push unknown project → 404 (got ${push404})`);
} finally {
  if (scratch.vendors.length || scratch.profiles.length) {
    const { getDb } = await import('../../backend/src/db/index.js');
    const db = getDb();
    for (const id of scratch.vendors) await db.prepare('DELETE FROM vendors WHERE id = ?').runAsync(id).catch(() => {});
    for (const id of scratch.profiles) {
      await db.prepare('DELETE FROM erp_push_log WHERE profile_id = ?').runAsync(id).catch(() => {});
      await db.prepare('DELETE FROM erp_profiles WHERE id = ?').runAsync(id).catch(() => {});
    }
  }
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
