import crypto from 'node:crypto';
import { getDb } from '../../db/index.js';

export const PROGRESS_PROPOSAL_KIND = 'progress_update';
const MAX_TEXT = 4000;
const dateText = (value) => {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};
const numberOrNull = (value) => (value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value));
const percentToFraction = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n / 100));
};
const round = (value, digits = 4) => Number(Number(value).toFixed(digits));
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function normalizeProgressInput(body = {}) {
  const text = String(body.text || '').trim().slice(0, MAX_TEXT);
  const explicitProgress = body.progress_pct == null || body.progress_pct === ''
    ? null : Number(body.progress_pct);
  return {
    text,
    workItemId: body.work_item_id == null || body.work_item_id === '' ? null : Number(body.work_item_id),
    scheduleItemId: body.schedule_item_id == null || body.schedule_item_id === '' ? null : Number(body.schedule_item_id),
    progressPercent: Number.isFinite(explicitProgress) ? Math.max(0, Math.min(100, explicitProgress)) : null,
    reportDate: body.report_date ? dateText(body.report_date) : null,
    department: body.department ? String(body.department).trim().slice(0, 100) : null,
    blocker: body.blocker ? String(body.blocker).trim().slice(0, 1000) : null,
    nextAction: body.next_action ? String(body.next_action).trim().slice(0, 1000) : null,
    idempotencyKey: body.idempotency_key ? String(body.idempotency_key).trim().slice(0, 200) : null,
  };
}

export function parseProgressText(text) {
  const source = String(text || '');
  const percentMatch = source.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/i);
  const dateMatch = source.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const labelledCode = source.match(/(?:mã|hạng mục|work\s*item|wbs|item)\s*(?:số|code)?\s*[:#-]?\s*([a-z0-9][a-z0-9._/-]{2,})/i);
  const codeTokens = [...source.matchAll(/\b[a-z0-9][a-z0-9._/-]{2,}\b/gi)]
    .map((match) => match[0])
    .filter((token) => /\d/.test(token) && !/^\d{1,2}$/.test(token));
  return {
    progressPercent: percentMatch ? Number(percentMatch[1].replace(',', '.')) : null,
    reportDate: dateMatch?.[1] || null,
    codeHint: labelledCode?.[1] || codeTokens[0] || null,
  };
}

async function loadWorkItem(db, projectId, workItemId) {
  if (!Number.isInteger(workItemId)) return null;
  return db.prepare(
    `SELECT id, project_id, code, name_vi, progress_pct, NULL::text AS status,
            planned_start_date, planned_end_date, updated_at
     FROM work_items WHERE id = ? AND project_id = ?`
  ).getAsync(workItemId, projectId);
}

async function loadSchedules(db, projectId, workItemId) {
  return db.prepare(
    `SELECT id, project_id, work_item_id, name_vi, progress_pct, status,
            plan_start_date, plan_end_date, created_at AS updated_at
     FROM construction_schedule_items WHERE project_id = ? AND work_item_id = ?
     ORDER BY id`
  ).allAsync(projectId, workItemId);
}

async function findCandidates(db, projectId, hint) {
  if (!hint) return [];
  const pattern = `%${String(hint).replace(/[\\%_]/g, '')}%`;
  return db.prepare(
    `SELECT id, project_id, code, name_vi, progress_pct, NULL::text AS status,
            planned_start_date, planned_end_date, updated_at
     FROM work_items
     WHERE project_id = ? AND (code ILIKE ? OR name_vi ILIKE ?)
     ORDER BY CASE WHEN lower(code) = lower(?) THEN 0 ELSE 1 END, id
     LIMIT 6`
  ).allAsync(projectId, pattern, pattern, String(hint));
}

export function progressFingerprint(workItem, schedules = []) {
  const value = {
    work_item: workItem ? {
      id: workItem.id,
      progress_pct: numberOrNull(workItem.progress_pct),
      status: workItem.status || null,
      planned_start_date: dateText(workItem.planned_start_date),
      planned_end_date: dateText(workItem.planned_end_date),
      updated_at: workItem.updated_at instanceof Date ? workItem.updated_at.toISOString() : (workItem.updated_at || null),
    } : null,
    schedules: schedules.map((row) => ({
      id: row.id,
      progress_pct: numberOrNull(row.progress_pct),
      status: row.status || null,
      plan_start_date: dateText(row.plan_start_date),
      plan_end_date: dateText(row.plan_end_date),
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : (row.updated_at || null),
    })),
  };
  return hash(JSON.stringify(value));
}

export async function buildProgressProposal({ tenantId, projectId, user, body, idempotencyKey = null }) {
  const db = getDb();
  const input = normalizeProgressInput(body);
  const parsed = parseProgressText(input.text);
  const workItemId = input.workItemId || (input.scheduleItemId
    ? (await db.prepare('SELECT work_item_id FROM construction_schedule_items WHERE id = ? AND project_id = ?').getAsync(input.scheduleItemId, projectId))?.work_item_id
    : null);
  let workItem = workItemId ? await loadWorkItem(db, projectId, workItemId) : null;
  let candidates = [];
  if (!workItem && !input.workItemId && !input.scheduleItemId) {
    candidates = await findCandidates(db, projectId, parsed.codeHint || input.text);
    if (candidates.length === 1) workItem = candidates[0];
  }
  const schedules = workItem ? await loadSchedules(db, projectId, workItem.id) : [];
  const progressPercent = input.progressPercent ?? parsed.progressPercent;
  const missing = [];
  if (!projectId || !Number.isInteger(Number(projectId))) missing.push('project_id');
  if (!workItem) missing.push(candidates.length > 1 ? 'work_item_id' : 'work_item');
  if (!Number.isFinite(progressPercent)) missing.push('progress_pct');
  if (!input.text) missing.push('text');
  const currentFraction = workItem ? numberOrNull(workItem.progress_pct) : null;
  const proposedFraction = Number.isFinite(progressPercent) ? percentToFraction(progressPercent) : null;
  const lifecycle = missing.length ? 'needs_input' : 'proposed';
  const key = idempotencyKey || input.idempotencyKey || hash([
    tenantId, projectId, user.id, input.text, workItem?.id || '', progressPercent ?? '', input.reportDate || parsed.reportDate || '',
  ].join('|'));
  const before = workItem ? {
    progress_pct: currentFraction,
    progress_percent: currentFraction == null ? null : round(currentFraction * 100, 1),
    status: workItem.status || null,
    planned_start_date: dateText(workItem.planned_start_date),
    planned_end_date: dateText(workItem.planned_end_date),
  } : null;
  const after = proposedFraction == null ? null : {
    progress_pct: round(proposedFraction),
    progress_percent: round(proposedFraction * 100, 1),
  };
  const title = workItem
    ? `[AI] Cập nhật tiến độ ${workItem.code || `#${workItem.id}`}`
    : '[AI] Cần xác định hạng mục cập nhật tiến độ';
  const reason = input.blocker || input.nextAction || input.text;
  const bodyText = lifecycle === 'proposed'
    ? `Đề xuất cập nhật ${workItem.name_vi || workItem.code} từ ${before.progress_percent ?? '?'}% lên ${after.progress_percent}%. ${reason || 'PM cần xác nhận trước khi apply.'}`
    : `AI đã nhận cập nhật nhưng còn thiếu: ${missing.join(', ')}. Cần bổ sung thông tin trước khi tạo thay đổi kế hoạch.`;
  const roleDepartment = {
    pm: 'PM', pmo: 'PMO', site: 'Chỉ huy trưởng công trường', technical: 'Phòng Kỹ thuật/Thiết kế',
    procurement: 'Phòng Vật tư/Thu mua', accounting: 'Phòng Tài chính/Kế toán', admin: 'Quản trị hệ thống',
  }[String(user.role || '').toLowerCase()] || (user.is_ceo ? 'Ban điều hành' : null);
  const payload = {
    schema_version: 1,
    kind: PROGRESS_PROPOSAL_KIND,
    lifecycle,
    source: 'ai_assistant',
    generator: 'deterministic_progress_guard',
    created_by: user.id,
    department: input.department || roleDepartment,
    report_date: input.reportDate || parsed.reportDate || null,
    blocker: input.blocker || null,
    next_action: input.nextAction || null,
    source_text: input.text,
    reason,
    target: workItem ? {
      type: 'work_item', id: workItem.id, code: workItem.code, name_vi: workItem.name_vi,
      schedule_item_ids: schedules.map((row) => row.id),
    } : null,
    candidates: candidates.map((row) => ({ id: row.id, code: row.code, name_vi: row.name_vi })),
    before,
    after,
    missing_fields: missing,
    fingerprint: workItem ? progressFingerprint(workItem, schedules) : null,
    idempotency_key: key,
    apply_policy: 'ceo_admin',
    citations: [
      ...(workItem ? [{ resource_type: 'work_item', resource_id: workItem.id, project_id: projectId }] : []),
      ...(schedules[0] ? [{ resource_type: 'schedule_item', resource_id: schedules[0].id, project_id: projectId }] : []),
    ],
  };
  return {
    kind: PROGRESS_PROPOSAL_KIND,
    title,
    body: bodyText,
    payload,
    idempotencyKey: key,
    lifecycle,
  };
}
