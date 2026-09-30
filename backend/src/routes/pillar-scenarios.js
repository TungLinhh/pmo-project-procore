// Pillar what-if scenarios (SRS Mục 4.2, GĐ2 Control Layer).
// POST /projects/:id/pillar-scenarios/simulate — preview CTL-01→CTL-06, lưu DRAFT,
// không ghi đè baseline (SRS 4.2.3 human-in-the-loop). Propose-level: PM/PMO
// được mô phỏng; apply/rollback ở bước sau.
// Mount: /api (xem index.js).
import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import { evaluateApplyAuthority } from '../lib/pillar-authority.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireProjectAccess } from '../lib/project-access.js';
import { requireFeature } from '../lib/entitlements.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { SIM_TYPES, simulate, collectSimBaseline } from '../lib/pillar-sim.js';
import { errorBody } from '../lib/error-body.js';
import {
  createBaselineVersion, ensureCurrentBaseline, getCurrentBaseline, lockProject,
  readScheduleRows, restoreBaseline, scheduleFingerprint, scheduleLinksFingerprint,
} from '../lib/baseline.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);
router.use('/projects/:id', requireProjectAccess());

const CAN_SIMULATE = [requireRole('admin', 'ceo', 'pm', 'pmo'), requireFeature('pillar-sim')];
// Apply/rollback authority. CEO/Admin always; PM/PMO may act "trong thẩm quyền"
// (SRS Table 9) — see lib/pillar-authority.js for the measurable caps. The role
// gate is gone on purpose: it is not the role but the measured impact that
// decides, so a PM is not blocked from a small change they own.
const CAN_DECIDE = [requireFeature('pillar-sim')];

const asObj = (v) => (typeof v === 'string' ? JSON.parse(v) : (v || {}));

async function loadScenarioOwned(req, res, db, id) {
  const { checkProjectAccess } = await import('../lib/project-access.js');
  const sc = await db.prepare('SELECT * FROM pillar_scenarios WHERE id = ?').getAsync(id);
  if (!sc) { res.status(404).json({ error: 'Not found' }); return null; }
  if (!(await checkProjectAccess(req.user, sc.project_id))) { res.status(404).json({ error: 'Not found' }); return null; }
  return sc;
}

async function notifyCrew(db, req, sc, title, body, severity) {
  try {
    const { notifyMany } = await import('../services/notify.js');
    const crew = await db.prepare(
      `SELECT DISTINCT u.id FROM project_members m JOIN users u ON u.id = m.user_id
       WHERE m.project_id = ? AND (u.role = 'admin' OR u.is_ceo OR u.role IN ('pm', 'pmo'))`
    ).allAsync(sc.project_id);
    const ids = [...new Set([...crew.map((u) => u.id), sc.created_by].filter(Boolean))];
    await notifyMany(ids, {
      tenantId: req.user.tenant_id, projectId: sc.project_id,
      title, body, severity, resourceType: 'pillar_scenario', resourceId: Number(sc.id),
    });
  } catch {}
}

function storedShiftDays(type, params, result) {
  if (type === 'CTL-01') return Math.floor(Number(params.extend_days));
  if (type === 'CTL-02') return -Math.floor(Number(params.cut_days));
  if (type === 'CTL-03') return Math.floor(Number(params.delay_days));
  if (type === 'CTL-05') return Math.floor(Number(result?.deltas?.completion_shift_days));
  if (type === 'CTL-06') return Math.floor(Number(params.rounds)) * Math.floor(Number(params.days_per_round));
  return 0;
}

// Official apply path. The transaction creates the next baseline version.
router.post('/pillar-scenarios/:id/apply', ...CAN_DECIDE, async (req, res) => {
  const db = getDb();
  const owned = await loadScenarioOwned(req, res, db, req.params.id);
  if (!owned) return;
  if (owned.status === 'APPLIED') return res.status(409).json({ error: 'already applied — rollback first to re-run' });
  let params;
  let previewResult;
  try {
    params = asObj(owned.params);
    previewResult = asObj(owned.result);
  } catch {
    return res.status(400).json({ error: 'stored scenario JSON is invalid' });
  }
  const shiftDays = storedShiftDays(owned.type, params, previewResult);
  if (!Number.isInteger(shiftDays)) return res.status(400).json({ error: 'stored params invalid, cannot apply' });

  // SRS Table 9: PM/PMO apply within their authority. "Authority" is measured
  // (schedule shift / cost / affected items), not assumed from the role name.
  const project = await db.prepare('SELECT id, pm_user_id FROM projects WHERE id = ?').getAsync(owned.project_id);
  const authority = evaluateApplyAuthority(req.user, project, { ...owned, params, result: previewResult });
  if (!authority.allowed) {
    return res.status(403).json({
      error: authority.reason,
      code: 'OUTSIDE_AUTHORITY',
      basis: authority.basis,
      exceeded: authority.exceeded || null,
      limits: authority.caps,
      escalate_to: 'CEO/Admin',
    });
  }

  try {
    const result = await withAudit(req, {
      action: 'APPLY', resourceType: 'pillar_scenario', resourceId: Number(owned.id),
      context: { project_id: owned.project_id, type: owned.type },
      before: { status: owned.status, baseline_fingerprint: owned.baseline_fingerprint },
      after: { status: 'APPLIED', shift_days: shiftDays },
      fieldChanges: [{ field: 'status', from: owned.status, to: 'APPLIED' }],
      note: `Apply ${owned.type} thành baseline chính thức`,
    }, async (client) => {
      await lockProject(client, owned.project_id);
      const scenario = (await client.query('SELECT * FROM pillar_scenarios WHERE id = $1 FOR UPDATE', [owned.id])).rows[0];
      if (!scenario) throw Object.assign(new Error('Scenario not found'), { status: 404 });
      if (scenario.status === 'APPLIED') throw Object.assign(new Error('Scenario already applied'), { status: 409 });
      const previewAgeMs = Date.now() - new Date(scenario.created_at).getTime();
      if (['CTL-01', 'CTL-02', 'CTL-03', 'CTL-05', 'CTL-06'].includes(scenario.type)
        && (!Number.isFinite(previewAgeMs) || previewAgeMs > 24 * 60 * 60 * 1000)) {
        throw Object.assign(new Error('Preview đã cũ hơn 24 giờ; hãy mô phỏng lại trước khi apply'), { status: 409 });
      }

      const beforeBaseline = await ensureCurrentBaseline(client, scenario.project_id, req.user.id);
      const currentRows = await readScheduleRows(client, scenario.project_id, true);
      const currentFingerprint = scheduleFingerprint(currentRows);
      const previewFingerprint = scenario.baseline_fingerprint || previewResult?.baseline?.schedule_fingerprint;
      const previewDependencyFingerprint = previewResult?.baseline?.dependency_fingerprint;
      if (scenario.type === 'CTL-02' && previewDependencyFingerprint) {
        const currentLinks = (await client.query(
          'SELECT predecessor_id, successor_id, link_type, lag_days FROM schedule_links WHERE project_id = $1 ORDER BY id',
          [scenario.project_id],
        )).rows;
        if (scheduleLinksFingerprint(currentLinks) !== previewDependencyFingerprint) {
          throw Object.assign(new Error('Dependency links changed after simulation; run simulate again before applying'), { status: 409 });
        }
      }
      if (!previewFingerprint || currentFingerprint !== previewFingerprint) {
        throw Object.assign(new Error('Schedule changed after simulation; run simulate again before applying'), { status: 409 });
      }
      if (owned.type !== 'CTL-04' && shiftDays === 0) {
        throw Object.assign(new Error('Kịch bản không có thay đổi lịch để áp dụng; hãy mô phỏng lại'), { status: 422 });
      }

      const changes = [];
      let skipped = 0;
      const dateText = (value) => value == null ? null : (value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));
      const cpmPlan = ['CTL-02', 'CTL-05'].includes(scenario.type) ? previewResult.after?.cpm : null;
      if (cpmPlan?.calendar_updates) {
        // CTL-02 uses the CPM calendar plan captured at simulation time. This
        // preserves dependencies and per-item duration floors; a uniform date
        // shift would make the result depend on row order.
        for (const row of currentRows) {
          const done = Number(row.progress_pct) >= 1 || String(row.status || '').toUpperCase() === 'DONE';
          if (done) continue;
          const update = cpmPlan.calendar_updates[String(row.id)];
          if (!update || !row.plan_end_date) { skipped += 1; continue; }
          const beforeStart = dateText(row.plan_start_date);
          const beforeEnd = dateText(row.plan_end_date);
          const nextDuration = Math.max(1, Number(cpmPlan.durations?.[row.id] || row.plan_duration_days || 1));
          if (beforeStart === update.new_start && beforeEnd === update.new_end && Number(row.plan_duration_days) === nextDuration) continue;
          changes.push({
            id: Number(row.id),
            before: { plan_start_date: beforeStart, plan_end_date: beforeEnd, plan_duration_days: row.plan_duration_days },
            after: { plan_start_date: update.new_start, plan_end_date: update.new_end, plan_duration_days: nextDuration },
          });
        }
        if (!changes.length) throw Object.assign(new Error(`${scenario.type} CPM plan has no applicable schedule change`), { status: 422 });
        for (const change of changes) {
          await client.query(
            `UPDATE construction_schedule_items
             SET plan_start_date = $1::date, plan_end_date = $2::date, plan_duration_days = $3
             WHERE id = $4 AND project_id = $5`,
            [change.after.plan_start_date, change.after.plan_end_date, change.after.plan_duration_days, change.id, scenario.project_id],
          );
        }
      } else if (scenario.type !== 'CTL-04' && shiftDays !== 0) {
        const rawPriority = scenario.type === 'CTL-02' ? params.priority_item_ids : null;
        const priorityIds = Array.isArray(rawPriority)
          ? rawPriority.map(Number)
          : (rawPriority == null || rawPriority === '' ? [] : String(rawPriority).split(',').map(Number));
        if (rawPriority != null && rawPriority !== ''
          && (priorityIds.some((id) => !Number.isInteger(id)) || new Set(priorityIds).size !== priorityIds.length)) {
          throw Object.assign(new Error('stored priority_item_ids are invalid'), { status: 400 });
        }
        const prioritySet = priorityIds.length ? new Set(priorityIds) : null;
        for (const row of currentRows) {
          const done = Number(row.progress_pct) >= 1 || String(row.status || '').toUpperCase() === 'DONE';
          if (done || (prioritySet && !prioritySet.has(Number(row.id)))) continue;
          if (!row.plan_end_date) { skipped += 1; continue; }
          changes.push({
            id: Number(row.id),
            before: {
              plan_start_date: dateText(row.plan_start_date),
              plan_end_date: dateText(row.plan_end_date),
              plan_duration_days: row.plan_duration_days,
            },
          });
        }
        if (!changes.length) throw Object.assign(new Error('no open items with plan_end_date to shift'), { status: 422 });
        for (const change of changes) {
          await client.query(
            `UPDATE construction_schedule_items
             SET plan_end_date = plan_end_date + $1::int,
                 plan_start_date = CASE WHEN plan_start_date > CURRENT_DATE THEN plan_start_date + $1::int ELSE plan_start_date END,
                 plan_duration_days = GREATEST(1, COALESCE(plan_duration_days,
                   CASE WHEN plan_start_date IS NOT NULL THEN (plan_end_date - plan_start_date + 1)::integer ELSE 1 END)
                   + CASE WHEN plan_start_date > CURRENT_DATE THEN 0 ELSE $1::int END)
             WHERE id = $2 AND project_id = $3`,
            [shiftDays, change.id, scenario.project_id],
          );
        }
      }

      const created = await createBaselineVersion(client, {
        projectId: scenario.project_id,
        userId: req.user.id,
        effectiveDate: new Date().toISOString().slice(0, 10),
        notes: `Official baseline from ${scenario.type}: ${scenario.name}`,
        sourceScenarioId: scenario.id,
      });
      const appliedInfo = scenario.type === 'CTL-04'
        ? {
          advance_amount: Number(previewResult?.after?.proposed_advance || 0),
          advance_capacity: Number(previewResult?.after?.advance_capacity || 0),
          cash_in_total: Number(previewResult?.after?.cash_in_total || 0),
          decided_at: new Date().toISOString(),
        }
        : { shift_days: shiftDays, changed_items: changes.length, skipped_items: skipped, applied_at: new Date().toISOString() };
      const storedResult = {
        ...previewResult,
        applied_before: changes,
        applied: appliedInfo,
        official_baseline: {
          before_id: beforeBaseline?.id || null,
          after_id: created.baseline.id,
          before_version: beforeBaseline?.version || null,
          after_version: created.baseline.version,
          plan_duration_days: created.planDurationDays,
        },
      };
      const updated = (await client.query(
        `UPDATE pillar_scenarios
         SET status = 'APPLIED', applied_at = now(), result = $1,
             baseline_before_id = $2, baseline_after_id = $3
         WHERE id = $4 RETURNING *`,
        [JSON.stringify(storedResult), beforeBaseline?.id || null, created.baseline.id, scenario.id],
      )).rows[0];
      return {
        scenario: updated,
        changed: changes.length,
        skipped,
        shift_days: shiftDays,
        baseline: created.baseline,
        plan_duration_days: created.planDurationDays,
      };
    });
    await notifyCrew(db, req, owned,
      `Đã áp dụng baseline ${result.baseline.version} từ ${owned.type}`,
      owned.type === 'CTL-04'
        ? `Phương án dòng tiền đã được quyết định; tạm ứng ${Number(result.scenario.result?.applied?.advance_amount || 0).toLocaleString('vi-VN')} VND.`
        : `${result.changed} hạng mục được ghi vào baseline ${result.baseline.version}.`,
      'warning');
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json(errorBody(error));
  }
});

// Rollback restores the complete prior baseline, not just a list of dates.
router.post('/pillar-scenarios/:id/rollback', ...CAN_DECIDE, async (req, res) => {
  const db = getDb();
  const owned = await loadScenarioOwned(req, res, db, req.params.id);
  if (!owned) return;
  if (owned.status !== 'APPLIED') return res.status(409).json({ error: 'only APPLIED scenarios can be rolled back' });
  // Same authority rule as apply: whoever was allowed to apply is allowed to
  // undo it. Rolling back never widens the impact, so it is not capped twice.
  const project = await db.prepare('SELECT id, pm_user_id FROM projects WHERE id = ?').getAsync(owned.project_id);
  const authority = evaluateApplyAuthority(req.user, project, owned);
  if (!authority.allowed && authority.basis !== 'role') {
    return res.status(403).json({
      error: authority.reason, code: 'OUTSIDE_AUTHORITY', basis: authority.basis, escalate_to: 'CEO/Admin',
    });
  }
  try {
    const result = await withAudit(req, {
      action: 'ROLLBACK', resourceType: 'pillar_scenario', resourceId: Number(owned.id),
      context: { project_id: owned.project_id, type: owned.type },
      before: { status: 'APPLIED', baseline_after_id: owned.baseline_after_id },
      after: { status: 'ROLLED_BACK', baseline_before_id: owned.baseline_before_id },
      fieldChanges: [{ field: 'status', from: 'APPLIED', to: 'ROLLED_BACK' }],
      note: `Rollback ${owned.type} về baseline ${owned.baseline_before_id || 'trước'}`,
    }, async (client) => {
      await lockProject(client, owned.project_id);
      const scenario = (await client.query('SELECT * FROM pillar_scenarios WHERE id = $1 FOR UPDATE', [owned.id])).rows[0];
      if (!scenario) throw Object.assign(new Error('Scenario not found'), { status: 404 });
      if (scenario.status !== 'APPLIED') throw Object.assign(new Error('Scenario is not applied'), { status: 409 });
      if (!scenario.baseline_before_id || !scenario.baseline_after_id) {
        throw Object.assign(new Error('Scenario has no versioned baseline snapshot'), { status: 409 });
      }
      const current = await getCurrentBaseline(client, owned.project_id, true);
      if (!current || Number(current.id) !== Number(scenario.baseline_after_id)) {
        throw Object.assign(new Error('A newer baseline exists; rollback refused'), { status: 409 });
      }
      const before = (await client.query('SELECT * FROM schedule_baselines WHERE id = $1', [scenario.baseline_before_id])).rows[0];
      if (!before) throw Object.assign(new Error('Previous baseline snapshot not found'), { status: 409 });
      const restored = await restoreBaseline(client, {
        projectId: owned.project_id,
        baseline: before,
        expectedContentHash: current.content_hash,
        userId: req.user.id,
      });
      await client.query(
        `UPDATE pillar_scenarios
         SET status = 'ROLLED_BACK', rolled_back_at = now(), result = jsonb_set(result, '{rollback}', $1::jsonb, true)
         WHERE id = $2`,
        [JSON.stringify({ restored: restored.restored, at: new Date().toISOString() }), scenario.id],
      );
      return { ok: true, restored: restored.restored, baseline: restored.baseline, plan_duration_days: restored.planDurationDays };
    });
    await notifyCrew(db, req, owned,
      `Đã rollback ${owned.type}`,
      `Đã khôi phục baseline ${result.baseline?.version || 'trước'}; lịch mới sẽ tạo baseline version tiếp theo khi áp dụng.`,
      'info');
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json(errorBody(error));
  }
});

router.get('/projects/:id/pillar-scenarios', async (req, res) => {
  const db = getDb();
  const parsedLimit = Number.parseInt(req.query.limit, 10);
  const lim = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 50, 1), 200);
  res.json(await db.prepare(
    'SELECT * FROM pillar_scenarios WHERE project_id = ? ORDER BY id DESC LIMIT ?'
  ).allAsync(Number(req.params.id), lim).catch((e) => {
    if (String(e.message || '').includes('does not exist')) return [];
    throw e;
  }));
});

router.post('/projects/:id/pillar-scenarios/simulate', ...CAN_SIMULATE, async (req, res) => {
  const { type, name, params } = req.body || {};
  if (!SIM_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be ${SIM_TYPES.join('|')}` });
  }
  try {
    const baseline = await collectSimBaseline(Number(req.params.id));
    const out = simulate(type, baseline, params || {});
    if (!out.ok) return res.status(400).json({ error: out.error });
    const { items: _items, all_items: _allItems, links: _links, ...baselineMeta } = baseline;
    const result = { ...out, baseline: baselineMeta, synthetic_baseline: baseline.synthetic };
    if (baseline.synthetic) {
      result.notes_vi = [...(result.notes_vi || []), 'Lưu ý: project chưa có plan_end_date — baseline tạm tính từ deadline/fallback, PM đối chiếu thủ công trước khi quyết định.'];
    }
    const row = await withAudit(req, {
      action: 'SIMULATE', resourceType: 'pillar_scenario',
      context: { project_id: Number(req.params.id), type },
      before: null,
      after: { type, params: params || {}, risk: result.risk, deltas: result.deltas },
      note: `Mô phỏng ${type} project ${req.params.id} (rủi ro ${result.risk})`,
    }, async (client) => {
      const r = await client.query(
        `INSERT INTO pillar_scenarios (project_id, type, name, params, result, status, created_by, baseline_fingerprint)
         VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, $7) RETURNING *`,
        [Number(req.params.id), type, name || `${type}-${new Date().toISOString().slice(0, 10)}`,
          JSON.stringify(params || {}), JSON.stringify(result), req.user.id, baseline.schedule_fingerprint]
      );
      return r.rows[0];
    });
    res.status(201).json(row);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

export default router;
