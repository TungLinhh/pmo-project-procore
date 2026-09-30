import { createHash } from 'node:crypto';

const dateValue = (value) => {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const numberValue = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 1_000_000) / 1_000_000 : null;
};

const httpError = (status, error) => Object.assign(new Error(error), { status });

export function scheduleFingerprint(rows) {
  const canonical = rows.map((row) => ({
    id: Number(row.id),
    plan_start_date: dateValue(row.plan_start_date),
    plan_end_date: dateValue(row.plan_end_date),
    plan_duration_days: row.plan_duration_days == null ? null : Number(row.plan_duration_days),
    progress_pct: numberValue(row.progress_pct),
    status: row.status == null ? null : String(row.status),
  })).sort((a, b) => a.id - b.id);
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

// Dependency graph is part of the stale-data contract for CTL-02. Keep it
// separate from the legacy row fingerprint so existing non-CPM scenarios keep
// their stored baseline hash semantics.
export function scheduleLinksFingerprint(links = []) {
  const canonical = links.map((link) => ({
    predecessor_id: Number(link.predecessor_id),
    successor_id: Number(link.successor_id),
    link_type: String(link.link_type || 'FS'),
    lag_days: Number(link.lag_days || 0),
  })).sort((a, b) =>
    a.predecessor_id - b.predecessor_id
    || a.successor_id - b.successor_id
    || a.link_type.localeCompare(b.link_type)
    || a.lag_days - b.lag_days
  );
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export async function lockProject(client, projectId) {
  const project = await client.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
  if (!project.rows[0]) throw httpError(404, 'Project not found');
  return project.rows[0];
}

export async function readScheduleRows(client, projectId, forUpdate = false) {
  const result = await client.query(
    `SELECT id, plan_start_date, plan_end_date, plan_duration_days, progress_pct, status
     FROM construction_schedule_items
     WHERE project_id = $1
     ORDER BY id${forUpdate ? ' FOR UPDATE' : ''}`,
    [projectId],
  );
  return result.rows;
}

export async function getCurrentBaseline(client, projectId, forUpdate = false) {
  const result = await client.query(
    `SELECT * FROM schedule_baselines
     WHERE project_id = $1 AND is_current
     ORDER BY version DESC LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [projectId],
  );
  return result.rows[0] || null;
}

export async function refreshProjectDuration(client, projectId) {
  const result = await client.query(
    `UPDATE projects p
     SET plan_duration_days = d.days
     FROM (
       SELECT project_id, GREATEST(1, (MAX(plan_end_date) - MIN(plan_start_date) + 1)::integer) AS days
       FROM construction_schedule_items
       WHERE project_id = $1 AND plan_start_date IS NOT NULL AND plan_end_date IS NOT NULL
       GROUP BY project_id
     ) d
     WHERE p.id = d.project_id
     RETURNING p.plan_duration_days`,
    [projectId],
  );
  return result.rows[0]?.plan_duration_days ?? null;
}

export async function createBaselineVersion(client, {
  projectId,
  userId = null,
  effectiveDate = null,
  notes = null,
  sourceScenarioId = null,
}) {
  await lockProject(client, projectId);
  const rows = await readScheduleRows(client, projectId, true);
  const fingerprint = scheduleFingerprint(rows);
  await client.query(
    'UPDATE schedule_baselines SET is_current = false WHERE project_id = $1 AND is_current',
    [projectId],
  );
  const versionResult = await client.query(
    'SELECT COALESCE(MAX(version), 0) + 1 AS version FROM schedule_baselines WHERE project_id = $1',
    [projectId],
  );
  const version = Number(versionResult.rows[0].version);
  const baselineResult = await client.query(
    `INSERT INTO schedule_baselines
       (project_id, version, effective_date, notes, created_by, is_current, applied_at, content_hash, source_scenario_id)
     VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, true, now(), $6, $7)
     RETURNING *`,
    [projectId, version, effectiveDate, notes, userId, fingerprint, sourceScenarioId],
  );
  const baseline = baselineResult.rows[0];
  for (const row of rows) {
    await client.query(
      `INSERT INTO schedule_baseline_items
         (baseline_id, schedule_item_id, plan_start_date, plan_end_date, plan_duration_days, progress_pct, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [baseline.id, row.id, dateValue(row.plan_start_date), dateValue(row.plan_end_date),
        row.plan_duration_days, row.progress_pct, row.status],
    );
  }
  await client.query(
    `UPDATE construction_schedule_items
     SET baseline_id = $1, baseline_version = $2
     WHERE project_id = $3`,
    [baseline.id, version, projectId],
  );
  const planDurationDays = await refreshProjectDuration(client, projectId);
  return { baseline, fingerprint, itemCount: rows.length, planDurationDays };
}

export async function ensureCurrentBaseline(client, projectId, userId = null) {
  const existing = await getCurrentBaseline(client, projectId);
  if (existing) return existing;
  return (await createBaselineVersion(client, {
    projectId,
    userId,
    notes: 'Official baseline bootstrapped before first scenario apply',
  })).baseline;
}

export async function baselineItems(client, baselineId) {
  const result = await client.query(
    `SELECT * FROM schedule_baseline_items WHERE baseline_id = $1 ORDER BY schedule_item_id`,
    [baselineId],
  );
  return result.rows;
}

export async function restoreBaseline(client, {
  projectId,
  baseline,
  expectedContentHash,
  userId = null,
}) {
  await lockProject(client, projectId);
  const current = await getCurrentBaseline(client, projectId, true);
  const currentRows = await readScheduleRows(client, projectId, true);
  if (!current || !expectedContentHash || current.content_hash !== expectedContentHash
      || scheduleFingerprint(currentRows) !== expectedContentHash) {
    throw httpError(409, 'Schedule changed after this scenario was applied; rollback would overwrite newer data');
  }
  const snapshots = await baselineItems(client, baseline.id);
  for (const snapshot of snapshots) {
    await client.query(
      `UPDATE construction_schedule_items
       SET plan_start_date = $1, plan_end_date = $2, plan_duration_days = $3,
           progress_pct = $4, status = $5, baseline_id = $6, baseline_version = $7
       WHERE id = $8 AND project_id = $9`,
      [dateValue(snapshot.plan_start_date), dateValue(snapshot.plan_end_date), snapshot.plan_duration_days,
        snapshot.progress_pct, snapshot.status, baseline.id, baseline.version, snapshot.schedule_item_id, projectId],
    );
  }
  await client.query(
    'UPDATE schedule_baselines SET is_current = false WHERE project_id = $1 AND is_current',
    [projectId],
  );
  await client.query(
    'UPDATE schedule_baselines SET is_current = true, rolled_back_at = NULL WHERE id = $1',
    [baseline.id],
  );
  await client.query(
    'UPDATE schedule_baselines SET rolled_back_at = now() WHERE id = $1',
    [current.id],
  );
  await client.query(
    `UPDATE construction_schedule_items
     SET baseline_id = $1, baseline_version = $2
     WHERE project_id = $3 AND id IN (SELECT schedule_item_id FROM schedule_baseline_items WHERE baseline_id = $1)`,
    [baseline.id, baseline.version, projectId],
  );
  const planDurationDays = await refreshProjectDuration(client, projectId);
  return { restored: snapshots.length, baseline, planDurationDays, userId };
}
