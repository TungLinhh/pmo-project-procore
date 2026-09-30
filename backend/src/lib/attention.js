// One overdue collector for the Attention screen and the daily digest. Every
// row has a destination, so an alert always leads to an action.
import { getDb } from '../db/index.js';

const rank = (daysLate, highAfter, mediumAfter = 3) =>
  daysLate >= highAfter ? 'HIGH' : daysLate >= mediumAfter ? 'MED' : 'LOW';
const daysLate = (value) => Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));

export async function collectAttention(projectId, itemLimit = 5) {
  const db = getDb();
  const pid = Number(projectId);
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('project_id required');
  const limit = Math.min(Math.max(Number(itemLimit) || 5, 1), 20);
  const count = (sql) => db.prepare(sql).getAsync(pid).then((row) => Number(row?.c || 0));
  const top = (sql) => db.prepare(sql.replace('__LIMIT__', String(limit))).allAsync(pid);
  const [scheduleCount, scheduleRows, shopCount, shopRows, materialCount, materialRows, paymentCount, paymentRows] = await Promise.all([
    count(`SELECT COUNT(*) AS c FROM construction_schedule_items WHERE project_id = ? AND plan_end_date < CURRENT_DATE AND COALESCE(progress_pct, 0) < 1 AND COALESCE(status, '') != 'DONE'`),
    top(`SELECT id, name_vi, plan_end_date, progress_pct FROM construction_schedule_items WHERE project_id = ? AND plan_end_date < CURRENT_DATE AND COALESCE(progress_pct, 0) < 1 AND COALESCE(status, '') != 'DONE' ORDER BY plan_end_date LIMIT __LIMIT__`),
    count(`SELECT COUNT(*) AS c FROM shop_drawings WHERE project_id = ? AND approval_date IS NULL AND COALESCE(actual_submit_date, planned_submit_date) < CURRENT_DATE - INTERVAL '3 days'`),
    top(`SELECT id, drawing_code, name_vi, COALESCE(actual_submit_date, planned_submit_date) AS due_date FROM shop_drawings WHERE project_id = ? AND approval_date IS NULL AND COALESCE(actual_submit_date, planned_submit_date) < CURRENT_DATE - INTERVAL '3 days' ORDER BY due_date LIMIT __LIMIT__`),
    count(`SELECT COUNT(*) AS c FROM material_submittals WHERE project_id = ? AND status NOT IN ('APPROVED', 'REJECTED') AND (sla_deadline < CURRENT_DATE OR submitted_date < CURRENT_DATE - INTERVAL '7 days')`),
    top(`SELECT id, submittal_code, COALESCE(sla_deadline, submitted_date) AS due_date FROM material_submittals WHERE project_id = ? AND status NOT IN ('APPROVED', 'REJECTED') AND (sla_deadline < CURRENT_DATE OR submitted_date < CURRENT_DATE - INTERVAL '7 days') ORDER BY due_date LIMIT __LIMIT__`),
    count(`SELECT COUNT(*) AS c FROM payment_requests pr JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id WHERE c.project_id = ? AND pr.due_date < CURRENT_DATE AND pr.status NOT IN ('PAID', 'REJECTED')`),
    top(`SELECT pr.id, pr.request_no, pr.due_date, pr.amount FROM payment_requests pr JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id WHERE c.project_id = ? AND pr.due_date < CURRENT_DATE AND pr.status NOT IN ('PAID', 'REJECTED') ORDER BY pr.due_date LIMIT __LIMIT__`),
  ]);
  const item = (id, code, label, due, href, highAfter) => ({
    id, code, label, href, days_late: daysLate(due), priority: rank(daysLate(due), highAfter),
  });
  return {
    project_id: pid,
    total: scheduleCount + shopCount + materialCount + paymentCount,
    groups: [
      {
        key: 'schedule', title: 'Tiến độ quá hạn', count: scheduleCount, href: `/hq/progress?project=${pid}`,
        items: scheduleRows.map((r) => item(r.id, String(r.plan_end_date).slice(0, 10), r.name_vi, r.plan_end_date, `/hq/progress?project=${pid}`, 14)),
      },
      {
        key: 'shop', title: 'Shop chờ duyệt quá 3 ngày', count: shopCount, href: `/hq/shop?project=${pid}`,
        items: shopRows.map((r) => item(r.id, r.drawing_code, r.name_vi, r.due_date, `/hq/shop?project=${pid}&drawing=${r.id}`, 7)),
      },
      {
        key: 'material', title: 'Vật tư quá SLA', count: materialCount, href: `/hq/materials?project=${pid}`,
        items: materialRows.map((r) => item(r.id, r.submittal_code, r.submittal_code, r.due_date, `/hq/materials?project=${pid}`, 7)),
      },
      {
        key: 'payment', title: 'Thanh toán quá hạn', count: paymentCount, href: `/hq/payment?project=${pid}`,
        // `label` ghép sẵn bằng tiếng Việt vì bản tin email (`attention-digest.js`) dùng nó
        // và không có ngữ cảnh ngôn ngữ. Nhưng màn web thì có — nên gửi thêm
        // `amount`/`due` để giao diện ghép lại theo ngôn ngữ đang xem.
        items: paymentRows.map((r) => ({
          ...item(r.id, r.request_no, `${Number(r.amount).toLocaleString('vi-VN')} VND · hạn ${String(r.due_date).slice(0, 10)}`, r.due_date, `/hq/payment?project=${pid}`, 14),
          amount: Number(r.amount), due: String(r.due_date).slice(0, 10),
        })),
      },
    ],
  };
}
