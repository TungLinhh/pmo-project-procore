// S-curves — SRS FR-1.7: kế hoạch vs. thực tế lũy kế cho từng trụ cột.
// Nguồn dates thật (không bịa): shop planned/actual_submit_date,
// submittal submitted/approved_date, schedule plan/actual_end_date,
// payments due_date (KH) vs paid_at (TT, theo giá trị VND).
// simulate-free: pure bucketing + collector, unit-testable qua e2e.
import { getDb } from '../db/index.js';

const DAY = 86400000;
const norm = (v) => {
  if (v == null || v === '') return null;
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const toMs = (s) => new Date(s + 'T00:00:00Z').getTime();

// Gom sự kiện (date, weight) thành chuỗi lũy kế theo bucket tuần. Rỗng khi
// không có sự kiện; UI tự ẩn khi <2 điểm (1 điểm không vẽ được đường).
export function toCumulative(events, maxPoints = 60) {
  const clean = events.filter((e) => e.date && Number.isFinite(e.w)).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!clean.length) return { labels: [], values: [] };
  let [start, end] = [toMs(clean[0].date), toMs(clean[clean.length - 1].date)];
  if (end <= start) end = start + DAY;
  const spanDays = Math.round((end - start) / DAY) + 1;
  const bucketDays = Math.max(7, Math.ceil(spanDays / maxPoints / 7) * 7);
  const n = Math.ceil(spanDays / bucketDays);
  const labels = [];
  const values = [];
  let acc = 0;
  let i = 0;
  for (let b = 0; b < n; b++) {
    const edge = start + (b + 1) * bucketDays * DAY;
    while (i < clean.length && toMs(clean[i].date) < edge) { acc += clean[i].w; i++; }
    labels.push(new Date(start + b * bucketDays * DAY).toISOString().slice(0, 10));
    values.push(Math.round(acc * 100) / 100);
  }
  return { labels, values };
}

export async function collectSCurves(projectId) {
  const db = getDb();
  const [shops, submittals, sched, pays] = await Promise.all([
    db.prepare('SELECT planned_submit_date, actual_submit_date FROM shop_drawings WHERE project_id = ?').allAsync(projectId),
    db.prepare('SELECT submitted_date, approved_date FROM material_submittals WHERE project_id = ?').allAsync(projectId),
    db.prepare('SELECT plan_end_date, actual_end_date, progress_pct, status FROM construction_schedule_items WHERE project_id = ?').allAsync(projectId),
    db.prepare('SELECT due_date, paid_at, paid_amount, amount FROM payments WHERE project_id = ?').allAsync(projectId),
  ]);
  const ev = (rows, pk, ak, w = () => 1) => ({
    planned: rows.map((r) => ({ date: norm(r[pk]), w: w(r) })).filter((e) => e.date),
    actual: rows.map((r) => ({ date: norm(r[ak]), w: w(r) })).filter((e) => e.date),
  });
  const shop = ev(shops, 'planned_submit_date', 'actual_submit_date');
  const msb = ev(submittals, 'submitted_date', 'approved_date');
  // Thực tế thi công: actual_end_date; hạng mục DONE nhưng thiếu ngày thì bỏ
  // qua (không bịa ngày) — tổng actual có thể thấp hơn planned là đúng.
  const schedEv = {
    planned: sched.map((r) => ({ date: norm(r.plan_end_date), w: 1 })).filter((e) => e.date),
    actual: sched.map((r) => ({ date: norm(r.actual_end_date), w: 1 })).filter((e) => e.date),
  };
  const num = (v) => Number(v) || 0;
  const payEv = {
    planned: pays.map((r) => ({ date: norm(r.due_date), w: num(r.amount) })).filter((e) => e.date),
    actual: pays.map((r) => ({ date: norm(r.paid_at), w: num(r.paid_amount ?? r.amount) })).filter((e) => e.date),
  };
  const curve = (p, a) => ({ planned: toCumulative(p), actual: toCumulative(a) });
  return {
    project_id: Number(projectId),
    unit: { shop: 'count', material: 'count', construction: 'count', payment: 'VND' },
    shop: curve(shop.planned, shop.actual),
    material: curve(msb.planned, msb.actual),
    construction: curve(schedEv.planned, schedEv.actual),
    payment: curve(payEv.planned, payEv.actual),
  };
}
