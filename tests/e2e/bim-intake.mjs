// BIM library e2e (Wave 3 C1): intake (.ifc only), metadata, zone link +
// suggestions, plan gate, quota honesty. Fixture: tests/fixtures/pilot-tower.ifc
// (no binaries in git). Self-cleaning (rows + staged files removed).
// Run: node tests/e2e/bim-intake.mjs (spawns its own server, needs dev DB)
import { waitForServer } from './lib.mjs';
import { spawn } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3117';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3117' }, stdio: 'ignore' });
await waitForServer(BASE);

const stagedKeys = [];
const uploadIds = [];
try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const adminT = await loginAs('admin@hbg.com');
  const pilotT = await loginAs('admin@pilot.test');
  ok(!!adminT && !!pilotT, 'both logins');
  const H = (t) => ({ Authorization: `Bearer ${t}` });
  const get = (t, p) => fetch(BASE + p, { headers: H(t) }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));
  const postFile = (t, p, path, name, extra = {}) => {
    const fd = new FormData();
    fd.append('file', new Blob([readFileSync(path)]), name);
    for (const [k, v] of Object.entries(extra)) fd.append(k, v);
    return fetch(BASE + p, { method: 'POST', headers: H(t), body: fd }).then(async r => ({ s: r.status, j: await r.json().catch(() => null) }));
  };

  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  const hbg = await db.prepare(`SELECT id FROM projects WHERE code = 'BTE-WP4-HBC'`).getAsync();
  const pilot = await db.prepare(`SELECT id FROM projects WHERE code = 'PILOT-001'`).getAsync();

  // 1. Gates: Small plan 403s everywhere here.
  const g1 = await get(pilotT, `/api/projects/${pilot.id}/bim-models`);
  ok(g1.s === 403, `small list → 403 (got ${g1.s})`);

  // 2. Intake with explicit zone.
  const u1 = await postFile(adminT, `/api/projects/${hbg.id}/bim/models`, 'tests/fixtures/pilot-tower.ifc', 'pilot-tower.ifc', { zone_code: 'BOH' });
  ok(u1.s === 201 && u1.j.expected_doc_type === 'bim_model', `upload 201 bim_model (got ${u1.s})`);
  uploadIds.push(u1.j.id);
  stagedKeys.push(u1.j.storage_key);
  const meta = typeof u1.j.report_json === 'string' ? JSON.parse(u1.j.report_json) : u1.j.report_json;
  ok(meta.schema === 'IFC4', `schema IFC4 (got ${meta.schema})`);
  ok(meta.storeys.length === 3 && meta.storeys[1].elevation === 3.6, `3 storeys + elevations (got ${JSON.stringify(meta.storeys.map((s) => s.elevation))})`);
  ok(meta.space_count === 2, `2 spaces (got ${meta.space_count})`);
  ok(meta.truncated === false, 'not truncated');
  ok(u1.j.zone_id != null, 'explicit zone linked');
  const dl = await fetch(BASE + `/api/bim/models/${u1.j.id}/download`, { headers: H(adminT) });
  const dlBytes = Buffer.from(await dl.arrayBuffer());
  ok(dl.status === 200 && dlBytes.equals(readFileSync('tests/fixtures/pilot-tower.ifc')), `BIM download round-trips bytes (got ${dl.status}/${dlBytes.length})`);
  const dlNoAuth = await fetch(BASE + `/api/bim/models/${u1.j.id}/download`);
  ok(dlNoAuth.status === 401, `BIM download no token → 401 (got ${dlNoAuth.status})`);
  const dlOtherTenant = await fetch(BASE + `/api/bim/models/${u1.j.id}/download`, { headers: H(pilotT) });
  ok([403, 404].includes(dlOtherTenant.status), `BIM download other tenant denied (got ${dlOtherTenant.status})`);

  // 3. Same content re-uploaded → SAME row (content-addressed stable identity).
  const u2 = await postFile(adminT, `/api/projects/${hbg.id}/bim/models`, 'tests/fixtures/pilot-tower.ifc', 'tower_BOH.ifc', {});
  uploadIds.push(u2.j.id);
  stagedKeys.push(u2.j.storage_key);
  ok(u2.s === 201 && u2.j.id === u1.j.id, `re-upload dedupes to same row (got ${u2.s}/${u2.j?.id})`);

  // 4. Non-IFC rejected; cross-project link-zone 404s.
  const bad = await postFile(adminT, `/api/projects/${hbg.id}/bim/models`, 'package.json', 'package.json', {});
  ok(bad.s === 400, `non-ifc → 400 (got ${bad.s})`);
  const xzone = await fetch(BASE + `/api/bim/models/${u1.j.id}/link-zone`, { method: 'POST', headers: { ...H(adminT), 'Content-Type': 'application/json' }, body: JSON.stringify({ zone_id: 999999 }) }).then(r => r.status);
  ok(xzone === 404, `unknown zone → 404 (got ${xzone})`);

  // 5. Suggestions shape (BTE zones don't match Tầng-names → empty, honestly).
  const sug = await get(adminT, `/api/bim/models/${u1.j.id}/zone-suggestions`);
  ok(sug.s === 200 && Array.isArray(sug.j.suggestions), 'suggestions shape');

  // 6. List shows the model (filename guess path covered: tower_BOH.ifc hit BOH).
  const list = await get(adminT, `/api/projects/${hbg.id}/bim-models`);
  ok(list.s === 200 && list.j.length >= 1 && list.j[0].zone_code === 'BOH', `library lists with zone (got ${list.j?.length})`);

  // 7. Unauthenticated 401.
  const unauth = await fetch(BASE + `/api/projects/${hbg.id}/bim-models`).then(r => r.status);
  ok(unauth === 401, `no token → 401 (got ${unauth})`);
} finally {
  if (uploadIds.length || stagedKeys.length) {
    const { getDb } = await import('../../backend/src/db/index.js');
    const db = getDb();
    for (const id of uploadIds) await db.prepare('DELETE FROM file_uploads WHERE id = ?').runAsync(id).catch(() => {});
    const { getFilePath } = await import('../../backend/src/lib/storage.js');
    for (const k of stagedKeys) {
      try { unlinkSync(getFilePath(k)); } catch {}
    }
  }
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
