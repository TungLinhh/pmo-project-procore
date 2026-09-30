// Notifications routes

import { Router } from 'express';
import { readPage } from '../lib/pagination.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';
import { notify, notifyMany } from '../services/notify.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

router.get('/', async (req, res) => {
  const db = getDb();
  const { unread_only } = req.query;
  // `?limit=-1` trước đây thành `LIMIT -1` ⇒ Postgres trả 500.
  const { limit: lim } = readPage(req.query, { defaultLimit: 50, maxLimit: 200 });
  const where = ['user_id = ?'];
  const params = [req.user.id];
  if (unread_only === '1') where.push("read_at IS NULL");
  params.push(lim);
  res.json(await db.prepare(
    `SELECT * FROM notifications WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ?`
  ).allAsync(...params));
});

router.post('/:id/read', async (req, res) => {
  const db = getDb();
  await db.prepare('UPDATE notifications SET read_at = now() WHERE id = ? AND user_id = ? AND read_at IS NULL').runAsync(req.params.id, req.user.id);
  res.json({ ok: true });
});

router.post('/mark-all-read', async (req, res) => {
  const db = getDb();
  await db.prepare('UPDATE notifications SET read_at = now() WHERE user_id = ? AND read_at IS NULL').runAsync(req.user.id);
  res.json({ ok: true });
});

router.post('/', requireRole('admin', 'ceo'), async (req, res) => {
  // Manual create notification (admin/CEO only — was unguarded: any user could spam user_ids[])
  const { user_ids, title, body, link, channel, severity, projectId, project_id, issueId, issue_id, resourceType, resource_id } = req.body || {};
  if (!title || !user_ids?.length) return res.status(400).json({ error: 'title and user_ids[] required' });
  const r = await notifyMany(user_ids, {
    tenantId: req.user.tenant_id,
    title, body, link,
    channels: [channel || 'in_app'],
    severity: severity || 'info',
    projectId: projectId ?? project_id ?? null,
    issueId: issueId ?? issue_id ?? null,
    resourceType: resourceType || null,
    resourceId: resource_id ?? null,
  });
  // `user_ids` đi thẳng từ body nên có thể chứa id của tenant khác; `notify` tự
  // loại và trả về `rejected`. Trả `count` = số **thực sự** gửi được, kèm danh
  // sách id bị loại, thay vì báo thành công cho toàn bộ danh sách.
  if (r.rejected.length) {
    console.warn(`[notify] admin ${req.user.id} gửi thông báo cho ${user_ids.length} id nhưng bỏ qua ${r.rejected.length} khác tenant: ${r.rejected.map((x) => x.userId).join(', ')}`);
  }
  res.json({ ok: true, count: r.delivered, requested: user_ids.length, rejected: r.rejected });
});

export default router;
