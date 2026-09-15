// Issues routes — list, create, detail

import { Router } from 'express';
import { requireAuth, currentUser } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireResourceProject, checkProjectAccess } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);
router.use('/:id', requireResourceProject({ table: 'issues' }));

router.get('/', async (req, res) => {
  const db = getDb();
  const { project_id, status, limit = 200 } = req.query;
  const lim = Math.min(parseInt(limit) || 200, 1000);
  const where = ['1=1'];
  const params = [];
  let i = 1;
  if (project_id) { where.push(`project_id = $${i++}`); params.push(project_id); }
  if (status) { where.push(`status = $${i++}`); params.push(status); }
  params.push(lim);
  const rows = await db.prepare(`SELECT * FROM issues WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${i}`).allAsync(...params);
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const db = getDb();
  const r = await db.prepare('SELECT * FROM issues WHERE id = $1').getAsync(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  res.json(r);
});

export async function createIssue(req, res) {
  const { project_id, title, body, category, severity, source_resource, source_id, zone_id } = req.body || {};
  if (!project_id || !title) return res.status(400).json({ error: 'project_id and title required' });
  if (!(await checkProjectAccess(req.user, Number(project_id)))) {
    return res.status(404).json({ error: 'Project not found' });
  }
  try {
    const result = await withAudit(req, {
      action: 'CREATE', resourceType: 'issue', resourceId: 0,
      context: { project_id, zone_id, source_resource, source_id },
      after: { project_id, title, body, category, severity, source_resource, source_id, zone_id },
      note: `Tạo issue: ${title}`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO issues (tenant_id, project_id, title, body, category, severity, status, source_resource, source_id, zone_id, owner_user_id, created_at)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'NORMAL'), 'OPEN', $7, $8, $9, $10, now()) RETURNING *`,
        [req.user.tenant_id, project_id, title, body, category, severity, source_resource, source_id, zone_id, req.user.id]
      );
      const r = ins.rows[0];
      // Update audit with real resource id (CTE for ORDER BY + LIMIT in UPDATE)
      await client.query(
        `WITH latest AS (SELECT id FROM audit_log WHERE resource_id = 0 AND resource_type = $2 AND context->>'project_id' = $3 ORDER BY id DESC LIMIT 1) UPDATE audit_log SET resource_id = $1 WHERE id IN (SELECT id FROM latest)`,
        [r.id, 'issue', String(project_id)]
      );
      return r;
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

router.post('/', createIssue);

export default router;
