// Directives routes — chỉ thị từ CEO/PMO

import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { checkProjectAccess } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { notifyMany } from '../services/notify.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

router.get('/', async (req, res) => {
  const db = getDb();
  const { project_id, limit = 50 } = req.query;
  const where = ['1=1'];
  const params = [];
  let i = 1;
  if (project_id) { where.push(`project_id = $${i++}`); params.push(project_id); }
  const lim = Math.min(parseInt(limit) || 50, 200);
  params.push(lim);
  res.json(await db.prepare(
    `SELECT * FROM directives WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${i}`
  ).allAsync(...params));
});

// Recipient picker source: id/name/role for the directive form.
router.get('/recipients', requireRole('ceo', 'admin', 'pmo'), async (req, res) => {
  const db = getDb();
  res.json(await db.prepare(
    `SELECT id, name, role FROM users ORDER BY CASE LOWER(role::text) WHEN 'pm' THEN 0 WHEN 'pmo' THEN 1 ELSE 2 END, id`
  ).allAsync());
});

router.post('/', requireRole('ceo', 'admin', 'pmo'), async (req, res) => {
  const db = getDb();
  const { project_id, body, issue_id, notify_to_user_ids } = req.body || {};
  if (!project_id || !body) return res.status(400).json({ error: 'project_id and body required' });
  if (!(await checkProjectAccess(req.user, Number(project_id)))) {
    return res.status(404).json({ error: 'Project not found' });
  }
  // Default recipients: every PM/PMO user. An explicit empty select from the
  // old hardcoded `[]` client used to notify NOBODY — that path now falls
  // back to the default instead of silently dropping the notification.
  let recipients = Array.isArray(notify_to_user_ids)
    ? notify_to_user_ids.filter(Boolean).map(Number)
    : [];
  if (!recipients.length) {
    // role is a custom ENUM (user_role) — lower() needs a text cast.
    const pmUsers = await db.prepare(
      `SELECT id FROM users WHERE LOWER(role::text) IN ('pm', 'pmo')`
    ).allAsync();
    recipients = pmUsers.map(u => Number(u.id));
  }
  const created = await withAudit(req, {
    action: 'DIRECTIVE', resourceType: 'directive', resourceId: 0,
    context: { project_id },
    after: { project_id, body, issue_id: issue_id || null },
    note: `Directive: ${body.slice(0, 80)}`,
  }, async (client) => {
    const ins = await client.query(
      `INSERT INTO directives (tenant_id, project_id, issue_id, from_user_id, from_user_name, body, notify_to_user_ids) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.tenant_id, project_id, issue_id || null, req.user.id, req.user.name || 'Admin', body, recipients.join(',')]
    );
    return ins.rows[0];
  });
  // Send notifications (async, don't block response)
  if (recipients.length) {
    notifyMany(recipients, {
      tenantId: req.user.tenant_id,
      title: `Chỉ thị mới: ${project_id}`,
      body: body.slice(0, 200),
      projectId: project_id,
      issueId: issue_id || null,
      resourceType: 'directive',
      resourceId: created?.id ?? null,
      severity: 'info',
    }).catch(e => console.error('[notify] directive failed:', e.message));
  }
  res.json(created);
});

export default router;
