// STEP1-01: shop parser golden files (BTE 3-tier + MCR 2-tier shapes) → parse + commit.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/step1-01-shop-golden.mjs
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
import { createRequire } from 'node:module';
const require = createRequire('/home/vutun/pmo_project/backend/package.json');
const XLSX = require('xlsx');
const { parse, commit } = await import('../../backend/src/services/ingest/shop_drawing.js');
const { getDb, closeDb } = await import('../../backend/src/db/index.js');
import { writeFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

// BTE-shaped: tier-1 (STT/Mã Hiệu/Tên/%HT/Lần1..2/Ngày phê duyệt/Ghi chú),
// tier-2 plan/actual/reply, tier-3 BQL/Ngày, section + group rows, 2 data rows.
function bteWorkbook() {
  const aoa = [
    ['SHOPDRAWING SUBMISSION FOR APPROVAL'],
    [null, null, null, null, 'STT', 'Mã Hiệu', 'Tên bản vẽ', '% HT', null, 'Lần 1', null, null, null, 'Lần 2', 'Ngày phê duyệt', 'Ghi chú'],
    [null, null, null, null, null, null, null, null, null, 'Dự kiến', 'Thực tế', 'Phản hồi', null, 'Dự kiến', null, null],
    [null, null, null, null, null, null, null, null, null, null, null, 'BQL', 'Ngày', null, null, null],
    [null, null, null, null, null, null, 'HVAC GROUP'],
    ['I', null, null, null, null, null, 'Hệ điều hòa'],
    [1, null, null, null, null, 'BTE-TEST-SHD-001', 'Sơ đồ nguyên lý', 0.9, null, new Date(2024,0,10), new Date(2024,0,12), 'R', new Date(2024,0,20), new Date(2024,1,1), new Date(2024,2,1), 'note one'],
    [2, null, null, null, null, 'BTE-TEST-SHD-002', 'Mặt bằng', 1, null, new Date(2024,0,10), null, null, null, null, null, null],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'SHOP BOH');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// MCR-shaped: no code header, tier-1 plan/actual left of Lần-block.
function mcrWorkbook() {
  const aoa = [
    ['SHOPDRAWING SUBMISSION FOR APPROVAL'],
    ['STT', null, null, null, null, null, 'Tên bản vẽ', '% HT', 'Ngày dự kiến trình', 'Ngày thực tế trình', 'Phản hồi BQLDA', null, 'Ngày phê duyệt', 'Ghi chú'],
    [null, null, null, null, null, null, null, null, null, null, 'Lần 1', 'Lần 2', null, null],
    ['1', null, null, null, null, 'HBG - MCR - CA - E - 001', 'Sơ đồ nguyên lý', 1, new Date(2024,4,1), new Date(2024,4,3), null, null, new Date(2024,4,10), null],
    ['2', null, null, null, null, 'HBG - MCR - CA - E - 002', 'Mặt bằng', 0.5, new Date(2024,4,1), null, null, null, null, null],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'SHOP CS');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

writeFileSync('/tmp/golden-shop-bte.xlsx', bteWorkbook());
writeFileSync('/tmp/golden-shop-mcr.xlsx', mcrWorkbook());

const bte = await parse('/tmp/golden-shop-bte.xlsx', 1, 'BOH');
ok(bte.totalRows === 2, `BTE golden: 2 data rows (section/group skipped, got ${bte.totalRows})`);
const r1 = bte.sheets[0].rows[0];
ok(r1.drawing_code === 'BTE-TEST-SHD-001' && r1.name_vi === 'Sơ đồ nguyên lý', 'BTE code+name');
ok(r1.progress_pct === 0.9 && r1.planned_submit_date === '2024-01-10' && r1.actual_submit_date === '2024-01-12', 'BTE progress + round-1 dates');
ok(r1.bql_l1_response === 'R' && r1.bql_l1_date === '2024-01-20', 'BTE L1 reply+date');
ok(r1.bql_l2_response === null && r1.approval_date === '2024-03-01' && r1.note === 'note one', 'BTE L2 empty + approval + note');
ok(bte.sheets[0].rows[1].bql_l1_response === null, 'BTE sparse row tolerated');

const mcr = await parse('/tmp/golden-shop-mcr.xlsx', 1, 'CS');
ok(mcr.totalRows === 2, `MCR golden: codes found without code header (got ${mcr.totalRows})`);
ok(mcr.sheets[0].rows[0].planned_submit_date === '2024-05-01' && mcr.sheets[0].rows[0].actual_submit_date === '2024-05-03', 'MCR tier-1 plan/actual');

// commit to throwaway project: statuses via shared table shape
const db = getDb();
const proj = await db.prepare(`INSERT INTO projects (tenant_id, code, name_vi) VALUES (1, 'GOLDEN-SHOP-${Date.now()}', 'x') RETURNING id`).getAsync();
const rep = await commit(bte, proj.id, 'BOH');
ok(rep.ok === 2 && rep.errors === 0, `commit ok=2 errors=0 (got ${rep.ok}/${rep.errors})`);
const cnt = await db.prepare('SELECT count(*)::int c FROM shop_drawings WHERE project_id = ?').getAsync(proj.id);
ok(cnt.c === 2, `2 shop_drawings rows persisted (got ${cnt.c})`);
const back = await db.prepare(`SELECT drawing_code, bql_l1_response FROM shop_drawings WHERE project_id = ? AND drawing_code = 'BTE-TEST-SHD-001'`).getAsync(proj.id);
ok(back?.bql_l1_response === 'R', `L1 reply persisted (got ${back?.bql_l1_response})`);

// structured failure: bad progress type → itemized entry (shared failures table)
const bad = { zone: { code: 'BOH' }, sheets: [{ sheet: 'S', rows: [{ rowIndex: 9, drawing_code: 'BAD-1', progress_pct: 'not-a-number' }] }] };
const rep2 = await commit(bad, proj.id, 'BOH');
ok(rep2.errors === 1 && rep2.items[0]?.row === 9 && typeof rep2.items[0]?.message === 'string', 'bad row itemized with row+message');

await db.prepare('DELETE FROM shop_drawings WHERE project_id = ?').runAsync(proj.id);
await db.prepare('DELETE FROM zones WHERE project_id = ?').runAsync(proj.id);
await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(proj.id);
await closeDb();

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
