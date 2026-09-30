import { getDb, getOwnerDb, closeDb } from '../../backend/src/db/index.js';
import { api, auth, loginAs, ok, summary } from './lib.mjs';

const projectId = Number(process.env.AI_PROGRESS_PROJECT_ID || 1);
const workItemId = Number(process.env.AI_PROGRESS_WORK_ITEM_ID || 424);
const created = { drafts: [], audits: [] };
let original = null;
let schedules = [];
let owner = null;

try {
  const pm = await loginAs('pm@hbg.com');
  const ceo = await loginAs('ceo@hbg.com');
  const db = getDb();
  owner = getOwnerDb();
  original = await db.prepare('SELECT * FROM work_items WHERE id = ? AND project_id = ?').getAsync(workItemId, projectId);
  if (!original) throw new Error('demo work item not found');
  schedules = await db.prepare('SELECT * FROM construction_schedule_items WHERE project_id = ? AND work_item_id = ? ORDER BY id').allAsync(projectId, workItemId);
  const key = `concurrency-${Date.now()}`;
  const body = { project_id: projectId, work_item_id: workItemId, progress_pct: 67, text: `Cập nhật ${original.code} lên 67%, kiểm tra concurrency.` };

  const creates = await Promise.all([0, 1].map(() => api('/api/ai/progress-proposals', {
    method: 'POST', headers: { ...auth(pm), 'Idempotency-Key': key }, body: JSON.stringify(body),
  })));
  const statuses = creates.map((r) => r.status).sort((a, b) => a - b);
  const ids = [...new Set(creates.map((r) => r.data?.proposal?.id).filter(Boolean))];
  ok(statuses[0] === 200 && statuses[1] === 201 && ids.length === 1, `concurrent create is idempotent (${statuses.join('/')}, ids=${ids.join(',')})`);
  if (ids[0]) created.drafts.push(ids[0]);

  const applies = await Promise.all([0, 1].map(() => api(`/api/ai/progress-proposals/${ids[0]}/apply`, { method: 'POST', headers: auth(ceo) })));
  const applyStatuses = applies.map((r) => r.status).sort((a, b) => a - b);
  const replayed = applies.filter((r) => r.data?.replayed).length;
  ok(applyStatuses.every((s) => s === 200) && replayed >= 1, `concurrent apply has one winner and replay (${applyStatuses.join('/')})`);
  const after = await db.prepare('SELECT progress_pct FROM work_items WHERE id = ?').getAsync(workItemId);
  ok(Math.abs(Number(after.progress_pct) - 0.67) < 0.0001, 'concurrent apply writes 67% once');
  const audit = await db.prepare(
    `SELECT id FROM audit_log WHERE resource_type = 'ai_progress_proposal' AND resource_id = ? AND action = 'AI_PROPOSAL_APPLY' ORDER BY id`,
  ).allAsync(ids[0]);
  ok(audit.length >= 1, 'concurrent apply leaves an auditable apply event');
  created.audits.push(...audit.map((r) => r.id));
} catch (error) {
  ok(false, error.message);
} finally {
  if (original) await owner.prepare('UPDATE work_items SET progress_pct = ?, updated_at = ? WHERE id = ?').runAsync(original.progress_pct, original.updated_at, workItemId).catch(() => {});
  for (const row of schedules) await owner.prepare('UPDATE construction_schedule_items SET progress_pct = ? WHERE id = ?').runAsync(row.progress_pct, row.id).catch(() => {});
  for (const id of created.audits) await owner.prepare('DELETE FROM audit_log WHERE id = ?').runAsync(id).catch(() => {});
  for (const id of created.drafts) await owner.prepare('DELETE FROM ai_drafts WHERE id = ?').runAsync(id).catch(() => {});
  await closeDb();
  summary();
}
