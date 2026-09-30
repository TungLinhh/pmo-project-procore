// Work-item productivity ledger: one row per work item, period, trade and kind.
// The project manpower plan remains a weekly headcount curve; this ledger keeps
// the output evidence that lets PM reconcile plan vs actual at item grain.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function nonNegative(value, field, { integer = false } = {}) {
  if (value == null || value === '') return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || (integer && !Number.isInteger(n))) {
    throw Object.assign(new Error(`${field} must be a non-negative${integer ? ' integer' : ' number'}`), { status: 400 });
  }
  return n;
}

export function normalizeProductivityInput(body = {}) {
  const periodStart = String(body.period_start || body.date || '').slice(0, 10);
  const periodEnd = String(body.period_end || body.date || periodStart).slice(0, 10);
  if (!DATE_RE.test(periodStart) || !DATE_RE.test(periodEnd) || periodEnd < periodStart) {
    throw Object.assign(new Error('period_start/period_end must be valid YYYY-MM-DD and period_end >= period_start'), { status: 400 });
  }
  const roleName = String(body.role_name_vi || body.role || 'DEFAULT').trim();
  if (!roleName) throw Object.assign(new Error('role_name_vi is required'), { status: 400 });
  const kind = String(body.kind || 'labor').toLowerCase();
  if (!['labor', 'equipment'].includes(kind)) throw Object.assign(new Error("kind must be 'labor' or 'equipment'"), { status: 400 });
  const unit = String(body.unit || 'unit').trim() || 'unit';
  return {
    periodStart,
    periodEnd,
    roleName,
    kind,
    plannedOutput: nonNegative(body.planned_output, 'planned_output'),
    actualOutput: nonNegative(body.actual_output, 'actual_output'),
    plannedHeadcount: nonNegative(body.planned_headcount, 'planned_headcount'),
    actualHeadcount: nonNegative(body.actual_headcount, 'actual_headcount'),
    unit,
    notes: body.notes == null ? null : String(body.notes).slice(0, 2000),
    sourceUploadId: body.source_upload_id == null || body.source_upload_id === '' ? null : Number(body.source_upload_id),
  };
}

export async function listProductivity(db, projectId, query = {}) {
  const where = ['wi.project_id = ?'];
  const args = [projectId];
  if (query.work_item_id) { where.push('p.work_item_id = ?'); args.push(Number(query.work_item_id)); }
  if (DATE_RE.test(String(query.period_start || ''))) { where.push('p.period_end >= ?'); args.push(String(query.period_start).slice(0, 10)); }
  if (DATE_RE.test(String(query.period_end || ''))) { where.push('p.period_start <= ?'); args.push(String(query.period_end).slice(0, 10)); }
  const rows = await db.prepare(
    `SELECT p.*, wi.code AS work_item_code, wi.name_vi AS work_item_name, wi.unit AS work_item_unit
     FROM work_item_productivity p
     JOIN work_items wi ON wi.id = p.work_item_id
     WHERE ${where.join(' AND ')}
     ORDER BY p.period_start, p.period_end, wi.code, p.role_name_vi, p.kind`,
  ).allAsync(...args);
  return rows.map((row) => ({
    ...row,
    planned_output: Number(row.planned_output),
    actual_output: Number(row.actual_output),
    planned_headcount: Number(row.planned_headcount),
    actual_headcount: Number(row.actual_headcount),
    output_variance: Number(row.actual_output) - Number(row.planned_output),
    headcount_variance: Number(row.actual_headcount) - Number(row.planned_headcount),
  }));
}

export async function upsertProductivity(client, { projectId, workItemId, userId, input }) {
  const result = await client.query(
    `INSERT INTO work_item_productivity
      (project_id, work_item_id, period_start, period_end, role_name_vi, kind,
       planned_output, actual_output, planned_headcount, actual_headcount,
       unit, notes, source_upload_id, created_by)
     VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (work_item_id, period_start, period_end, role_name_vi, kind)
     DO UPDATE SET
       planned_output = EXCLUDED.planned_output,
       actual_output = EXCLUDED.actual_output,
       planned_headcount = EXCLUDED.planned_headcount,
       actual_headcount = EXCLUDED.actual_headcount,
       unit = EXCLUDED.unit,
       notes = EXCLUDED.notes,
       source_upload_id = EXCLUDED.source_upload_id,
       created_by = EXCLUDED.created_by,
       updated_at = now()
     RETURNING *`,
    [projectId, workItemId, input.periodStart, input.periodEnd, input.roleName, input.kind,
      input.plannedOutput, input.actualOutput, input.plannedHeadcount, input.actualHeadcount,
      input.unit, input.notes, input.sourceUploadId, userId],
  );
  return result.rows[0];
}
