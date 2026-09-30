// Behavior checks for the canonical work-item key and material lifecycle.
import { spawn } from 'node:child_process';
import { getDb, closeDb } from '../../backend/src/db/index.js';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
process.env.DATABASE_URL = DB;
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3121';
let failures = 0;
const ok = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'} — ${message}`);
  if (!condition) failures += 1;
};
const api = async (token, path, options = {}) => {
  const response = await fetch(BASE + path, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body };
};
const json = (body) => ({ method: 'POST', body: JSON.stringify(body) });


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['WI-%', 'MAT-WI-%'], { label: 'work-items-materials' });
const port = new URL(BASE).port || '3000';
const server = spawn('node', ['backend/src/index.js'], {
  env: { ...process.env, DATABASE_URL: DB, PORT: port, LOGIN_RATE_MAX: '1000' },
  stdio: 'ignore',
});
await new Promise((resolve) => setTimeout(resolve, 3500));
const db = getDb();
let projectId;
let zoneId;
let workItemId;
let materialId;

try {
  const login = await api(null, '/api/auth/login', json({ email: 'admin@hbg.com', password: 'admin123' }));
  const token = login.body?.token;
  ok(Boolean(token), 'admin login');
  const stamp = Date.now();
  const project = await api(token, '/api/projects', json({ code: `WI-MAT-${stamp}`, name_vi: 'Work item lifecycle test' }));
  projectId = project.body?.id;
  ok(Boolean(projectId), `project created (${projectId})`);
  const zone = await api(token, `/api/projects/${projectId}/zones`, json({ code: 'WI-ZONE', name_en: 'Work item zone' }));
  zoneId = zone.body?.id;
  ok(Boolean(zoneId), `zone created (${zoneId})`);

  const workItem = await api(token, `/api/projects/${projectId}/work-items`, json({
    code: 'WI-001', name_vi: 'Hạng mục kiểm thử', item_type: 'TASK',
    planned_start_date: '2026-09-01', planned_end_date: '2026-09-30', plan_duration_days: 30,
  }));
  workItemId = workItem.body?.id;
  ok(Boolean(workItemId), `work item created (${workItemId})`);

  const productivity = await api(token, `/api/work-items/${workItemId}/productivity`, json({
    period_start: '2026-09-01', period_end: '2026-09-30', role_name_vi: 'Thợ điện', kind: 'labor',
    planned_output: 100, actual_output: 90, planned_headcount: 5, actual_headcount: 4, unit: 'm2',
  }));
  ok(productivity.status === 200 && Number(productivity.body?.actual_output) === 90, `work-item productivity upserted (${productivity.status})`);
  const productivityAgain = await api(token, `/api/work-items/${workItemId}/productivity`, json({
    period_start: '2026-09-01', period_end: '2026-09-30', role_name_vi: 'Thợ điện', kind: 'labor',
    planned_output: 100, actual_output: 95, planned_headcount: 5, actual_headcount: 4, unit: 'm2',
  }));
  const productivityList = await api(token, `/api/projects/${projectId}/productivity`);
  ok(productivityAgain.body?.id === productivity.body?.id && productivityList.body?.length === 1 && Number(productivityList.body?.[0]?.actual_output) === 95,
    `productivity upsert is idempotent (${productivityList.body?.length} row)`);
  const invalidProductivity = await api(token, `/api/work-items/${workItemId}/productivity`, json({ period_start: '2026-09-01', actual_output: -1 }));
  ok(invalidProductivity.status === 400, `negative productivity rejected (${invalidProductivity.status})`);
  const siteUser = await db.prepare("SELECT id FROM users WHERE email = 'site@hbg.com'").getAsync();
  await api(token, `/api/projects/${projectId}/members`, json({ user_id: siteUser.id }));
  const siteLogin = await api(null, '/api/auth/login', json({ email: 'site@hbg.com', password: 'admin123' }));
  const siteProductivity = await api(siteLogin.body?.token, `/api/work-items/${workItemId}/productivity`, json({
    period_start: '2026-10-01', period_end: '2026-10-31', role_name_vi: 'Thợ điện', kind: 'labor',
    planned_output: 80, actual_output: 76, planned_headcount: 4, actual_headcount: 4, unit: 'm2',
  }));
  ok(siteProductivity.status === 200 && Number(siteProductivity.body?.actual_output) === 76, `assigned site can record productivity (${siteProductivity.status})`);

  const schedule = await db.prepare(
    `INSERT INTO construction_schedule_items
      (project_id, zone_id, source_sheet, ordinal, name_vi, progress_pct, status, plan_start_date, plan_end_date)
     VALUES (?, ?, 'WI-TEST', 1, 'Hạng mục gốc', 0.2, 'IN_PROGRESS', '2026-09-01', '2026-09-30') RETURNING id`,
  ).getAsync(projectId, zoneId);
  ok(Boolean(schedule?.id), `schedule row created (${schedule?.id})`);
  const linkSchedule = await api(token, `/api/work-items/${workItemId}/links`, json({
    resource_type: 'construction_schedule_item', resource_id: schedule.id,
  }));
  ok(linkSchedule.status === 201, `schedule linked to work item (${linkSchedule.status})`);

  const material = await api(token, '/api/materials', json({
    project_id: projectId, zone_id: zoneId, material_code: 'MAT-WI-001', name_vi: 'Vật tư kiểm thử',
  }));
  materialId = material.body?.id;
  ok(Boolean(materialId), `material created (${materialId})`);
  const linkMaterial = await api(token, `/api/work-items/${workItemId}/links`, json({
    resource_type: 'material', resource_id: materialId,
  }));
  ok(linkMaterial.status === 201, `material linked to work item (${linkMaterial.status})`);

  const contract = await api(token, `/api/projects/${projectId}/contracts`, json({ contract_no: `WI-CT-${stamp}`, total_value: 100000 }));
  const invoice = await api(token, `/api/contracts/${contract.body?.id}/invoices`, json({ invoice_no: `WI-INV-${stamp}`, amount: 100000 }));
  const requestRow = await api(token, `/api/invoices/${invoice.body?.id}/payment-requests`, json({ request_no: `WI-PR-${stamp}`, amount: 100000 }));
  const linkPayment = await api(token, `/api/work-items/${workItemId}/links`, json({
    resource_type: 'payment_request', resource_id: requestRow.body?.id, accepted_value: 100000,
  }));
  ok(linkPayment.status === 201, `payment request linked to work item (${linkPayment.status})`);

  const links = await api(token, `/api/work-items/${workItemId}/links`);
  ok(links.status === 200 && links.body?.schedule?.length === 1 && links.body?.materials?.length === 1 && links.body?.payment_requests?.length === 1,
    `work item links expose schedule, material and payment (${JSON.stringify({ schedule: links.body?.schedule?.length, materials: links.body?.materials?.length, payments: links.body?.payment_requests?.length })})`);

  let lifecycle = await api(token, `/api/materials/${materialId}/lifecycle`, json({ to_status: 'MSB_PREPARING' }));
  ok(lifecycle.status === 200 && lifecycle.body?.procurement_status === 'MSB_PREPARING', 'material REQUESTED → MSB_PREPARING');
  lifecycle = await api(token, `/api/materials/${materialId}/lifecycle`, json({ to_status: 'MSB_APPROVED' }));
  ok(lifecycle.status === 200 && lifecycle.body?.procurement_status === 'MSB_APPROVED', 'material MSB_PREPARING → MSB_APPROVED');
  lifecycle = await api(token, `/api/materials/${materialId}/lifecycle`, json({ to_status: 'PO_ISSUED', po_number: 'PO-WI-001' }));
  ok(lifecycle.status === 200 && lifecycle.body?.po_number === 'PO-WI-001', 'material MSB_APPROVED → PO_ISSUED');
  lifecycle = await api(token, `/api/materials/${materialId}/lifecycle`, json({ to_status: 'IN_TRANSIT' }));
  ok(lifecycle.status === 200 && lifecycle.body?.procurement_status === 'IN_TRANSIT', 'material PO_ISSUED → IN_TRANSIT');
  lifecycle = await api(token, `/api/materials/${materialId}/lifecycle`, json({ to_status: 'DELIVERED' }));
  ok(lifecycle.status === 200 && lifecycle.body?.procurement_status === 'DELIVERED', 'material IN_TRANSIT → DELIVERED');
  lifecycle = await api(token, `/api/materials/${materialId}/lifecycle`, json({ to_status: 'ACCEPTED', acceptance_result: 'PASS' }));
  ok(lifecycle.status === 200 && lifecycle.body?.procurement_status === 'ACCEPTED' && lifecycle.body?.accepted_at, 'material DELIVERED → ACCEPTED');

  const stale = await api(token, `/api/materials/${materialId}/lifecycle`, json({ to_status: 'PO_ISSUED', expected_status: 'REQUESTED' }));
  ok(stale.status === 409, `stale material transition → 409 (${stale.status})`);
  const invalid = await api(token, `/api/materials/${materialId}/lifecycle`, json({ to_status: 'DELIVERED' }));
  ok(invalid.status === 422, `invalid material transition → 422 (${invalid.status})`);
} finally {
  if (projectId) {
    await db.prepare('DELETE FROM payment_request_items WHERE work_item_id IN (SELECT id FROM work_items WHERE project_id = ?)').runAsync(projectId).catch(() => {});
    await db.prepare('DELETE FROM payment_requests WHERE invoice_id IN (SELECT i.id FROM invoices i JOIN contracts c ON c.id = i.contract_id WHERE c.project_id = ?)').runAsync(projectId).catch(() => {});
    await db.prepare('DELETE FROM invoices WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?)').runAsync(projectId).catch(() => {});
    await db.prepare('DELETE FROM contracts WHERE project_id = ?').runAsync(projectId).catch(() => {});
    await db.prepare('DELETE FROM work_items WHERE project_id = ?').runAsync(projectId).catch(() => {});
    await db.prepare('DELETE FROM materials WHERE project_id = ?').runAsync(projectId).catch(() => {});
    await db.prepare('DELETE FROM construction_schedule_items WHERE project_id = ?').runAsync(projectId).catch(() => {});
    await db.prepare('DELETE FROM zones WHERE project_id = ?').runAsync(projectId).catch(() => {});
    await db.prepare('DELETE FROM project_members WHERE project_id = ?').runAsync(projectId).catch(() => {});
    await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(projectId).catch(() => {});
  }
  await closeDb();
  server.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
