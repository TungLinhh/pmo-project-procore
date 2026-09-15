// Bổ sung demo data TEST-MASTER-01 (project 3) - đầy đủ mọi state cho demo
//  - Shop Drawing: 5 status phân tán, có rejected_reason, approval_date
//  - Material Submittal: workflow đủ, revision > 1, overdue SLA
//  - Payment: status đủ, retention/VAT, due_date quá hạn
//  - Issue: 4 severity x nhiều status, có CEO directive
//  - KPI: period_lock=true và false
//  - Area hierarchy: Project -> Building -> Zone -> Floor -> Area -> Work Item
//  - Notification: critical/warning/info
//  - Dashboard pillars: pie > 0
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

const db = new Database('/home/vutun/pmo_project/backend/data/pmo.db');
const PROJECT_ID = 3;
const TENANT_ID = 1;
const now = new Date();
const isoNow = now.toISOString();
const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();
const daysAhead = (n) => new Date(now.getTime() + n * 86400000).toISOString();

console.log('=== TEST-MASTER-01 (project 3) demo data enrichment ===\n');

// ========== 1. Shop Drawing: phân tán 5 status ==========
console.log('[1] Shop Drawing - distribute to 5 status...');
const updateShop = db.prepare(`UPDATE shop_drawings SET status = ?, rejected_reason = COALESCE(?, rejected_reason),
  approval_date = COALESCE(?, approval_date), bql_l1_response = COALESCE(?, bql_l1_response), bql_l2_response = COALESCE(?, bql_l2_response)
  WHERE id = ?`);
const shopCount = db.prepare(`SELECT count(*) c FROM shop_drawings WHERE project_id = ?`).get(PROJECT_ID).c;
const shopIds = db.prepare(`SELECT id FROM shop_drawings WHERE project_id = ? ORDER BY id`).all(PROJECT_ID);
// Distribute: 5 DRAFT, 5 SUBMITTED, 5 REVIEW, 5 APPROVED, 5 REJECTED
const shopDistribution = ['DRAFT', 'DRAFT', 'DRAFT', 'DRAFT', 'DRAFT', 'SUBMITTED', 'SUBMITTED', 'SUBMITTED', 'SUBMITTED', 'SUBMITTED',
  'REVIEW', 'REVIEW', 'REVIEW', 'REVIEW', 'REVIEW', 'APPROVED', 'APPROVED', 'APPROVED', 'APPROVED', 'APPROVED',
  'REJECTED', 'REJECTED', 'REJECTED', 'REJECTED', 'REJECTED'];
let sUpd = 0;
for (let i = 0; i < Math.min(shopIds.length, 50); i++) {
  const status = shopDistribution[i] || 'DRAFT';
  const rejected_reason = status === 'REJECTED' ? 'Chưa đúng kích thước theo bản vẽ kiến trúc - cần revise' : null;
  const approval_date = status === 'APPROVED' ? daysAgo(i + 1) : null;
  const l1 = (status === 'SUBMITTED' || status === 'REVIEW' || status === 'APPROVED' || status === 'REJECTED') ? 'APPROVED' : null;
  const l2 = (status === 'REVIEW' || status === 'APPROVED' || status === 'REJECTED') ? 'APPROVED' : null;
  updateShop.run(status, rejected_reason, approval_date, l1, l2, shopIds[i].id);
  sUpd++;
}
console.log(`  Updated ${sUpd} shop_drawings`);

// ========== 2. Material Submittal: workflow + revision > 1 + overdue ==========
console.log('\n[2] Material Submittal - add revision + overdue + DRAFT/PENDING...');
// Add 10 more with revision > 1 and overdue
const addSubmittal = db.prepare(`INSERT INTO material_submittals (project_id, material_id, submittal_code, status, sla_days, sla_deadline, revision_number, parent_submittal_id, submitted_by, submitted_date, approved_by, approved_date, rejected_at, rejection_reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const submittalStatuses = ['DRAFT', 'DRAFT', 'PENDING', 'PENDING', 'SUBMITTED', 'SUBMITTED', 'SUBMITTED', 'APPROVED', 'APPROVED', 'REJECTED'];
let subAdd = 0;
for (let i = 0; i < 10; i++) {
  const status = submittalStatuses[i];
  const mat = db.prepare('SELECT id FROM materials WHERE project_id = ? LIMIT 1 OFFSET ?').get(PROJECT_ID, i);
  if (!mat) continue;
  const rev = i % 3 === 0 ? 2 : (i % 2 === 0 ? 1 : 0);
  const overdue = i < 3 ? daysAgo(2) : daysAhead(7);
  addSubmittal.run(
    PROJECT_ID, mat.id, `SUBM-DEMO-${PROJECT_ID}-${100 + i}`,
    status, 7, overdue, rev, null,
    status !== 'DRAFT' ? 1 : null,
    status !== 'DRAFT' ? daysAgo(5) : null,
    status === 'APPROVED' ? 1 : null,
    status === 'APPROVED' ? daysAgo(1) : null,
    status === 'REJECTED' ? isoNow : null,
    status === 'REJECTED' ? 'Cần bổ sung chứng chỉ chất lượng' : null,
    daysAgo(10)
  );
  subAdd++;
}
console.log(`  Added ${subAdd} new material_submittals`);

// ========== 3. Payment milestones: full status + retention/VAT + overdue ==========
console.log('\n[3] Payment milestones - distribute to 5 status...');
// Schema: project_id, ordinal, description, volume, value_vnd, approval_status, quality_docs_status, overall_status
// Insert mới vì project 3 chưa có
const addPay = db.prepare(`INSERT INTO payment_milestones (project_id, ordinal, description, volume, value_vnd, approval_status, quality_docs_status, overall_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const payStatuses = ['PLANNED', 'PLANNED', 'PLANNED', 'SUBMITTED', 'SUBMITTED', 'SUBMITTED', 'APPROVED', 'APPROVED', 'PAID', 'PAID', 'OVERDUE'];
let payAdd = 0;
for (let i = 0; i < payStatuses.length; i++) {
  const status = payStatuses[i];
  addPay.run(
    PROJECT_ID, i + 1, `Đợt thanh toán ${i + 1} - Hạng mục tháng ${i + 1}`,
    1000 + i * 100, 50000000 + i * 10000000,
    status === 'APPROVED' || status === 'PAID' ? 'APPROVED' : (status === 'SUBMITTED' || status === 'OVERDUE' ? 'PENDING' : null),
    status === 'PAID' ? 'COMPLETE' : (status === 'APPROVED' ? 'VERIFIED' : 'PENDING'),
    status, daysAgo(15)
  );
  payAdd++;
}
console.log(`  Added ${payAdd} payment_milestones`);

// ========== 4. Issues: 4 severity x status + CEO directive ==========
console.log('\n[4] Issues - 4 severity x 4 status + CEO directive...');
// Schema: tenant_id, project_id, source_resource, source_id, title, body, category, severity, status, zone_id
const addIssue = db.prepare(`INSERT INTO issues (tenant_id, project_id, source_resource, source_id, title, body, category, severity, status, zone_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const issueData = [
  { sev: 'CRITICAL', status: 'OPEN', title: 'Foundation crack tại zone A2', body: 'Phát hiện vết nứt 30mm tại cột C5. Cần xử lý ngay.' },
  { sev: 'CRITICAL', status: 'IN_PROGRESS', title: 'Khoan cọc sai vị trí BOH-15', body: 'Sai 50mm so với bản vẽ. Đã dừng thi công.' },
  { sev: 'CRITICAL', status: 'ESCALATED', title: 'Thiếu safety harness 12 cái', body: 'Yêu cầu cấp bách cho công nhân tầng 8.' },
  { sev: 'HIGH', status: 'OPEN', title: 'Material delivery trễ 5 ngày', body: 'MEP package 2 chưa về site.' },
  { sev: 'HIGH', status: 'IN_PROGRESS', title: 'Shop drawing BOH-HVAC bị reject', body: 'Đang revise v2, dự kiến nộp lại 25/5.' },
  { sev: 'HIGH', status: 'ESCALATED', title: 'CCTV không hoạt động zone B', body: 'Đã escalate CEO' },
  { sev: 'MEDIUM', status: 'OPEN', title: 'Punch list tầng 5 còn 8 items', body: 'Cần xử lý trước khi bàn giao.' },
  { sev: 'MEDIUM', status: 'IN_PROGRESS', title: 'RFI 23 chưa được trả lời', body: 'Consultant trễ response 4 ngày.' },
  { sev: 'MEDIUM', status: 'RESOLVED', title: 'Beton không đạt cường độ zone C', body: 'Đã test lại, đạt yêu cầu.' },
  { sev: 'LOW', status: 'OPEN', title: 'Vệ sinh kho vật tư chưa sạch', body: 'Yêu cầu dọn trong tuần.' },
  { sev: 'LOW', status: 'RESOLVED', title: 'Thiếu biển báo 1 số khu vực', body: 'Đã lắp đặt xong.' },
  { sev: 'LOW', status: 'CLOSED', title: 'Bảo hộ lao động thiếu 3 bộ', body: 'Đã cấp bổ sung, closed.' },
];
let issAdd = 0;
for (const it of issueData) {
  addIssue.run(
    TENANT_ID, PROJECT_ID, 'manual', null, it.title, it.body,
    it.sev === 'CRITICAL' ? 'SAFETY' : (it.sev === 'HIGH' ? 'PROGRESS' : 'QUALITY'),
    it.sev, it.status, 1 + (issAdd % 5),
    daysAgo(7), daysAgo(7)
  );
  issAdd++;
}
console.log(`  Added ${issAdd} issues`);

// Add CEO directive for escalated issues
// Schema: tenant_id, project_id, issue_id, from_user_id, from_user_name, body, notify_to_user_ids
const addDirective = db.prepare(`INSERT INTO directives (tenant_id, project_id, issue_id, from_user_id, from_user_name, body, notify_to_user_ids) VALUES (?, ?, ?, ?, ?, ?, ?)`);
addDirective.run(TENANT_ID, PROJECT_ID, null, 2, 'CEO Tùng',
  'CEO Directive: Safety violation zone B. Yêu cầu dừng thi công zone B cho đến khi có safety harness đầy đủ.',
  '1,2,3,4,5,6,7');
console.log(`  Added 1 CEO directive`);

// ========== 5. KPI: period_lock=true + false ==========
console.log('\n[5] KPI - period_lock true/false...');
// Update existing 4 to have mix
const kpis = db.prepare('SELECT id FROM kpi_targets WHERE project_id = ?').all(PROJECT_ID);
const lockStates = [true, false, true, false];
kpis.forEach((k, i) => {
  db.prepare('UPDATE kpi_targets SET period_lock = ? WHERE id = ?').run(lockStates[i] ? 1 : 0, k.id);
});
// Add 2 more (KPI schema: project_id, kpi_code, name_vi, target_value, actual_value, unit, period_start, period_end, period_lock)
const addKpi = db.prepare(`INSERT INTO kpi_targets (project_id, kpi_code, name_vi, target_value, actual_value, unit, period_start, period_end, period_lock, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
addKpi.run(PROJECT_ID, 'SAFETY_INCIDENTS', 'Tai nạn lao động', 0, 2, 'incidents', '2026-Q1', '2026-Q1', 1, 'Period locked vì Q1 đã đóng', daysAgo(60));
addKpi.run(PROJECT_ID, 'MILESTONE_ON_TIME', 'Cột mốc đúng hạn', 90, 78, '%', '2026-Q2', '2026-Q2', 0, 'Q2 đang chạy, chưa lock', daysAgo(30));
console.log(`  Set lock states + 2 new KPIs`);

// ========== 6. Area hierarchy: Project > Building > Zone > Floor > Area > Work Item ==========
console.log('\n[6] Area hierarchy - Project -> Building -> Zone -> Floor -> Area...');
// Schema: project_id, parent_id, level, code, name_vi, name_en, sort_order
// Level options: building, floor, area, room
const zones = db.prepare('SELECT id, code FROM zones WHERE project_id = ?').all(PROJECT_ID);
const addArea = db.prepare(`INSERT INTO area_hierarchy (project_id, parent_id, level, code, name_vi, name_en, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
let areaAdd = 0;
for (let z = 0; z < Math.min(zones.length, 3); z++) {
  const zone = zones[z];
  // 1. Building per zone
  const bRes = addArea.run(PROJECT_ID, null, 'building',
    `BLD-${zone.code}`, `Tòa nhà ${zone.code}`, `Building ${zone.code}`, z * 100 + 1, daysAgo(60));
  const buildingId = bRes.lastInsertRowid;
  // 2. 3 floors per building
  for (let f = 0; f < 3; f++) {
    const fRes = addArea.run(PROJECT_ID, buildingId, 'floor',
      `FLR-${zone.code}-${f + 1}`, `Tầng ${f + 1}`, `Floor ${f + 1}`, f + 1, daysAgo(60));
    const floorId = fRes.lastInsertRowid;
    // 3. 2 areas per floor
    for (let a = 0; a < 2; a++) {
      addArea.run(PROJECT_ID, floorId, 'area',
        `AREA-${zone.code}-${f + 1}-${a + 1}`, `Khu vực ${a + 1} tầng ${f + 1}`,
        `Area ${a + 1} floor ${f + 1}`, a + 1, daysAgo(60));
      areaAdd++;
    }
  }
}
console.log(`  Added ${areaAdd} areas under 3 buildings x 3 floors`);

// ========== 7. Notification: critical/warning/info balance ==========
console.log('\n[7] Notifications - more critical + warning...');
// Notifications schema: tenant_id, user_id, project_id, issue_id, channel, delivery_status, severity, title, body, resource_type, resource_id
const addNotif = db.prepare(`INSERT INTO notifications (tenant_id, user_id, project_id, issue_id, channel, delivery_status, severity, title, body, resource_type, resource_id, sent_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const notifData = [
  { sev: 'critical', title: 'CRITICAL: Foundation crack zone A2', body: 'Phát hiện vết nứt 30mm. Đã issue #1.' },
  { sev: 'critical', title: 'CRITICAL: Khoan cọc sai vị trí', body: 'Dừng thi công BOH-15.' },
  { sev: 'critical', title: 'CRITICAL: Safety violation zone B', body: 'CEO directive yêu cầu dừng thi công.' },
  { sev: 'critical', title: 'CRITICAL: CFO payment overdue', body: '5 payment requests đã quá hạn.' },
  { sev: 'warning', title: 'WARNING: Material delivery trễ 5 ngày', body: 'MEP package 2 chưa về site.' },
  { sev: 'warning', title: 'WARNING: Shop drawing revision', body: '15 drawings đang ở status REJECTED.' },
  { sev: 'warning', title: 'WARNING: 3 KPI targets underperforming', body: 'MILESTONE_ON_TIME đang dưới target.' },
  { sev: 'warning', title: 'WARNING: 3 issues chưa resolve 7 ngày', body: 'Cần escalate.' },
  { sev: 'info', title: 'INFO: Daily report 25/5 submitted', body: 'C20 ngày 25.5.2021 đã được nộp.' },
  { sev: 'info', title: 'INFO: 4 shopdrawings approved', body: 'BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-015 và 3 bản khác.' },
  { sev: 'info', title: 'INFO: Weekly sync 9h sáng mai', body: 'Tất cả PM tham dự.' },
];
let nAdd = 0;
for (const n of notifData) {
  addNotif.run(
    TENANT_ID, 1, PROJECT_ID, null, 'in_app', 'sent', n.sev, n.title, n.body,
    'issue', null, isoNow, daysAgo(Math.floor(Math.random() * 3))
  );
  nAdd++;
}
console.log(`  Added ${nAdd} notifications`);

// ========== 8. Verify dashboard pie data source ==========
console.log('\n[8] Verify dashboard pie data sources...');
const verifyQueries = [
  ['shop_dashboard_pie', `SELECT status, count(*) c FROM shop_drawings WHERE project_id = ${PROJECT_ID} GROUP BY status`],
  ['material_dashboard', `SELECT count(*) c FROM materials WHERE project_id = ${PROJECT_ID}`],
  ['payment_dashboard', `SELECT overall_status, count(*) c FROM payment_milestones WHERE project_id = ${PROJECT_ID} GROUP BY overall_status`],
  ['construction_dashboard', `SELECT count(*) c FROM construction_schedule_items WHERE project_id = ${PROJECT_ID}`],
];
for (const [name, q] of verifyQueries) {
  const r = db.prepare(q).all();
  console.log(`  ${name}: ${JSON.stringify(r)}`);
}

db.close();
console.log('\n=== DONE ===');
