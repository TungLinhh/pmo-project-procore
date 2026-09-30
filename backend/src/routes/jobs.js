// TVGS auto-escalation job
// Decision 2026-09-05: Khi TVGS quá 3 ngày (supervisor_deadline < CURRENT_DATE), tự escalate:
//   - Gửi notification cho PM của dự án
//   - Gửi notification cho CEO
//   - Mark escalated_at
//
// Mount: /api/jobs
//  - POST /escalate-tvgs        — chạy thủ công
//  - GET  /escalate-tvgs/status — xem trạng thái job lần cuối
//  - GET  /attention?project_id= — "Cần xử lý": gom quá hạn 4 trụ cột (top 5
//    mỗi nhóm + count). Mọi dòng đều deep-link được (quy tắc U5).
//
// Auto-run every 1 hour

import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';
import { errorBody } from '../lib/error-body.js';

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

// `scopeTenantId`:
//   • `null` (mặc định) — chạy **toàn hệ thống**. Đây là đường cron, không có ngữ
//     cảnh tenant, nên nó phải thấy mọi tenant.
//   • một số tenant — chạy cho riêng tenant đó. Dùng khi một admin bấm nút "Chạy
//     ngay": trước đây nút đó gọi hàm không tham số nên **admin tenant A bấm một
//     cái là tenant B nhận thông báo**, và phản hồi trả về cho admin A danh sách
//     `submittal_code`/`project_code` của tenant B. Vừa rò dữ liệu vừa ghi chéo.
export async function runTvgsEscalation(scopeTenantId = null) {
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
      ${scopeTenantId == null ? '' : 'AND p.tenant_id = ?'}
  `).allAsync(...(scopeTenantId == null ? [] : [scopeTenantId]));

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
        // PHẢI khoá theo `tenant_id`. Cron chạy ngoài `runWithTenant` nên
        // `app.current_tenant` không được set ⇒ policy RLS mở hatch
        // `app_tenant_unset()` ⇒ câu không có `tenant_id` trả về user của **mọi
        // tenant**. Rồi `insertNotification` ghi `notifications(tenant_id = tenant
        // của dự án, user_id = user của tenant khác)` kèm mã dự án, mã submittal
        // và tên PM trong nội dung. Đã tích luỹ 25 dòng rò trong DB trước khi sửa.
        const admins = await db.prepare(
          `SELECT id FROM users WHERE tenant_id = ? AND (is_ceo = true OR role = 'admin') LIMIT 5`
        ).allAsync(sub.project_tenant_id);
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
      // Cùng lý do: không khoá tenant thì mọi CEO mọi tenant đều nhận thông báo.
      const ceos = await db.prepare(
        `SELECT id FROM users WHERE tenant_id = ? AND is_ceo = true`
      ).allAsync(sub.project_tenant_id);
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

// Nút "Chạy ngay" chỉ chạy cho **tenant của người bấm**. Cron (setInterval bên dưới)
// vẫn gọi không tham số nên vẫn toàn hệ thống — đó là việc của hệ thống, không phải
// của một admin đơn lẻ.
router.post('/escalate-tvgs', requireRole('admin', 'ceo'), async (req, res) => {
  const result = await runTvgsEscalation(req.user.tenant_id);
  res.json({ ...result, scope: `tenant ${req.user.tenant_id}` });
});

router.get('/escalate-tvgs/status', async (req, res) => {
  // `_lastResult` là kết quả của lần chạy cron gần nhất, có thể chứa mã của mọi
  // tenant — không trả cho một admin đơn lẻ. Chỉ trả phần thống kê.
  res.json({
    last_run: _lastRun,
    last_result: _lastResult
      ? { escalated_count: _lastResult.escalated_count, scope: 'global (cron)' }
      : null,
  });
});

// GET /api/jobs/attention?project_id= — gom việc quá hạn theo dự án.
// Mọi dòng đều có href deep-link (quy tắc U5). 404 khi không có quyền project.
router.get('/attention', async (req, res) => {
  const pid = Number(req.query.project_id);
  if (!pid) return res.status(400).json({ error: 'project_id required' });
  const { checkProjectAccess } = await import('../lib/project-access.js');
  if (!(await checkProjectAccess(req.user, pid))) return res.status(404).json({ error: 'Project not found' });
  const { collectAttention } = await import('../lib/attention.js');
  res.json(await collectAttention(pid));
});

// POST /api/jobs/overdue-digest — idempotent daily digest for admins/CEO.
router.post('/overdue-digest', requireRole('admin', 'ceo'), async (req, res) => {
  const { runOverdueDigest } = await import('../lib/attention-digest.js');
  const date = typeof req.body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)
    ? req.body.date : new Date().toISOString().slice(0, 10);
  res.json(await runOverdueDigest({
    tenantId: req.user.tenant_id,
    date,
    force: req.body?.force === true,
  }));
});

router.get('/overdue-digest/status', requireRole('admin', 'ceo'), async (req, res) => {
  const { attentionDigestStatus } = await import('../lib/attention-digest.js');
  res.json({ last_run: attentionDigestStatus() });
});

// Retention: what the sweeper would prune, and run it on demand. Read-only by
// default so an admin can inspect the plan before anything is deleted.
//
// `POST /retention/run` cố ý chạy **toàn hệ thống** (nó dọn dữ liệu hết hạn của mọi
// tenant, giống hệt cron lúc 00:00) — đó là việc của người vận hành, và quyền đó đã
// được `requireRole('admin','ceo')` cho. Nhưng `GET /retention` chỉ nên **báo cáo
// tenant của người gọi**: trước đây câu đếm không có `tenant_id`, và trong request thì
// RLS có GUC nên nó đã giới hạn theo tenant — tức đúng, nhưng chỉ đúng **khi RLS còn
// đang bật**. Cùng kiểu với mục 11.15 (cron không có GUC ⇒ mở hatch). Ghi rõ điều kiện
// thay vì dựa vào nó trong im lặng.
router.get('/retention', requireRole('admin', 'ceo'), async (req, res) => {
  const { retentionPlan } = await import('../lib/retention.js');
  const db = getDb();
  // `counts[table]` giữ **là số** như trước. Bản đầu tôi đổi nó thành object
  // `{n, scope}` để ghi rõ phạm vi, và `tests/e2e/monitoring.mjs` đỏ ngay — đó là hợp
  // đồng `counts` đã có người dùng. Giờ phạm vi nằm ở bản đồ `scopes` riêng.
  const counts = {};
  const scopes = {};
  for (const target of retentionPlan()) {
    // Cờ `tenantScoped` do `lib/retention.js` khai báo: bảng không có `tenant_id`
    // (bảng phiên toàn cục) thì đếm toàn cục, và `scopes` nói rõ để người đọc không
    // tưởng đó là số của riêng mình.
    const counted = await db.prepare(
      `SELECT count(*)::int AS n FROM ${target.table}${target.tenantScoped ? ' WHERE tenant_id = ?' : ''}`,
    ).getAsync(...(target.tenantScoped ? [req.user.tenant_id] : []));
    counts[target.table] = counted?.n ?? 0;
    scopes[target.table] = target.tenantScoped ? 'tenant' : 'global';
  }
  res.json({
    plan: retentionPlan(),
    counts,
    scopes,
    note: 'Bảng `global` là bảng phiên toàn cục, không lọc theo tenant được; '
      + 'POST /api/jobs/retention/run thì dọn toàn hệ thống.',
  });
});

// Chạy tay. Cố ý **không** giới hạn theo tenant: đây là việc của người vận hành và
// nó dọn giống hệt cron lúc 00:00 (cron cũng gọi không tham số). Chỉ có `requireRole`
// bảo vệ — giống hệt các route vận hành khác như `/escalate-tvgs`.
//
// LƯU Ý: route này từng bị tôi xoá nhầm khi sửa `GET /retention` — bản thay thế chỉ
// giữ lại GET, và `tests/e2e/monitoring.mjs` đỏ với 404. Bài kiểm gate bắt được.
router.post('/retention/run', requireRole('admin', 'ceo'), async (req, res) => {
  const { runRetention } = await import('../lib/retention.js');
  res.json(await runRetention());
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
    const { checkProjectAccess } = await import('../lib/project-access.js');
    const db = getDb();
    // Project membership is checked here: this path has no /projects/:id
    // segment, so permissionMiddleware resolved projectId = null and canAccess
    // returned true for any role with `payment write` — an ACCOUNTING user
    // assigned to one project could upload any project's AP ledger.
    if (!(await checkProjectAccess(req.user, project_id))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const profile = await db.prepare('SELECT connector FROM erp_profiles WHERE id = ? AND tenant_id = ?').getAsync(profile_id, req.user.tenant_id);
    if (!profile) return res.status(404).json({ error: 'ERP profile not found' });
    if (profile.connector === 'fast') {
      const { pushFastPRs } = await import('../lib/erp-fast.js');
      return res.json(await pushFastPRs({ tenantId: req.user.tenant_id, profileId: profile_id, projectId: project_id }));
    }
    if (profile.connector === 'webhook') {
      return res.status(422).json({ error: 'webhook profiles push via events, not this endpoint (see /api/erp/webhooks/test)' });
    }
    const { pushLedger } = await import('../lib/erp-push.js');
    res.json(await pushLedger({ tenantId: req.user.tenant_id, profileId: profile_id, projectId: project_id }));
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// Auto-run every hour.
// Overlap guards (P1): a slow run must never stack with the next tick —
// if the previous run is still in flight, skip + log instead of doubling
// notifications. Timers are intentionally NOT unref'd and never cleared:
// the backend is a long-lived server process and these crons are part of its
// steady-state duties (clearing them on shutdown is handled by process exit).
let _tvgsRunning = false;
let _slaRunning = false;
let _backupRunning = false;
let _backupDay = null; // local YYYY-MM-DD đã chạy thành công
const localDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
let _digestRunning = false;
let _digestDay = null;
let _retentionRunning = false;
let _retentionDay = null;
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    if (_tvgsRunning) { console.log('[cron] TVGS escalation skipped (previous run still in flight)'); return; }
    _tvgsRunning = true;
    runTvgsEscalation()
      .catch(e => console.error('[escalate-tvgs cron]', e.message))
      .finally(() => { _tvgsRunning = false; });
  }, 3600000);
  console.log('[cron] TVGS escalation scheduled every 1h');
  setInterval(async () => {
    if (_slaRunning) { console.log('[cron] AI SLA watcher skipped (previous run still in flight)'); return; }
    _slaRunning = true;
    try {
      const { runAiSlaWatch } = await import('../lib/ai/watcher.js');
      await runAiSlaWatch();
    } catch (e) { console.error('[ai-sla-watch cron]', e.message); }
    finally { _slaRunning = false; }
  }, 3600000);
  console.log('[cron] AI SLA watcher scheduled every 1h');
  // Daily backup (SRS NFR): mỗi giờ kiểm tra một lần, chạy khi sang giờ hẹn
  // (BACKUP_HOUR, mặc định 02:00) và hôm nay chưa chạy. Overlap guard chung.
  setInterval(async () => {
    try {
      const { runBackup, backupHour, lastRun } = await import('../lib/backup.js');
      const now = new Date();
      const today = localDateKey(now);
      if (now.getHours() !== backupHour() || _backupDay === today) return;
      if (_backupRunning) { console.log('[cron] backup skipped (previous run still in flight)'); return; }
      if (lastRun() && !lastRun().error && localDateKey(new Date(lastRun().at)) === today) { _backupDay = today; return; }
      _backupRunning = true;
      await runBackup();
      _backupDay = today;
      console.log('[cron] daily backup ok');
    } catch (e) { console.error('[backup cron]', e.message); }
    finally { _backupRunning = false; }
  }, 3600000);
  console.log('[cron] daily backup scheduled (hourly check)');
  setInterval(async () => {
    try {
      const { runOverdueDigest, digestHour } = await import('../lib/attention-digest.js');
      const now = new Date();
      const today = localDateKey(now);
      if (now.getHours() < digestHour() || _digestDay === today) return;
      if (_digestRunning) { console.log('[cron] overdue digest skipped (previous run still in flight)'); return; }
      _digestRunning = true;
      const tenants = await getDb().prepare('SELECT id FROM tenants').allAsync();
      const failed = [];
      for (const tenant of tenants) {
        try {
          await runOverdueDigest({ tenantId: tenant.id, date: today });
        } catch (e) {
          failed.push(`${tenant.id}: ${e.message}`);
          console.error(`[overdue-digest cron] tenant ${tenant.id} failed:`, e.message);
        }
      }
      // Mark the day done only when every tenant succeeded — otherwise the next
      // hourly tick retries instead of the digest being lost for 24h.
      if (failed.length) console.error(`[cron] overdue digest incomplete (${failed.length}/${tenants.length} tenants) — will retry`);
      else { _digestDay = today; console.log('[cron] overdue digest ok'); }
    } catch (e) { console.error('[overdue-digest cron]', e.message); }
    finally { _digestRunning = false; }
  }, 3600000);
  console.log('[cron] overdue digest scheduled (hourly check)');
  // Retention sweep, once a day just after midnight: expired sessions and
  // telemetry only, never business or audit data (lib/retention.js).
  setInterval(async () => {
    try {
      const { runRetention } = await import('../lib/retention.js');
      const now = new Date();
      const today = localDateKey(now);
      if (now.getHours() !== 0 || _retentionDay === today) return;
      if (_retentionRunning) { console.log('[cron] retention skipped (previous run still in flight)'); return; }
      _retentionRunning = true;
      const report = await runRetention();
      _retentionDay = today;
      const removed = report.results.reduce((sum, r) => sum + (r.deleted || 0), 0);
      console.log(`[cron] retention ok — ${removed} dòng dọn (${report.results.map((r) => `${r.table}:${r.deleted || 'giữ'}`).join(', ')})`);
    } catch (e) { console.error('[retention cron]', e.message); }
    finally { _retentionRunning = false; }
  }, 3600000);
  console.log('[cron] daily retention scheduled (hourly check)');
}

export default router;
