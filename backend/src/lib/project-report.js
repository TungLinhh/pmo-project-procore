// Project report workbook (SRS FR-1.9, Excel — GĐ1 "Nên có").
// Một workbook / 1 dự án, 6 sheets từ rows thật (không bịa số):
//   Tong_quan (meta + health + gates), Shopdrawing, Vat_tu, Trinh_duyet_MSB,
//   Thi_cong, Thanh_toan (tái dùng buildApLedger).
// Giới hạn 5000 dòng/sheet để chặn bộ nhớ. Tên sheet ASCII an toàn Excel.
import { needSync } from './optional-dep.js';
const XLSX = needSync('xlsx');
import { getDb } from '../db/index.js';
import { getProjectHealth } from './health.js';
import { getPillarGates } from './pillar-gates.js';
// buildApLedger import động trong hàm (tránh vòng tĩnh với routes/export.js).

const MAX_ROWS = 5000;
const norm = (v) => {
  if (v == null || v === '') return '';
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
};

function sheet(rows, headerVI, headerEN = null) {
  // SRS Ngon ngu: kien truc du lieu ho tro song ngu — dong 1 tieu de VI,
  // dong 2 tieu de EN (doi tac/nha dau tu nuoc ngoai). Ledger Thanh_toan giu
  // nguyen (cot snake_case EN on dinh byte cho ERP doi chieu).
  const data = rows.slice(0, MAX_ROWS).map((r) => headerVI.map((h) => r[h] ?? ''));
  const aoa = headerEN ? [headerVI, headerEN, ...data] : [headerVI, ...data];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = headerVI.map((h) => ({ wch: Math.min(42, Math.max(String(h).length + 2, 14)) }));
  return ws;
}

const EN = {
  overview: ['Item', 'Value'],
  shop: ['Drawing code', 'Name', 'Zone', 'Status', 'Planned submit', 'Actual submit', 'Approved date'],
  mats: ['Material code', 'Name', 'Zone', 'Progress %', 'Delivery date (lot 1)'],
  msb: ['MSB code', 'Status', 'SLA', 'TVGS deadline', 'Submitted date', 'Approved date'],
  sched: ['Item', 'Zone', 'Progress %', 'Status', 'Planned start', 'Planned finish', 'Actual finish'],
};

export async function buildProjectReport(projectId) {
  const db = getDb();
  const [proj, shop, mats, msb, sched] = await Promise.all([
    db.prepare('SELECT code, name_vi, name_en, package, status, tenant_id FROM projects WHERE id = ?').getAsync(projectId),
    db.prepare(
      `SELECT sd.drawing_code, sd.name_vi, sd.status, sd.planned_submit_date, sd.actual_submit_date, sd.approval_date, z.code AS zone
       FROM shop_drawings sd LEFT JOIN zones z ON z.id = sd.zone_id WHERE sd.project_id = ? ORDER BY sd.id`
    ).allAsync(projectId),
    db.prepare(
      `SELECT m.material_code, m.name_vi, z.code AS zone, m.progress_pct, m.delivery_date_1
       FROM materials m LEFT JOIN zones z ON z.id = m.zone_id WHERE m.project_id = ? ORDER BY m.id`
    ).allAsync(projectId),
    db.prepare(
      `SELECT submittal_code, status, sla_deadline, supervisor_deadline, submitted_date, approved_date
       FROM material_submittals WHERE project_id = ? ORDER BY id`
    ).allAsync(projectId),
    db.prepare(
      `SELECT csi.name_vi, z.code AS zone, csi.progress_pct, csi.status, csi.plan_start_date, csi.plan_end_date, csi.actual_end_date
       FROM construction_schedule_items csi LEFT JOIN zones z ON z.id = csi.zone_id WHERE csi.project_id = ? ORDER BY csi.plan_start_date`
    ).allAsync(projectId),
  ]);
  if (!proj) return null;
  const tenantId = proj.tenant_id ?? null;
  const [gatesReal, healthReal, exp] = await Promise.all([
    tenantId != null ? getPillarGates(tenantId, projectId) : null,
    tenantId != null ? getProjectHealth(tenantId, projectId) : null,
    import('../routes/export.js'),
  ]);

  const wb = XLSX.utils.book_new();
  const overview = [
    { 'Hạng mục': 'Mã dự án', 'Giá trị': proj.code },
    { 'Hạng mục': 'Tên dự án', 'Giá trị': proj.name_vi || '' },
    { 'Hạng mục': 'Tên EN', 'Giá trị': proj.name_en || '' },
    { 'Hạng mục': 'Gói thầu', 'Giá trị': proj.package || '' },
    { 'Hạng mục': 'Trạng thái', 'Giá trị': proj.status || '' },
    { 'Hạng mục': 'Xuất lúc', 'Giá trị': new Date().toISOString() },
    { 'Hạng mục': 'Sức khỏe tổng thể', 'Giá trị': healthReal?.overall || '' },
  ];
  for (const [pillar, s] of Object.entries(healthReal?.signals || {})) {
    overview.push({ 'Hạng mục': `Đèn ${pillar}`, 'Giá trị': `${s.level} (${s.value}, ngưỡng V ${s.yellow_at} / Đ ${s.red_at})` });
  }
  for (const g of gatesReal?.gates || []) {
    overview.push({ 'Hạng mục': `Gate ${g.id} ${g.from}→${g.to}`, 'Giá trị': `${g.state} (${g.metric_value}% / ngưỡng ${g.threshold_pct}%)` });
  }
  XLSX.utils.book_append_sheet(wb, sheet(overview, ['Hạng mục', 'Giá trị'], EN.overview), 'Tong_quan');
  XLSX.utils.book_append_sheet(wb, sheet(shop.map((r) => ({
    'Mã BV': r.drawing_code, 'Tên': r.name_vi, 'Zone': r.zone, 'Trạng thái': r.status,
    'KH trình': norm(r.planned_submit_date), 'TT trình': norm(r.actual_submit_date), 'Ngày duyệt': norm(r.approval_date),
  })), ['Mã BV', 'Tên', 'Zone', 'Trạng thái', 'KH trình', 'TT trình', 'Ngày duyệt'], EN.shop), 'Shopdrawing');
  XLSX.utils.book_append_sheet(wb, sheet(mats.map((r) => ({
    'Mã VT': r.material_code, 'Tên': r.name_vi, 'Zone': r.zone,
    'Tiến độ %': r.progress_pct, 'Ngày về (đợt 1)': norm(r.delivery_date_1),
  })), ['Mã VT', 'Tên', 'Zone', 'Tiến độ %', 'Ngày về (đợt 1)'], EN.mats), 'Vat_tu');
  XLSX.utils.book_append_sheet(wb, sheet(msb.map((r) => ({
    'Mã MSB': r.submittal_code, 'Trạng thái': r.status, 'SLA': norm(r.sla_deadline),
    'Hạn TVGS': norm(r.supervisor_deadline), 'Ngày trình': norm(r.submitted_date), 'Ngày duyệt': norm(r.approved_date),
  })), ['Mã MSB', 'Trạng thái', 'SLA', 'Hạn TVGS', 'Ngày trình', 'Ngày duyệt'], EN.msb), 'Trinh_duyet_MSB');
  XLSX.utils.book_append_sheet(wb, sheet(sched.map((r) => ({
    'Hạng mục': r.name_vi, 'Zone': r.zone, 'Tiến độ %': r.progress_pct, 'Trạng thái': r.status,
    'KH bắt đầu': norm(r.plan_start_date), 'KH xong': norm(r.plan_end_date), 'TT xong': norm(r.actual_end_date),
  })), ['Hạng mục', 'Zone', 'Tiến độ %', 'Trạng thái', 'KH bắt đầu', 'KH xong', 'TT xong'], EN.sched), 'Thi_cong');
  const ledger = exp ? await exp.buildApLedger(projectId) : [];
  const AP_LEDGER_COLS = exp?.AP_LEDGER_COLS?.length ? exp.AP_LEDGER_COLS : Object.keys(ledger[0] || {});
  XLSX.utils.book_append_sheet(wb, sheet(ledger, AP_LEDGER_COLS), 'Thanh_toan');
  return { wb, code: proj.code };
}
