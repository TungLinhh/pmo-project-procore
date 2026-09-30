// STEP1-02: schedule parser golden file (BTE CSP shape) → parse + commit.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/step1-02-schedule-golden.mjs
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const XLSX = require('xlsx');
const { parse, commit } = await import('../../backend/src/services/ingest/construction_schedule.js');
const { getDb, closeDb } = await import('../../backend/src/db/index.js');
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';
import { writeFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

function workbook() {
  const aoa = [
    ['TỔNG TIẾN ĐỘ THI CÔNG/GENERAL SCHEDULE'],
    [null, null, null, 'Stt/No', 'Công việc thi công/Work', '% Hoàn thành', 'Tình trạng', 'Ngày bắt đầu', null, 'Ngày kết thúc', null, 'Số ngày', null, 'Hao phí nhân công', 'Tháng 1'],
    [null, null, null, null, null, null, null, 'KH', 'TT', 'KH', 'TT', null, null, null, 'Tuần 1'],
    [null, null, null, null, 'BOH'],
    [null, null, null, 'I', 'Hệ thống điện', null, null, new Date(2024, 0, 1), new Date(2024, 0, 1), new Date(2024, 5, 30), new Date(2024, 5, 30)],
    [null, null, null, 1, 'Lắp đặt ống', 1, 'YES', new Date(2024, 0, 1), new Date(2024, 0, 1), new Date(2024, 0, 10), new Date(2024, 0, 10), 10, 5],
    [null, null, null, 2, 'Kéo dây', 0.5, 'NO', new Date(2024, 0, 5), null, new Date(2024, 0, 20), null, 16, 4],
    [null, null, null, null, 'Ghi chú dòng trống tên thiếu'],
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'MEP-BTE-CSP-BOH');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

writeFileSync('/tmp/golden-sched.xlsx', workbook());
const p = await parse('/tmp/golden-sched.xlsx', 1, 'BOH');
ok(p.totalRows === 4, `4 rows (zone label + nameless skipped, got ${p.totalRows})`);
const [group, t1, t2, noted] = p.sheets[0].rows;
ok(group.level_roman === 'I' && group.name_vi === 'Hệ thống điện', 'Roman group level kept');
ok(t1.ordinal === 1 && t1.progress_pct === 1 && t1.status === 'DONE', 'task1 DONE + progress');
ok(t1.plan_start_date === '2024-01-01' && t1.actual_end_date === '2024-01-10' && t1.plan_duration_days === 10, 'task1 KH/TT dates + duration');
ok(t2.status === 'IN_PROGRESS' && t2.actual_start_date === null, 'task2 IN_PROGRESS from 50% (raw NO no longer trusted), missing actual tolerated');
ok(noted.ordinal != null, 'nameless-STT row kept with rowIndex ordinal fallback');

const db = getDb();
const proj = await db.prepare(`INSERT INTO projects (tenant_id, code, name_vi) VALUES (1, 'GOLDEN-SCHED-${Date.now()}', 'x') RETURNING id`).getAsync();

// Dọn dự án thử ở `process.on('exit')` — **không** dựng tay bằng `DELETE`.
//
// Vì sao: `commit()` của ingestor tạo `work_items`, mà dự án bị `work_items` tham chiếu
// thì `DELETE FROM projects` hỏng FK `23503` và **cả tiến trình chết** trước khi in tổng
// kết. Đo 2026-09-28: bản dọn tay thiếu `work_items` ⇒ mỗi lần chạy để lại một dự án
// rác (chạy `step1-02` 2 lần → 2 dự án `GOLDEN-SCHED-*` còn lại), và dự án rác làm các
// bài đếm dự án khác đỏ. `cleanupProjectsOnExit` liệt kê 34 bảng con rồi mới xoá dự án.
cleanupProjectsOnExit(['GOLDEN-SCHED-%'], { label: 'sched-golden' });

const rep = await commit(p, proj.id, 'BOH');
ok(rep.ok === 4 && rep.errors === 0, `commit ok=4 (got ${rep.ok}/${rep.errors})`);
const rep2 = await commit(p, proj.id, 'BOH');
ok(rep2.ok === 4 && rep2.errors === 0, 're-commit idempotent (upsert, no dup errors)');
const cnt = await db.prepare('SELECT count(*)::int c FROM construction_schedule_items WHERE project_id = ?').getAsync(proj.id);
ok(cnt.c === 4, `4 items persisted, no dup rows (got ${cnt.c})`);

await closeDb();

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
