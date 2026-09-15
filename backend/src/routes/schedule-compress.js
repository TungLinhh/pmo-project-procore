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
import { computeCpm, compressSchedule, mapToCalendar, rowDurationDays, dateDiffDays } from '../lib/cpm.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);
router.use('/projects/:id', requireProjectAccess());
const ENTERPRISE = [requireRole('admin', 'ceo', 'pm'), requireFeature('schedule-compress')];

const todayStr = () => new Date().toISOString().slice(0, 10);
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
function runCompression(rows, links, targetEnd, policy) {
  const items = toEngineItems(rows);
  const anchor = todayStr();
  const targetDays = dateDiffDays(anchor, targetEnd);
  if (targetDays == null) throw Object.assign(new Error('target_end_date must be YYYY-MM-DD'), { status: 400 });
  const comp = compressSchedule(items, links, targetDays, policy);
  const final = computeCpm(items.map((i) => ({ id: i.id, duration_days: comp.durations[i.id] ?? i.duration_days })), links);
  const cal = mapToCalendar(rows, comp.durations, final.es, anchor, todayStr());
  const calEnd = Object.values(cal).map((c) => c.new_end).sort().pop();
  const names = new Map(rows.map((r) => [r.id, r.name_vi]));
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
    days_saved: comp.before - comp.after,
    per_item: comp.perItem.map((p) => ({
      ...p, name: names.get(p.id),
      new_start: cal[p.id].new_start, new_end: cal[p.id].new_end,
    })),
    bottleneck,
    critical: final.critical,
    durations: comp.durations, cal, rounds: comp.rounds,
  };
}

// POST /api/projects/:id/schedule-compress/preview {target_end_date, policy?, name?}
router.post('/projects/:id/schedule-compress/preview', ...ENTERPRISE, async (req, res) => {
  const db = getDb();
  const { target_end_date, policy = {}, name } = req.body || {};
  if (!target_end_date || !/^\d{4}-\d{2}-\d{2}$/.test(target_end_date)) {
    return res.status(400).json({ error: 'target_end_date (YYYY-MM-DD) required' });
  }
  const cleanPolicy = {
    min_days_floor: Number.isFinite(policy.min_days_floor) ? Math.max(0, Math.floor(policy.min_days_floor)) : 1,
    min_pct: Number.isFinite(policy.min_pct) ? Math.min(1, Math.max(0, policy.min_pct)) : 0.5,
  };
  try {
    const { rows, links } = await loadSchedule(req.params.id);
    if (!rows.length) return res.status(422).json({ error: 'project has no schedule items' });
    const out = runCompression(rows, links, target_end_date, cleanPolicy);
    const ins = await withAudit(req, {
      action: 'PREVIEW', resourceType: 'schedule_scenario', resourceId: 0,
      context: { project_id: Number(req.params.id) },
      after: { target_end_date, feasible: out.feasible, after_days: out.after_days },
      note: `Compression preview → ${target_end_date}: ${out.feasible ? `feasible (−${out.days_saved}d)` : 'infeasible'}`,
    }, async (client) => {
      const r = await client.query(
        `INSERT INTO schedule_scenarios (project_id, name, target_end_date, policy, result, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6) RETURNING *`,
        [req.params.id, name || `Nén về ${target_end_date}`, target_end_date, JSON.stringify(cleanPolicy),
         JSON.stringify({ ...out, cal: undefined, durations: undefined }), req.user.id]
      );
      return r.rows[0];
    });
    res.status(201).json({ scenario_id: ins.id, ...out });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/schedule-scenarios/:id/apply — recompute live, write dates, snapshot before.
router.post('/schedule-scenarios/:id/apply', ...ENTERPRISE, async (req, res) => {
  const db = getDb();
  const sc = await db.prepare('SELECT * FROM schedule_scenarios WHERE id = ?').getAsync(req.params.id);
  if (!sc) return res.status(404).json({ error: 'Not found' });
  if (!(await checkProjectAccess(req.user, sc.project_id))) return res.status(404).json({ error: 'Not found' });
  if (sc.status === 'APPLIED') return res.status(409).json({ error: 'already applied — rollback first to re-run' });
  try {
    const { rows, links } = await loadSchedule(sc.project_id);
    const policy = sc.policy || {};
    const target = asDateStr(sc.target_end_date);
    const out = runCompression(rows, links, target, policy);
    if (!out.feasible) {
      return res.status(422).json({ error: `infeasible on current data (calendar end ${out.calendar_end} > target)`, bottleneck: out.bottleneck, scenario_id: sc.id });
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
      for (const c of changes) {
        await client.query(
          `UPDATE construction_schedule_items SET plan_start_date = $1, plan_end_date = $2, plan_duration_days = $3 WHERE id = $4`,
          [c.after.plan_start_date, c.after.plan_end_date, c.after.plan_duration_days, c.id]
        );
      }
      const r = await client.query(
        `UPDATE schedule_scenarios SET status = 'APPLIED', applied_at = now(), result = $1 WHERE id = $2 RETURNING *`,
        [JSON.stringify({ ...out, cal: undefined, applied_before: changes, applied_at: new Date().toISOString() }), sc.id]
      );
      return { scenario: r.rows[0], changed: changes.length, days_saved: out.days_saved, calendar_end: out.calendar_end };
    });
    res.json(result);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// POST /api/schedule-scenarios/:id/rollback — restore the exact before-values.
router.post('/schedule-scenarios/:id/rollback', ...ENTERPRISE, async (req, res) => {
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
      for (const c of changes) {
        await client.query(
          `UPDATE construction_schedule_items SET plan_start_date = $1, plan_end_date = $2, plan_duration_days = $3 WHERE id = $4`,
          [c.before.plan_start_date, c.before.plan_end_date, c.before.plan_duration_days, c.id]
        );
      }
      await client.query(`UPDATE schedule_scenarios SET status = 'ROLLED_BACK' WHERE id = $1`, [sc.id]);
      return { ok: true };
    });
    res.json({ ok: true, restored: changes.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/projects/:id/schedule-scenarios + GET /api/schedule-scenarios/:id
router.get('/projects/:id/schedule-scenarios', ...ENTERPRISE, async (req, res) => {
  const db = getDb();
  res.json(await db.prepare(
    'SELECT id, project_id, name, target_end_date, status, created_by, created_at, applied_at FROM schedule_scenarios WHERE project_id = ? ORDER BY id DESC'
  ).allAsync(req.params.id));
});

router.get('/schedule-scenarios/:id', ...ENTERPRISE, async (req, res) => {
  const db = getDb();
  const sc = await db.prepare('SELECT * FROM schedule_scenarios WHERE id = ?').getAsync(req.params.id);
  if (!sc) return res.status(404).json({ error: 'Not found' });
  if (!(await checkProjectAccess(req.user, sc.project_id))) return res.status(404).json({ error: 'Not found' });
  res.json(sc);
});

export default router;
