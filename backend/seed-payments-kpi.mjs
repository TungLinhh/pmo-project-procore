// Seed contracts/invoices/payment_requests + KPI targets cho demo (mục 43.5, 43.10)
// Idempotent: chỉ insert nếu chưa có
import { getDb } from './src/db/index.js';

const db = getDb();

// === Contracts (43.5) ===
const contracts = [
  { no: 'CT-2026-001', name: 'Hợp đồng MEP BOH (Boiler House)', vendor: 'Cty CP Cơ điện Hoàng Anh', signed: '2026-01-15', value: 18500000000 },
  { no: 'CT-2026-002', name: 'Hợp đồng kết cấu BPV-1BR', vendor: 'Cty TNHH Xây dựng Đại Phát', signed: '2026-02-20', value: 12200000000 },
  { no: 'CT-2026-003', name: 'Hợp đồng hoàn thiện RES-3BR', vendor: 'Tổng Cty Sông Đà', signed: '2026-03-10', value: 9500000000 },
];

const existingContracts = db.prepare('SELECT contract_no FROM contracts').all().map(r => r.contract_no);
for (const c of contracts) {
  if (existingContracts.includes(c.no)) { console.log(`  SKIP contract ${c.no}`); continue; }
  const info = db.prepare(`INSERT INTO contracts (project_id, vendor_id, contract_no, contract_name, signed_date, total_value, status, created_at) VALUES (1, 1, ?, ?, ?, ?, 'ACTIVE', datetime('now'))`)
    .run(c.no, c.name, c.signed, c.value);
  const contractId = info.lastInsertRowid;

  // Each contract: 2-3 invoices
  const invoices = [
    { no: `${c.no}-INV1`, date: '2026-04-15', amount: c.value * 0.3, vat: c.value * 0.03 },
    { no: `${c.no}-INV2`, date: '2026-06-15', amount: c.value * 0.4, vat: c.value * 0.04 },
  ];
  for (const inv of invoices) {
    const iInfo = db.prepare(`INSERT INTO invoices (contract_id, invoice_no, invoice_date, amount, vat_amount, status, created_at) VALUES (?, ?, ?, ?, ?, 'APPROVED', datetime('now'))`)
      .run(contractId, inv.no, inv.date, inv.amount, inv.vat);
    const invId = iInfo.lastInsertRowid;

    // Each invoice: 1 payment request
    const due = new Date(inv.date);
    due.setMonth(due.getMonth() + 1);
    const dueStr = due.toISOString().slice(0, 10);
    const retention = inv.amount * 0.05;  // 5% retention
    db.prepare(`INSERT INTO payment_requests (invoice_id, request_no, request_date, amount, retention_amount, due_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', datetime('now'))`)
      .run(invId, `REQ-${inv.no}`, inv.date, inv.amount, retention, dueStr);
  }
  console.log(`  ADDED contract ${c.no} + ${invoices.length} invoices + ${invoices.length} payment requests`);
}

// === KPI targets (43.10) ===
const kpis = [
  { code: 'PROGRESS_PCT',     name: '% Tiến độ tổng',          target: 80, unit: '%', period: '2026-Q3',  lock: 0 },
  { code: 'SHOP_APPROVED_PCT', name: '% Shop drawing approved', target: 90, unit: '%', period: '2026-Q3',  lock: 0 },
  { code: 'MATERIAL_OTD',     name: 'Vật tư on-time delivery', target: 95, unit: '%', period: '2026-Q2',  lock: 1 },  // Q2 đã đóng → lock
  { code: 'SAFETY_INCIDENTS', name: 'Sự cố an toàn',           target: 0,  unit: 'case', period: '2026-Q3', lock: 0 },
];

const existingKpis = db.prepare('SELECT kpi_code, period_start FROM kpi_targets').all().map(r => `${r.kpi_code}-${r.period_start}`);
for (const k of kpis) {
  const key = `${k.code}-${k.period}`;
  if (existingKpis.includes(key)) { console.log(`  SKIP KPI ${key}`); continue; }
  const periodStart = k.period === '2026-Q2' ? '2026-04-01' : '2026-07-01';
  const periodEnd   = k.period === '2026-Q2' ? '2026-06-30' : '2026-09-30';
  const approvedAt  = k.lock ? '2026-07-01 10:00:00' : null;
  db.prepare(`INSERT INTO kpi_targets (project_id, kpi_code, name_vi, target_value, actual_value, unit, period_start, period_end, version, effective_from, approved_by, approved_at, period_lock, created_at) VALUES (1, ?, ?, ?, 0, ?, ?, ?, 1, ?, ?, ?, ?, datetime('now'))`)
    .run(k.code, k.name, k.target, k.unit, periodStart, periodEnd, periodStart, k.lock ? 1 : null, approvedAt, k.lock);
  console.log(`  ADDED KPI ${k.code} (${k.period}, lock=${k.lock})`);
}

console.log('\n=== Demo data summary ===');
console.log(`  contracts: ${db.prepare('SELECT COUNT(*) as c FROM contracts').get().c}`);
console.log(`  invoices: ${db.prepare('SELECT COUNT(*) as c FROM invoices').get().c}`);
console.log(`  payment_requests: ${db.prepare('SELECT COUNT(*) as c FROM payment_requests').get().c}`);
console.log(`  kpi_targets: ${db.prepare('SELECT COUNT(*) as c FROM kpi_targets').get().c}`);
