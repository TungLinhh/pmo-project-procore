// Site holidays (v0.6.1): global VN calendar + per-tenant days off.
// Reads merge both; writes are always own-tenant (global rows are seed-managed).
// Compression auto-merges overlapping holidays as suspension gaps.
// Mount: /api.

import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

router.get('/holidays', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare(
    `SELECT id, holiday_date, name, CASE WHEN tenant_id IS NULL THEN 'global' ELSE 'tenant' END AS scope
     FROM site_holidays WHERE tenant_id IS NULL OR tenant_id = ? ORDER BY holiday_date`
  ).allAsync(req.user.tenant_id));
});

router.post('/holidays', requireRole('admin', 'ceo', 'pm'), async (req, res) => {
  const db = getDb();
  const { holiday_date, name } = req.body || {};
  if (!holiday_date || !/^\d{4}-\d{2}-\d{2}$/.test(holiday_date)) {
    return res.status(400).json({ error: 'holiday_date (YYYY-MM-DD) required' });
  }
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name required' });
  try {
    const row = await withAudit(req, {
      action: 'CREATE', resourceType: 'site_holiday', resourceId: 0,
      after: { holiday_date, name },
      note: `Ngày nghỉ ${holiday_date} (${name})`,
    }, async (client) => {
      const r = await client.query(
        `INSERT INTO site_holidays (tenant_id, holiday_date, name) VALUES ($1, $2, $3)
         ON CONFLICT (tenant_id, holiday_date) DO NOTHING RETURNING *`,
        [req.user.tenant_id, holiday_date, String(name).trim()]
      );
      return r.rows[0] || null;
    });
    if (!row) return res.status(409).json({ error: 'holiday already exists' });
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/holidays/:id', requireRole('admin', 'ceo', 'pm'), async (req, res) => {
  const db = getDb();
  const old = await db.prepare('SELECT * FROM site_holidays WHERE id = ?').getAsync(req.params.id);
  // Global rows are seed-managed, never API-deletable (same 404, no leak signal).
  if (!old || old.tenant_id == null || old.tenant_id !== req.user.tenant_id) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    await withAudit(req, {
      action: 'DELETE', resourceType: 'site_holiday', resourceId: Number(req.params.id),
      before: old, after: null,
      note: `Xóa ngày nghỉ ${String(old.holiday_date).slice(0, 10)}`,
    }, async (client) => {
      await client.query('DELETE FROM site_holidays WHERE id = $1', [req.params.id]);
      return { ok: true };
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
