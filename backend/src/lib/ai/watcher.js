// AI SLA watcher (v0.7.0 §3): overdue submittals → LLM-drafted nudges.
// Human-in-the-loop: drafts land in ai_drafts (pending); NOTHING sends until a
// user approves in the assistant panel. Dedupe: one pending draft per
// submittal per 24h. Monthly cap enforced inside callChat.
import { getDb } from '../../db/index.js';
import { callChat } from './providers.js';

let _lastRun = null;
let _lastResult = null;
export function aiWatchStatus() {
  return { last_run: _lastRun, last_result: _lastResult };
}

const DRAFT_SYSTEM = `Bạn viết tin nhắn nhắc việc cho quản lý dự án xây dựng.
- Tiếng Việt, súc tích (≤4 câu), nêu rõ: mã submittal, dự án, quá hạn mấy ngày, hành động cần làm.
- Không bịa tên người, số liệu ngoài NGỮ CẢNH. Chỉ trả về nội dung tin nhắn.`;

export async function runAiSlaWatch({ maxDrafts = 20 } = {}) {
  const db = getDb();
  const tenants = await db.prepare(
    `SELECT DISTINCT tenant_id FROM ai_provider_configs WHERE purpose = 'chat' AND enabled`
  ).allAsync();
  const drafted = [];
  for (const { tenant_id } of tenants) {
    const overdue = await db.prepare(
      `SELECT ms.id, ms.submittal_code, ms.sla_deadline, ms.supervisor_deadline,
              p.id AS project_id, p.code AS project_code, p.pm_user_id
       FROM material_submittals ms JOIN projects p ON p.id = ms.project_id
       WHERE p.tenant_id = ? AND ms.status = 'SUBMITTED'
         AND (ms.sla_deadline < CURRENT_DATE OR ms.supervisor_deadline < CURRENT_DATE)
         AND NOT EXISTS (
           SELECT 1 FROM ai_drafts d
           WHERE d.kind = 'sla_nudge' AND d.status = 'pending'
             AND d.payload->>'submittal_id' = ms.id::text
             AND d.created_at > now() - interval '24 hours')
       ORDER BY LEAST(ms.sla_deadline, ms.supervisor_deadline) ASC
       LIMIT ?`
    ).allAsync(tenant_id, maxDrafts);
    for (const sub of overdue) {
      if (drafted.length >= maxDrafts) break;
      const daysLate = Math.max(
        Math.floor((Date.now() - new Date(sub.sla_deadline || sub.supervisor_deadline)) / 864e5), 0
      );
      try {
        const r = await callChat(tenant_id, {
          system: DRAFT_SYSTEM,
          user: `Submittal ${sub.submittal_code} (dự án ${sub.project_code}) quá hạn ${daysLate} ngày. Viết tin nhắn nhắc TVGS/PM xử lý.`,
          maxTokens: 200,
        });
        let notifyUser = sub.pm_user_id;
        if (!notifyUser) {
          const admin = await db.prepare(
            `SELECT id FROM users WHERE tenant_id = ? AND (role = 'admin' OR is_ceo) ORDER BY id LIMIT 1`
          ).getAsync(tenant_id);
          notifyUser = admin?.id || null;
        }
        await db.prepare(
          `INSERT INTO ai_drafts (tenant_id, project_id, kind, title, body, payload)
           VALUES (?, ?, 'sla_nudge', ?, ?, ?)`
        ).runAsync(tenant_id, sub.project_id, `[AI] Nhắc submittal ${sub.submittal_code} quá hạn`,
          r.text, JSON.stringify({
            submittal_id: sub.id, notify_user_id: notifyUser,
            resource_type: 'material_submittal', resource_id: sub.id,
            severity: 'warning', provider: r.provider, model: r.model,
          }));
        // Webhook fan-out (Wave D4): draft created (human still approves).
        try {
          const { emitWebhook } = await import('../erp-webhook.js');
          await emitWebhook(tenant_id, 'ai_draft.created', {
            kind: 'sla_nudge', submittal_id: sub.id, project_id: sub.project_id,
          });
        } catch {}
        drafted.push({ submittal_id: sub.id, submittal_code: sub.submittal_code, days_late: daysLate });
      } catch (e) {
        console.error(`[ai-watch] submittal ${sub.id}:`, e.message);
      }
    }
  }
  _lastRun = new Date().toISOString();
  _lastResult = { drafted_count: drafted.length, items: drafted };
  return _lastResult;
}
