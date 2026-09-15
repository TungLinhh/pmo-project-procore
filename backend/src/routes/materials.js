// Materials routes
// Schema: materials(project_id, zone_id, source_sheet, material_code, name_vi, name_en, progress_pct, request_date_1, delivery_date_1, ... notes)

import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { checkProjectAccess } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

router.post('/', async (req, res) => {
  const db = getDb();
  // Accept both 'code' and 'material_code' from frontend
  const { project_id, code, material_code, zone_id, source_sheet, name_vi, name_en, progress_pct, notes } = req.body || {};
  const codeToUse = material_code || code;
  if (!project_id || !codeToUse) return res.status(400).json({ error: 'project_id and code required' });
  if (!(await checkProjectAccess(req.user, Number(project_id)))) {
    return res.status(404).json({ error: 'Project not found' });
  }
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: 'material', resourceId: 0,
      context: { project_id },
      after: { code: codeToUse, name_vi, name_en },
      note: `Tạo material ${codeToUse}`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO materials (project_id, zone_id, source_sheet, material_code, name_vi, name_en, progress_pct, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [project_id, zone_id || null, source_sheet || null, codeToUse, name_vi, name_en, progress_pct || null, notes || null]
      );
      return ins.rows[0];
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
