// Deadline replan proposal (CEO/PM/PMO feature).
// When projects.end_date changes, run the CPM compression engine toward the
// new deadline and store:
//   1. schedule_scenarios row (DRAFT) — the checkable/approvable timeline diff
//   2. ai_drafts row (kind='schedule_replan', pending) — LLM explanation + payload
// Best-effort: never throws for missing schedule / missing AI provider —
// callers surface the fallback in the PATCH response instead of 500ing.
import { getDb } from '../db/index.js';
import { withAudit } from './with-audit.js';
import { computeCpm, compressSchedule, mapToCalendar, rowDurationDays, dateDiffDays, normalizeGaps, detectSummaryRows } from './cpm.js';

const todayStr = () => new Date().toISOString().slice(0, 10);
const asDateStr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDateStr(v) {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

async function loadScheduleRows(projectId) {
  const db = getDb();
  const [rows, links] = await Promise.all([
    db.prepare(
      `SELECT id, zone_id, name_vi, progress_pct, status, plan_start_date, actual_start_date, plan_end_date, plan_duration_days
       FROM construction_schedule_items WHERE project_id = ?`
    ).allAsync(projectId),
    db.prepare('SELECT predecessor_id, successor_id, link_type, lag_days FROM schedule_links WHERE project_id = ?').allAsync(projectId),
  ]);
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

export async function runReplanCompression(db, tenantId, rows, links, targetEnd, policy = {}) {
  const excluded = new Set((policy.exclude_ids || []).filter(Number.isInteger));
  const live = rows.filter((r) => !excluded.has(r.id));
  const liveLinks = links.filter((l) => !excluded.has(l.predecessor_id) && !excluded.has(l.successor_id));
  const items = toEngineItems(live);
  const anchor = todayStr();
  const targetDays = dateDiffDays(anchor, targetEnd);
  if (targetDays == null) throw Object.assign(new Error('target_end_date must be YYYY-MM-DD'), { status: 400 });
  const comp = compressSchedule(items, liveLinks, targetDays, policy);
  const final = computeCpm(items.map((i) => ({ id: i.id, duration_days: comp.durations[i.id] ?? i.duration_days })), liveLinks);
  const asStr = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
  const hols = await db.prepare(
    `SELECT holiday_date AS d FROM site_holidays
     WHERE (tenant_id IS NULL OR tenant_id = ?) AND holiday_date BETWEEN ? AND ?`
  ).allAsync(tenantId, anchor, targetEnd).catch(() => []);
  const gaps = normalizeGaps([
    ...(policy.suspensions || []),
    ...hols.map((h) => ({ from: asStr(h.d), to: asStr(h.d) })),
  ]);
  const cal = mapToCalendar(live, comp.durations, final.es, anchor, todayStr(), gaps);
  for (const r of rows) {
    if (excluded.has(r.id)) {
      const s = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10));
      cal[r.id] = { new_start: s(r.plan_start_date), new_end: s(r.plan_end_date) };
    }
  }
  const calEnd = Object.values(cal).map((c) => c.new_end).sort().pop();
  const names = new Map(rows.map((r) => [r.id, r.name_vi]));
  let feasible = comp.feasible && calEnd <= targetEnd;
  let bottleneck = comp.bottleneck.map((b) => ({ id: b.id, name: names.get(b.id), locked: b.locked }));
  if (comp.feasible && calEnd > targetEnd) {
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
    suspensions_applied: gaps.filter((g) => g.from <= calEnd),
    holidays_applied: [...new Set(hols.map((h) => asStr(h.d)))].filter((d) => d <= calEnd).sort(),
    summary_candidates: detectSummaryRows(rows),
    excluded_ids: [...excluded],
  };
}

function fallbackBody({ projectCode, targetEnd, out, autoExcluded = [] }) {
  const exclNote = autoExcluded.length
    ? `Đã tự loại ${autoExcluded.length} dòng tổng hợp khỏi tính toán (không phải việc thật): ${autoExcluded.map((c) => c.name || `#${c.id}`).join(', ')}.`
    : '';
  const head = out.feasible
    ? `Đề xuất điều chỉnh tiến độ để kịp deadline mới ${targetEnd} (dự án ${projectCode}): rút ${out.days_saved} ngày (${out.before_days}d → ${out.after_days}d, dự kiến xong ${out.calendar_end}).`
    : `Deadline mới ${targetEnd} (dự án ${projectCode}) KHÔNG khả thi: việc thật cần ${out.before_days}d nhưng chỉ còn ${out.targetDays}d (dự kiến xong ${out.calendar_end}). Nguyên nhân là các nút thắt bị khóa bên dưới — không phải do thiếu thời gian chung.`;
  const lines = (out.per_item || []).slice(0, 15).map((p) => `- #${p.id} ${p.name || ''}: ${p.old_dur}d → ${p.new_dur}d (${p.new_start}→${p.new_end})${p.at_floor ? ' [sàn]' : ''}${p.was_critical ? ' [KEY]' : ''}`);
  const bn = (out.bottleneck || []).slice(0, 5).map((b) => `${b.locked ? '🔒 ' : ''}${b.name || '#' + b.id}`).join(', ');
  return [head, exclNote,
    lines.length ? `Chi tiết:\n${lines.join('\n')}` : '',
    bn ? `Nút thắt (đã khóa 🔒 = không thể rút, cần CEO quyết): ${bn}` : '',
    'CEO/Admin kiểm tra scenario rồi Apply (ghi đè ngày KH) hoặc Rollback.',
  ].filter(Boolean).join('\n');
}

async function llmExplain(tenantId, { projectCode, targetEnd, out, autoExcluded = [] }) {
  const { callChat } = await import('./ai/providers.js');
  const perItem = (out.per_item || []).slice(0, 20).map((p) => `#${p.id} ${p.name}: ${p.old_dur}→${p.new_dur}d ${p.new_start}→${p.new_end}${p.at_floor ? ' (sàn)' : ''}`).join('\n');
  const bn = (out.bottleneck || []).map((b) => `${b.locked ? '🔒' : ''}${b.name || b.id}`).join(', ');
  const excl = autoExcluded.map((c) => `#${c.id} ${c.name} (${c.reason})`).join('\n');
  const r = await callChat(tenantId, {
    system: `Bạn là trợ lý tiến độ xây dựng. Tiếng Việt, súc tích (≤10 câu). Chỉ dùng số liệu được cung cấp, không bịa.
- Nếu khả thi=false: nêu NGUYÊN NHÂN CỤ THỂ (dòng nào bị khóa 🔒, bao nhiêu ngày, vì sao không rút được) và CÁCH KHẮC PHỤC (loại dòng tổng / nới deadline / tăng ca...). CẤM viết câu mâu thuẫn kiểu "xong sớm nhưng không khả thi" mà không giải thích.
- Nếu có dòng tổng hợp bị tự loại: nói rõ đã loại dòng nào và vì sao (không phải việc thật).
Kết thúc bằng câu đề nghị CEO/Admin kiểm tra và Apply/Rollback.`,
    user: `Dự án ${projectCode} đổi deadline về ${targetEnd}. CPM: trước ${out.before_days}d, sau ${out.after_days}d (tiết kiệm ${out.days_saved}d), xong dự kiến ${out.calendar_end}, khả thi=${out.feasible}.\nItems:\n${perItem || '(không đổi)'}\nNút thắt: ${bn || '—'}\nDòng tổng hợp đã tự loại khỏi tính toán:\n${excl || '(không có)'}\nViết đề xuất điều chỉnh timeline cho người duyệt.`,
    maxTokens: 600,
  });
  return { text: r.text, provider: r.provider, model: r.model };
}

// Main entry: called AFTER projects.end_date is updated (or for preview).
// Creates schedule_scenarios DRAFT + ai_drafts schedule_replan, returns both.
// Never throws for empty schedule / AI failure — returns { skipped, reason }.
export async function proposeDeadlineReplan(req, { projectId, targetEnd, policy = {}, projectCode = '' }) {
  const db = getDb();
  const tenantId = req.user.tenant_id;
  const { rows, links } = await loadScheduleRows(projectId);
  if (!rows.length) return { skipped: true, reason: 'project has no schedule items' };
  const cleanPolicy = {
    min_days_floor: Number.isFinite(policy.min_days_floor) ? Math.max(0, Math.floor(policy.min_days_floor)) : 1,
    min_pct: Number.isFinite(policy.min_pct) ? Math.min(1, Math.max(0, policy.min_pct)) : 0.5,
  };
  if (policy.exclude_ids !== undefined) {
    if (!Array.isArray(policy.exclude_ids) || !policy.exclude_ids.every(Number.isInteger)) {
      throw Object.assign(new Error('exclude_ids must be an array of integer item ids'), { status: 400 });
    }
    cleanPolicy.exclude_ids = [...new Set(policy.exclude_ids)];
  }
  let out = await runReplanCompression(db, tenantId, rows, links, targetEnd, cleanPolicy);
  // Auto-exclude summary rows (BTE case): header/summary lines ("TỔNG...") carry
  // huge locked spans that poison the duration math even when real work fits.
  // If the first run is infeasible and un-excluded summary candidates exist,
  // rerun once with them excluded and SAY SO in the proposal (never silent).
  let autoExcluded = [];
  if (!out.feasible) {
    const fresh = (out.summary_candidates || []).filter((c) => !(cleanPolicy.exclude_ids || []).includes(c.id));
    if (fresh.length) {
      cleanPolicy.exclude_ids = [...new Set([...(cleanPolicy.exclude_ids || []), ...fresh.map((c) => c.id)])];
      out = await runReplanCompression(db, tenantId, rows, links, targetEnd, cleanPolicy);
      autoExcluded = fresh;
    }
  }
  const scenario = await withAudit(req, {
    // Xem `routes/schedule-compress.js` cùng chỗ: `defer` để `resource_id` lấy id
    // thật thay vì sentinel `0` (mọi dòng PREVIEW từng ghi `resource_id = 0`).
    defer: true,
    action: 'PREVIEW', resourceType: 'schedule_scenario',
    context: { project_id: Number(projectId), trigger: 'deadline_change' },
    note: `Deadline ${targetEnd}: ${out.feasible ? `khả thi (−${out.days_saved}d)` : 'không khả thi'} — chờ CEO/Admin duyệt`,
  }, async (client) => {
    const r = await client.query(
      `INSERT INTO schedule_scenarios (project_id, name, target_end_date, policy, result, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6) RETURNING *`,
      [projectId, `Deadline → ${targetEnd}`, targetEnd, JSON.stringify(cleanPolicy),
       JSON.stringify({ ...out, cal: undefined, durations: undefined }), req.user.id]
    );
    const row = r.rows[0];
    return {
      value: row,
      resource_id: row.id,
      before: null,
      after: { target_end_date: targetEnd, feasible: out.feasible, after_days: out.after_days },
    };
  });
  let body = fallbackBody({ projectCode, targetEnd, out, autoExcluded });
  let provider = 'template';
  let model = 'cpm-fallback';
  try {
    const llm = await llmExplain(tenantId, { projectCode, targetEnd, out, autoExcluded });
    if (llm.text?.trim()) body = llm.text;
    provider = llm.provider;
    model = llm.model;
  } catch (e) {
    // No AI provider / cap exceeded / network — deterministic template still ships.
    body += `\n(Ghi chú: AI text không khả dụng — ${String(e.message || e).slice(0, 120)})`;
  }
  const draft = await withAudit(req, {
    action: 'AI_DRAFT_CREATE', resourceType: 'ai_draft',
    context: { kind: 'schedule_replan', project_id: Number(projectId), scenario_id: scenario.id },
    after: { scenario_id: scenario.id, feasible: out.feasible },
    note: `AI đề xuất timeline cho deadline ${targetEnd}`,
  }, async (client) => {
    const r = await client.query(
      `INSERT INTO ai_drafts (tenant_id, project_id, kind, title, body, payload)
       VALUES ($1, $2, 'schedule_replan', $3, $4, $5) RETURNING *`,
      [tenantId, projectId, `[AI] Đề xuất timeline về deadline ${targetEnd} (${projectCode || 'project ' + projectId})`,
       body, JSON.stringify({
         scenario_id: scenario.id, target_end_date: targetEnd,
         feasible: out.feasible, days_saved: out.days_saved,
         before_days: out.before_days, after_days: out.after_days,
         calendar_end: out.calendar_end, bottleneck: out.bottleneck,
         per_item: (out.per_item || []).slice(0, 50),
         auto_excluded: autoExcluded.map((c) => ({ id: c.id, name: c.name, reason: c.reason })),
         excluded_ids: out.excluded_ids,
         provider, model, trigger: 'deadline_change',
       })]
    );
    return r.rows[0];
  });
  // Auto-notify approvers (CEO/Admin): a proposal sitting silently in the inbox
  // is a missed deadline. Best-effort — never fails the PATCH.
  try {
    const { notifyMany } = await import('../services/notify.js');
    const approvers = await db.prepare(
      `SELECT id FROM users WHERE tenant_id = ? AND (role = 'admin' OR is_ceo) ORDER BY id`
    ).allAsync(tenantId);
    const title = out.feasible
      ? `[AI] Đề xuất timeline mới cho ${projectCode} (kịp deadline ${targetEnd})`
      : `[AI] Deadline ${targetEnd} (${projectCode}) KHÔNG khả thi — cần CEO quyết`;
    await notifyMany(approvers.map((u) => u.id), {
      tenantId, projectId: Number(projectId),
      title, body: String(body).slice(0, 500),
      severity: out.feasible ? 'info' : 'warning',
      resourceType: 'ai_draft', resourceId: draft.id,
    });
  } catch {}
  return { skipped: false, scenario, draft, out, provider, model, autoExcluded };
}
