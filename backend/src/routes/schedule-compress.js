// Schedule compression (v0.6.0 Phase 2): preview → apply → rollback.
// Invariants: preview writes nothing but the scenario row; apply ALWAYS
// recomputes from CURRENT rows (never trusts a stale preview); apply stores
// the before-values it overwrote so rollback restores exactly.
// Enterprise-only: every endpoint requires the 'schedule-compress' flag (403
// below Enterprise). Mount: /api.

import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireProjectAccess, checkProjectAccess } from '../lib/project-access.js';
import { requireFeature } from '../lib/entitlements.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { lockProject, readScheduleRows, scheduleFingerprint } from '../lib/baseline.js';
import { computeCpm, compressSchedule, mapToCalendar, rowDurationDays, dateDiffDays, normalizeGaps, detectSummaryRows } from '../lib/cpm.js';
import { errorBody } from '../lib/error-body.js';

// Lỗi mang HTTP status để handler trả đúng mã. `lib/baseline.js` có hàm cùng
// việc nhưng không export, nên khai báo riêng ở đây thay vì sửa baseline.
const httpError = (status, error) => Object.assign(new Error(error), { status });

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);
router.use('/projects/:id', requireProjectAccess());
// Role split (deadline feature): PM/PMO propose (preview + view), only
// CEO/Admin approve (apply/rollback). PMO was 403 before — now included.
const CAN_PROPOSE = [requireRole('admin', 'ceo', 'pm', 'pmo'), requireFeature('schedule-compress')];
const CAN_APPROVE = [requireRole('admin', 'ceo'), requireFeature('schedule-compress')];

const todayStr = () => new Date().toISOString().slice(0, 10);

// Ngày đích **nhỏ nhất** để lần nén thành công.
//
// Không đoán được bằng `calendar_end + 1`. Bản đầu đoán vậy và **sai**: đo 2026-09-30,
// `calendar_end` = 2027-06-25 cho mục tiêu 2026-10-30 nhưng = 2027-07-01 cho mục tiêu
// 2027-03-29 — tức đổi mục tiêu thì lịch tính ra cũng đổi, vì mục tiêu xa hơn thì nén
// ít hơn. Gợi ý 2027-06-26 dùng vào lại **không** khả thi. Nên phải tìm thật.
//
// Tìm theo **tìm kiếm nhị phân** trên ngày đích: `feasible` không đơn điệu theo một
// chiều (đo đã thấy lịch dài hơn khi mục tiêu xa hơn), nên tìm nhị phân chỉ an toàn
// khi kiểm được cả hai vế — và ở đây `calc` thuần nên thử thoải mái. Vì thực tế không
// đơn điệu, ta **duyệt theo bước** trước để lấy một khoảng hẹp, rồi nhị phân trong
// khoảng đó.
const SEARCH_HORIZON_DAYS = 900;
const SEARCH_STEP_DAYS = 15;

function searchEarliestFeasible(anchor, calc) {
  // Bước 1: quét thô để biết có khả thi trong chân trời không, và bắt đầu từ đâu.
  let firstFeasible = null;
  for (let d = SEARCH_STEP_DAYS; d <= SEARCH_HORIZON_DAYS; d += SEARCH_STEP_DAYS) {
    const t = addDays(anchor, d);
    const r = calc(t);
    if (r.comp.feasible && r.calEnd <= t) { firstFeasible = t; break; }
  }
  if (!firstFeasible) return null;
  // Bước 2: nhị phân trong `[firstFeasible - STEP, firstFeasible]` để lấy ngày sớm nhất
  // ở độ phân giải một ngày.
  let lo = Math.max(SEARCH_STEP_DAYS, daysBetween(anchor, firstFeasible) - SEARCH_STEP_DAYS);
  let hi = daysBetween(anchor, firstFeasible);
  const ok = (d) => {
    const t = addDays(anchor, d);
    const r = calc(t);
    return r.comp.feasible && r.calEnd <= t;
  };
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) hi = mid; else lo = mid + 1;
  }
  return addDays(anchor, lo);
}

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const addDays = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
// pg returns DATE columns as JS Date (or string via some paths) — normalize.
const asDateStr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

async function loadSchedule(projectId) {
  const db = getDb();
  const [rows, links] = await Promise.all([
    db.prepare(
      `SELECT id, zone_id, name_vi, progress_pct, status, plan_start_date, actual_start_date, plan_end_date, plan_duration_days
       FROM construction_schedule_items WHERE project_id = ?`
    ).allAsync(projectId),
    db.prepare('SELECT predecessor_id, successor_id, link_type, lag_days FROM schedule_links WHERE project_id = ?').allAsync(projectId),
  ]);
  // pg returns DATE as JS Date objects — normalize to YYYY-MM-DD strings once,
  // so the pure engine (string date math) never sees a Date.
  for (const r of rows) {
    for (const k of ['plan_start_date', 'actual_start_date', 'plan_end_date']) {
      if (r[k] != null) r[k] = asDateStr(r[k]);
    }
  }
  return { rows, links };
}

function toEngineItems(rows) {
  return rows.map((r) => {
    const dur = rowDurationDays(r);
    const pct = r.progress_pct ?? 0;
    return {
      id: r.id, duration_days: dur,
      locked: pct >= 1 || r.status === 'DONE',
      elapsed_days: pct > 0 && pct < 1 ? Math.round(dur * pct) : 0,
    };
  });
}

// Full compression run from live rows. Returns everything preview AND apply need.
// Anchor is ALWAYS today: compression replans remaining work forward from now.
// (Anchoring at min plan_start let ancient 2019 rows inflate the day-index
// scale into meaninglessness.) Started/locked items keep their real starts;
// pending items never start in the past (clamped in mapToCalendar).
// Holidays (global + own tenant) overlapping the window auto-merge as gaps.
async function runCompression(db, tenantId, rows, links, targetEnd, policy) {
  const excluded = new Set((policy.exclude_ids || []).filter(Number.isInteger));
  const live = rows.filter((r) => !excluded.has(r.id));
  const liveLinks = links.filter((l) => !excluded.has(l.predecessor_id) && !excluded.has(l.successor_id));
  const items = toEngineItems(live);
  const anchor = todayStr();
  // Chỉ kiểm tra dạng ngày ở đây; phép tính thật do `calc()` bên dưới làm, để cùng một
  // đường cho cả mục tiêu người dùng gửi lẫn mục tiêu mà tìm kiếm thử.
  if (dateDiffDays(anchor, targetEnd) == null) {
    throw Object.assign(new Error('target_end_date must be YYYY-MM-DD'), { status: 400 });
  }
  const asStr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  // Cửa sổ nạp ngày nghỉ **rộng** (`SEARCH_HORIZON_DAYS`), không phải tới `targetEnd`.
  // Vì phần tìm ngày đích khả thi sẽ thử nhiều mục tiêu, và mỗi lần thử cần đúng bộ ngày
  // nghỉ phủ tới mục tiêu đó. Nạp hẹp rồi thử rộng thì các vòng sau dùng thiếu ngày nghỉ
  // ⇒ tính ra lịch ngắn hơn thật ⇒ báo khả thi sai.
  const hols = await db.prepare(
    `SELECT holiday_date AS d FROM site_holidays
     WHERE (tenant_id IS NULL OR tenant_id = ?) AND holiday_date BETWEEN ? AND ?`
  ).allAsync(tenantId, anchor, addDays(anchor, SEARCH_HORIZON_DAYS)).catch(() => []);
  const holidayDates = new Set(hols.map((h) => asStr(h.d)));
  // `gaps` chỉ gồm ngày nghỉ **trong cửa sổ tới mục tiêu** — `mapToCalendar` cần đúng
  // phần đó, và mục tiêu khác thì phần lấy khác. Nên nó được tính bên trong `calc`.
  const names = new Map(rows.map((r) => [r.id, r.name_vi]));
  const suspends = normalizeGaps(policy.suspensions || []);

  /**
   * Tính lại toàn bộ kết quả cho một mục tiêu khác. **Thuần** — không đụng DB — nên
   * tìm ngày đích khả thi bằng cách thử nhiều mục tiêu là rẻ.
   */
  const calc = (tEnd) => {
    const tDays = dateDiffDays(anchor, tEnd);
    const c = compressSchedule(items, liveLinks, tDays, policy);
    const f = computeCpm(items.map((i) => ({ id: i.id, duration_days: c.durations[i.id] ?? i.duration_days })), liveLinks);
    const g = normalizeGaps([
      ...suspends,
      ...[...hols].map((h) => ({ from: asStr(h.d), to: asStr(h.d) })).filter((x) => x.from <= tEnd),
    ]);
    const calendar = mapToCalendar(live, c.durations, f.es, anchor, todayStr(), g);
    // Excluded rows pass through untouched (never moved, never shortened).
    for (const r of rows) {
      if (excluded.has(r.id)) {
        const s2 = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10));
        calendar[r.id] = { new_start: s2(r.plan_start_date), new_end: s2(r.plan_end_date) };
      }
    }
    const end = Object.values(calendar).map((x) => x.new_end).sort().pop();
    return { comp: c, final: f, cal: calendar, calEnd: end, gaps: g, targetDays: tDays };
  };

  const {
    comp, final, cal, calEnd, gaps, targetDays,
  } = calc(targetEnd);
  let feasible = comp.feasible && calEnd <= targetEnd;
  let bottleneck = comp.bottleneck.map((b) => ({ id: b.id, name: names.get(b.id), locked: b.locked }));
  if (comp.feasible && calEnd > targetEnd) {
    // Durations fit but the calendar doesn't: locked tails / clamped starts end
    // past the target. Attribute to the latest-ending unchangeable items so the
    // answer is never "infeasible" with an empty bottleneck.
    feasible = false;
    const atFloor = new Set(comp.perItem.filter((p) => p.at_floor).map((p) => p.id));
    const lockedSet = new Set(items.filter((i) => i.locked).map((i) => i.id));
    bottleneck = rows
      .filter((r) => lockedSet.has(r.id) || atFloor.has(r.id))
      .sort((a, b) => (cal[b.id].new_end < cal[a.id].new_end ? -1 : 1))
      .slice(0, 5)
      .map((r) => ({ id: r.id, name: r.name_vi, locked: lockedSet.has(r.id), reason: 'late-locked-tail' }));
  }
  return {
    anchor, targetDays, before_days: comp.before, after_days: comp.after,
    calendar_end: calEnd, feasible,
    // Ngày đích dùng được ngay, **tìm ra** chứ không đoán. Đo 2026-09-30: `calendar_end`
    // là 2027-06-25 (268 ngày tới) nên **mọi** mục tiêu trong quý tới đều 422, và thông
    // báo cũ không nói phải thử đến bao giờ (đã thử 8 ngày đích, đều hỏng). Tính khả
    // thi là **đúng** — dữ liệu đơn vị cần 268 ngày — nhưng phải chỉ ra lối ra.
    earliest_feasible_target: feasible ? null : searchEarliestFeasible(anchor, calc),
    days_saved: comp.before - comp.after,
    per_item: comp.perItem.map((p) => ({
      ...p, name: names.get(p.id),
      new_start: cal[p.id].new_start, new_end: cal[p.id].new_end,
    })),
    bottleneck,
    critical: final.critical,
    durations: comp.durations, cal, rounds: comp.rounds,
    suspensions_applied: gaps.filter((g) => g.from <= calEnd),
    holidays_applied: [...holidayDates].filter((d) => d <= calEnd).sort(),
    summary_candidates: detectSummaryRows(rows),
    excluded_ids: [...excluded],
  };
}

// POST /api/projects/:id/schedule-compress/preview {target_end_date, policy?, name?}
router.post('/projects/:id/schedule-compress/preview', ...CAN_PROPOSE, async (req, res) => {
  const db = getDb();
  const { target_end_date, policy = {}, name } = req.body || {};
  if (!target_end_date || !/^\d{4}-\d{2}-\d{2}$/.test(target_end_date)) {
    return res.status(400).json({ error: 'target_end_date (YYYY-MM-DD) required' });
  }
  const cleanPolicy = {
    min_days_floor: Number.isFinite(policy.min_days_floor) ? Math.max(0, Math.floor(policy.min_days_floor)) : 1,
    min_pct: Number.isFinite(policy.min_pct) ? Math.min(1, Math.max(0, policy.min_pct)) : 0.5,
  };
  if (policy.suspensions !== undefined) {
    if (!Array.isArray(policy.suspensions) || policy.suspensions.length > 10) {
      return res.status(400).json({ error: 'suspensions must be an array of ≤10 {from,to} (YYYY-MM-DD)' });
    }
    for (const g of policy.suspensions) {
      if (!g || !/^\d{4}-\d{2}-\d{2}$/.test(g.from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(g.to || '') || g.from > g.to) {
        return res.status(400).json({ error: 'each suspension needs {from,to} YYYY-MM-DD with from ≤ to' });
      }
    }
    cleanPolicy.suspensions = policy.suspensions.map((g) => ({ from: g.from.slice(0, 10), to: g.to.slice(0, 10) }));
  }
  if (policy.exclude_ids !== undefined) {
    if (!Array.isArray(policy.exclude_ids) || policy.exclude_ids.length > 500 || !policy.exclude_ids.every(Number.isInteger)) {
      return res.status(400).json({ error: 'exclude_ids must be an array of ≤500 integer item ids' });
    }
    cleanPolicy.exclude_ids = [...new Set(policy.exclude_ids)];
  }
  try {
    const { rows, links } = await loadSchedule(req.params.id);
    if (!rows.length) return res.status(422).json({ error: 'project has no schedule items' });
    const out = await runCompression(db, req.user.tenant_id, rows, links, target_end_date, cleanPolicy);
    const ins = await withAudit(req, {
      // `defer` + `resource_id` trong kết quả callback: id kịch bản chỉ có sau INSERT,
      // mà `withAudit` ghi dòng audit trong **cùng** transaction nên phải chờ.
      // Trước đây ghi `resourceId: 0` — mọi dòng PREVIEW trong `audit_log` có cùng
      // `resource_id = 0` (đo 2026-09-28), nên không truy được vừa tạo kịch bản nào,
      // và `SELECT … WHERE resource_id = 0` gộp nhầm preview của mọi dự án/tenant.
      defer: true,
      action: 'PREVIEW', resourceType: 'schedule_scenario',
      context: { project_id: Number(req.params.id) },
      note: `Compression preview → ${target_end_date}: ${out.feasible ? `feasible (−${out.days_saved}d)` : 'infeasible'}`,
    }, async (client) => {
      const r = await client.query(
        `INSERT INTO schedule_scenarios (project_id, name, target_end_date, policy, result, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6) RETURNING *`,
        [req.params.id, name || `Nén về ${target_end_date}`, target_end_date, JSON.stringify(cleanPolicy),
         JSON.stringify({ ...out, cal: undefined, durations: undefined }), req.user.id]
      );
      const row = r.rows[0];
      return {
        value: row,
        resource_id: row.id,
        before: null,
        after: { target_end_date, feasible: out.feasible, after_days: out.after_days },
      };
    });
    res.status(201).json({ scenario_id: ins.id, ...out });
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// POST /api/schedule-scenarios/:id/apply — recompute live, write dates, snapshot before.
router.post('/schedule-scenarios/:id/apply', ...CAN_APPROVE, async (req, res) => {
  const db = getDb();
  const sc = await db.prepare('SELECT * FROM schedule_scenarios WHERE id = ?').getAsync(req.params.id);
  if (!sc) return res.status(404).json({ error: 'Not found' });
  if (!(await checkProjectAccess(req.user, sc.project_id))) return res.status(404).json({ error: 'Not found' });
  if (sc.status === 'APPLIED') return res.status(409).json({ error: 'already applied — rollback first to re-run' });
  try {
    const { rows, links } = await loadSchedule(sc.project_id);
    const policy = sc.policy || {};
    const target = asDateStr(sc.target_end_date);
    const out = await runCompression(db, req.user.tenant_id, rows, links, target, policy);
    if (!out.feasible) {
      return res.status(422).json({
        error: `infeasible on current data (calendar end ${out.calendar_end} > target)`,
        // `422` vẫn là `422` — đây không phải lỗi server, và `error`/`bottleneck` giữ
        // nguyên cho ai đang dựa vào chúng. Chỉ thêm ngày đích dùng được để client
        // không phải tự đoán.
        earliest_feasible_target: out.earliest_feasible_target,
        calendar_end: out.calendar_end,
        bottleneck: out.bottleneck,
        scenario_id: sc.id,
      });
    }
    const byId = new Map(rows.map((r) => [r.id, r]));
    const changes = out.per_item.filter((p) => {
      const cur = byId.get(p.id);
      return cur && (cur.plan_start_date !== p.new_start || cur.plan_end_date !== p.new_end);
    }).map((p) => {
      const cur = byId.get(p.id);
      return { id: p.id, name: p.name, before: { plan_start_date: cur.plan_start_date, plan_end_date: cur.plan_end_date, plan_duration_days: cur.plan_duration_days }, after: { plan_start_date: p.new_start, plan_end_date: p.new_end, plan_duration_days: out.durations[p.id] } };
    });
    const result = await withAudit(req, {
      action: 'APPLY', resourceType: 'schedule_scenario', resourceId: Number(sc.id),
      context: { project_id: sc.project_id },
      before: { status: sc.status },
      after: { status: 'APPLIED', changed_items: changes.length, days_saved: out.days_saved },
      fieldChanges: [{ field: 'status', from: sc.status, to: 'APPLIED' }],
      note: `Apply compression: ${changes.length} items, −${out.days_saved}d → ${target}`,
    }, async (client) => {
      // Khoá project rồi khoá dòng scenario, đúng như `routes/pillar-scenarios.js`.
      // Thiếu hai bước này thì hai CEO apply hai scenario khác nhau của cùng dự án
      // chạy song song: cả hai đọc cùng trạng thái gốc, `applied_before` của
      // scenario bị ghi đè bởi lần chạy sau, và rollback sau đó khôi phục snapshot
      // cũ ⇒ **xoá mất thay đổi của scenario còn lại**, không có dấu vết audit.
      // Test e2e chạy tuần tự nên không bao giờ thấy lỗi này.
      await lockProject(client, sc.project_id);
      const fresh = (await client.query(
        'SELECT status FROM schedule_scenarios WHERE id = $1 FOR UPDATE', [sc.id]
      )).rows[0];
      if (!fresh) throw httpError(404, 'Not found');
      if (fresh.status === 'APPLIED') throw httpError(409, 'already applied — rollback first to re-run');
      for (const c of changes) {
        await client.query(
          `UPDATE construction_schedule_items SET plan_start_date = $1, plan_end_date = $2, plan_duration_days = $3 WHERE id = $4 AND project_id = $5`,
          [c.after.plan_start_date, c.after.plan_end_date, c.after.plan_duration_days, c.id, sc.project_id]
        );
      }
      // `AND status <> 'APPLIED'` chặn ghi đè trạng thái khi một request song song
      // đã apply scenario này trước đó.
      // Vân tay lịch **sau khi ghi**: rollback sẽ so với nó. Không có thứ này thì
      // apply A, apply B, rồi rollback A sẽ khôi phục ảnh chụp của A đè lên thay
      // đổi của B — mất lịch mà không có dấu vết. Đo được bằng
      // `tests/e2e/concurrency.mjs`. Đây là cùng chốt mà `restoreBaseline()` của
      // `lib/baseline.js` dùng cho kịch bản trụ cột, chỉ đưa sang đây vì
      // schedule-compress tự phục hồi từ `applied_before` chứ không qua baseline.
      const afterFingerprint = scheduleFingerprint(await readScheduleRows(client, sc.project_id));
      const r = await client.query(
        `UPDATE schedule_scenarios SET status = 'APPLIED', applied_at = now(), result = $1
         WHERE id = $2 AND status <> 'APPLIED' RETURNING *`,
        [JSON.stringify({
          ...out,
          cal: undefined,
          applied_before: changes,
          applied_at: new Date().toISOString(),
          schedule_fingerprint_after: afterFingerprint,
        }), sc.id]
      );
      if (!r.rows[0]) throw httpError(409, 'already applied — rollback first to re-run');
      return { scenario: r.rows[0], changed: changes.length, days_saved: out.days_saved, calendar_end: out.calendar_end };
    });
    const { emitDecision } = await import('../lib/events.js');
    await emitDecision(db, req.user.tenant_id, { kind: 'compression', id: Number(sc.id), label: sc.name, decision: 'APPLIED', projectId: sc.project_id });
    const { emitWebhook } = await import('../lib/erp-webhook.js');
    await emitWebhook(req.user.tenant_id, 'compression.applied', {
      scenario_id: Number(sc.id), project_id: sc.project_id, changed_items: changes.length,
    });
    // Auto-notify the crew that must move faster: proposer + project PM/PMO.
    try {
      const { notifyMany } = await import('../services/notify.js');
      const crew = await db.prepare(
        `SELECT DISTINCT u.id FROM project_members m JOIN users u ON u.id = m.user_id
         WHERE m.project_id = ? AND (u.role = 'admin' OR u.is_ceo OR u.role IN ('pm', 'pmo'))`
      ).allAsync(sc.project_id);
      const ids = [...new Set([...crew.map((u) => u.id), sc.created_by].filter(Boolean))];
      await notifyMany(ids, {
        tenantId: req.user.tenant_id, projectId: sc.project_id,
        title: `Đã Apply timeline mới (${sc.name}): −${out.days_saved} ngày, ${changes.length} hạng mục`,
        body: `CEO/Admin vừa duyệt scenario #${sc.id} → mục tiêu ${target}. Các ban kiểm tra hạng mục được giao và đẩy nhanh tiến độ.`,
        severity: 'warning', resourceType: 'schedule_scenario', resourceId: Number(sc.id),
      });
    } catch {}
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// POST /api/schedule-scenarios/:id/rollback — restore the exact before-values.
router.post('/schedule-scenarios/:id/rollback', ...CAN_APPROVE, async (req, res) => {
  const db = getDb();
  const sc = await db.prepare('SELECT * FROM schedule_scenarios WHERE id = ?').getAsync(req.params.id);
  if (!sc) return res.status(404).json({ error: 'Not found' });
  if (!(await checkProjectAccess(req.user, sc.project_id))) return res.status(404).json({ error: 'Not found' });
  if (sc.status !== 'APPLIED') return res.status(409).json({ error: 'only APPLIED scenarios can be rolled back' });
  const changes = sc.result?.applied_before || [];
  try {
    await withAudit(req, {
      action: 'ROLLBACK', resourceType: 'schedule_scenario', resourceId: Number(sc.id),
      context: { project_id: sc.project_id },
      before: { status: 'APPLIED', changed_items: changes.length },
      after: { status: 'ROLLED_BACK' },
      fieldChanges: [{ field: 'status', from: 'APPLIED', to: 'ROLLED_BACK' }],
      note: `Rollback compression: restore ${changes.length} items`,
    }, async (client) => {
      // Cùng lý do với apply: khoá project và khoá dòng scenario, để rollback không
      // chạy đè lên một apply đang dở và để hai rollback song song không khôi phục
      // chồng lên nhau. Ngoài ra khoá theo `project_id` khi sửa hạng mục, để một
      // scenario của dự án này không bao giờ chạm hàng của dự án khác.
      await lockProject(client, sc.project_id);
      const fresh = (await client.query(
        'SELECT status FROM schedule_scenarios WHERE id = $1 FOR UPDATE', [sc.id]
      )).rows[0];
      if (!fresh) throw httpError(404, 'Not found');
      if (fresh.status !== 'APPLIED') throw httpError(409, 'only APPLIED scenarios can be rolled back');

      // Lịch đã đổi kể từ lúc apply ⇒ có thay đổi của người khác nằm trong đó.
      // Rollback lúc này sẽ xoá mất thay đổi đó, nên từ chối thay vì âm thầm ghi
      // đè. Người dùng xử lý được: rollback hoặc apply kịch bản mới nhất trước.
      const currentFingerprint = scheduleFingerprint(await readScheduleRows(client, sc.project_id));
      const expected = sc.result?.schedule_fingerprint_after;
      if (expected && currentFingerprint !== expected) {
        throw httpError(
          409,
          'Schedule changed after this scenario was applied; rollback would overwrite newer data',
        );
      }
      for (const c of changes) {
        await client.query(
          `UPDATE construction_schedule_items SET plan_start_date = $1, plan_end_date = $2, plan_duration_days = $3 WHERE id = $4 AND project_id = $5`,
          [c.before.plan_start_date, c.before.plan_end_date, c.before.plan_duration_days, c.id, sc.project_id]
        );
      }
      const r = await client.query(
        `UPDATE schedule_scenarios SET status = 'ROLLED_BACK' WHERE id = $1 AND status = 'APPLIED' RETURNING id`,
        [sc.id]
      );
      if (!r.rows[0]) throw httpError(409, 'only APPLIED scenarios can be rolled back');
      return { ok: true };
    });
    try {
      const { notifyMany } = await import('../services/notify.js');
      const crew = await db.prepare(
        `SELECT DISTINCT u.id FROM project_members m JOIN users u ON u.id = m.user_id
         WHERE m.project_id = ? AND (u.role = 'admin' OR u.is_ceo OR u.role IN ('pm', 'pmo'))`
      ).allAsync(sc.project_id);
      const ids = [...new Set([...crew.map((u) => u.id), sc.created_by].filter(Boolean))];
      await notifyMany(ids, {
        tenantId: req.user.tenant_id, projectId: sc.project_id,
        title: `Đã Rollback timeline (${sc.name}): khôi phục ${changes.length} hạng mục`,
        body: `Scenario #${sc.id} đã trả về ngày kế hoạch gốc. Các ban trở lại nhịp cũ.`,
        severity: 'info', resourceType: 'schedule_scenario', resourceId: Number(sc.id),
      });
    } catch {}
    res.json({ ok: true, restored: changes.length });
  } catch (e) {
    // `e.status` thay vì cứ 500: khối bên trong ném 404 (scenario biến mất giữa
    // lúc đọc và lúc khoá) và 409 (lịch đã đổi sau khi apply ⇒ rollback sẽ xoá
    // mất thay đổi mới hơn). Trước đây cả hai đều thành 500, tức phía giao diện
    // không phân biệt được "bị từ chối" với "máy chủ hỏng". Route `apply` ngay
    // phía trên đã dùng đúng cách này.
    res.status(e.status || 500).json(errorBody(e));
  }
});

// GET /api/projects/:id/schedule-scenarios + GET /api/schedule-scenarios/:id
router.get('/projects/:id/schedule-scenarios', ...CAN_PROPOSE, async (req, res) => {
  const db = getDb();
  res.json(await db.prepare(
    'SELECT id, project_id, name, target_end_date, status, created_by, created_at, applied_at FROM schedule_scenarios WHERE project_id = ? ORDER BY id DESC'
  ).allAsync(req.params.id));
});

router.get('/schedule-scenarios/:id', ...CAN_PROPOSE, async (req, res) => {
  const db = getDb();
  const sc = await db.prepare('SELECT * FROM schedule_scenarios WHERE id = ?').getAsync(req.params.id);
  if (!sc) return res.status(404).json({ error: 'Not found' });
  if (!(await checkProjectAccess(req.user, sc.project_id))) return res.status(404).json({ error: 'Not found' });
  res.json(sc);
});

// PATCH /api/schedule-scenarios/:id — admin/CEO manages the plan.
// {name?} renames. {target_end_date?, policy?} retargets: recomputes the
// proposal from CURRENT rows (same honesty as preview) and resets to DRAFT.
// APPLIED scenarios are immutable here (409 — rollback first), so approved
// dates can never silently shift under an approval.
router.patch('/schedule-scenarios/:id', ...CAN_APPROVE, async (req, res) => {
  const db = getDb();
  const sc = await db.prepare('SELECT * FROM schedule_scenarios WHERE id = ?').getAsync(req.params.id);
  if (!sc) return res.status(404).json({ error: 'Not found' });
  if (!(await checkProjectAccess(req.user, sc.project_id))) return res.status(404).json({ error: 'Not found' });
  const { name, target_end_date, policy } = req.body || {};
  const wantsRetarget = target_end_date !== undefined || policy !== undefined;
  if (wantsRetarget && sc.status === 'APPLIED') {
    return res.status(409).json({ error: 'already applied — rollback first to re-plan' });
  }
  if (name !== undefined && (typeof name !== 'string' || !name.trim() || name.length > 200)) {
    return res.status(400).json({ error: 'name must be 1..200 chars' });
  }
  try {
    let out = null;
    let nextTarget = asDateStr(sc.target_end_date);
    let nextPolicy = sc.policy || {};
    if (wantsRetarget) {
      if (target_end_date !== undefined) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(target_end_date)) return res.status(400).json({ error: 'target_end_date must be YYYY-MM-DD' });
        nextTarget = target_end_date;
      }
      if (policy !== undefined) {
        if (typeof policy !== 'object' || policy === null) return res.status(400).json({ error: 'policy must be an object' });
        nextPolicy = {
          min_days_floor: Number.isFinite(policy.min_days_floor) ? Math.max(0, Math.floor(policy.min_days_floor)) : 1,
          min_pct: Number.isFinite(policy.min_pct) ? Math.min(1, Math.max(0, policy.min_pct)) : 0.5,
        };
        if (policy.suspensions !== undefined) {
          if (!Array.isArray(policy.suspensions) || policy.suspensions.length > 10) {
            return res.status(400).json({ error: 'suspensions must be an array of ≤10 {from,to}' });
          }
          nextPolicy.suspensions = policy.suspensions;
        }
        if (policy.exclude_ids !== undefined) {
          if (!Array.isArray(policy.exclude_ids) || !policy.exclude_ids.every(Number.isInteger)) {
            return res.status(400).json({ error: 'exclude_ids must be an array of integer item ids' });
          }
          nextPolicy.exclude_ids = [...new Set(policy.exclude_ids)];
        }
      }
      const { rows, links } = await loadSchedule(sc.project_id);
      out = await runCompression(db, req.user.tenant_id, rows, links, nextTarget, nextPolicy);
    }
    const updated = await withAudit(req, {
      action: 'UPDATE', resourceType: 'schedule_scenario', resourceId: Number(sc.id),
      context: { project_id: sc.project_id },
      before: { name: sc.name, target_end_date: asDateStr(sc.target_end_date), status: sc.status },
      after: { name: name?.trim() || sc.name, target_end_date: nextTarget, status: wantsRetarget ? 'DRAFT' : sc.status, feasible: out?.feasible },
      fieldChanges: [
        ...(name ? [{ field: 'name', from: sc.name, to: name.trim() }] : []),
        ...(wantsRetarget ? [{ field: 'target_end_date', from: asDateStr(sc.target_end_date), to: nextTarget }] : []),
      ],
      note: wantsRetarget
        ? `Re-plan scenario #${sc.id} → ${nextTarget}: ${out.feasible ? `khả thi (−${out.days_saved}d)` : 'không khả thi'}`
        : `Rename scenario #${sc.id}`,
    }, async (client) => {
      const r = await client.query(
        `UPDATE schedule_scenarios SET name = $1, target_end_date = $2, policy = $3,
          result = COALESCE($4, result), status = $5, applied_at = NULL WHERE id = $6 RETURNING *`,
        [name?.trim() || sc.name, nextTarget, JSON.stringify(nextPolicy),
         out ? JSON.stringify({ ...out, cal: undefined, durations: undefined }) : null,
         wantsRetarget ? 'DRAFT' : sc.status, sc.id]
      );
      return r.rows[0];
    });
    res.json(updated);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// DELETE /api/schedule-scenarios/:id — admin/CEO removes a DRAFT plan.
// Pending AI drafts pointing at it are auto-dismissed (no orphan inbox rows).
router.delete('/schedule-scenarios/:id', ...CAN_APPROVE, async (req, res) => {
  const db = getDb();
  const sc = await db.prepare('SELECT * FROM schedule_scenarios WHERE id = ?').getAsync(req.params.id);
  if (!sc) return res.status(404).json({ error: 'Not found' });
  if (!(await checkProjectAccess(req.user, sc.project_id))) return res.status(404).json({ error: 'Not found' });
  if (sc.status !== 'DRAFT') return res.status(409).json({ error: `only DRAFT scenarios can be deleted (status=${sc.status})` });
  try {
    const result = await withAudit(req, {
      action: 'DELETE', resourceType: 'schedule_scenario', resourceId: Number(sc.id),
      context: { project_id: sc.project_id },
      before: { name: sc.name, target_end_date: asDateStr(sc.target_end_date), status: sc.status },
      after: null,
      note: `Xóa scenario #${sc.id} (${sc.name})`,
    }, async (client) => {
      const d = await client.query(
        `UPDATE ai_drafts SET status = 'dismissed', decided_at = now()
         WHERE kind = 'schedule_replan' AND status = 'pending' AND payload->>'scenario_id' = $1`,
        [String(sc.id)]
      );
      await client.query('DELETE FROM schedule_scenarios WHERE id = $1', [sc.id]);
      return { ok: true, dismissed_drafts: d.rowCount };
    });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

export default router;
