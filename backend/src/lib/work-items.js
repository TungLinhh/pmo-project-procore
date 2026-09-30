const httpError = (status, error) => Object.assign(new Error(error), { status });
const cleanCode = (value) => String(value || '').trim().replace(/\s+/g, '-').slice(0, 100);

export async function ensureWorkItem(client, {
  projectId,
  zoneId = null,
  code,
  nameVi = null,
  nameEn = null,
  itemType = 'TASK',
  plannedStartDate = null,
  plannedEndDate = null,
  planDurationDays = null,
  progressPct = null,
  sourceScheduleItemId = null,
  wbsId = null,
}) {
  const normalizedCode = cleanCode(code);
  if (!normalizedCode) throw httpError(400, 'work item code is required');
  // zone_id / wbs_id are existence-only FKs, so without these checks a work
  // item in project A could point at project B's zone or WBS node and then
  // render B's zone_code / wbs_name inside A's tree. Every other create path
  // (materials, issues, shop, submittals, qa) already validates the pair.
  if (zoneId != null) {
    const zone = (await client.query('SELECT id FROM zones WHERE id = $1 AND project_id = $2', [zoneId, projectId])).rows[0];
    if (!zone) throw httpError(404, 'Zone not found in this project');
  }
  if (wbsId != null) {
    const wbs = (await client.query('SELECT id FROM wbs WHERE id = $1 AND project_id = $2', [wbsId, projectId])).rows[0];
    if (!wbs) throw httpError(404, 'WBS node not found in this project');
  }
  const result = await client.query(
    `INSERT INTO work_items
       (project_id, zone_id, code, name_vi, name_en, item_type,
        planned_start_date, planned_end_date, plan_duration_days, progress_pct,
        source_schedule_item_id, wbs_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
     ON CONFLICT (project_id, code) DO UPDATE SET
       zone_id = COALESCE(EXCLUDED.zone_id, work_items.zone_id),
       name_vi = COALESCE(EXCLUDED.name_vi, work_items.name_vi),
       name_en = COALESCE(EXCLUDED.name_en, work_items.name_en),
       item_type = EXCLUDED.item_type,
       planned_start_date = COALESCE(EXCLUDED.planned_start_date, work_items.planned_start_date),
       planned_end_date = COALESCE(EXCLUDED.planned_end_date, work_items.planned_end_date),
       plan_duration_days = COALESCE(EXCLUDED.plan_duration_days, work_items.plan_duration_days),
       progress_pct = COALESCE(EXCLUDED.progress_pct, work_items.progress_pct),
       source_schedule_item_id = COALESCE(EXCLUDED.source_schedule_item_id, work_items.source_schedule_item_id),
       wbs_id = COALESCE(EXCLUDED.wbs_id, work_items.wbs_id),
       updated_at = now()
     RETURNING *`,
    [projectId, zoneId, normalizedCode, nameVi, nameEn, itemType, plannedStartDate, plannedEndDate,
      planDurationDays, progressPct, sourceScheduleItemId, wbsId],
  );
  return result.rows[0];
}

export async function linkResourceToWorkItem(client, { workItemId, projectId, resourceType, resourceId, quantity = null, acceptedValue = null }) {
  const numericId = Number(resourceId);
  if (!Number.isInteger(numericId) || numericId < 1) throw httpError(400, 'resource_id must be a positive integer');
  const item = (await client.query('SELECT id, project_id FROM work_items WHERE id = $1', [workItemId])).rows[0];
  if (!item || Number(item.project_id) !== Number(projectId)) throw httpError(404, 'Work item not found');

  if (resourceType === 'payment_request') {
    const target = (await client.query(
      `SELECT pr.id FROM payment_requests pr
       JOIN invoices i ON i.id = pr.invoice_id
       JOIN contracts c ON c.id = i.contract_id
       WHERE pr.id = $1 AND c.project_id = $2`,
      [numericId, projectId],
    )).rows[0];
    if (!target) throw httpError(404, 'Payment request not found');
    await client.query(
      `INSERT INTO payment_request_items (payment_request_id, work_item_id, quantity, accepted_value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (payment_request_id, work_item_id) DO UPDATE SET
         quantity = EXCLUDED.quantity, accepted_value = EXCLUDED.accepted_value`,
      [numericId, workItemId, quantity, acceptedValue],
    );
    return { resource_type: resourceType, resource_id: numericId };
  }

  const directTables = {
    construction_schedule_item: ['construction_schedule_items', 'work_item_id'],
    shop_drawing: ['shop_drawings', 'work_item_id'],
    material: ['materials', 'work_item_id'],
    material_submittal: ['material_submittals', 'work_item_id'],
    qa_inspection: ['qa_inspections', 'work_item_id'],
  };
  if (directTables[resourceType]) {
    const [table, column] = directTables[resourceType];
    const result = await client.query(
      `UPDATE ${table} SET ${column} = $1 WHERE id = $2 AND project_id = $3 RETURNING id`,
      [workItemId, numericId, projectId],
    );
    if (!result.rows[0]) throw httpError(404, `${resourceType} not found`);
    return { resource_type: resourceType, resource_id: numericId };
  }

  const nested = {
    daily_work_item: ['daily_work_items', 'daily_reports', 'daily_report_id'],
    daily_acceptance: ['daily_acceptance', 'daily_reports', 'daily_report_id'],
    daily_manpower: ['daily_manpower', 'daily_reports', 'daily_report_id'],
  };
  if (nested[resourceType]) {
    const [table, parentTable, parentKey] = nested[resourceType];
    const result = await client.query(
      `UPDATE ${table} target SET work_item_id = $1
       FROM ${parentTable} parent
       WHERE target.id = $2 AND target.${parentKey} = parent.id AND parent.project_id = $3
       RETURNING target.id`,
      [workItemId, numericId, projectId],
    );
    if (!result.rows[0]) throw httpError(404, `${resourceType} not found`);
    return { resource_type: resourceType, resource_id: numericId };
  }
  throw httpError(400, `Unsupported resource_type: ${resourceType}`);
}

export async function listWorkItemLinks(client, workItemId) {
  const shop = await client.query('SELECT id, drawing_code AS code, name_vi, status FROM shop_drawings WHERE work_item_id = $1 ORDER BY id', [workItemId]);
  const materials = await client.query('SELECT id, material_code AS code, name_vi, progress_pct FROM materials WHERE work_item_id = $1 ORDER BY id', [workItemId]);
  const submittals = await client.query('SELECT id, submittal_code AS code, status FROM material_submittals WHERE work_item_id = $1 ORDER BY id', [workItemId]);
  const schedule = await client.query('SELECT id, name_vi, plan_start_date, plan_end_date, progress_pct, status FROM construction_schedule_items WHERE work_item_id = $1 ORDER BY id', [workItemId]);
  const acceptance = await client.query('SELECT id, name_vi, quantity, unit FROM daily_acceptance WHERE work_item_id = $1 ORDER BY id', [workItemId]);
  const manpower = await client.query('SELECT dm.id, dm.role_code, dm.headcount, dr.report_date FROM daily_manpower dm JOIN daily_reports dr ON dr.id = dm.daily_report_id WHERE dm.work_item_id = $1 ORDER BY dm.id', [workItemId]);
  const qa = await client.query('SELECT id, code, title_vi, status FROM qa_inspections WHERE work_item_id = $1 ORDER BY id', [workItemId]);
  const payments = await client.query('SELECT pri.id, pri.payment_request_id, pr.request_no, pr.status FROM payment_request_items pri JOIN payment_requests pr ON pr.id = pri.payment_request_id WHERE pri.work_item_id = $1 ORDER BY pri.id', [workItemId]);
  return {
    schedule: schedule.rows,
    shop_drawings: shop.rows,
    materials: materials.rows,
    material_submittals: submittals.rows,
    daily_acceptance: acceptance.rows,
    daily_manpower: manpower.rows,
    qa_inspections: qa.rows,
    payment_requests: payments.rows,
  };
}
