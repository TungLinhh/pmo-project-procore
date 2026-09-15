// Seed thêm data cho TEST-MASTER-01 (project 3) - dùng schema thực tế
import Database from 'better-sqlite3';

const db = new Database('/home/vutun/pmo_project/backend/data/pmo.db');
const PROJECT_ID = 3;
const TENANT_ID = 1;

console.log('Seeding business data for TEST-MASTER-01 (project', PROJECT_ID, ')...');

const subs = db.prepare('SELECT id, name FROM subcontractors WHERE tenant_id=? LIMIT 5').all(TENANT_ID);
const sups = db.prepare('SELECT id, name FROM suppliers WHERE tenant_id=? LIMIT 5').all(TENANT_ID);
const zones = db.prepare('SELECT id, code FROM zones WHERE project_id=?').all(PROJECT_ID);
const materials = db.prepare('SELECT id, material_code FROM materials WHERE project_id=? LIMIT 5').all(PROJECT_ID);
console.log('Subs:', subs.length, 'Suppliers:', sups.length, 'Zones:', zones.length, 'Materials:', materials.length);

// ========== 1. Contracts ==========
console.log('\n[1] Contracts...');
const contractInsert = db.prepare(`
  INSERT INTO contracts (project_id, vendor_id, contract_no, contract_name, signed_date,
    total_value, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);
const contractIds = [];
let i = 0;
for (const sub of subs.slice(0, 3)) {
  const value = 5_000_000_000 + i * 2_000_000_000;
  const r = contractInsert.run(
    PROJECT_ID, sub.id,
    `TEST-CTR-${String(i+1).padStart(3, '0')}`,
    `Hợp đồng thi công với ${sub.name.slice(0, 30)}`,
    '2026-01-01',
    value,
    'ACTIVE'
  );
  contractIds.push({ id: Number(r.lastInsertRowid), value, name: sub.name });
  i++;
}
console.log(`  Inserted ${contractIds.length} contracts`);

// ========== 2. Invoices ==========
console.log('\n[2] Invoices...');
const invInsert = db.prepare(`
  INSERT INTO invoices (contract_id, invoice_no, invoice_date, amount, vat_amount, status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
`);
const invoices = [];
for (const c of contractIds) {
  for (let j = 0; j < 2; j++) {
    const amt = Math.round(c.value * 0.15);
    const vat = Math.round(amt * 0.1);
    const r = invInsert.run(
      c.id,
      `TEST-INV-${c.id}-${j+1}`,
      '2026-03-01',
      amt, vat,
      j === 0 ? 'PAID' : 'PENDING'
    );
    invoices.push({ id: Number(r.lastInsertRowid), amount: amt, contract_id: c.id });
  }
}
console.log(`  Inserted ${invoices.length} invoices`);

// ========== 3. Payment requests ==========
console.log('\n[3] Payment requests...');
const payInsert = db.prepare(`
  INSERT INTO payment_requests (invoice_id, request_no, request_date, amount, retention_amount,
    due_date, status, notes, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);
const payIds = [];
for (const inv of invoices) {
  const retention = Math.round(inv.amount * 0.05);
  const netAmount = inv.amount - retention;
  const r = payInsert.run(
    inv.id,
    `TEST-PAY-${inv.id}`,
    '2026-03-15',
    netAmount, retention,
    '2026-04-01',
    inv.contract_id % 2 === 0 ? 'PENDING' : 'APPROVED',
    'Test payment request'
  );
  payIds.push({ id: Number(r.lastInsertRowid), amount: netAmount });
}
console.log(`  Inserted ${payIds.length} payment requests`);

// ========== 4. Material submittals ==========
console.log('\n[4] Material submittals...');
const submittalInsert = db.prepare(`
  INSERT INTO material_submittals (project_id, material_id, submittal_code, status, sla_days,
    sla_deadline, revision_number, submitted_by, submitted_date, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);
const submittals = [];
for (let k = 0; k < 5; k++) {
  const status = ['SUBMITTED', 'APPROVED', 'APPROVED', 'REJECTED', 'SUBMITTED'][k];
  const mat = materials[k % materials.length];
  if (!mat) continue;
  const r = submittalInsert.run(
    PROJECT_ID,
    mat.id,
    `TEST-SUB-${String(k+1).padStart(3, '0')}`,
    status,
    7,
    new Date(2026, 0, k+10).toISOString(),
    1,
    1,
    new Date(2026, 0, k+1).toISOString()
  );
  submittals.push({ id: Number(r.lastInsertRowid), status });
}
console.log(`  Inserted ${submittals.length} material submittals`);

// ========== 5. Issues ==========
console.log('\n[5] Issues...');
const issueInsert = db.prepare(`
  INSERT INTO issues (tenant_id, project_id, title, body, severity, category, status, zone_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);
const issues = [];
const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'MEDIUM'];
const categories = ['PROGRESS', 'QUALITY', 'SAFETY', 'DESIGN', 'COORDINATION'];
const statuses = ['OPEN', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'OPEN'];
for (let k = 0; k < 5; k++) {
  const r = issueInsert.run(
    TENANT_ID, PROJECT_ID,
    `[${severities[k]}] Test issue ${k+1} - ${categories[k]}`,
    `Chi tiết vấn đề ${k+1}: thi công bị delay do thiếu vật tư, cần PM xử lý`,
    severities[k], categories[k], statuses[k],
    zones[k % zones.length]?.id
  );
  issues.push(Number(r.lastInsertRowid));
}
console.log(`  Inserted ${issues.length} issues`);

// ========== 6. Notifications ==========
console.log('\n[6] Notifications...');
const notifInsert = db.prepare(`
  INSERT INTO notifications (tenant_id, user_id, project_id, title, body, resource_type, created_at)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
`);
let notifCount = 0;
const notifTypes = ['APPROVAL_PENDING', 'PAYMENT_DUE', 'ISSUE_ASSIGNED', 'MATERIAL_REJECTED', 'KPI_ALERT'];
for (let u = 1; u <= 7; u++) {
  for (let k = 0; k < 3; k++) {
    const t = notifTypes[(u + k) % notifTypes.length];
    notifInsert.run(TENANT_ID, u, PROJECT_ID, `[${t}] Thông báo ${k+1} cho user ${u}`, `Body test notification ${k+1}`, t);
    notifCount++;
  }
}
console.log(`  Inserted ${notifCount} notifications`);

// ========== 7. Directives ==========
console.log('\n[7] Directives...');
const dirInsert = db.prepare(`
  INSERT INTO directives (tenant_id, project_id, from_user_id, from_user_name, body, created_at)
  VALUES (?, ?, ?, ?, ?, datetime('now'))
`);
let dirCount = 0;
for (let k = 0; k < 3; k++) {
  dirInsert.run(
    TENANT_ID, PROJECT_ID, 1, 'Admin HBG',
    `Chỉ thị công trường ${k+1}: Tăng cường ATLĐ khu vực ${zones[k]?.code || 'TST-A'}. Yêu cầu site team giám sát chặt chẽ, báo cáo trước ${new Date(2026, 0, k+15).toISOString().slice(0,10)}`
  );
  dirCount++;
}
console.log(`  Inserted ${dirCount} directives`);

// ========== 8. Audit log ==========
console.log('\n[8] Audit log...');
const auditInsert = db.prepare(`
  INSERT INTO audit_log (tenant_id, user_id, user_name, action, resource_type, resource_id, note, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);
let auditCount = 0;
const actions = ['CREATE', 'UPDATE', 'APPROVE', 'REJECT', 'LOGIN', 'EXPORT'];
const entities = ['shop_drawing', 'material', 'payment', 'issue', 'submittal', 'project'];
for (let k = 0; k < 30; k++) {
  auditInsert.run(TENANT_ID, 1 + (k % 7), `User${(k % 7) + 1}`, actions[k % 6], entities[k % 6], k + 1, `Audit entry #${k+1} - ${actions[k % 6]}`);
  auditCount++;
}
console.log(`  Inserted ${auditCount} audit log entries`);

// ========== 9. File uploads ==========
console.log('\n[9] File uploads...');
const fileInsert = db.prepare(`
  INSERT INTO file_uploads (tenant_id, project_id, original_filename, storage_key, content_hash,
    file_size, expected_doc_type, uploader_user_id, status, total_rows, ok_rows, error_rows, report_json, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
`);
const fixtures = [
  { name: 'Shop TST-A.xlsx', type: 'shop_drawing' },
  { name: 'TĐ TST-B.xlsx', type: 'construction_schedule' },
  { name: 'Vật tư TST-C.xlsx', type: 'material_supply' },
  { name: 'Báo cáo công việc TEST 1.8.2026.xlsx', type: 'daily_report' },
];
let fileCount = 0;
for (let k = 0; k < fixtures.length; k++) {
  const uniqueHash = 'a' + String(Date.now() + k).padStart(63, 'b');
  fileInsert.run(TENANT_ID, PROJECT_ID, fixtures[k].name, `stored_${Date.now()}_${k}.xlsx`, uniqueHash, 50000 + k * 10000, fixtures[k].type, 1, 'OK', 50, 50, 0, JSON.stringify({ ok: 50, errors: 0 }));
  fileCount++;
}
console.log(`  Inserted ${fileCount} file_uploads`);

// ========== 10. KPI targets ==========
console.log('\n[10] KPI targets...');
try {
  const kpiInsert = db.prepare(`
    INSERT INTO kpi_targets (project_id, kpi_code, name_vi, target_value, unit,
      period_start, period_end, effective_from, period_lock, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  const kpiNames = ['Tiến độ', 'Chất lượng', 'An toàn', 'Ngân sách'];
  let kpiCount = 0;
  for (let q = 1; q <= 4; q++) {
    const r = kpiInsert.run(
      PROJECT_ID,
      ['PROGRESS', 'QUALITY', 'SAFETY', 'BUDGET'][q % 4],
      `${kpiNames[q % 4]} Q${q} 2026`,
      75 + q * 5,
      '%',
      `2026-Q${q}`,
      `2026-Q${q}`,
      `2026-${String(q*3-2).padStart(2, '0')}-01`,
      q === 1 ? 1 : 0
    );
    kpiCount++;
  }
  console.log(`  Inserted ${kpiCount} KPI targets`);
} catch (e) {
  console.log(`  KPI error: ${e.message}`);
}

console.log('\n=== FINAL COUNTS for TEST-MASTER-01 ===');
for (const t of ['contracts', 'invoices', 'payment_requests', 'material_submittals', 'issues', 'notifications', 'directives', 'audit_log', 'file_uploads', 'kpi_targets', 'shop_drawings', 'construction_schedule_items', 'materials', 'daily_reports', 'daily_work_items', 'daily_manpower', 'daily_materials', 'daily_acceptance', 'subcontractors', 'suppliers', 'business_process_steps', 'rfa_log']) {
  const c = db.prepare(`SELECT count(*) as c FROM ${t} WHERE project_id=? OR (project_id IS NULL AND tenant_id=1)`).get(PROJECT_ID);
  console.log(`  ${t}: ${c.c}`);
}

db.close();
