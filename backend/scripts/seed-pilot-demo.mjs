// Seed a small but complete 4-pillar demo dataset on the PILOT tenant only.
// Purpose: the Small plan view is demonstrable (not empty screens). HBG data
// is never touched. Idempotent: every insert is select-then-insert or upsert,
// safe to re-run after cleanup-demo.mjs (which ignores PILOT rows).
// Run: node backend/scripts/seed-pilot-demo.mjs
// Env: DATABASE_URL or DB_* parts (same as init.js).
import { getDb, closeDb } from '../src/db/index.js';
import { deriveStatus } from '../src/services/ingest/construction_schedule.js';

const SHEET = 'PILOT-SEED';
const db = getDb();
try {
  const tenant = await db.prepare(`SELECT id FROM tenants WHERE code = 'PILOT'`).getAsync();
  if (!tenant) throw new Error('PILOT tenant missing — run provision-tenant.mjs first');
  const project = await db.prepare('SELECT id FROM projects WHERE tenant_id = ? AND code = ?').getAsync(tenant.id, 'PILOT-001');
  if (!project) throw new Error('PILOT-001 project missing — run provision-tenant.mjs first');
  const pid = project.id;
  const zones = await db.prepare('SELECT id, code FROM zones WHERE project_id = ? ORDER BY code').allAsync(pid);
  const zone = (code) => zones.find((z) => z.code === code)?.id;
  if (!zone('A') || !zone('B') || !zone('C')) throw new Error('PILOT zones A/B/C missing');
  const admin = await db.prepare(`SELECT id FROM users WHERE tenant_id = ? AND role = 'admin' ORDER BY id LIMIT 1`).getAsync(tenant.id);

  // ---- P1: 6 schedule items, mixed progress, dates around today (OTD stays live)
  const items = [
    { z: 'A', ord: 1, name: 'Ép cọc zone A', pct: 1.0, start: -20, end: -6, actualEnd: -6 },
    { z: 'A', ord: 2, name: 'Đài móng zone A', pct: 0.8, start: -8, end: 4, actualEnd: null },
    { z: 'B', ord: 1, name: 'Cột tầng 1 zone B', pct: 0.45, start: -5, end: 10, actualEnd: null },
    { z: 'B', ord: 2, name: 'Dầm sàn tầng 1 zone B', pct: 0.1, start: 2, end: 18, actualEnd: null },
    { z: 'C', ord: 1, name: 'Xây tường zone C', pct: 0.0, start: 10, end: 30, actualEnd: null },
    { z: 'C', ord: 2, name: 'Tô trát zone C', pct: 0.0, start: 25, end: 45, actualEnd: null },
  ];
  for (const it of items) {
    const status = deriveStatus(it.pct, it.actualEnd ? new Date(Date.now() + it.actualEnd * 864e5).toISOString().slice(0, 10) : null);
    await db.upsert('construction_schedule_items',
      { conflictCols: ['project_id', 'zone_id', 'source_sheet', 'ordinal'] },
      {
        project_id: pid, zone_id: zone(it.z), source_sheet: SHEET, ordinal: it.ord,
        name_vi: it.name, progress_pct: it.pct, status,
        plan_start_date: new Date(Date.now() + it.start * 864e5).toISOString().slice(0, 10),
        plan_end_date: new Date(Date.now() + it.end * 864e5).toISOString().slice(0, 10),
        actual_end_date: it.actualEnd ? new Date(Date.now() + it.actualEnd * 864e5).toISOString().slice(0, 10) : null,
      });
  }
  console.log(`= schedule: ${items.length} items`);

  // ---- P2: 1 shop drawing SUBMITTED (single-step approve demo)
  const shopCode = 'PILOT-SHOP-001';
  const shopExists = await db.prepare('SELECT id FROM shop_drawings WHERE project_id = ? AND drawing_code = ?').getAsync(pid, shopCode);
  if (!shopExists) {
    await db.prepare(
      `INSERT INTO shop_drawings (project_id, zone_id, source_sheet, drawing_code, name_vi, status, planned_submit_date, actual_submit_date)
       VALUES (?, ?, ?, ?, ?, 'SUBMITTED', CURRENT_DATE - 2, CURRENT_DATE - 2) RETURNING project_id`
    ).runAsync(pid, zone('A'), SHEET, shopCode, 'Shop cọc zone A');
    console.log('+ shop PILOT-SHOP-001 (SUBMITTED)');
  } else console.log('= shop PILOT-SHOP-001 exists');

  // ---- P3: 1 material + 1 submittal SUBMITTED (SLA/TVGS dates live)
  await db.upsert('materials',
    { conflictCols: ['project_id', 'zone_id', 'material_code'] },
    { project_id: pid, zone_id: zone('A'), material_code: 'PILOT-COC', name_vi: 'Cọc BTCT zone A', progress_pct: 0.6, source_sheet: SHEET });
  const mat = await db.prepare('SELECT id FROM materials WHERE project_id = ? AND material_code = ?').getAsync(pid, 'PILOT-COC');
  const subCode = 'PILOT-SUB-001';
  const subExists = await db.prepare('SELECT id FROM material_submittals WHERE project_id = ? AND submittal_code = ?').getAsync(pid, subCode);
  if (!subExists) {
    await db.prepare(
      `INSERT INTO material_submittals (project_id, material_id, submittal_code, status, sla_days, sla_deadline, supervisor_approval_days, supervisor_deadline, submitted_by, submitted_date)
       VALUES (?, ?, ?, 'SUBMITTED', 7, CURRENT_DATE + 7, 3, CURRENT_DATE + 3, ?, now()) RETURNING project_id`
    ).runAsync(pid, mat.id, subCode, admin?.id ?? null);
    console.log('+ submittal PILOT-SUB-001 (SUBMITTED, SLA+7/TVGS+3)');
  } else console.log('= submittal PILOT-SUB-001 exists');

  // ---- P4: vendor + contract → invoice → PR(PENDING) chain (AP-only for Small)
  const vendorName = 'PILOT Vendor';
  let vendor = await db.prepare('SELECT id FROM vendors WHERE tenant_id = ? AND name = ?').getAsync(tenant.id, vendorName);
  if (!vendor) {
    const r = await db.prepare('INSERT INTO vendors (tenant_id, name) VALUES (?, ?)').runAsync(tenant.id, vendorName);
    vendor = { id: Number(r.lastInsertRowid) };
    console.log('+ vendor PILOT Vendor');
  }
  const contractNo = 'PILOT-HD-001';
  let contract = await db.prepare('SELECT id FROM contracts WHERE project_id = ? AND contract_no = ?').getAsync(pid, contractNo);
  if (!contract) {
    const r = await db.prepare(
      'INSERT INTO contracts (project_id, vendor_id, contract_no, contract_name, signed_date, total_value) VALUES (?, ?, ?, ?, CURRENT_DATE - 10, 500000000) RETURNING id'
    ).runAsync(pid, vendor.id, contractNo, 'Hợp đồng ép cọc pilot');
    contract = { id: Number(r.lastInsertRowid) };
    console.log('+ contract PILOT-HD-001 (500tr)');
  }
  const invoiceNo = 'PILOT-INV-001';
  let invoice = await db.prepare('SELECT id FROM invoices WHERE contract_id = ? AND invoice_no = ?').getAsync(contract.id, invoiceNo);
  if (!invoice) {
    const r = await db.prepare(
      'INSERT INTO invoices (contract_id, invoice_no, invoice_date, amount, vat_amount, status) VALUES (?, ?, CURRENT_DATE - 2, 200000000, 16000000, ?) RETURNING id'
    ).runAsync(contract.id, invoiceNo, 'SUBMITTED');
    invoice = { id: Number(r.lastInsertRowid) };
    console.log('+ invoice PILOT-INV-001 (200tr)');
  }
  const reqNo = 'PILOT-PR-001';
  const prExists = await db.prepare('SELECT id FROM payment_requests WHERE invoice_id = ? AND request_no = ?').getAsync(invoice.id, reqNo);
  if (!prExists) {
    await db.prepare(
      `INSERT INTO payment_requests (invoice_id, request_no, request_date, amount, retention_amount, due_date, status, created_at)
       VALUES (?, ?, CURRENT_DATE, 200000000, 10000000, CURRENT_DATE + 14, 'PENDING', now()) RETURNING invoice_id`
    ).runAsync(invoice.id, reqNo);
    console.log('+ payment request PILOT-PR-001 (PENDING, for Approval screen)');
  } else console.log('= payment request PILOT-PR-001 exists');

  console.log('\nOK pilot demo seeded (PILOT-001: 6 schedule, 1 shop, 1 material+submittal, 1 AP chain)');
} finally {
  await closeDb();
}
