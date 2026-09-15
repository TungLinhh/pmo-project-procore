// STEP1-03: TĐ TỔNG cross-check — rollup % vs ingested zone-detail aggregates.
// Needs the real BTE folder (BTE_DATA_DIR); skips cleanly when absent (CI).
// Run: BTE_DATA_DIR=/mnt/c/Users/vutun/Downloads/2020.03.11\ MEP-BTE-PCR/2020.01.11\ MEP-BTE-PCR DATABASE_URL=... node tests/e2e/step1-03-crosscheck.mjs
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const BTE = process.env.BTE_DATA_DIR || '/mnt/c/Users/vutun/Downloads/2020.03.11 MEP-BTE-PCR/2020.01.11 MEP-BTE-PCR';
if (!existsSync(`${BTE}/TIẾN ĐỘ SHOP/MEP-BTE-SHD-BOH.xlsx`)) {
  console.log('SKIP — BTE_DATA_DIR not present');
  process.exit(0);
}

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3216';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3216' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const H = { Authorization: `Bearer ${token}` };
  const J = { ...H, 'Content-Type': 'application/json' };

  // project + zones via API
  const code = `XCHECK-${Date.now()}`;
  const proj = await fetch(BASE + '/api/projects', { method: 'POST', headers: J, body: JSON.stringify({ code }) }).then(r => r.json());
  const pid = proj.id;

  // helper: stage a real file then configure+commit through the wizard
  async function ingestFile(absPath, zoneCode, docType) {
    const buf = readFileSync(absPath);
    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), absPath.split('/').pop());
    const up = await fetch(BASE + '/api/upload', { method: 'POST', headers: H, body: fd }).then(r => r.json());
    const cfg = await fetch(BASE + `/api/upload/${up.upload_id}/configure`, { method: 'POST', headers: J, body: JSON.stringify({ project_id: pid, new_zone: { code: zoneCode }, doc_type: docType }) }).then(r => r.json());
    const cmt = await fetch(BASE + `/api/upload/${up.upload_id}/commit`, { method: 'POST', headers: J }).then(r => r.json());
    return { up, cfg, cmt };
  }

  const shop = await ingestFile(`${BTE}/TIẾN ĐỘ SHOP/MEP-BTE-SHD-BOH.xlsx`, 'BOH', 'shop_drawing');
  ok(shop.cmt.status === 'SUCCESS' || shop.cmt.status === 'PARTIAL', `BOH shop committed (${shop.cmt.status}, ok=${shop.cmt.ok})`);
  const sched = await ingestFile(`${BTE}/TIẾN ĐỘ THI CÔNG/MEP-BTE-CSP-BOH.xlsx`, 'BOH', 'construction_schedule');
  ok(sched.cmt.status === 'SUCCESS' || sched.cmt.status === 'PARTIAL', `BOH schedule committed (${sched.cmt.status}, ok=${sched.cmt.ok})`);

  // stage the two rollups (no commit — cross-check reads them)
  async function stageOnly(absPath) {
    const fd = new FormData();
    fd.append('file', new Blob([readFileSync(absPath)]), absPath.split('/').pop());
    return fetch(BASE + '/api/upload', { method: 'POST', headers: H, body: fd }).then(r => r.json());
  }
  const mshop = await stageOnly(`${BTE}/TIẾN ĐỘ SHOP/HBG-BTE-MSHOP-01.xlsx`);
  const csp = await stageOnly(`${BTE}/TIẾN ĐỘ THI CÔNG/MEP-BTE-CSP-01.xlsx`);

  const xShop = await fetch(BASE + `/api/upload/${mshop.upload_id}/crosscheck`, { method: 'POST', headers: J, body: JSON.stringify({ project_id: pid, kind: 'shop' }) }).then(r => r.json());
  ok(xShop.rollup_sheet && xShop.zones.length > 5, `shop rollup read (${xShop.zones.length} zones from ${xShop.rollup_sheet})`);
  const bohShop = xShop.zones.find(z => z.zone === 'BOH');
  ok(bohShop && bohShop.db_rows > 0, `BOH matched with db rows (rollup=${bohShop?.rollup_pct}, db=${bohShop?.db_pct}, delta=${bohShop?.delta})`);
  ok(xShop.summary.zones_rollup_only > 0, `rollup-only zones reported (not yet ingested: ${xShop.summary.zones_rollup_only})`);

  const xSched = await fetch(BASE + `/api/upload/${csp.upload_id}/crosscheck`, { method: 'POST', headers: J, body: JSON.stringify({ project_id: pid, kind: 'schedule' }) }).then(r => r.json());
  ok(xSched.zones.length > 5, `schedule rollup read (${xSched.zones.length} zones)`);
  const bohSched = xSched.zones.find(z => z.zone === 'BOH');
  ok(bohSched && bohSched.db_rows > 0, `BOH schedule matched (rollup=${bohSched?.rollup_pct}, db=${bohSched?.db_pct}, delta=${bohSched?.delta})`);

  const bad = await fetch(BASE + '/api/upload/999999999/crosscheck', { method: 'POST', headers: J, body: JSON.stringify({ project_id: pid, kind: 'shop' }) });
  ok(bad.status === 404, `missing upload → 404 (got ${bad.status})`);

  execSync(`PGPASSWORD=pmo_dev_pwd /home/linuxbrew/.linuxbrew/bin/psql -h 127.0.0.1 -p 5433 -U pmo_user -d pmo -t -A -c "DELETE FROM file_uploads WHERE project_id=${pid}; DELETE FROM shop_drawings WHERE project_id=${pid}; DELETE FROM construction_schedule_items WHERE project_id=${pid}; DELETE FROM zones WHERE project_id=${pid}; DELETE FROM projects WHERE id=${pid};"`);
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
