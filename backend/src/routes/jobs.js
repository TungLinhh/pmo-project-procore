// TVGS auto-escalation job
// Decision 2026-09-05: Khi TVGS quá 3 ngày (supervisor_deadline < CURRENT_DATE), tự escalate:
//   - Gửi notification cho PM của dự án
//   - Gửi notification cho CEO
//   - Mark escalated_at
//
// Mount: /api/jobs
//  - POST /escalate-tvgs        — chạy thủ công
//  - GET  /escalate-tvgs/status — xem trạng thái job lần cuối
//
// Auto-run every 1 hour

import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

let _lastRun = null;
let _lastResult = null;

async function insertNotification(db, tenantId, userId, title, body, projectId, resourceType, resourceId, severity) {
  // Schema thật: notifications có project_id, resource_type, resource_id (KHÔNG có link, is_read)
  await db.prepare(
    `INSERT INTO notifications (tenant_id, user_id, project_id, channel, delivery_status, severity, title, body, resource_type, resource_id, created_at)
     VALUES ($1, $2, $3, 'in_app', 'pending', $4, $5, $6, $7, $8, now()) RETURNING id`
  ).runAsync(tenantId, userId, projectId || null, severity, title, body, resourceType, resourceId).then(async (info) => {
    // Realtime fan-out (Wave D3): TVGS path writes directly, not via notify().
    try {
      const { publish } = await import('../lib/events.js');
      publish(userId, { type: 'notification.created', id: info.lastInsertRowid, severity, title, resource_type: resourceType, resource_id: resourceId, project_id: projectId || null });
    } catch {}
  });
}

export async function runTvgsEscalation() {
  const db = getDb();
  const now = new Date();
  const escalated = [];

  // 1. Tìm submittals quá TVGS deadline, chưa được escalate hôm nay.
  // NULL deadlines excluded in SQL (new Date(null) = 1970 → bogus huge daysLate + CEO spam).
  const overdue = await db.prepare(`
    SELECT ms.*, p.code AS project_code, p.name_vi AS project_name,
           p.tenant_id AS project_tenant_id,
           p.pm_user_id, u.email AS pm_email, u.name AS pm_name
    FROM material_submittals ms
    JOIN projects p ON p.id = ms.project_id
    LEFT JOIN users u ON u.id = p.pm_user_id
    WHERE ms.status = 'SUBMITTED'
      AND ms.supervisor_deadline IS NOT NULL
      AND ms.supervisor_deadline < CURRENT_DATE
      AND (ms.escalated_at IS NULL OR ms.escalated_at < CURRENT_DATE)
  `).allAsync();

  for (const sub of overdue) {
    const daysLate = Math.floor((now - new Date(sub.supervisor_deadline)) / 86400000);
    try {
      // 2. Gửi notification cho PM của dự án (nếu có)
      if (sub.pm_user_id) {
        await insertNotification(
          db,
          sub.project_tenant_id,
          sub.pm_user_id,
          `[ESCALATE] TVGS quá hạn ${daysLate} ngày`,
          `Submittal ${sub.submittal_code} (dự án ${sub.project_code}) chờ TVGS duyệt quá ${daysLate} ngày. Cần follow-up ngay.`,
          sub.project_id,
          'material_submittal',
          sub.id,
          'warning'
        );
      } else {
        // Fallback: notify admin
        const admins = await db.prepare(`SELECT id FROM users WHERE is_ceo = true OR role = 'admin' LIMIT 5`).allAsync();
        for (const admin of admins) {
          await insertNotification(
            db,
            sub.project_tenant_id,
            admin.id,
            `[ESCALATE] TVGS quá hạn ${daysLate} ngày — dự án chưa có PM`,
            `Submittal ${sub.submittal_code} (${sub.project_code}) — dự án chưa gán PM. Vui lòng gán PM.`,
            sub.project_id,
            'material_submittal',
            sub.id,
            'warning'
          );
        }
      }

      // 3. Gửi notification cho tất cả CEO
      const ceos = await db.prepare(`SELECT id FROM users WHERE is_ceo = true`).allAsync();
      for (const ceo of ceos) {
        await insertNotification(
          db,
          sub.project_tenant_id,
          ceo.id,
          `[CEO] Submittal quá hạn TVGS`,
          `${sub.submittal_code} (${sub.project_code}) quá ${daysLate} ngày TVGS. PM: ${sub.pm_name || '—'}`,
          sub.project_id,
          'material_submittal',
          sub.id,
          'critical'
        );
      }

      // 4. Mark escalated
      await db.prepare(`UPDATE material_submittals SET escalated_at = now() WHERE id = $1`).runAsync(sub.id);

      // 5. Webhook fan-out (Wave D4): overdue events for subscribed endpoints.
      try {
        const { emitWebhook } = await import('../lib/erp-webhook.js');
        await emitWebhook(sub.project_tenant_id, 'submittal.overdue', {
          submittal_id: sub.id, submittal_code: sub.submittal_code,
          project_id: sub.project_id, days_late: daysLate,
        });
      } catch {}

      escalated.push({
        id: sub.id,
        submittal_code: sub.submittal_code,
        project_code: sub.project_code,
        days_late: daysLate,
        pm_notified: !!sub.pm_user_id,
        ceos_notified: ceos.length,
      });
    } catch (e) {
      console.error(`[escalate] failed for submittal ${sub.id}:`, e.message);
    }
  }

  _lastRun = now.toISOString();
  _lastResult = { escalated_count: escalated.length, items: escalated };
  return _lastResult;
}

router.post('/escalate-tvgs', requireRole('admin', 'ceo'), async (req, res) => {
  const result = await runTvgsEscalation();
  res.json(result);
});

router.get('/escalate-tvgs/status', async (req, res) => {
  res.json({ last_run: _lastRun, last_result: _lastResult });
});

// AI SLA watcher (v0.7.0): overdue submittals → LLM drafts (human approves).
// Same hourly cadence as TVGS; drafts never auto-send.
router.post('/ai-sla-watch', requireRole('admin', 'ceo'), async (req, res) => {
  const { runAiSlaWatch } = await import('../lib/ai/watcher.js');
  res.json(await runAiSlaWatch());
});

router.get('/ai-sla-watch/status', async (req, res) => {
  const { aiWatchStatus } = await import('../lib/ai/watcher.js');
  res.json(aiWatchStatus());
});

// ERP SFTP push, manual (Wave 3 C2): {profile_id, project_id} → ledger CSV upload.
// No auto-cron in v1 (accountants push on close schedule). Secrets from env.
router.post('/erp-push', requireRole('admin', 'ceo', 'accounting'), async (req, res) => {
  const { profile_id, project_id } = req.body || {};
  if (!Number.isInteger(profile_id) || !Number.isInteger(project_id)) {
    return res.status(400).json({ error: 'profile_id + project_id (ints) required' });
  }
  const { getEntitlements, hasFeature } = await import('../lib/entitlements.js');
  const ent = await getEntitlements(req.user.tenant_id);
  if (!hasFeature(ent, 'erp-export')) {
    return res.status(403).json({ error: `Plan '${ent.plan}' lacks feature 'erp-export'` });
  }
  try {
    const { getDb } = await import('../db/index.js');
    const db = getDb();
    const profile = await db.prepare('SELECT connector FROM erp_profiles WHERE id = ? AND tenant_id = ?').getAsync(profile_id, req.user.tenant_id);
    if (!profile) return res.status(404).json({ error: 'ERP profile not found' });
    if (profile.connector === 'fast') {
      const { pushFastPRs } = await import('../lib/erp-fast.js');
      return res.json(await pushFastPRs({ tenantId: req.user.tenant_id, profileId: profile_id }));
    }
    if (profile.connector === 'webhook') {
      return res.status(422).json({ error: 'webhook profiles push via events, not this endpoint (see /api/erp/webhooks/test)' });
    }
    const { pushLedger } = await import('../lib/erp-push.js');
    res.json(await pushLedger({ tenantId: req.user.tenant_id, profileId: profile_id, projectId: project_id }));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// Auto-run every hour
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    runTvgsEscalation().catch(e => console.error('[escalate-tvgs cron]', e.message));
  }, 3600000);
  console.log('[cron] TVGS escalation scheduled every 1h');
  setInterval(async () => {
    try {
      const { runAiSlaWatch } = await import('../lib/ai/watcher.js');
      await runAiSlaWatch();
    } catch (e) { console.error('[ai-sla-watch cron]', e.message); }
  }, 3600000);
  console.log('[cron] AI SLA watcher scheduled every 1h');
}

export default router;
