// STEP1-03: TĐ TỔNG cross-check — rollup % vs ingested zone-detail aggregates.
// Needs the real BTE folder (BTE_DATA_DIR); skips cleanly when absent (CI).
// Run: BTE_DATA_DIR=/path/to/BTE-source DATABASE_URL=... node tests/e2e/step1-03-crosscheck.mjs
import { waitForServer } from './lib.mjs';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

// Tên file nguồn: dùng `bte-files.mjs` để dịch tên chuẩn ↔ tên gốc (xem file đó).
// Không còn `SKIP` khi thiếu dữ liệu: thiếu thì **ném lỗi kèm cả hai danh sách tên**,
// vì `SKIP` im lặng chính là lý do ba bài `step1` này chưa từng chạy với dữ liệu thật
// trong khi dữ liệu thật vẫn nằm ngay trong `reference_sheets/`.
const { btePath, bteRoot } = await import('./bte-files.mjs');
const BTE = bteRoot();


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['XCHECK-%'], { label: 'step1-03-crosscheck' });
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3216';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3216' }, stdio: 'ignore' });
await waitForServer(BASE);
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

  const shop = await ingestFile(btePath('TIẾN ĐỘ SHOP', 'MEP-BTE-SHD-BOH.xlsx'), 'BOH', 'shop_drawing');
  ok(shop.cmt.status === 'SUCCESS' || shop.cmt.status === 'PARTIAL', `BOH shop committed (${shop.cmt.status}, ok=${shop.cmt.ok})`);
  const sched = await ingestFile(btePath('TIẾN ĐỘ THI CÔNG', 'MEP-BTE-CSP-BOH.xlsx'), 'BOH', 'construction_schedule');
  ok(sched.cmt.status === 'SUCCESS' || sched.cmt.status === 'PARTIAL', `BOH schedule committed (${sched.cmt.status}, ok=${sched.cmt.ok})`);

  // stage the two rollups (no commit — cross-check reads them)
  async function stageOnly(absPath) {
    const fd = new FormData();
    fd.append('file', new Blob([readFileSync(absPath)]), absPath.split('/').pop());
    return fetch(BASE + '/api/upload', { method: 'POST', headers: H, body: fd }).then(r => r.json());
  }
  const mshop = await stageOnly(btePath('TIẾN ĐỘ SHOP', 'HBG-BTE-MSHOP-01.xlsx'));
  const csp = await stageOnly(btePath('TIẾN ĐỘ THI CÔNG', 'MEP-BTE-CSP-01.xlsx'));

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

  // Dọn: **không** dựng tay. Bản dọn tay ở đây liệt kê 5 bảng con nhưng bỏ sót
  // `work_items` (do `commit` của `construction_schedule` tạo ra) ⇒ `DELETE FROM projects`
  // hỏng FK `23503` và giết tiến trình **trước** khi in tổng kết. `cleanupProjectsOnExit`
  // (đăng ký ở đầu file) biết 34 bảng con và chạy ở `process.on('exit')` nên chịu được
  // cả đường thoát này lẫn SIGPIPE.
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
