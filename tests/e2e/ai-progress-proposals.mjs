import { getDb, getOwnerDb, closeDb } from '../../backend/src/db/index.js';
import { api, auth, loginAs, ok, summary } from './lib.mjs';

const projectId = Number(process.env.AI_PROGRESS_PROJECT_ID || 1);
const workItemId = Number(process.env.AI_PROGRESS_WORK_ITEM_ID || 424);
const created = { drafts: [], audits: [], projects: [] };
let original = null;
let originalSchedules = [];
let owner = null;

const body = (token, value) => ({ method: 'POST', headers: auth(token), body: JSON.stringify(value) });
const get = (token, path) => api(path, { headers: auth(token) });

try {
  const pm = await loginAs('pm@hbg.com');
  const ceo = await loginAs('ceo@hbg.com');
  const db = getDb();
  owner = getOwnerDb();
  original = await db.prepare('SELECT * FROM work_items WHERE id = ? AND project_id = ?').getAsync(workItemId, projectId);
  if (!original) throw new Error(`work item ${workItemId} not found in project ${projectId}`);
  originalSchedules = await db.prepare('SELECT * FROM construction_schedule_items WHERE project_id = ? AND work_item_id = ? ORDER BY id').allAsync(projectId, workItemId);

  const text = `Cập nhật tiến độ hạng mục ${original.code} lên 65%, PM cần xử lý trước.`;
  const first = await api('/api/ai/progress-proposals', body(pm, {
    project_id: projectId, text, work_item_id: workItemId, progress_pct: 65,
  }));
  ok(first.status === 201, `PM creates proposal (got ${first.status})`);
  const proposal = first.data?.proposal;
  const payload = proposal?.payload || {};
  ok(payload.lifecycle === 'proposed', 'complete input creates proposed lifecycle');
  ok(payload.before?.progress_percent === 60 && payload.after?.progress_percent === 65, 'proposal has before/after 60%→65%');
  ok(payload.fingerprint && payload.idempotency_key, 'proposal has fingerprint and idempotency key');
  created.drafts.push(proposal.id);

  const natural = await api('/api/ai/progress-proposals', body(pm, {
    project_id: projectId, text: `Cập nhật hạng mục ${original.code} lên 66%, cần PM theo dõi.`,
  }));
  ok(natural.status === 201 && natural.data?.proposal?.payload?.lifecycle === 'proposed', 'natural-language input resolves target and percent');
  if (natural.data?.proposal?.id) created.drafts.push(natural.data.proposal.id);

  const replay = await api('/api/ai/progress-proposals', {
    method: 'POST', headers: { ...auth(pm), 'Idempotency-Key': payload.idempotency_key },
    body: JSON.stringify({ project_id: projectId, text, work_item_id: workItemId, progress_pct: 65 }),
  });
  ok(replay.status === 200 && replay.data?.proposal?.id === proposal.id && replay.data?.replayed, 'retry replays same proposal');

  const needsInput = await api('/api/ai/progress-proposals', body(pm, {
    project_id: projectId, text: 'Cập nhật hạng mục chưa xác định lên 70%.',
  }));
  ok(needsInput.status === 201 && needsInput.data?.proposal?.payload?.lifecycle === 'needs_input', 'missing target still creates needs_input proposal');
  created.drafts.push(needsInput.data.proposal.id);
  const other = await db.prepare('SELECT id FROM work_items WHERE project_id <> ? ORDER BY id LIMIT 1').getAsync(projectId);
  if (other) {
    const wrongProject = await api('/api/ai/progress-proposals', body(pm, {
      project_id: projectId, work_item_id: other.id, progress_pct: 70, text: 'Cập nhật hạng mục khác project.',
    }));
    ok(wrongProject.status === 404, `cross-project target rejected (got ${wrongProject.status})`);
  }

  const hiddenProject = await owner.prepare(
    `INSERT INTO projects (tenant_id, code, name_vi, status) VALUES (1, $1, 'Hidden project', 'ACTIVE') RETURNING id`,
  ).getAsync(`AI-HIDDEN-${Date.now()}`);
  created.projects.push(hiddenProject.id);
  const hiddenDraft = await owner.prepare(
    `INSERT INTO ai_drafts (tenant_id, project_id, kind, title, body, payload) VALUES (1, ?, 'test_kind', 'Hidden draft', 'Hidden body', '{}') RETURNING id`,
  ).getAsync(hiddenProject.id);
  created.drafts.push(hiddenDraft.id);
  const hiddenList = await get(pm, '/api/ai/drafts?status=pending');
  ok(!hiddenList.data?.some?.((row) => row.id === hiddenDraft.id), 'draft inbox hides inaccessible project');
  const hiddenApprove = await api(`/api/ai/drafts/${hiddenDraft.id}/approve`, { method: 'POST', headers: auth(pm) });
  ok(hiddenApprove.status === 404, `inaccessible draft approve returns 404 (got ${hiddenApprove.status})`);

  const pmApply = await api(`/api/ai/progress-proposals/${proposal.id}/apply`, { method: 'POST', headers: auth(pm) });
  ok(pmApply.status === 403, `PM cannot apply (got ${pmApply.status})`);

  const ceoApply = await api(`/api/ai/progress-proposals/${proposal.id}/apply`, { method: 'POST', headers: auth(ceo) });
  ok(ceoApply.status === 200, `CEO applies proposal (got ${ceoApply.status})`);
  const after = await db.prepare('SELECT progress_pct FROM work_items WHERE id = ?').getAsync(workItemId);
  ok(Math.abs(Number(after.progress_pct) - 0.65) < 0.0001, 'work item progress updated to 65%');
  for (const schedule of originalSchedules) {
    const updated = await db.prepare('SELECT progress_pct FROM construction_schedule_items WHERE id = ?').getAsync(schedule.id);
    ok(Math.abs(Number(updated.progress_pct) - 0.65) < 0.0001, `linked schedule #${schedule.id} updated`);
  }
  const audit = await db.prepare(
    `SELECT id FROM audit_log WHERE resource_type = 'ai_progress_proposal' AND resource_id = ? AND action = 'AI_PROPOSAL_APPLY' ORDER BY id DESC LIMIT 1`,
  ).getAsync(proposal.id);
  ok(!!audit, 'apply audit references proposal id');
  if (audit) created.audits.push(audit.id);

  const replayApply = await api(`/api/ai/progress-proposals/${proposal.id}/apply`, { method: 'POST', headers: auth(ceo) });
  ok(replayApply.status === 200 && replayApply.data?.replayed, 'apply replay is idempotent');
  const rollback = await api(`/api/ai/progress-proposals/${proposal.id}/rollback`, { method: 'POST', headers: auth(ceo) });
  ok(rollback.status === 200, `CEO rolls back proposal (got ${rollback.status})`);
  const restored = await db.prepare('SELECT progress_pct FROM work_items WHERE id = ?').getAsync(workItemId);
  ok(Math.abs(Number(restored.progress_pct) - 0.6) < 0.0001, 'rollback restores previous progress');

  const staleProposal = await api('/api/ai/progress-proposals', body(pm, {
    project_id: projectId, text: 'Cập nhật tiến độ lên 66%.', work_item_id: workItemId, progress_pct: 66,
  }));
  const staleId = staleProposal.data?.proposal?.id;
  ok(staleProposal.status === 201 && staleId, 'second proposal created for stale check');
  if (staleId) created.drafts.push(staleId);
  await db.prepare('UPDATE work_items SET progress_pct = 0.7, updated_at = now() WHERE id = ?').runAsync(workItemId);
  const staleApply = await api(`/api/ai/progress-proposals/${staleId}/apply`, { method: 'POST', headers: auth(ceo) });
  ok(staleApply.status === 409 && staleApply.data?.code === 'STALE_PROPOSAL', 'changed target returns stale 409');
  const staleRow = await db.prepare('SELECT payload FROM ai_drafts WHERE id = ?').getAsync(staleId);
  const stalePayload = typeof staleRow?.payload === 'string' ? JSON.parse(staleRow.payload) : staleRow?.payload;
  ok(stalePayload?.lifecycle === 'stale', 'stale proposal is marked stale');
} catch (error) {
  ok(false, error.message);
} finally {
  if (original) {
    await owner.prepare('UPDATE work_items SET progress_pct = ?, updated_at = ? WHERE id = ?')
      .runAsync(original.progress_pct, original.updated_at, workItemId).catch(() => {});
  }
  for (const schedule of originalSchedules) {
    await owner.prepare('UPDATE construction_schedule_items SET progress_pct = ? WHERE id = ?')
      .runAsync(schedule.progress_pct, schedule.id).catch(() => {});
  }
  for (const id of created.drafts) await owner.prepare('DELETE FROM ai_drafts WHERE id = ?').runAsync(id).catch(() => {});
  for (const id of created.projects) await owner.prepare('DELETE FROM projects WHERE id = ?').runAsync(id).catch(() => {});
  for (const id of created.audits) await owner.prepare('DELETE FROM audit_log WHERE id = ?').runAsync(id).catch(() => {});
  await closeDb();
  summary();
}
