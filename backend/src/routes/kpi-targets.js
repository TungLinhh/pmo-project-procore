// KPI target update — tạo version mới
// Mount: /api/kpi-targets

import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireResourceProject } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { errorBody } from '../lib/error-body.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
// Resolve the target's project before the matrix. Without this the map entry
// `kpi write` evaluated with projectId=null and canAccess() returned true, so
// PMO could retarget any project's KPI version from anywhere in the tenant.
router.use('/:id', requireResourceProject({ table: 'kpi_targets' }));
router.use(permissionMiddleware);

router.put('/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const db = getDb();
  const old = await db.prepare('SELECT * FROM kpi_targets WHERE id = $1').getAsync(id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const { target_value, name_vi, unit, period_start, period_end, period_lock, notes } = req.body || {};
  try {
    const updated = await withAudit(req, {
      action: 'UPDATE', resourceType: 'kpi_target', resourceId: old.id,
      context: { project_id: old.project_id, kpi_code: old.kpi_code },
      before: old,
      after: { ...old, target_value, name_vi, unit, version: old.version + 1 },
      fieldChanges: [
        { field: 'target_value', from: old.target_value, to: target_value },
        { field: 'version', from: old.version, to: old.version + 1 },
      ],
      note: `Update KPI ${old.kpi_code} v${old.version} → v${old.version + 1}`,
    }, async (client) => {
      // Same serialization as POST /projects/:id/kpi-targets (see routes/kpi.js).
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [`kpi:${old.project_id}`, old.kpi_code]);
      // Close old
      await client.query(
        `UPDATE kpi_targets SET effective_to = CURRENT_DATE WHERE id = $1`,
        [old.id]
      );
      const lastV = await client.query(
        `SELECT COALESCE(MAX(version), 0) as v FROM kpi_targets WHERE project_id = $1 AND kpi_code = $2`,
        [old.project_id, old.kpi_code]
      );
      const v = (lastV.rows[0]?.v || 0) + 1;
      const ins = await client.query(
        `INSERT INTO kpi_targets (project_id, kpi_code, name_vi, target_value, unit, period_start, period_end, period_lock, version, effective_from, effective_to, notes, approved_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_DATE, NULL, $10, $11) RETURNING *`,
        [old.project_id, old.kpi_code, name_vi || old.name_vi,
         target_value ?? old.target_value, unit || old.unit, period_start || old.period_start, period_end || old.period_end,
         period_lock !== undefined ? !!period_lock : old.period_lock,
         v, notes || old.notes, req.user.id]
      );
      return ins.rows[0];
    });
    res.json(updated);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

export default router;
