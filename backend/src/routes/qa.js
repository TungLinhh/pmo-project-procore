// QA/QC inspections (trụ cột mở rộng — NFR, SRS Mục 5 sau L4).
// Nghiệm thu: POST tạo OPEN → PATCH chuyển PASSED/FAILED (422 nếu sai).
// RBAC qua module issue (PM own / SITE assigned ghi; PMO đọc) — xem map
// permission-middleware. Mount: /api (xem index.js).
import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireProjectAccess, checkProjectAccess } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { readPage, withTotal } from '../lib/pagination.js';
import { withAudit } from '../lib/with-audit.js';
import { checkQaTransition } from '../lib/pillars.js';
import { errorBody } from '../lib/error-body.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use('/projects/:id', requireProjectAccess());
router.use(permissionMiddleware);

router.get('/projects/:id/qa-inspections', async (req, res) => {
  const db = getDb();
  const { limit, offset } = readPage(req.query);
  const projectId = Number(req.params.id);
  const rows = await db.prepare(
    `SELECT q.*, z.code AS zone_code FROM qa_inspections q
     LEFT JOIN zones z ON z.id = q.zone_id
     WHERE q.project_id = ? ORDER BY q.id DESC LIMIT ? OFFSET ?`
  ).allAsync(projectId, limit, offset);
  const [{ total }] = await db.prepare(
    'SELECT count(*)::int AS total FROM qa_inspections WHERE project_id = ?'
  ).allAsync(projectId);
  withTotal(res, total);
  res.json(rows);
});

router.post('/projects/:id/qa-inspections', async (req, res) => {
  const db = getDb();
  const pid = Number(req.params.id);
  const { code, title_vi, zone_id, inspected_at, inspector, note } = req.body || {};
  if (!code || !title_vi) return res.status(400).json({ error: 'code + title_vi required' });
  try {
    const row = await withAudit(req, {
      action: 'CREATE', resourceType: 'qa_inspection',
      context: { project_id: pid },
      after: { code, title_vi, status: 'OPEN' },
      note: `Nghiệm thu ${code}: ${String(title_vi).slice(0, 80)}`,
    }, async (client) => {
      // The zone FK is existence-only, so an unvalidated zone_id let a member
      // of project A attach project B's zone — and the list query then leaked
      // B's zone_code into A's view.
      if (zone_id != null) {
        const zone = (await client.query('SELECT id FROM zones WHERE id = $1 AND project_id = $2', [zone_id, pid])).rows[0];
        if (!zone) throw Object.assign(new Error('Zone not found in this project'), { status: 404 });
      }
      const r = await client.query(
        `INSERT INTO qa_inspections (tenant_id, project_id, zone_id, code, title_vi, inspected_at, inspector, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [req.user.tenant_id, pid, zone_id || null, String(code).slice(0, 50), String(title_vi),
          inspected_at || null, inspector ? String(inspector).slice(0, 200) : null,
          note ? String(note).slice(0, 2000) : null, req.user.id]
      );
      return r.rows[0];
    });
    res.status(201).json(row);
  } catch (e) {
    if (String(e.code) === '23505') return res.status(409).json({ error: 'Mã nghiệm thu đã tồn tại trong dự án' });
    res.status(e.status || 500).json(errorBody(e));
  }
});

router.patch('/qa-inspections/:id', async (req, res) => {
  const db = getDb();
  const sc = await db.prepare('SELECT * FROM qa_inspections WHERE id = ?').getAsync(req.params.id);
  if (!sc) return res.status(404).json({ error: 'Not found' });
  if (!(await checkProjectAccess(req.user, sc.project_id))) return res.status(404).json({ error: 'Not found' });
  const to = String(req.body?.status || '').toUpperCase();
  const t = checkQaTransition(sc.status, to);
  if (!t.ok) return res.status(422).json({ error: t.error });
  try {
    const row = await withAudit(req, {
      action: 'TRANSITION', resourceType: 'qa_inspection', resourceId: Number(sc.id),
      context: { project_id: sc.project_id },
      before: { status: sc.status },
      after: { status: to },
      fieldChanges: [{ field: 'status', from: sc.status, to }],
      note: `Nghiệm thu ${sc.code}: ${sc.status} → ${to}`,
    }, async (client) => {
      const r = await client.query(
        `UPDATE qa_inspections SET status = $1, updated_at = now() WHERE id = $2 AND status = $3 RETURNING *`,
        [to, sc.id, sc.status]
      );
      if (r.rowCount !== 1) throw Object.assign(new Error('Inspection đã được cập nhật bởi phiên khác'), { status: 409 });
      return r.rows[0];
    });
    res.json(row);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

export default router;
