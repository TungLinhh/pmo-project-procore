// Audit log routes — view + export
// requireAuth: bắt buộc đăng nhập
// Permission: role admin/pm/ceo/pmo mới xem (decision 2026-09-04: tất cả user trong công ty đều có thể xem audit)

import { Router } from 'express';
import { requireAuth, currentUser } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

function buildWhere({ resource_type, resource_id, project_id, zone_id, issue_id, action, user_id, search, from, to }) {
  const where = ['1=1'];
  const params = [];
  let i = 1;
  if (resource_type) { where.push(`resource_type = $${i++}`); params.push(resource_type); }
  if (resource_id) { where.push(`resource_id = $${i++}`); params.push(resource_id); }
  if (project_id) { where.push(`context->>'project_id' = $${i++}`); params.push(String(project_id)); }
  if (zone_id) { where.push(`context->>'zone_id' = $${i++}`); params.push(String(zone_id)); }
  if (issue_id) { where.push(`context->>'issue_id' = $${i++}`); params.push(String(issue_id)); }
  if (action) { where.push(`action = $${i++}`); params.push(action); }
  if (user_id) { where.push(`user_id = $${i++}`); params.push(user_id); }
  if (search) { where.push(`(user_name ILIKE $${i} OR note ILIKE $${i} OR field_changes::text ILIKE $${i})`); params.push(`%${search}%`); i++; }
  if (from) { where.push(`created_at >= $${i++}`); params.push(from); }
  if (to) { where.push(`created_at <= $${i++}`); params.push(to); }
  return { sql: where.join(' AND '), params };
}

router.get('/', async (req, res) => {
  const db = getDb();
  const { limit = 50, offset = 0 } = req.query;
  const { sql: where, params } = buildWhere(req.query);
  const lim = Math.min(parseInt(limit) || 50, 500);
  const off = parseInt(offset) || 0;
  params.push(lim, off);
  const rows = await db.prepare(`SELECT * FROM audit_log WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`).allAsync(...params);
  res.json(rows);
});

router.get('/export', async (req, res) => {
  const db = getDb();
  const { format = 'json', limit = 10000 } = req.query;
  const { sql: where, params } = buildWhere(req.query);
  const lim = Math.min(parseInt(limit) || 10000, 50000);
  params.push(lim);
  const rows = await db.prepare(`SELECT * FROM audit_log WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length}`).allAsync(...params);

  if (format === 'csv') {
    const cols = ['id', 'created_at', 'action', 'resource_type', 'resource_id', 'actor_role', 'user_id', 'user_name', 'project_id', 'zone_id', 'issue_id', 'field_changes', 'note', 'before', 'after'];
    const csvEscape = (v) => {
      if (v == null) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [cols.join(',')];
    for (const r of rows) {
      const ctx = r.context || {};
      const row = [
        r.id, r.created_at, r.action, r.resource_type, r.resource_id,
        r.actor_role, r.user_id, r.user_name,
        ctx.project_id, ctx.zone_id, ctx.issue_id,
        r.field_changes, r.note, r.before, r.after,
      ];
      lines.push(row.map(csvEscape).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-${Date.now()}.csv"`);
    return res.send(lines.join('\n'));
  }

  // JSON
  res.setHeader('Content-Disposition', `attachment; filename="audit-${Date.now()}.json"`);
  res.json({ exported_at: new Date().toISOString(), count: rows.length, rows });
});

export default router;
