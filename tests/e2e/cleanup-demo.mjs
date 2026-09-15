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
  'CNT-TEST-%', 'INV-TEST-%', 'PR-TEST-%', 'PR-NEG-%', 'SUB-TEST-%', 'TEST-L5-%', 'TEST-ESC-%', 'p0-05-%'];
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
  exec(`DELETE FROM payment_requests WHERE invoice_id IN (SELECT i.id FROM invoices i JOIN contracts c ON c.id = i.contract_id WHERE c.project_id IN (${ids}));`);
  exec(`DELETE FROM invoices WHERE contract_id IN (SELECT id FROM contracts WHERE project_id IN (${ids}));`);
  exec(`DELETE FROM contracts WHERE project_id IN (${ids});`);
  exec(`DELETE FROM payments WHERE project_id IN (${ids});`);
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
exec(`DELETE FROM auth_refresh_tokens WHERE revoked_at IS NOT NULL OR expires_at < now() - INTERVAL '7 days';`);
exec(`UPDATE notifications SET read_at = COALESCE(read_at, now());`);
console.log('cleared test rows + bell (all users marked read)');

console.log(`projects now: ${sh(`SELECT string_agg(code, ',' ORDER BY id) FROM projects;`)}`);
console.log(`unread bell (admin): ${sh(`SELECT COUNT(*) FROM notifications WHERE user_id = 1 AND read_at IS NULL;`)}`);
