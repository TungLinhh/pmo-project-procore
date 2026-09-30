// Browser-printable project report. Vietnamese and English use the same real
// project rows; the frontend opens this authenticated response in a print
// view, where the browser can save it as PDF without a server PDF dependency.
import { getDb } from '../db/index.js';
import { getProjectHealth } from './health.js';
import { getPillarGates } from './pillar-gates.js';

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const date = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const num = (value) => Number(value || 0).toLocaleString('vi-VN');

const COPY = {
  vi: {
    title: 'Báo cáo dự án', generated: 'Xuất lúc', overview: 'Tổng quan', health: 'Sức khỏe',
    gates: 'Trạng thái liên thông', waiting: 'Chờ điều kiện', open: 'Mở', disabled: 'Tắt',
    schedule: 'Tiến độ thi công', shop: 'Shopdrawing', material: 'Vật tư', submittal: 'MSB', payment: 'Thanh toán',
    code: 'Mã', name: 'Hạng mục', zone: 'Zone', status: 'Trạng thái', progress: 'Tiến độ', planned: 'Kế hoạch', actual: 'Thực tế',
    amount: 'Giá trị', due: 'Hạn', paid: 'Đã chi', noData: 'Không có dữ liệu', print: 'In / lưu PDF',
  },
  en: {
    title: 'Project report', generated: 'Generated', overview: 'Overview', health: 'Health',
    gates: 'Interlock status', waiting: 'Waiting for condition', open: 'Open', disabled: 'Disabled',
    schedule: 'Construction progress', shop: 'Shop drawings', material: 'Materials', submittal: 'MSB', payment: 'Payments',
    code: 'Code', name: 'Item', zone: 'Zone', status: 'Status', progress: 'Progress', planned: 'Planned', actual: 'Actual',
    amount: 'Amount', due: 'Due', paid: 'Paid', noData: 'No data', print: 'Print / Save PDF',
  },
};

function table(headers, rows, render, noData = 'No data') {
  if (!rows.length) return `<div class="empty">${esc(noData)}</div>`;
  return `<table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(render).join('')}</tbody></table>`;
}

export async function buildProjectPrintHtml(projectId, lang = 'vi', autoPrint = false) {
  const c = COPY[lang] || COPY.vi;
  const db = getDb();
  const project = await db.prepare(
    'SELECT id, code, name_vi, name_en, package, status, tenant_id FROM projects WHERE id = ?'
  ).getAsync(projectId);
  if (!project) return null;
  const [schedule, shop, materials, submittals, ledger, gates, health] = await Promise.all([
    db.prepare(
      `SELECT csi.name_vi, z.code AS zone, csi.progress_pct, csi.status,
              csi.plan_start_date, csi.plan_end_date, csi.actual_end_date
       FROM construction_schedule_items csi LEFT JOIN zones z ON z.id = csi.zone_id
       WHERE csi.project_id = ? ORDER BY csi.plan_end_date LIMIT 2000`
    ).allAsync(projectId),
    db.prepare(
      `SELECT sd.drawing_code, sd.name_vi, z.code AS zone, sd.status, sd.planned_submit_date, sd.approval_date
       FROM shop_drawings sd LEFT JOIN zones z ON z.id = sd.zone_id
       WHERE sd.project_id = ? ORDER BY sd.id LIMIT 2000`
    ).allAsync(projectId),
    db.prepare(
      `SELECT m.material_code, m.name_vi, z.code AS zone, m.progress_pct, m.delivery_date_1
       FROM materials m LEFT JOIN zones z ON z.id = m.zone_id
       WHERE m.project_id = ? ORDER BY m.id LIMIT 2000`
    ).allAsync(projectId),
    db.prepare(
      `SELECT submittal_code, status, sla_deadline, submitted_date, approved_date
       FROM material_submittals WHERE project_id = ? ORDER BY id LIMIT 2000`
    ).allAsync(projectId),
    import('../routes/export.js').then((mod) => mod.buildApLedger(projectId)),
    getPillarGates(project.tenant_id, projectId),
    getProjectHealth(project.tenant_id, projectId),
  ]);

  const gateRows = (gates?.gates || []).map((gate) => `<tr>
    <td>${esc(gate.id)}</td><td>${esc(`${gate.from} → ${gate.to}`)}</td>
    <td>${gate.state === 'WAITING' ? `<strong>${esc(c.waiting)}</strong>` : esc(gate.state === 'OPEN' ? c.open : c.disabled)}</td>
    <td>${num(gate.metric_value)}% / ${num(gate.threshold_pct)}%</td><td>${esc(gate.reason_vi)}</td>
  </tr>`).join('');

  const generated = new Date().toISOString();
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(c.title)} · ${esc(project.code)}</title>
<style>
:root{font-family:Inter,Arial,sans-serif;color:#17212b;background:#fff}*{box-sizing:border-box}body{margin:0;padding:28px;font-size:12px}h1{margin:0 0 4px;font-size:24px}h2{font-size:15px;margin:0 0 10px;padding-bottom:6px;border-bottom:2px solid #1f5f8b}.meta{color:#607080;margin-bottom:18px}.toolbar{text-align:right;margin-bottom:14px}.toolbar button{padding:8px 14px;border:1px solid #1f5f8b;background:#1f5f8b;color:#fff;border-radius:5px;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}.metric{border:1px solid #d7dee5;border-radius:6px;padding:9px}.metric b{display:block;font-size:17px;margin-top:3px}section{break-inside:avoid;margin:0 0 18px}table{width:100%;border-collapse:collapse}th,td{padding:5px 6px;border:1px solid #d7dee5;text-align:left;vertical-align:top}th{background:#edf3f7;font-size:11px}.empty{padding:12px;border:1px dashed #b7c2cc;color:#607080}.foot{color:#607080;border-top:1px solid #d7dee5;padding-top:8px;margin-top:20px}@media print{@page{size:A4 landscape;margin:10mm}.toolbar{display:none}body{padding:0;font-size:10px}section{break-inside:auto}tr{break-inside:avoid}.grid{grid-template-columns:repeat(4,1fr)}}
</style></head><body>
<div class="toolbar"><button onclick="window.print()">${esc(c.print)}</button></div>
<h1>${esc(project.code)} · ${esc(project.name_vi || project.name_en || '')}</h1>
<div class="meta">${esc(c.generated)}: ${esc(generated)} · ${esc(project.package || '')} · ${esc(project.status || '')}</div>
<div class="grid">
  <div class="metric">${esc(c.health)}<b>${esc(health?.overall || '—')}</b></div>
  <div class="metric">${esc(c.schedule)}<b>${num(schedule.length)}</b></div>
  <div class="metric">${esc(c.shop)}<b>${num(shop.length)}</b></div>
  <div class="metric">${esc(c.material)}<b>${num(materials.length)}</b></div>
</div>
<section><h2>${esc(c.gates)}</h2><table><thead><tr><th>ID</th><th>Flow</th><th>${esc(c.status)}</th><th>Value / threshold</th><th>Reason</th></tr></thead><tbody>${gateRows || `<tr><td colspan="5">${esc(c.noData)}</td></tr>`}</tbody></table></section>
<section><h2>${esc(c.schedule)}</h2>${table([c.name, c.zone, c.status, c.progress, c.planned, c.actual], schedule, (r) => `<tr><td>${esc(r.name_vi)}</td><td>${esc(r.zone)}</td><td>${esc(r.status)}</td><td>${num(Number(r.progress_pct || 0) * 100)}%</td><td>${esc(date(r.plan_end_date))}</td><td>${esc(date(r.actual_end_date))}</td></tr>`, c.noData)}</section>
<section><h2>${esc(c.shop)}</h2>${table([c.code, c.name, c.zone, c.status, c.planned, c.actual], shop, (r) => `<tr><td>${esc(r.drawing_code)}</td><td>${esc(r.name_vi)}</td><td>${esc(r.zone)}</td><td>${esc(r.status)}</td><td>${esc(date(r.planned_submit_date))}</td><td>${esc(date(r.approval_date))}</td></tr>`, c.noData)}</section>
<section><h2>${esc(c.material)}</h2>${table([c.code, c.name, c.zone, c.progress, c.actual], materials, (r) => `<tr><td>${esc(r.material_code)}</td><td>${esc(r.name_vi)}</td><td>${esc(r.zone)}</td><td>${num(Number(r.progress_pct || 0) * 100)}%</td><td>${esc(date(r.delivery_date_1))}</td></tr>`, c.noData)}</section>
<section><h2>${esc(c.submittal)}</h2>${table([c.code, c.status, 'SLA', c.actual, c.actual], submittals, (r) => `<tr><td>${esc(r.submittal_code)}</td><td>${esc(r.status)}</td><td>${esc(date(r.sla_deadline))}</td><td>${esc(date(r.submitted_date))}</td><td>${esc(date(r.approved_date))}</td></tr>`, c.noData)}</section>
<section><h2>${esc(c.payment)}</h2>${table(['Invoice', c.code, c.amount, c.status, c.due, c.paid], ledger, (r) => `<tr><td>${esc(r.invoice_no)}</td><td>${esc(r.request_no)}</td><td>${num(r.request_amount || r.invoice_amount)}</td><td>${esc(r.request_status)}</td><td>${esc(date(r.invoice_date))}</td><td>${num(r.paid_amount)}</td></tr>`, c.noData)}</section>
<div class="foot">O-NEXUS PMO · ${esc(project.code)}</div>
${autoPrint ? '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),300))</script>' : ''}
</body></html>`;
}
