// Pillar gate engine — SRS Mục 2.5 (ma trận liên thông) + 3.1 (gate-based
// logic, cấu hình được, không hard-code).
//
// 5 gates theo đúng Bảng Mục 2.5:
//   G1 shop → material     (duyệt bản vẽ mới được trình MSB)
//   G2 shop → manpower     (duyệt BPTC mới được huy động thi công)
//   G3 material → manpower (vật tư về đủ mới huy động hiệu quả)
//   G4 manpower → payment  (khối lượng hoàn thành → hồ sơ thanh toán)
//   G5 payment → material  (feedback: dòng tiền thu → đặt hàng đợt sau)
//
// Mỗi gate: enabled + threshold_pct do PMO cấu hình (bảng
// pillar_gate_configs; project_id = 0 là default cấp tenant).
// Ngưỡng mặc định dưới đây là điểm khởi đầu — PMO chỉnh theo loại dự án.
// Gate TẮT (enabled = false) = không chặn hiển thị (state DISABLED).
// Layer chưa đủ gate hiện "Chờ điều kiện" (SRS Mục 5), không phải số trống.
import { getDb } from '../db/index.js';

export const PILLARS = ['shop', 'material', 'manpower', 'payment'];

// Thứ tự lớp hiển thị SRS Mục 5: L1 shop → L2 material → L3 manpower → L4 payment.
export const LAYER_OF = { shop: 1, material: 2, manpower: 3, payment: 4 };

export const GATES = [
  {
    id: 'G1', from: 'shop', to: 'material', metric: 'shop_approved_pct',
    defaultThreshold: 80,
    label_vi: 'Duyệt bản vẽ mới được trình MSB',
    delay_vi: 'Độ trễ điển hình 1–3 tuần',
  },
  {
    id: 'G2', from: 'shop', to: 'manpower', metric: 'shop_approved_pct',
    defaultThreshold: 80,
    label_vi: 'Duyệt BPTC mới được huy động thi công',
    delay_vi: 'Tức thời – 1 tuần',
  },
  {
    id: 'G3', from: 'material', to: 'manpower', metric: 'material_arrived_pct',
    defaultThreshold: 70,
    label_vi: 'Vật tư về đủ mới huy động hiệu quả',
    delay_vi: '2–8 tuần theo loại vật tư',
  },
  {
    id: 'G4', from: 'manpower', to: 'payment', metric: 'schedule_done_pct',
    defaultThreshold: 1,
    label_vi: 'Khối lượng hoàn thành → hồ sơ thanh toán',
    delay_vi: '2–4 tuần',
  },
  {
    id: 'G5', from: 'payment', to: 'material', metric: 'payment_paid_pct',
    defaultThreshold: 50,
    label_vi: 'Dòng tiền thu → khả năng đặt hàng đợt sau (feedback)',
    delay_vi: 'Theo chu kỳ dòng tiền dự án',
  },
];

const pct = (done, total) => (total > 0 ? Math.round((done / total) * 1000) / 10 : 0);

// Đọc override cấu hình: project riêng trước, thiếu thì default tenant
// (project_id = 0). Không có row nào → dùng defaultThreshold trong GATES.
export async function loadGateConfigs(tenantId, projectId) {
  const db = getDb();
  const rows = await db.prepare(
    'SELECT * FROM pillar_gate_configs WHERE tenant_id = ? AND project_id IN (0, ?)'
  ).allAsync(tenantId, projectId);
  const byGate = new Map();
  for (const r of rows) {
    const key = `${r.from_pillar}->${r.to_pillar}`;
    // Row project riêng thắng row default tenant.
    if (!byGate.has(key) || Number(r.project_id) === Number(projectId)) byGate.set(key, r);
  }
  return byGate;
}

// Metrics thật từ DB cho 1 project. Toàn COUNT/SUM — rẻ, chạy song song.
export async function collectGateMetrics(projectId) {
  const db = getDb();
  const [
    shopTotal, shopApproved,
    msbTotal, msbApproved,
    matTotal, matArrived,
    schedTotal, schedDone,
    manpower7d, reports7d,
    prTotal, prPaid,
  ] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS c FROM shop_drawings WHERE project_id = ?').getAsync(projectId).then((r) => Number(r?.c || 0)),
    db.prepare("SELECT COUNT(*) AS c FROM shop_drawings WHERE project_id = ? AND status = 'APPROVED'").getAsync(projectId).then((r) => Number(r?.c || 0)),
    db.prepare('SELECT COUNT(*) AS c FROM material_submittals WHERE project_id = ?').getAsync(projectId).then((r) => Number(r?.c || 0)),
    db.prepare("SELECT COUNT(*) AS c FROM material_submittals WHERE project_id = ? AND status IN ('APPROVED', 'CLOSED')").getAsync(projectId).then((r) => Number(r?.c || 0)),
    db.prepare('SELECT COUNT(*) AS c FROM materials WHERE project_id = ?').getAsync(projectId).then((r) => Number(r?.c || 0)),
    db.prepare("SELECT COUNT(*) AS c FROM materials WHERE project_id = ? AND procurement_status IN ('DELIVERED', 'ACCEPTED')").getAsync(projectId).then((r) => Number(r?.c || 0)),
    db.prepare('SELECT COUNT(*) AS c FROM construction_schedule_items WHERE project_id = ?').getAsync(projectId).then((r) => Number(r?.c || 0)),
    db.prepare('SELECT COUNT(*) AS c FROM construction_schedule_items WHERE project_id = ? AND (COALESCE(progress_pct, 0) >= 1 OR status = ?)').getAsync(projectId, 'DONE').then((r) => Number(r?.c || 0)),
    db.prepare(
      `SELECT COALESCE(SUM(dm.headcount), 0) AS c FROM daily_manpower dm
       JOIN daily_reports dr ON dr.id = dm.daily_report_id
       WHERE dr.project_id = ? AND dr.report_date >= CURRENT_DATE - INTERVAL '7 days'
         AND COALESCE(dm.kind, 'labor') = 'labor'`
    ).getAsync(projectId).then((r) => Number(r?.c || 0)),
    db.prepare(
      `SELECT COUNT(*) AS c FROM daily_reports WHERE project_id = ? AND report_date >= CURRENT_DATE - INTERVAL '7 days'`
    ).getAsync(projectId).then((r) => Number(r?.c || 0)),
    db.prepare(
      `SELECT COUNT(*) AS c FROM payment_requests pr
       JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id
       WHERE c.project_id = ?`
    ).getAsync(projectId).then((r) => Number(r?.c || 0)),
    db.prepare(
      `SELECT COUNT(*) AS c FROM payment_requests pr
       JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id
       WHERE c.project_id = ? AND pr.status = 'PAID'`
    ).getAsync(projectId).then((r) => Number(r?.c || 0)),
  ]);
  return {
    shop_total: shopTotal, shop_approved: shopApproved, shop_approved_pct: pct(shopApproved, shopTotal),
    msb_total: msbTotal, msb_approved: msbApproved, msb_approved_pct: pct(msbApproved, msbTotal),
    material_total: matTotal, material_arrived: matArrived, material_arrived_pct: pct(matArrived, matTotal),
    schedule_total: schedTotal, schedule_done: schedDone, schedule_done_pct: pct(schedDone, schedTotal),
    manpower_7d: manpower7d, reports_7d: reports7d,
    pr_total: prTotal, pr_paid: prPaid, payment_paid_pct: pct(prPaid, prTotal),
  };
}

function metricValue(metrics, name) {
  return Number(metrics[name] ?? 0);
}

// Đánh giá 1 gate: DISABLED | OPEN | WAITING. Project chưa có dữ liệu nguồn
// (mẫu số = 0) → WAITING với lý do "chưa có dữ liệu", trừ khi gate bị tắt.
// override mang thêm scope (default|tenant|project) để UI hiển thị nguồn.
export function evaluateGate(def, metrics, override) {
  const enabled = override ? !!override.enabled : true;
  const threshold = override && override.threshold_pct != null
    ? Number(override.threshold_pct) : def.defaultThreshold;
  const scope = !override ? 'default' : (override.scope || (Number(override.project_id) === 0 ? 'tenant' : 'project'));
  if (!enabled) {
    return { ...def, enabled, threshold_pct: threshold, metric_value: metricValue(metrics, def.metric), state: 'DISABLED', reason_vi: 'Gate đang tắt (PMO cấu hình) — không chặn.', scope };
  }
  const value = metricValue(metrics, def.metric);
  const hasSource = hasSourceData(def.metric, metrics);
  if (!hasSource) {
    return { ...def, enabled, threshold_pct: threshold, metric_value: value, state: 'WAITING', reason_vi: 'Chưa có dữ liệu nguồn — cần nhập liệu trước.', scope };
  }
  if (value >= threshold) {
    return { ...def, enabled, threshold_pct: threshold, metric_value: value, state: 'OPEN', reason_vi: `Đạt ${value}% ≥ ngưỡng ${threshold}%.`, scope };
  }
  return { ...def, enabled, threshold_pct: threshold, metric_value: value, state: 'WAITING', reason_vi: `Mới ${value}% < ngưỡng ${threshold}% (${def.delay_vi}).`, scope };
}

function hasSourceData(metric, m) {
  if (metric === 'shop_approved_pct') return m.shop_total > 0;
  if (metric === 'material_arrived_pct') return m.material_total > 0;
  if (metric === 'schedule_done_pct') return m.schedule_total > 0;
  if (metric === 'payment_paid_pct') return m.pr_total > 0;
  return true;
}

// Trạng thái lớp hiển thị SRS Mục 5:
//   L1 luôn READY. L2 READY khi G1 OPEN/DISABLED. L3 READY khi G2+G3
//   OPEN/DISABLED. L4 READY khi G4 OPEN/DISABLED (cần khối lượng hoàn thành).
//   G5 là feedback — chỉ cảnh báo trên L2, không chặn hiển thị.
export function evaluateLayers(gates) {
  const byId = new Map(gates.map((g) => [g.id, g]));
  const pass = (id) => { const g = byId.get(id); return !g || g.state !== 'WAITING'; };
  const blockers = (ids) => ids.filter((id) => byId.get(id)?.state === 'WAITING');
  const layers = [
    { layer: 1, pillar: 'shop', state: 'READY', blocked_by: [] },
    { layer: 2, pillar: 'material', state: pass('G1') ? 'READY' : 'WAITING', blocked_by: blockers(['G1']) },
    { layer: 3, pillar: 'manpower', state: pass('G2') && pass('G3') ? 'READY' : 'WAITING', blocked_by: blockers(['G2', 'G3']) },
    { layer: 4, pillar: 'payment', state: pass('G4') ? 'READY' : 'WAITING', blocked_by: blockers(['G4']) },
  ];
  const g5 = byId.get('G5');
  const feedback = g5 ? { state: g5.state, reason_vi: g5.reason_vi } : null;
  return { layers, feedback };
}

export async function collectWorkItemGateMetrics(projectId, workItemId = null) {
  const db = getDb();
  const params = workItemId ? [projectId, workItemId] : [projectId];
  const filter = workItemId ? 'AND wi.id = $2' : '';
  const result = await db.prepare(
    `SELECT wi.id AS work_item_id, wi.code, wi.name_vi,
            COUNT(DISTINCT sd.id) AS shop_total,
            COUNT(DISTINCT sd.id) FILTER (WHERE sd.status = 'APPROVED') AS shop_approved,
            COUNT(DISTINCT ms.id) AS msb_total,
            COUNT(DISTINCT ms.id) FILTER (WHERE ms.status IN ('APPROVED', 'CLOSED')) AS msb_approved,
            COUNT(DISTINCT m.id) AS material_total,
            COUNT(DISTINCT m.id) FILTER (WHERE m.procurement_status IN ('DELIVERED', 'ACCEPTED')) AS material_arrived,
            COUNT(DISTINCT csi.id) AS schedule_total,
            COUNT(DISTINCT csi.id) FILTER (WHERE COALESCE(csi.progress_pct, 0) >= 1 OR csi.status = 'DONE') AS schedule_done,
            COUNT(DISTINCT pri.id) AS pr_total,
            COUNT(DISTINCT pri.id) FILTER (WHERE pr.status = 'PAID') AS pr_paid
     FROM work_items wi
     LEFT JOIN construction_schedule_items csi ON csi.work_item_id = wi.id
     LEFT JOIN shop_drawings sd ON sd.work_item_id = wi.id
     LEFT JOIN material_submittals ms ON ms.work_item_id = wi.id
     LEFT JOIN materials m ON m.work_item_id = wi.id
     LEFT JOIN payment_request_items pri ON pri.work_item_id = wi.id
     LEFT JOIN payment_requests pr ON pr.id = pri.payment_request_id
     WHERE wi.project_id = $1 ${filter}
     GROUP BY wi.id, wi.code, wi.name_vi
     ORDER BY wi.code, wi.id
     LIMIT 500`,
  ).allAsync(...params);
  return result.map((row) => ({
    work_item_id: Number(row.work_item_id),
    code: row.code,
    name_vi: row.name_vi,
    metrics: {
      shop_total: Number(row.shop_total), shop_approved: Number(row.shop_approved), shop_approved_pct: pct(Number(row.shop_approved), Number(row.shop_total)),
      msb_total: Number(row.msb_total), msb_approved: Number(row.msb_approved), msb_approved_pct: pct(Number(row.msb_approved), Number(row.msb_total)),
      material_total: Number(row.material_total), material_arrived: Number(row.material_arrived), material_arrived_pct: pct(Number(row.material_arrived), Number(row.material_total)),
      schedule_total: Number(row.schedule_total), schedule_done: Number(row.schedule_done), schedule_done_pct: pct(Number(row.schedule_done), Number(row.schedule_total)),
      pr_total: Number(row.pr_total), pr_paid: Number(row.pr_paid), payment_paid_pct: pct(Number(row.pr_paid), Number(row.pr_total)),
    },
  }));
}

export async function getPillarGates(tenantId, projectId, workItemId = null) {
  const [metrics, overrides] = await Promise.all([
    collectGateMetrics(projectId),
    loadGateConfigs(tenantId, projectId),
  ]);
  const gates = GATES.map((def) =>
    evaluateGate(def, metrics, overrides.get(`${def.from}->${def.to}`) || null)
  );
  const { layers, feedback } = evaluateLayers(gates);
  const workItemMetrics = await collectWorkItemGateMetrics(projectId, workItemId);
  const workItems = workItemMetrics.map((row) => {
    const itemGates = GATES.map((def) => evaluateGate(def, row.metrics, overrides.get(`${def.from}->${def.to}`) || null));
    const itemLayers = evaluateLayers(itemGates);
    return {
      work_item_id: row.work_item_id,
      code: row.code,
      name_vi: row.name_vi,
      layers: itemLayers.layers,
      gates: itemGates,
      feedback: itemLayers.feedback,
      metrics: row.metrics,
    };
  });
  return {
    project_id: Number(projectId),
    work_item_id: workItemId ? Number(workItemId) : null,
    layers,
    gates,
    feedback,
    metrics,
    work_items: workItems,
  };
}
