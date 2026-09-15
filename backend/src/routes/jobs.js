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
     VALUES ($1, $2, $3, 'in_app', 'pending', $4, $5, $6, $7, $8, now())`
  ).runAsync(tenantId, userId, projectId || null, severity, title, body, resourceType, resourceId);
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

// Auto-run every hour
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    runTvgsEscalation().catch(e => console.error('[escalate-tvgs cron]', e.message));
  }, 3600000);
  console.log('[cron] TVGS escalation scheduled every 1h');
}

export default router;
