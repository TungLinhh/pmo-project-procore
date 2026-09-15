// Seed demo data for empty/unpopulated tables so all MVP screens render.
// Idempotent: checks existing counts before inserting.
// TODO: thay bằng dữ liệu thật khi có project mới.
import Database from 'better-sqlite3';
const DB_PATH = '/home/vutun/pmo_project/backend/data/pmo.db';
const db = new Database(DB_PATH);

function ensure(...args) {
  // returns id
  return args[0];
}

function exists(table) {
  return db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get().c;
}

console.log('=== Seed demo data ===');

// 1) ISSUES — chỉ seed nếu chưa có
if (exists('issues') === 0) {
  console.log('Seeding issues...');
  const issues = [
    // BTE project (id=1) - Construction
    { p: 1, src: 'construction_schedule_items', src_id: 1, title: 'Construction chậm 6% so với plan', body: 'Zone BOH construction schedule đang ở 47% (planned 53%). 6% delta đã kéo dài 3 tuần.', cat: 'PROGRESS', sev: 'CRITICAL', stat: 'OPEN' },
    { p: 1, src: 'construction_schedule_items', src_id: 50, title: 'Overdue 463 items (BOH)', body: '463 items tại zone BOH đã quá plan_end_date mà chưa hoàn thành. Cần ưu tiên review với site team.', cat: 'PROGRESS', sev: 'CRITICAL', stat: 'OPEN' },
    { p: 1, src: 'shop_drawings', src_id: 1, title: 'Shopdrawing HVAC chưa approved (15 drawings)', body: '15 drawings HVAC zone BOH đã submit nhưng chưa được BQL review. Có thể ảnh hưởng construction MEP.', cat: 'DESIGN', sev: 'HIGH', stat: 'IN_PROGRESS' },
    { p: 1, src: 'shop_drawings', src_id: 7, title: 'BQL yêu cầu revision drawing BTE-SHD-STR-FND-BOH-003', body: 'L1 response = R. Lý do: missing anchor bolt details cho zone BOH foundation.', cat: 'DESIGN', sev: 'HIGH', stat: 'OPEN' },
    { p: 1, src: 'materials', src_id: 1, title: 'Material MEP zone BOH delivery delayed 5 ngày', body: 'MEP material (HVAC ducts, electrical conduits) bị delay do supplier logistics issue. ETA lùi 5 ngày.', cat: 'MATERIAL', sev: 'HIGH', stat: 'ACK' },
    { p: 1, src: 'materials', src_id: 5, title: '8 materials vượt thời gian lead time', body: 'Danh sách vật tư có 8 items đã vượt lead time dự kiến. Cần verify với procurement.', cat: 'MATERIAL', sev: 'MEDIUM', stat: 'IN_PROGRESS' },
    { p: 1, src: 'materials', src_id: 12, title: '3 materials critical ảnh hưởng trực tiếp BOH', body: 'Material Submittal cho BOH chưa duyệt: structural steel grade A36, fire damper, anchor bolts.', cat: 'MATERIAL', sev: 'CRITICAL', stat: 'OPEN' },
    { p: 1, src: 'payment_milestones', src_id: 1, title: '2 payment requests overdue (80 triệu)', body: '2 payment milestones đã vượt due date 14 ngày, tổng giá trị 80 triệu VND. NCC chưa nhận được.', cat: 'PAYMENT', sev: 'HIGH', stat: 'OPEN' },
    { p: 1, src: 'payment_milestones', src_id: 5, title: 'Payment milestone 5 thiếu quality docs', body: 'Milestone #5 value 45 triệu chưa có chứng từ chất lượng. Cần bổ sung từ QC team.', cat: 'PAYMENT', sev: 'MEDIUM', stat: 'OPEN' },
    { p: 1, src: null, src_id: null, title: 'Quality issue: bê tông thương phẩm zone RES-3BR', body: 'Sample bê tông ngày 18/5/2021 chưa đạt 28-day strength theo QC report. Đề xuất test lại.', cat: 'QUALITY', sev: 'HIGH', stat: 'IN_PROGRESS' },
    // Lawrence project (id=2)
    { p: 2, src: 'construction_schedule_items', src_id: 600, title: 'LAWRENCE: 12 items overdue', body: '12 construction items tại Lawrence Sting 2 quá plan_end_date. So với tổng 0 items (chưa ingest cho project 2).', cat: 'PROGRESS', sev: 'HIGH', stat: 'OPEN' },
    { p: 2, src: 'shop_drawings', src_id: 105, title: 'LAWRENCE: 0 shop drawings', body: 'Project Lawrence chưa có shop drawing nào trong hệ thống. Cần đẩy từ team.', cat: 'DESIGN', sev: 'MEDIUM', stat: 'OPEN' },
  ];
  const ins = db.prepare(`INSERT INTO issues (tenant_id, project_id, source_resource, source_id, title, body, category, severity, status, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-' || ? || ' hours'), datetime('now', '-' || ? || ' hours'))`);
  const ages = [2, 5, 24, 30, 18, 48, 12, 72, 96, 36, 4, 6];
  issues.forEach((i, idx) => {
    const age = ages[idx] || 12;
    ins.run(i.p, i.src, i.src_id, i.title, i.body, i.cat, i.sev, i.stat, age, age);
  });
  console.log(`  Seeded ${issues.length} issues`);
} else {
  console.log(`issues: ${exists('issues')} rows exist, skip`);
}

// 2) NOTIFICATIONS — sinh từ issues + thêm demo khác
if (exists('notifications') === 0) {
  console.log('Seeding notifications...');
  // Lấy issues vừa tạo
  const allIssues = db.prepare('SELECT id, project_id, title, severity FROM issues').all();
  const insN = db.prepare(`INSERT INTO notifications (tenant_id, user_id, project_id, issue_id, severity, title, body, resource_type, resource_id, read_at, created_at) VALUES (1, NULL, ?, ?, ?, ?, ?, 'issue', ?, ?, datetime('now', '-' || ? || ' hours'))`);
  let n = 0;
  for (const i of allIssues) {
    const sev = i.severity === 'CRITICAL' ? 'critical' : i.severity === 'HIGH' ? 'warning' : 'info';
    insN.run(i.project_id, i.id, sev, i.title, 'Click để xem chi tiết issue #ID' + i.id, i.id, n < 3 ? 0 : 1, Math.floor(Math.random() * 24) + 1);
    n++;
  }
  // Thêm 3 notifications không liên quan issue
  db.prepare(`INSERT INTO notifications (tenant_id, user_id, project_id, issue_id, severity, title, body, resource_type, resource_id, read_at, created_at) VALUES (1, NULL, 1, NULL, 'info', 'Daily report submitted', 'Nguyễn Văn Định nộp báo cáo C20 ngày 23.5.2021', 'daily_report', NULL, 1, datetime('now', '-1 days'))`).run();
  db.prepare(`INSERT INTO notifications (tenant_id, user_id, project_id, issue_id, severity, title, body, resource_type, resource_id, read_at, created_at) VALUES (1, NULL, 1, NULL, 'info', 'Shopdrawing approved', 'BTE-WP4-HBC-SHD-MEP-HVAC-HVA-BOH-015 đã được BQL L2 approve', 'shop_drawing', 1, 1, datetime('now', '-2 days'))`).run();
  db.prepare(`INSERT INTO notifications (tenant_id, user_id, project_id, issue_id, severity, title, body, resource_type, resource_id, read_at, created_at) VALUES (1, NULL, 1, NULL, 'warning', 'Material submittal overdue', 'MEP-PLB-001 chưa nộp sau 14 ngày từ khi tạo', 'material_submittal', 1, 0, datetime('now', '-8 hours'))`).run();
  console.log(`  Seeded ${n + 3} notifications`);
} else {
  console.log(`notifications: ${exists('notifications')} rows exist, skip`);
}

// 3) AUDIT LOG — seed một số events mẫu
if (exists('audit_log') === 0) {
  console.log('Seeding audit_log...');
  const evs = [
    { u: 1, n: 'Admin HBG', a: 'CREATE', rt: 'shop_drawing', ri: 1, fn: null, ov: null, nv: null, note: 'Upload Shop BOH.xlsx', hours: 48 },
    { u: 1, n: 'Admin HBG', a: 'UPDATE', rt: 'construction_item', ri: 1, fn: 'progress_pct', ov: '0.3', nv: '0.47', note: null, hours: 12 },
    { u: 1, n: 'Admin HBG', a: 'STATUS_CHANGE', rt: 'shop_drawing', ri: 1, fn: 'status', ov: 'PENDING', nv: 'REVIEW', note: null, hours: 6 },
    { u: 1, n: 'Admin HBG', a: 'DIRECTIVE', rt: 'issue', ri: 1, fn: null, ov: null, nv: null, note: 'CEO directive: Ưu tiên vendor HVAC mới, họp lại tuần sau', hours: 3 },
    { u: 1, n: 'Admin HBG', a: 'CREATE', rt: 'project', ri: 1, fn: null, ov: null, nv: null, note: 'Project BTE-WP4-HBC created', hours: 720 },
  ];
  const ins = db.prepare(`INSERT INTO audit_log (tenant_id, user_id, user_name, action, resource_type, resource_id, field_name, old_value, new_value, note, created_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-' || ? || ' hours'))`);
  evs.forEach(e => ins.run(e.u, e.n, e.a, e.rt, e.ri, e.fn || null, e.ov, e.nv, e.note, e.hours));
  console.log(`  Seeded ${evs.length} audit events`);
} else {
  console.log(`audit_log: ${exists('audit_log')} rows exist, skip`);
}

// 4) DIRECTIVES — seed mẫu (CEO/PMO ghi chú)
if (exists('directives') === 0) {
  console.log('Seeding directives...');
  const ds = [
    { p: 1, i: 1, u: 1, n: 'Admin HBG (CEO)', body: 'Ưu tiên nhà cung cấp HVAC đã thẩm định. Họp lại thứ 6 tuần sau với vendor X để chốt timeline mới. PM BTE chuẩn bị slide tổng hợp.', notify: '[2,3]', hours: 3 },
    { p: 1, i: 2, u: 1, n: 'Admin HBG (CEO)', body: 'Vấn đề overdue 463 items BOH cần escalate. Đề xuất tách nhóm nhỏ (5 tổ đội), mỗi nhóm phụ trách 1 cluster zone. PM báo cáo mỗi 2 ngày.', notify: '[2]', hours: 8 },
    { p: 1, i: 5, u: 1, n: 'Admin HBG (CEO)', body: 'Material delay 5 ngày: chấp nhận được vì không ảnh hưởng critical path. Nhưng cần lock-in alternative supplier cho MEP zone BOH ngay trong tuần này.', notify: '[2,4]', hours: 24 },
    { p: 1, i: null, u: 1, n: 'Admin HBG (PMO)', body: 'Tuần này tập trung: 1) dọn shopdrawing backlog 2) chốt payment milestone 5 3) review quality issue BOH. CEO sẽ review dashboard thứ 4 hàng tuần.', notify: '[2,3,4]', hours: 36 },
  ];
  const ins = db.prepare(`INSERT INTO directives (tenant_id, project_id, issue_id, from_user_id, from_user_name, body, notify_to_user_ids, created_at) VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now', '-' || ? || ' hours'))`);
  ds.forEach(d => ins.run(d.p, d.i, d.u, d.n, d.body, d.notify, d.hours));
  console.log(`  Seeded ${ds.length} directives`);
} else {
  console.log(`directives: ${exists('directives')} rows exist, skip`);
}

console.log('=== Done ===');
console.log('Final counts:');
['issues', 'notifications', 'audit_log', 'directives'].forEach(t => {
  console.log(`  ${t}: ${exists(t)}`);
});
