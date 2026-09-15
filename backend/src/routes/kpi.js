// KPI targets routes — versioning (mỗi POST = row mới, giữ history)
// Mount: /api/projects/:id/kpi-targets

import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

// GET list (active by default, ?include_history=1 trả tất cả versions)
router.get('/', async (req, res) => {
  const db = getDb();
  const { include_history } = req.query;
  const sql = include_history === '1'
    ? 'SELECT * FROM kpi_targets WHERE project_id = $1 ORDER BY kpi_code, version DESC'
    : "SELECT * FROM kpi_targets WHERE project_id = $1 AND effective_to IS NULL ORDER BY kpi_code";
  res.json(await db.prepare(sql).allAsync(req.params.id));
});

// POST create new version (close old, insert new)
router.post('/', async (req, res) => {
  const db = getDb();
  const { kpi_code, name_vi, target_value, unit, period_start, period_end, period_lock, notes } = req.body || {};
  if (!kpi_code || !name_vi) return res.status(400).json({ error: 'kpi_code and name_vi required' });
  const projectId = Number(req.params.id);
  if (!projectId) return res.status(400).json({ error: 'project_id (in path) required' });
  try {
    const result = await withAudit(req, {
      action: 'CREATE', resourceType: 'kpi_target', resourceId: 0,
      context: { project_id: Number(req.params.id), kpi_code },
      after: { kpi_code, name_vi, target_value, unit, period_start, period_end },
      note: `Tạo KPI ${kpi_code}`,
    }, async (client) => {
      // Close old version nếu có
      await client.query(
        `UPDATE kpi_targets SET effective_to = CURRENT_DATE WHERE project_id = $1 AND kpi_code = $2 AND effective_to IS NULL`,
        [req.params.id, kpi_code]
      );
      const lastV = await client.query(
        `SELECT COALESCE(MAX(version), 0) as v FROM kpi_targets WHERE project_id = $1 AND kpi_code = $2`,
        [req.params.id, kpi_code]
      );
      const v = (lastV.rows[0]?.v || 0) + 1;
      const ins = await client.query(
        `INSERT INTO kpi_targets (project_id, kpi_code, name_vi, target_value, unit, period_start, period_end, period_lock, version, effective_from, effective_to, notes, approved_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, NULL, $10, $11) RETURNING *`,
        [req.params.id, kpi_code, name_vi, target_value, unit, period_start, period_end, !!period_lock, v, notes, req.user.id]
      );
      return ins.rows[0];
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET history by code
router.get('/:kpi_code/history', async (req, res) => {
  const db = getDb();
  const { include_history } = req.query;
  const sql = include_history === '1'
    ? 'SELECT * FROM kpi_targets WHERE project_id = $1 AND kpi_code = $2 ORDER BY version DESC'
    : "SELECT * FROM kpi_targets WHERE project_id = $1 AND kpi_code = $2 AND effective_to IS NULL ORDER BY version DESC";
  res.json(await db.prepare(sql).allAsync(req.params.id, req.params.kpi_code));
});

export default router;
