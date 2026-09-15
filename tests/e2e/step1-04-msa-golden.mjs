// STEP1-04: MSA material golden (parent/batch grain) + real-file commit.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/step1-04-msa-golden.mjs
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
import { createRequire } from 'node:module';
const require = createRequire('/home/vutun/pmo_project/backend/package.json');
const XLSX = require('xlsx');
const { parse, commit } = await import('../../backend/src/services/ingest/material_supply.js');
const { getDb, closeDb } = await import('../../backend/src/db/index.js');
import { writeFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

function workbook() {
  const aoa = [
    ['MATERIAL SUBMISSION & DELIVERY SCHEDULE'],
    ['No.', 'Reference/Tham chiếu', 'Description/Diễn giải', 'SỐ HĐ', 'Brandname', 'C/O', 'Suppliers', 'Contact', 'Status', 'Yêu cầu số', 'Lần về', 'Delivery Time', null, null, null, null, null, 'Nghiệm thu', 'Người TH', 'Ghi chú'],
    [null, null, null, null, null, null, null, null, null, null, null, 'Ngày yêu cầu', 'Lead days', 'Ngày kí HĐ', 'Thông báo XK', 'Ngày dự kiến', 'Ngày thực tế', null, null, null],
    [null, 'PLUMBING SYSTEM'],
    ['1', 'BTE-TEST-MAA-001\nWater supply', 'PP-R pipe', 'HD-01', 'DaiViet', 'VN', 'Tam Da', 'Mr Nam', 'A', 'YCVT-01', 1, new Date(2024, 0, 5), 14, new Date(2024, 0, 10), new Date(2024, 0, 12), new Date(2024, 0, 20), new Date(2024, 0, 22), 'Đã nghiệm thu', null, 'Đã giao'],
    [null, null, null, null, null, null, null, null, null, 'YCVT-02', 2, new Date(2024, 1, 1), 14, null, null, new Date(2024, 1, 15), null, 'Chờ', null, null],
    ['2', 'BTE-TEST-MAA-002', 'UPVC pipe', 'HD-02', 'BM', 'VN', 'Lan Trinh', null, 'A', 'YCVT-03', 1, new Date(2024, 0, 8), 7, null, null, null, new Date(2024, 0, 18), 'Đã nghiệm thu', null, null],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'RFA-Submission_Delivery');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

writeFileSync('/tmp/golden-msa.xlsx', workbook());
const p = await parse('/tmp/golden-msa.xlsx', 1, 'GEN');
ok(p.totalRows === 2, `2 parent items (category label skipped, got ${p.totalRows})`);
const [a, b] = p.sheets[0].rows;
ok(a.ref_code === 'BTE-TEST-MAA-001' && a.batches.length === 2, `parent code split + 2 batches (got ${a.ref_code}/${a.batches.length})`);
ok(a.batches[0].request_date === '2024-01-05' && a.batches[0].actual === '2024-01-22', 'batch-1 dates');
ok(a.batches[1].actual === null && b.batches.length === 1, 'open batch tolerated');
ok(a.supplier === 'Tam Da' && a.acceptance === 'Đã nghiệm thu', 'supplier + acceptance');

const db = getDb();
const proj = await db.prepare(`INSERT INTO projects (tenant_id, code, name_vi) VALUES (1, 'GOLDEN-MSA-${Date.now()}', 'x') RETURNING id`).getAsync();
const rep = await commit(p, proj.id, 'GEN');
ok(rep.ok === 2 && rep.errors === 0, `commit ok=2 (got ${rep.ok}/${rep.errors})`);
const row = await db.prepare(`SELECT material_code, progress_pct, request_date_1, delivery_date_1, request_date_2, notes FROM materials WHERE project_id = ? AND material_code = 'BTE-TEST-MAA-001'`).getAsync(proj.id);
const dstr = (v) => v == null ? null : String(v instanceof Date ? v.toISOString().slice(0, 10) : v).slice(0, 10);
ok(dstr(row?.request_date_1) === '2024-01-05' && dstr(row?.delivery_date_1) === '2024-01-22' && dstr(row?.request_date_2) === '2024-02-01', 'batch dates in numbered columns');
ok(row?.progress_pct === 0.5, `progress = delivered/total (got ${row?.progress_pct})`);
ok(/Tam Da/.test(row?.notes || ''), 'supplier preserved in notes');

// real MSA file commits clean
const BTE = process.env.BTE_DATA_DIR || '/mnt/c/Users/vutun/Downloads/2020.03.11 MEP-BTE-PCR/2020.01.11 MEP-BTE-PCR';
const { existsSync } = await import('node:fs');
if (existsSync(`${BTE}/TIẾN ĐỘ CUNG ỨNG VẬT TƯ/MEP-BTE-MSA-01.xlsx`)) {
  const real = await parse(`${BTE}/TIẾN ĐỘ CUNG ỨNG VẬT TƯ/MEP-BTE-MSA-01.xlsx`, proj.id, 'GEN');
  const rr = await commit(real, proj.id, 'GEN');
  ok(rr.errors === 0 && rr.ok >= 40 && (rr.skipped_empty || 0) > 0, `real MSA: substantive committed, stubs counted (ok=${rr.ok} skipped=${rr.skipped_empty} errors=${rr.errors})`);
  if (rr.errors) console.log('  sample:', JSON.stringify(rr.items.slice(0, 2)).slice(0, 300));
} else {
  console.log('SKIP — real MSA file absent');
}

await db.prepare('DELETE FROM materials WHERE project_id = ?').runAsync(proj.id);
await db.prepare('DELETE FROM zones WHERE project_id = ?').runAsync(proj.id);
await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(proj.id);
await closeDb();

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
