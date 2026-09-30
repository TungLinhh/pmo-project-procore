// Pillar what-if simulation — SRS Mục 4.2 (CTL-01 → CTL-06, GĐ2 Control Layer).
// Nguyên tắc an toàn SRS 4.2.3: simulate() là pure (không ghi DB), chỉ tính
// lan truyền qua ma trận liên thông Mục 2.5 và trả về trước–sau; route mới
// persist DRAFT + audit. "Áp dụng làm baseline mới" + rollback ở bước sau.
//
// Baseline (ảnh chụp từ rows thật, xem collectSimBaseline):
//   completion      — max plan_end_date của items chưa DONE (YYYY-MM-DD)
//   open_items      — số items chưa DONE
//   manpower_rate   — headcount 7 ngày / 7 (người/ngày)
//   outstanding     — tổng PR chưa PAID (VND)
//   end_date        — deadline chính thức của project (có thể null)
//   unready_drawings / pending_materials — gate L1/L2 chưa duyệt (cho CTL-02)
import { getDb } from '../db/index.js';
import { scheduleFingerprint, scheduleLinksFingerprint } from './baseline.js';
import { compressSchedule, computeCpm, mapToCalendar, rowDurationDays } from './cpm.js';

export const SIM_TYPES = ['CTL-01', 'CTL-02', 'CTL-03', 'CTL-04', 'CTL-05', 'CTL-06'];

const DAY = 86400000;
const toDate = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00Z');
const fmt = (d) => d.toISOString().slice(0, 10);
const shift = (s, days) => fmt(new Date(toDate(s).getTime() + days * DAY));
const outstandingValue = (value) => Math.max(0, Number(value) || 0);

// Mức rủi ro trễ tổng thể: so ngày trễ thêm với float còn lại tới end_date.
export function riskOf(extraDays, floatDays) {
  if (extraDays <= 0) return 'LOW';
  if (floatDays == null) return extraDays <= 7 ? 'MED' : 'HIGH';
  if (extraDays <= 0.2 * Math.max(floatDays, 0)) return 'LOW';
  if (extraDays <= Math.max(floatDays, 0)) return 'MED';
  return 'HIGH';
}

// CTL-01 gia hạn (SRS 4.2.2): mốc hoàn thành lùi +extend_days; nhu cầu nhân
// lực/vật tư dàn mỏng theo thời gian mới; dòng tiền thanh toán lùi theo.
export function simCTL01(base, { extend_days }) {
  const d = Math.floor(Number(extend_days));
  if (!Number.isInteger(d) || d < 1 || d > 365) return { ok: false, error: 'extend_days must be integer 1..365' };
  const after = shift(base.completion, d);
  const remaining = Math.max(0, Math.round((toDate(base.completion) - Date.now()) / DAY));
  const diluted = remaining > 0 ? Math.round(base.manpower_rate * (remaining / (remaining + d)) * 10) / 10 : base.manpower_rate;
  return {
    ok: true,
    before: { completion: base.completion, open_items: base.open_items, manpower_rate: base.manpower_rate, outstanding: base.outstanding },
    after: {
      completion: after, open_items: base.open_items,
      manpower_rate_respread: diluted, material_need_shift_days: d, payment_shift_days: d,
    },
    deltas: { extension_days: d, affected_items: base.open_items },
    risk: riskOf(d, base.float_days),
    notes_vi: [
      `Gia hạn ${d} ngày → mốc hoàn thành ${base.completion} → ${after} cho ${base.open_items} hạng mục dở dang.`,
      `Nhu cầu nhân lực dàn mỏng ${base.manpower_rate} → ${diluted} người/ngày; vật tư đợt sau dịch ${d} ngày.`,
      `Dòng tiền thanh toán theo khối lượng lùi tương ứng ${d} ngày.`,
    ],
  };
}

// CTL-02 nén tiến độ: CPM quyết định những duration nào được rút và các
// ngày lịch sau nén. Công thức nhân lực bên dưới chỉ quy đổi mức nén thành
// ca/head-days; nó không tạo thêm một lịch tính độc lập.
export function simCTL02(base, { cut_days, cost_per_head_day, priority_item_ids }) {
  const d = Math.floor(Number(cut_days));
  if (!Number.isInteger(d) || d < 1 || d > 365) return { ok: false, error: 'cut_days must be integer 1..365' };
  const remaining = Math.max(0, Math.round((toDate(base.completion) - Date.now()) / DAY));
  if (remaining === 0) return { ok: false, error: 'no remaining time to compress (completion already reached)' };
  if (d >= remaining) return { ok: false, error: `cut_days (${d}) exceeds remaining time (${remaining} days)` };
  const rawIds = priority_item_ids == null || priority_item_ids === ''
    ? []
    : (Array.isArray(priority_item_ids) ? priority_item_ids : String(priority_item_ids).split(','));
  const priorityIds = [...new Set(rawIds.map(Number).filter(Number.isInteger))];
  const openIds = new Set((base.items || []).map((item) => Number(item.id)));
  if (rawIds.length && (priorityIds.length !== rawIds.length || priorityIds.some((id) => !openIds.has(id)))) {
    return { ok: false, error: 'priority_item_ids must contain open schedule item ids from this project' };
  }
  const selected = priorityIds.length
    ? (base.items || []).filter((item) => priorityIds.includes(Number(item.id)))
    : (base.items || []);

  let cpm = null;
  const sourceItems = base.all_items || base.items || [];
  if (sourceItems.length) {
    const cpmItems = sourceItems.map((item) => ({
      id: Number(item.id),
      duration_days: rowDurationDays(item),
      locked: Number(item.progress_pct) >= 1 || String(item.status || '').toUpperCase() === 'DONE',
    }));
    const links = (base.links || []).map((link) => ({
      predecessor_id: Number(link.predecessor_id),
      successor_id: Number(link.successor_id),
      link_type: link.link_type,
      lag_days: Number(link.lag_days || 0),
    }));
    try {
      const beforeCpm = computeCpm(cpmItems, links);
      const targetDays = Math.max(1, beforeCpm.projectDuration - d);
      const compression = compressSchedule(cpmItems, links, targetDays, {
        min_days_floor: 1,
        min_pct: 0.5,
        candidate_ids: selected.map((item) => Number(item.id)),
      });
      if (!compression.feasible) {
        return {
          ok: false,
          error: `dependency/CPM không đủ thời gian để nén ${d} ngày; còn thiếu ${compression.before - targetDays} ngày`,
        };
      }
      const afterCpm = computeCpm(
        cpmItems.map((item) => ({ ...item, duration_days: compression.durations[item.id] })),
        links,
      );
      const dateRows = sourceItems.map((item) => ({
        id: Number(item.id),
        plan_start_date: item.plan_start_date,
        actual_start_date: item.actual_start_date || null,
        progress_pct: item.progress_pct,
        status: item.status,
      }));
      const validStarts = dateRows.map((row) => row.plan_start_date).filter(Boolean).map(fmt).sort();
      const anchor = validStarts[0] || fmt(new Date());
      const calendarUpdates = mapToCalendar(dateRows, compression.durations, afterCpm.es, anchor, fmt(new Date()));
      cpm = {
        before_duration_days: compression.before,
        after_duration_days: compression.after,
        target_days: targetDays,
        critical_item_ids: afterCpm.critical,
        per_item: compression.perItem,
        durations: compression.durations,
        calendar_updates: calendarUpdates,
      };
    } catch (error) {
      return { ok: false, error: `dependency/CPM không hợp lệ: ${error.message}` };
    }
  }

  const factor = remaining / (remaining - d);
  const extraPct = Math.round((factor - 1) * 1000) / 10;
  const extraHeads = Math.round(base.manpower_rate * (factor - 1) * 10) / 10;
  const extraHeadDays = Math.round(extraHeads * (remaining - d));
  const after = shift(base.completion, -d);
  const costEach = Number(cost_per_head_day) || 0;
  const unreadyDrawings = Number(base.unready_drawings) || 0;
  const pendingMaterials = Number(base.pending_materials) || 0;
  const gated = unreadyDrawings + pendingMaterials > 0;
  const affectedItems = cpm
    ? Object.entries(cpm.calendar_updates || {}).filter(([id, update]) => {
      const item = sourceItems.find((row) => Number(row.id) === Number(id));
      const oldStart = item?.plan_start_date ? fmt(item.plan_start_date) : null;
      const oldEnd = item?.plan_end_date ? fmt(item.plan_end_date) : null;
      return item && !cpmItemsLocked(item) && (update.new_start !== oldStart || update.new_end !== oldEnd);
    }).length
    : selected.length;
  const risk = extraPct > 80 || (gated && d > 14) ? 'HIGH' : extraPct > 30 || gated ? 'MED' : 'LOW';
  const scopeLabel = priorityIds.length
    ? `${selected.length} hạng mục ưu tiên: ${selected.map((item) => item.name_vi || `#${item.id}`).join(', ')}`
    : `${base.open_items} hạng mục dở dang`;
  const notes = [
    `Nén ${d} ngày: thời gian còn lại ${remaining} → ${remaining - d} ngày, mốc ${base.completion} → ${after} cho ${scopeLabel}.`,
    `Cần bổ sung ~${extraPct}% nhân lực/ca (${base.manpower_rate} → ${Math.round((base.manpower_rate + extraHeads) * 10) / 10} người/ngày), tổng ~${extraHeadDays} người·ngày tăng thêm.`,
  ];
  if (cpm) notes.push(`CPM: đường găng ${cpm.critical_item_ids.length} hạng mục, rút ${cpm.before_duration_days - cpm.after_duration_days} ngày theo dependency.`);
  if (costEach > 0) {
    notes.push(`Ước tính chi phí nén: ~${Math.round(extraHeadDays * costEach).toLocaleString('vi-VN')} VND (${extraHeadDays} người·ngày × ${Number(costEach).toLocaleString('vi-VN')} VND).`);
  }
  if (gated) {
    notes.push(`Cảnh báo gate: ${unreadyDrawings} bản vẽ chưa duyệt (L1) + ${pendingMaterials} vật tư chưa duyệt (L2) — nén mà gate chưa sẵn sàng sẽ thành tiến độ ảo.`);
  }
  return {
    ok: true,
    before: { completion: base.completion, open_items: base.open_items, manpower_rate: base.manpower_rate, remaining_days: remaining },
    after: {
      completion: after, remaining_days: remaining - d,
      priority_item_ids: priorityIds, affected_items: affectedItems,
      required_extra_pct: extraPct, extra_head_days: extraHeadDays,
      ...(costEach > 0 ? { estimated_cost_vnd: Math.round(extraHeadDays * costEach) } : {}),
      unready_drawings: unreadyDrawings, pending_materials: pendingMaterials,
      ...(cpm ? { cpm } : {}),
    },
    deltas: { cut_days: d, affected_items: affectedItems, required_extra_pct: extraPct },
    risk,
    notes_vi: notes,
  };
}

function cpmItemsLocked(item) {
  return Number(item.progress_pct) >= 1 || String(item.status || '').toUpperCase() === 'DONE';
}

export function simCTL03(base, { delay_days }) {
  const d = Math.floor(Number(delay_days));
  if (!Number.isInteger(d) || d < 1 || d > 365) return { ok: false, error: 'delay_days must be integer 1..365' };
  const after = shift(base.completion, d);
  return {
    ok: true,
    before: { completion: base.completion, open_items: base.open_items, manpower_rate: base.manpower_rate, outstanding: base.outstanding },
    after: { completion: after, open_items: base.open_items, manpower_idle_heads_days: Math.round(d * base.manpower_rate), payment_slip_days: d },
    deltas: { completion_slip_days: d, affected_items: base.open_items },
    risk: riskOf(d, base.float_days),
    notes_vi: [
      `Vật tư trễ ${d} ngày → ${base.open_items} hạng mục dở dang lùi mốc hoàn thành ${base.completion} → ${after}.`,
      `Huy động nhân lực kém hiệu quả ~${Math.round(d * base.manpower_rate)} người·ngày (gate L2→L3).`,
      `Hồ sơ thanh toán theo khối lượng lùi tương ứng ${d} ngày (L3→L4).`,
    ],
  };
}

export function simCTL04(base, { late_days }) {
  const d = Math.floor(Number(late_days));
  if (!Number.isInteger(d) || d < 1 || d > 365) return { ok: false, error: 'late_days must be integer 1..365' };
  const cashIn = Math.max(0, Number(base.cash_in_total) || 0);
  const dueNow = Math.max(0, Number(base.cash_due_now) || 0);
  const remainingReceivable = Math.max(0, Number(base.cash_remaining) || 0);
  const advanceCapacity = Math.max(0, cashIn - dueNow);
  const proposedAdvance = Math.min(Math.max(0, Number(base.outstanding) || 0), advanceCapacity);
  return {
    ok: true,
    before: {
      outstanding: base.outstanding,
      next_procurement_start: base.completion,
      cash_in_total: cashIn,
      cash_due_now: dueNow,
    },
    after: {
      outstanding: base.outstanding,
      next_procurement_start: shift(base.completion, d),
      cash_in_total: cashIn,
      cash_remaining: remainingReceivable,
      advance_capacity: advanceCapacity,
      proposed_advance: proposedAdvance,
      advance_coverage_pct: outstandingValue(base.outstanding) > 0
        ? Math.round((proposedAdvance / outstandingValue(base.outstanding)) * 1000) / 10
        : 100,
    },
    deltas: { procurement_slip_days: d, proposed_advance: proposedAdvance },
    risk: proposedAdvance < outstandingValue(base.outstanding) ? 'HIGH' : riskOf(d, base.float_days),
    notes_vi: [
      `Chủ đầu tư chậm giải ngân ${d} ngày (feedback L4→L2): đợt đặt hàng vật tư sau lùi ${d} ngày.`,
      `Dòng tiền thực tế từ AR: đã thu ${cashIn.toLocaleString('vi-VN')} VND · đã đến hạn ${dueNow.toLocaleString('vi-VN')} VND · còn phải thu ${remainingReceivable.toLocaleString('vi-VN')} VND.`,
      proposedAdvance > 0
        ? `Đề xuất tạm ứng ${proposedAdvance.toLocaleString('vi-VN')} VND, không vượt số tiền thực thu còn khả dụng.`
        : 'Chưa đủ bằng chứng AR để đề xuất tạm ứng; nhập phải thu/đã thu thực tế trước khi cấp.',
    ],
  };
}

export function simCTL05(base, { delta_pct }) {
  const p = Number(delta_pct);
  if (!Number.isFinite(p) || p <= -100 || p > 300 || p === 0) return { ok: false, error: 'delta_pct must be in (-100, 300] and != 0' };
  const factor = 1 / (1 + p / 100);
  const remaining = Math.max(0, Math.round((toDate(base.completion) - Date.now()) / DAY));
  if (remaining === 0) return { ok: false, error: 'no remaining time to re-plan (completion already reached)' };
  const newRemaining = Math.round(remaining * factor);
  const manpowerAfter = Math.round(base.manpower_rate * (1 + p / 100) * 10) / 10;

  // Positive productivity is a schedule compression request, not a blanket
  // date shift. Run it through the same dependency/CPM floor as CTL-02.
  if (p > 0) {
    const cutDays = remaining - newRemaining;
    if (cutDays < 1) return { ok: false, error: 'mức tăng năng suất không tạo đủ ngày để nén; hãy mô phỏng lại' };
    const sourceItems = base.all_items || base.items || [];
    if (!sourceItems.length) return { ok: false, error: 'CTL-05 cần ít nhất một hạng mục lịch thực' };
    const cpmItems = sourceItems.map((item) => ({
      id: Number(item.id),
      duration_days: rowDurationDays(item),
      locked: Number(item.progress_pct) >= 1 || String(item.status || '').toUpperCase() === 'DONE',
    }));
    const links = (base.links || []).map((link) => ({
      predecessor_id: Number(link.predecessor_id),
      successor_id: Number(link.successor_id),
      link_type: link.link_type,
      lag_days: Number(link.lag_days || 0),
    }));
    try {
      const beforeCpm = computeCpm(cpmItems, links);
      const targetDays = beforeCpm.projectDuration - cutDays;
      if (targetDays < 1) return { ok: false, error: 'compression target is below one day' };
      const compression = compressSchedule(cpmItems, links, targetDays, {
        min_days_floor: 1,
        min_pct: 0.5,
        candidate_ids: (base.items || []).map((item) => Number(item.id)),
      });
      if (!compression.feasible) {
        return { ok: false, error: `dependency/CPM không đủ thời gian để nén ${cutDays} ngày; còn thiếu ${compression.before - targetDays} ngày` };
      }
      const afterCpm = computeCpm(
        cpmItems.map((item) => ({ ...item, duration_days: compression.durations[item.id] })),
        links,
      );
      const dateRows = sourceItems.map((item) => ({
        id: Number(item.id),
        plan_start_date: item.plan_start_date,
        actual_start_date: item.actual_start_date || null,
        progress_pct: item.progress_pct,
        status: item.status,
      }));
      const validStarts = dateRows.map((row) => row.plan_start_date).filter(Boolean).map(fmt).sort();
      const anchor = validStarts[0] || base.completion;
      const calendarUpdates = mapToCalendar(dateRows, compression.durations, afterCpm.es, anchor, fmt(new Date()));
      const completion = Math.max(...Object.values(calendarUpdates).map((update) => update.new_end).filter(Boolean));
      const extraPct = Math.round(((1 / (1 + p / 100)) - 1) * 1000) / 10;
      return {
        ok: true,
        before: { completion: base.completion, manpower_rate: base.manpower_rate, remaining_days: remaining },
        after: {
          completion: completion || shift(base.completion, -cutDays),
          manpower_rate: manpowerAfter,
          remaining_days: newRemaining,
          material_need_shift_days: -cutDays,
          required_extra_pct: extraPct,
          affected_items: Object.keys(calendarUpdates).length,
          cpm: {
            before_duration_days: compression.before,
            after_duration_days: compression.after,
            critical_item_ids: afterCpm.critical,
            per_item: compression.perItem,
            durations: compression.durations,
            calendar_updates: calendarUpdates,
          },
        },
        deltas: { completion_shift_days: -cutDays, headcount_change_pct: p, affected_items: Object.keys(calendarUpdates).length },
        risk: extraPct > 80 ? 'HIGH' : extraPct > 30 ? 'MED' : 'LOW',
        notes_vi: [
          `Tăng ${p}% nhân lực/máy → nén ${cutDays} ngày theo CPM, mốc ${base.completion} → ${completion || shift(base.completion, -cutDays)}.`,
          `Đường găng còn ${afterCpm.critical.length} hạng mục; tổng thời gian ${compression.before} → ${compression.after} ngày.`,
        ],
      };
    } catch (error) {
      return { ok: false, error: `dependency/CPM không hợp lệ: ${error.message}` };
    }
  }

  const extensionDays = newRemaining - remaining;
  const after = shift(base.completion, extensionDays);
  return {
    ok: true,
    before: { completion: base.completion, manpower_rate: base.manpower_rate, remaining_days: remaining },
    after: {
      completion: after,
      manpower_rate: manpowerAfter,
      remaining_days: newRemaining,
      material_need_shift_days: extensionDays,
    },
    deltas: { completion_shift_days: extensionDays, headcount_change_pct: p },
    risk: riskOf(extensionDays, base.float_days),
    notes_vi: [
      `Giảm ${Math.abs(p)}% nhân lực/máy → thời gian còn lại ${remaining} → ${newRemaining} ngày, mốc ${base.completion} → ${after}.`,
      `Nhu cầu vật tư tương ứng dịch ${extensionDays} ngày (giữ đồng bộ L2↔L3).`,
    ],
  };
}

export function simCTL06(base, { rounds, days_per_round }) {
  const r = Math.floor(Number(rounds));
  const d = Math.floor(Number(days_per_round));
  if (!Number.isInteger(r) || r < 1 || r > 10) return { ok: false, error: 'rounds must be integer 1..10' };
  if (!Number.isInteger(d) || d < 1 || d > 90) return { ok: false, error: 'days_per_round must be integer 1..90' };
  const extra = r * d;
  const after = shift(base.completion, extra);
  return {
    ok: true,
    before: { completion: base.completion, open_items: base.open_items },
    after: { completion: after, downstream_gates: ['G1', 'G2', 'G3', 'G4'] },
    deltas: { rework_days: extra, affected_items: base.open_items },
    risk: riskOf(extra, base.float_days),
    notes_vi: [
      `Bản vẽ/BPTC bị trả lại ${r} vòng × ${d} ngày = ${extra} ngày → toàn bộ downstream (L2,L3,L4) lùi ${base.completion} → ${after}.`,
      `Mức rủi ro trễ tổng thể: ${riskOf(extra, base.float_days)}.`,
    ],
  };
}

const SIM_FN = { 'CTL-01': simCTL01, 'CTL-02': simCTL02, 'CTL-03': simCTL03, 'CTL-04': simCTL04, 'CTL-05': simCTL05, 'CTL-06': simCTL06 };

// Ảnh baseline từ rows thật của project. Không có schedule items → lấy
// project.end_date, cuối cùng fallback today+30 (ghi rõ trong notes của route).
export async function collectSimBaseline(projectId) {
  const db = getDb();
  const [items, links, manpower, outstanding, proj, cashflow, gates] = await Promise.all([
    db.prepare(
      `SELECT id, name_vi, zone_id, plan_start_date, plan_end_date, plan_duration_days, progress_pct, status, actual_start_date
       FROM construction_schedule_items WHERE project_id = ? ORDER BY id`
    ).allAsync(projectId),
    db.prepare(
      `SELECT predecessor_id, successor_id, link_type, lag_days
       FROM schedule_links WHERE project_id = ? ORDER BY id`
    ).allAsync(projectId),
    db.prepare(
      `SELECT COALESCE(SUM(dm.headcount), 0) AS c FROM daily_manpower dm
       JOIN daily_reports dr ON dr.id = dm.daily_report_id
       WHERE dr.project_id = ? AND dr.report_date >= CURRENT_DATE - INTERVAL '7 days'
         AND COALESCE(dm.kind, 'labor') = 'labor'`
    ).getAsync(projectId).then((r) => Number(r?.c || 0)),
    db.prepare(
      `SELECT COALESCE(SUM(pr.amount), 0) AS c FROM payment_requests pr
       JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id
       WHERE c.project_id = ? AND pr.status != 'PAID'`
    ).getAsync(projectId).then((r) => Number(r?.c || 0)),
    db.prepare('SELECT end_date FROM projects WHERE id = ?').getAsync(projectId),
    // Gate chưa sẵn sàng cho CTL-02: bản vẽ chưa duyệt (L1) + submittal chưa duyệt (L2).
    db.prepare(
      `SELECT COALESCE(SUM(paid_value), 0) AS cash_in,
              COALESCE(SUM(due_now_value), 0) AS due_now,
              COALESCE(SUM(remaining_value), 0) AS remaining
       FROM ar_contracts WHERE project_id = ?`
    ).getAsync(projectId),
    Promise.all([
      db.prepare(
        `SELECT COUNT(*) AS c FROM shop_drawings WHERE project_id = ? AND approval_date IS NULL`
      ).getAsync(projectId).then((r) => Number(r?.c || 0)),
      db.prepare(
        `SELECT COUNT(*) AS c FROM material_submittals WHERE project_id = ? AND status NOT IN ('APPROVED')`
      ).getAsync(projectId).then((r) => Number(r?.c || 0)),
    ]),
  ]);
  const open = items.filter((i) => !(Number(i.progress_pct) >= 1 || String(i.status).toUpperCase() === 'DONE'));
  const ends = open.map((i) => i.plan_end_date).filter(Boolean).map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))).sort();
  const normEnd = proj?.end_date ? (proj.end_date instanceof Date ? proj.end_date.toISOString().slice(0, 10) : String(proj.end_date).slice(0, 10)) : null;
  const completion = ends.length ? ends[ends.length - 1] : (normEnd || fmt(new Date(Date.now() + 30 * DAY)));
  const floatDays = normEnd ? Math.round((toDate(normEnd) - toDate(completion)) / DAY) : null;
  return {
    completion,
    open_items: open.length,
    items: open.map((item) => ({
      id: Number(item.id), name_vi: item.name_vi, zone_id: item.zone_id,
      plan_start_date: item.plan_start_date, plan_end_date: item.plan_end_date,
      plan_duration_days: item.plan_duration_days, progress_pct: item.progress_pct,
      status: item.status, actual_start_date: item.actual_start_date,
    })),
    all_items: items.map((item) => ({
      id: Number(item.id), name_vi: item.name_vi, zone_id: item.zone_id,
      plan_start_date: item.plan_start_date, plan_end_date: item.plan_end_date,
      plan_duration_days: item.plan_duration_days, progress_pct: item.progress_pct,
      status: item.status, actual_start_date: item.actual_start_date,
    })),
    links: links.map((link) => ({
      predecessor_id: Number(link.predecessor_id), successor_id: Number(link.successor_id),
      link_type: link.link_type, lag_days: Number(link.lag_days || 0),
    })),
    manpower_rate: Math.round((manpower / 7) * 10) / 10,
    outstanding,
    cash_in_total: Number(cashflow?.cash_in || 0),
    cash_due_now: Number(cashflow?.due_now || 0),
    cash_remaining: Number(cashflow?.remaining || 0),
    end_date: normEnd,
    float_days: floatDays,
    unready_drawings: gates[0],
    pending_materials: gates[1],
    schedule_fingerprint: scheduleFingerprint(items),
    dependency_fingerprint: scheduleLinksFingerprint(links),
    synthetic: ends.length === 0, // true khi không có plan_end_date thật
  };
}

export function simulate(type, baseline, params) {
  const fn = SIM_FN[type];
  if (!fn) return { ok: false, error: `Unknown type (must be ${SIM_TYPES.join('|')})` };
  return fn(baseline, params || {});
}
