// Audit log routes — view + export
// requireAuth: bắt buộc đăng nhập.
// Scope: admin/CEO đọc toàn tenant; mọi role khác chỉ đọc audit của các
// project mình được gán (đúng với `audit: { read: 'assigned' | 'own' }` trong
// lib/permissions.js). Trước đây route không có /projects/:id nên canAccess
// trả true và mọi user đọc được before/after của cả tenant.

import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';
import { readPage, withTotal } from '../lib/pagination.js';
import { requireFeature } from '../lib/entitlements.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

// Project ids the caller may read audit for; null means "no project scope"
// (admin/CEO) and the query is left unscoped.
async function visibleProjectIds(user) {
  if (user.role === 'admin' || user.is_ceo) return null;
  const db = getDb();
  const rows = await db.prepare(
    `SELECT p.id FROM projects p
      WHERE p.tenant_id = ?
        AND (p.pm_user_id = ? OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = ?))
      ORDER BY p.id`
  ).allAsync(user.tenant_id, user.id, user.id);
  return rows.map((row) => String(row.id));
}

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
  // A bare YYYY-MM-DD compared with <= means midnight at the START of that day,
  // so choosing "To = today" silently excluded every event from that day. Take
  // the end of the day instead. Callers passing a full timestamp are unaffected.
  if (to) { where.push(`created_at < $${i++}::date + interval '1 day'`); params.push(to); }
  return { sql: where.join(' AND '), params, next: i };
}

// Adds the caller's project scope to every query. admin/CEO (null) stay
// tenant-wide; anyone else only sees rows whose context.project_id is one of
// their own projects, so a SITE user cannot read another project's
// before/after snapshots. Tenant-level rows (no project_id) stay with
// admin/CEO, which is where user/security actions belong.
async function scopedWhere(user, query) {
  const { sql, params, next } = buildWhere(query);
  const ids = await visibleProjectIds(user);
  if (ids === null) return { sql, params, ids: null, startAt: next };
  if (ids.length === 0) return { sql: `${sql} AND FALSE`, params, ids: [], startAt: next };
  const placeholders = ids.map((_, index) => `$${next + index}`).join(',');
  return {
    sql: `${sql} AND context->>'project_id' IN (${placeholders})`,
    params,
    ids,
    startAt: next,
  };
}

router.get('/', async (req, res) => {
  const db = getDb();
  const { sql, params, ids } = await scopedWhere(req.user, req.query);
  const allParams = [...params, ...(ids || [])];
  // Như các route khác: `?limit=-1` trước đây thành `LIMIT -1` ⇒ 500. `readPage`
  // kẹp cả `offset` (âm trước đây rơi về 0 theo `Math.max(…, 0)` — vẫn an toàn,
  // giữ nguyên hành vi).
  const { limit: lim, offset: off } = readPage(req.query, { defaultLimit: 50, maxLimit: 500 });
  allParams.push(lim, off);
  const rows = await db.prepare(
    `SELECT * FROM audit_log WHERE ${sql} ORDER BY created_at DESC LIMIT $${allParams.length - 1} OFFSET $${allParams.length}`
  ).allAsync(...allParams);
  // Nhật ký có hàng nghìn dòng. Không có tổng thì 50 dòng đầu trông giống hết bản
  // ghi, và người dùng tưởng hệ thống chỉ ghi bấy nhiêu đó.
  // `sql` đã chứa sẵn mệnh đề giới hạn theo dự án (hoặc `AND FALSE` khi không
  // được thấy dự án nào), nên truy vấn đếm chỉ cần bỏ hai tham số lim/off đi.
  const [{ total }] = await db.prepare(
    `SELECT count(*)::int AS total FROM audit_log WHERE ${sql}`
  ).allAsync(...allParams.slice(0, -2));
  withTotal(res, total);
  res.json(rows);
});

router.get('/export', requireFeature('audit-export'), async (req, res) => {
  const db = getDb();
  const { format = 'json' } = req.query;
  const { sql, params, ids } = await scopedWhere(req.user, req.query);
  const allParams = [...params, ...(ids || [])];
  const { limit: lim } = readPage(req.query, { defaultLimit: 10000, maxLimit: 50000 });
  allParams.push(lim);
  const rows = await db.prepare(
    `SELECT * FROM audit_log WHERE ${sql} ORDER BY created_at DESC LIMIT $${allParams.length}`
  ).allAsync(...allParams);

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
