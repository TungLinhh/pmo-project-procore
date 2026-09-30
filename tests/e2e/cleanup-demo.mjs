// Demo cleanup — removes test-junk projects + marks demo bell read.
// Patterns cover every suite that creates throwaways on the DEV database:
// DRILL-*, WIZ-AUTH-*, P0-06-*, P0-07-*, TR-*, CH-*, CH-TEST-*, CH-DEPT-*,
// SEQ-*, TX-*, REJ-TEST-*, P1-CLOSE-*, directive-p0-05-*, E2E issues/directives.
// Safe: never touches the 3 real projects (ids 1,2,3) or real data.
// Run: node tests/e2e/cleanup-demo.mjs
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sh = (sql) => execSync(`bash backend/scripts/pg-ctl.sh psql -t -A -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8', cwd: ROOT }).trim();
const exec = (sql) => execSync(`bash backend/scripts/pg-ctl.sh psql -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf8', cwd: ROOT });

const PATTERNS = ['DRILL-%', 'WIZ-AUTH-%', 'P0-06-%', 'P0-07-%', 'TR-TEST-%', 'TR-MS-%', 'TR-CT-%', 'TR-INV-%', 'TR-PR-%',
  'CH-TEST-%', 'CH-DEPT-%', 'SEQ-%', 'TX-OK', 'REJ-TEST-%', 'REJ-MS-%', 'P1-CLOSE-%', 'FRESH-%', 'PAY-SLA-%',
  'CNT-TEST-%', 'INV-TEST-%', 'PR-TEST-%', 'PR-NEG-%', 'SUB-TEST-%', 'TEST-L5-%', 'TEST-ESC-%', 'p0-05-%', 'DL-%']; // DL-*: deadline-replan scratch
const like = (col) => PATTERNS.map((p) => `${col} LIKE '${p}'`).join(' OR ');

const junkProjects = sh(`SELECT COALESCE(string_agg(id::text, ','), '') FROM projects WHERE id NOT IN (1,2,3) AND (${like('code')});`);
if (junkProjects) {
  const ids = junkProjects;
  exec(`DELETE FROM daily_photos WHERE daily_report_id IN (SELECT id FROM daily_reports WHERE project_id IN (${ids}));`);
  exec(`DELETE FROM daily_manpower WHERE daily_report_id IN (SELECT id FROM daily_reports WHERE project_id IN (${ids}));`);
  exec(`DELETE FROM daily_work_items WHERE daily_report_id IN (SELECT id FROM daily_reports WHERE project_id IN (${ids}));`);
  exec(`DELETE FROM daily_materials WHERE daily_report_id IN (SELECT id FROM daily_reports WHERE project_id IN (${ids}));`);
  exec(`DELETE FROM daily_acceptance WHERE daily_report_id IN (SELECT id FROM daily_reports WHERE project_id IN (${ids}));`);
  exec(`DELETE FROM daily_reports WHERE project_id IN (${ids});`);
  exec(`DELETE FROM payments WHERE project_id IN (${ids});`);
  exec(`DELETE FROM payment_requests WHERE invoice_id IN (SELECT i.id FROM invoices i JOIN contracts c ON c.id = i.contract_id WHERE c.project_id IN (${ids}));`);
  exec(`DELETE FROM invoices WHERE contract_id IN (SELECT id FROM contracts WHERE project_id IN (${ids}));`);
  exec(`DELETE FROM contracts WHERE project_id IN (${ids});`);
  exec(`DELETE FROM ar_lines WHERE project_id IN (${ids});`);
  exec(`DELETE FROM ar_contracts WHERE project_id IN (${ids});`);
  exec(`DELETE FROM construction_schedule_items WHERE project_id IN (${ids});`);
  exec(`DELETE FROM materials WHERE project_id IN (${ids});`);
  exec(`DELETE FROM shop_drawings WHERE project_id IN (${ids});`);
  exec(`DELETE FROM material_submittals WHERE project_id IN (${ids});`);
  exec(`DELETE FROM file_uploads WHERE project_id IN (${ids});`);
  exec(`DELETE FROM issues WHERE project_id IN (${ids});`);
  exec(`DELETE FROM notifications WHERE project_id IN (${ids});`);
  exec(`DELETE FROM zones WHERE project_id IN (${ids});`);
  exec(`DELETE FROM project_members WHERE project_id IN (${ids});`);
  exec(`DELETE FROM projects WHERE id IN (${ids});`);
  console.log(`removed junk projects: ${ids}`);
} else {
  console.log('no junk projects');
}

// Common-code leftovers (any project, incl. real ones — patterns are test-only)
exec(`DELETE FROM shop_drawings WHERE drawing_code LIKE 'TR-TEST-%' OR drawing_code LIKE 'CH-TEST-%' OR drawing_code LIKE 'CH-DEPT-%' OR drawing_code LIKE 'REJ-TEST-%' OR drawing_code LIKE 'TEST-L5-%' OR drawing_code LIKE 'P0-07%';`);
exec(`DELETE FROM material_submittals WHERE submittal_code LIKE 'TR-MS-%' OR submittal_code LIKE 'TEST-ESC-%' OR submittal_code LIKE 'SUB-TEST-%' OR submittal_code LIKE 'REJ-MS-%';`);
exec(`DELETE FROM payments WHERE payment_request_id IN (SELECT id FROM payment_requests WHERE request_no LIKE 'TR-PR-%' OR request_no LIKE 'PR-TEST-%' OR request_no LIKE 'PR-NEG-%');`);
exec(`DELETE FROM payment_requests WHERE request_no LIKE 'TR-PR-%' OR request_no LIKE 'PR-TEST-%' OR request_no LIKE 'PR-NEG-%';`);
exec(`DELETE FROM invoices WHERE invoice_no LIKE 'TR-INV-%' OR invoice_no LIKE 'INV-TEST-%';`);
exec(`DELETE FROM contracts WHERE contract_no LIKE 'TR-CT-%' OR contract_no LIKE 'CNT-TEST-%';`);
exec(`DELETE FROM zones WHERE code LIKE 'SEQ-%';`);
exec(`DELETE FROM materials WHERE material_code LIKE 'TEST%';`);
exec(`DELETE FROM directives WHERE body LIKE 'directive-p0-05-%' OR body = 'E2E test directive';`);
exec(`DELETE FROM issues WHERE title = 'E2E test issue';`);
exec(`DELETE FROM kpi_targets WHERE kpi_code = 'TEST_E2E';`);
exec(`DELETE FROM schedule_baselines WHERE notes = 'E2E test baseline';`);
// Phiên đăng nhập tích luỹ. Bản đầu chỉ dọn token **đã thu hồi** hoặc **hết hạn**,
// nên token còn hiệu lực của các lần chạy e2e tích luỹ vô hạn — đo 2026-09-30:
// 10 150 dòng, và bảng vượt sàn `RETENTION_MIN_ROWS` (10 000) nên
// `tests/e2e/retention.mjs` đỏ vì giả định "bảng nhỏ được bảo vệ" không còn đúng.
// Xoá hết token phiên: chỉ buộc đăng nhập lại, không mất dữ liệu nghiệp vụ.
exec(`DELETE FROM auth_refresh_tokens;`);
exec(`DELETE FROM auth_revoked_jti WHERE expires_at < now() + INTERVAL '1 day';`);

// Tài khoản thử do bài kiểm tạo mà **không tự dọn** (đo 2026-09-30: còn sót
// `admin@pilot.test` với role `admin`). Năm bài tạo ra nó:
// realtime, deadline-replan, ai-assistant, cross-tenant-guard, password-rotation.
// Xoá theo thứ tự khoá ngoại: link lịch → digest → notifications → user.
// Giữ đúng tên miền demo `@hbg.com`; không đụng tài khoản thật.
// Xoá user thử **có thể không được**, và đó là hệ quả đúng chứ không phải lỗi:
// `audit_log` cố ý giữ dấu vết nên có khoá ngoại tới `users` ⇒ mọi dòng audit mà user
// thử sinh ra chặn việc xoá user đó. Xoá audit để xoá user là **đánh đổi không nên làm**
// (mất dấu vết chỉ để dọn một tài khoản thử).
//
// Nên: dọn hết thứ có thể dọn, rồi **báo** phần còn lại thay vì để script crash — một
// kịch bản dọn crash ở dòng cuối thì mất luôn phần đã dọn trước đó trong lần chạy đó.
for (const uid of (sh(`SELECT string_agg(id::text, ',') FROM users WHERE email LIKE '%@pilot.test';`) || '')
  .split(',').filter(Boolean)) {
  exec(`DELETE FROM schedule_links WHERE created_by = ${uid};`);
  exec(`DELETE FROM attention_digest_runs WHERE user_id = ${uid};`);
  exec(`DELETE FROM notifications WHERE user_id = ${uid};`);
  exec(`DELETE FROM auth_refresh_tokens WHERE user_id = ${uid};`);
  try {
    exec(`DELETE FROM users WHERE id = ${uid};`);
    console.log(`  xoá user thử id=${uid}`);
  } catch (e) {
    const why = /audit_log_user_id/.test(e.message)
      ? 'còn dòng audit_log tham chiếu (giữ dấu vết — không xoá)'
      : e.message.split('\n')[0].slice(0, 90);
    console.log(`  · user thử id=${uid} giữ lại: ${why}`);
    console.log('    → nguồn rác: realtime, deadline-replan, ai-assistant, cross-tenant-guard, password-rotation');
  }
}
exec(`UPDATE notifications SET read_at = COALESCE(read_at, now());`);
console.log('cleared test rows + bell (all users marked read)');

console.log(`projects now: ${sh(`SELECT string_agg(code, ',' ORDER BY id) FROM projects;`)}`);
console.log(`unread bell (admin): ${sh(`SELECT COUNT(*) FROM notifications WHERE user_id = 1 AND read_at IS NULL;`)}`);
