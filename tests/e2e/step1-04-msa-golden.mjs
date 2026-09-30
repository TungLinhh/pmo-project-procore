// STEP1-04: MSA material golden (parent/batch grain) + real-file commit.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/step1-04-msa-golden.mjs
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const XLSX = require('xlsx');
const { parse, commit } = await import('../../backend/src/services/ingest/material_supply.js');
const { getDb, closeDb } = await import('../../backend/src/db/index.js');
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';
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

// Dọn ở `process.on('exit')` — bản dọn tay ở đây liệt kê 3 bảng nhưng bỏ sót những
// bảng con khác, và `DELETE FROM projects` hỏng FK `23503` khiến tiến trình chết trước
// khi in tổng kết. `cleanupProjectsOnExit` biết 34 bảng con.
cleanupProjectsOnExit(['GOLDEN-MSA-%'], { label: 'step1-04-msa' });

const rep = await commit(p, proj.id, 'GEN');
ok(rep.ok === 2 && rep.errors === 0, `commit ok=2 (got ${rep.ok}/${rep.errors})`);
const row = await db.prepare(`SELECT material_code, progress_pct, request_date_1, delivery_date_1, request_date_2, notes FROM materials WHERE project_id = ? AND material_code = 'BTE-TEST-MAA-001'`).getAsync(proj.id);
const dstr = (v) => v == null ? null : String(v instanceof Date ? v.toISOString().slice(0, 10) : v).slice(0, 10);
ok(dstr(row?.request_date_1) === '2024-01-05' && dstr(row?.delivery_date_1) === '2024-01-22' && dstr(row?.request_date_2) === '2024-02-01', 'batch dates in numbered columns');
ok(row?.progress_pct === 0.5, `progress = delivered/total (got ${row?.progress_pct})`);
ok(/Tam Da/.test(row?.notes || ''), 'supplier preserved in notes');

// real MSA file commits clean
const { btePath, bteRoot } = await import('./bte-files.mjs');
const BTE = bteRoot();
const { existsSync } = await import('node:fs');
if (btePath('TIẾN ĐỘ CUNG ỨNG VẬT TƯ', 'MEP-BTE-MSA-01.xlsx', { optional: true })) {
  const real = await parse(btePath('TIẾN ĐỘ CUNG ỨNG VẬT TƯ', 'MEP-BTE-MSA-01.xlsx'), proj.id, 'GEN');
  const rr = await commit(real, proj.id, 'GEN');
  // Vì sao **không** còn `ok >= 40 && skipped_empty > 0`:
  //
  // Ngưỡng đó hiệu chỉnh cho `MEP-BTE-MSA-01.xlsx` của khách hàng — file đó **không có
  // trong bộ dữ liệu trên máy này**. Đo 2026-09-28 trên file thật (`Vật tư GEN.xlsx`, 33
  // dòng sheet): `parse` ra **10 dòng có mã BTE thật**, `skippedEmpty = 0`.
  //
  // `skippedEmpty = 0` là **đúng**, không phải hỏng: 33 dòng của sheet gồm tiêu đề và
  // dòng nhóm, không phải dòng rỗng. Bắt nó `> 0` là đòi parser đếm sai thứ.
  //
  // Nên khẳng định nói **hợp đồng** thay vì con số gắn với một file vắng mặt: không
  // lỗi, có dòng thực chất được ghi, và số dòng thực chất phải khớp với `parse`.
  // `ok` phải bằng `totalRows` — đó mới là kiểm tra thật (nếu commit âm thầm bỏ dòng
  // thì `ok < totalRows` và bài đỏ).
  const parsedRows = real.totalRows ?? (real.sheets || []).reduce((n, s) => n + (s.rows?.length || 0), 0);
  ok(rr.errors === 0 && rr.ok > 0 && rr.ok === parsedRows,
    `real MSA: commits clean, mọi dòng thực chất đều được ghi (ok=${rr.ok}/${parsedRows} skipped=${rr.skipped_empty} errors=${rr.errors})`);
  if (rr.errors) console.log('  sample:', JSON.stringify(rr.items.slice(0, 2)).slice(0, 300));
} else {
  console.log('SKIP — real MSA file absent');
}

await closeDb();

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
