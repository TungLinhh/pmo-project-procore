// Health signals — SRS FR-1.6: đèn xanh/vàng/đỏ theo ngưỡng cấu hình được.
// Mỗi metric: direction cố định + yellow_at/red_at (default dưới đây mirror
// đúng logic cứng cũ của ControlCenter để hành vi mặc định không đổi).
// Override: row project riêng thắng row tenant (project_id = 0).
import { getDb } from '../db/index.js';
import { collectGateMetrics } from './pillar-gates.js';

export const THRESHOLDS = [
  { metric: 'overdue_items', direction: 'high_bad', yellow_at: 1, red_at: 6, label_vi: 'Hạng mục trễ tiến độ' },
  { metric: 'approval_pct', direction: 'low_bad', yellow_at: 90, red_at: 50, label_vi: '% duyệt shopdrawing' },
  { metric: 'payment_overdue', direction: 'high_bad', yellow_at: 1, red_at: 3, label_vi: 'Thanh toán quá hạn' },
  { metric: 'material_delayed', direction: 'high_bad', yellow_at: 1, red_at: 5, label_vi: 'Vật tư chậm/trọng yếu' },
];

const byMetric = new Map(THRESHOLDS.map((t) => [t.metric, t]));
export const knownMetric = (m) => byMetric.has(m);

// green | yellow | red. high_bad: v<yellow→green, v<red→yellow, else red.
// low_bad: v<red→red, v<yellow→yellow, else green.
export function evaluateLevel(def, value) {
  const v = Number(value) || 0;
  if (def.direction === 'high_bad') {
    if (v < def.yellow_at) return 'green';
    if (v < def.red_at) return 'yellow';
    return 'red';
  }
  if (v < def.red_at) return 'red';
  if (v < def.yellow_at) return 'yellow';
  return 'green';
}

export function validateThreshold(metric, yellow_at, red_at) {
  const def = byMetric.get(metric);
  if (!def) return `Unknown metric (must be ${[...byMetric.keys()].join('|')})`;
  const y = Number(yellow_at), r = Number(red_at);
  if (!Number.isFinite(y) || !Number.isFinite(r)) return 'yellow_at/red_at must be numbers';
  if (def.direction === 'high_bad' && y > r) return 'high_bad needs yellow_at <= red_at';
  if (def.direction === 'low_bad' && r > y) return 'low_bad needs red_at <= yellow_at';
  return null;
}

export async function loadThresholds(tenantId, projectId) {
  const db = getDb();
  const rows = await db.prepare(
    'SELECT * FROM health_thresholds WHERE tenant_id = ? AND project_id IN (0, ?)'
  ).allAsync(tenantId, projectId);
  const out = new Map();
  for (const r of rows) {
    if (!out.has(r.metric) || Number(r.project_id) === Number(projectId)) out.set(r.metric, r);
  }
  return out;
}

const eff = (overrides, metric) => {
  const base = byMetric.get(metric);
  const o = overrides.get(metric);
  return {
    metric, direction: base.direction, label_vi: base.label_vi,
    yellow_at: o ? Number(o.yellow_at) : base.yellow_at,
    red_at: o ? Number(o.red_at) : base.red_at,
    scope: o ? (Number(o.project_id) === 0 ? 'tenant' : 'project') : 'default',
  };
};

// Số liệu bổ sung ngoài collectGateMetrics: payment quá hạn + vật tư chậm.
// Định nghĩa khớp đúng ControlCenter (payment: chưa PAID + có due_date quá hạn;
// material: progress<0.5 & tạo >30 ngày = delayed — proxy hiện tại của UI).
export async function collectHealthMetrics(projectId) {
  const db = getDb();
  const gates = await collectGateMetrics(projectId);
  const [payOverdue, matDelayed] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS c FROM payment_requests pr
       JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id
       WHERE c.project_id = ? AND pr.status != 'PAID'
         AND pr.due_date IS NOT NULL AND pr.due_date < CURRENT_DATE`
    ).getAsync(projectId).then((r) => Number(r?.c || 0)),
    db.prepare(
      `SELECT COUNT(*) AS c FROM materials
       WHERE project_id = ? AND procurement_status NOT IN ('DELIVERED', 'ACCEPTED') AND COALESCE(expected_delivery_at, created_at::date) < CURRENT_DATE - INTERVAL '30 days'`
    ).getAsync(projectId).then((r) => Number(r?.c || 0)),
  ]);
  return { ...gates, payment_overdue: payOverdue, material_delayed: matDelayed };
}

const worst = (levels) => (levels.includes('red') ? 'red' : levels.includes('yellow') ? 'yellow' : 'green');

export async function getProjectHealth(tenantId, projectId) {
  const [metrics, overrides] = await Promise.all([
    collectHealthMetrics(projectId),
    loadThresholds(tenantId, projectId),
  ]);
  const valueOf = {
    overdue_items: metrics.schedule_total
      ? metrics.schedule_total - metrics.schedule_done : 0,
    approval_pct: metrics.shop_approved_pct,
    payment_overdue: metrics.payment_overdue,
    material_delayed: metrics.material_delayed,
  };
  // overdue_items: tính đúng như UI (chưa xong + plan_end_date đã qua).
  const db = getDb();
  const overdue = await db.prepare(
    `SELECT COUNT(*) AS c FROM construction_schedule_items
     WHERE project_id = ? AND COALESCE(progress_pct, 0) < 1
       AND plan_end_date IS NOT NULL AND plan_end_date < CURRENT_DATE`
  ).getAsync(projectId).then((r) => Number(r?.c || 0));
  valueOf.overdue_items = overdue;
  const pillars = {
    shop: 'approval_pct',
    material: 'material_delayed',
    manpower: 'overdue_items',
    payment: 'payment_overdue',
  };
  const signals = {};
  for (const [pillar, metric] of Object.entries(pillars)) {
    const def = eff(overrides, metric);
    signals[pillar] = { ...def, value: valueOf[metric], level: evaluateLevel(def, valueOf[metric]) };
  }
  return {
    project_id: Number(projectId),
    overall: worst(Object.values(signals).map((s) => s.level)),
    signals,
    metrics: {
      overdue_items: valueOf.overdue_items,
      approval_pct: valueOf.approval_pct,
      payment_overdue: valueOf.payment_overdue,
      material_delayed: valueOf.material_delayed,
    },
  };
}

export async function getEffectiveThresholds(tenantId, projectId) {
  const overrides = await loadThresholds(tenantId, projectId);
  return THRESHOLDS.map((t) => eff(overrides, t.metric));
}
