// Approval chain configuration (Wave 2).
// One chain per (department|default, resource_type). No chain = legacy single-step.
// Writes: admin/ceo only. Reads: any authenticated member.
import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { validateLevels, CHAINABLE_RESOURCES } from '../lib/approval.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

router.get('/', async (req, res) => {
  const db = getDb();
  const { resource_type } = req.query;
  const where = ['c.tenant_id = $1'];
  const params = [req.user.tenant_id];
  let i = 2;
  if (resource_type) { where.push(`c.resource_type = $${i++}`); params.push(resource_type); }
  res.json(await db.prepare(
    `SELECT c.*, d.code AS department_code, d.name_vi AS department_name
     FROM approval_chains c LEFT JOIN departments d ON d.id = c.department_id
     WHERE ${where.join(' AND ')} ORDER BY c.resource_type, c.department_id NULLS FIRST`
  ).allAsync(...params));
});

router.post('/', requireRole('admin', 'ceo'), async (req, res) => {
  const db = getDb();
  const { department_id = null, resource_type, levels } = req.body || {};
  if (!CHAINABLE_RESOURCES.includes(resource_type)) {
    return res.status(400).json({ error: `resource_type must be one of: ${CHAINABLE_RESOURCES.join(', ')}` });
  }
  const v = validateLevels(levels);
  if (!v.ok) return res.status(400).json({ error: v.error });
  if (department_id) {
    const dept = await db.prepare('SELECT id FROM departments WHERE id = ? AND tenant_id = ?').getAsync(department_id, req.user.tenant_id);
    if (!dept) return res.status(404).json({ error: 'Department not found' });
  }
  try {
    const result = await withAudit(req, {
      action: 'CONFIG', resourceType: 'approval_chain', resourceId: 0,
      context: { department_id, resource_type },
      after: { department_id, resource_type, levels },
      note: `Cấu hình chain ${resource_type} (${department_id ? 'dept #' + department_id : 'default'})`,
    }, async (client) => {
      const existing = await client.query(
        department_id
          ? `SELECT id FROM approval_chains WHERE tenant_id = $1 AND department_id = $2 AND resource_type = $3`
          : `SELECT id FROM approval_chains WHERE tenant_id = $1 AND department_id IS NULL AND resource_type = $2`,
        department_id ? [req.user.tenant_id, department_id, resource_type] : [req.user.tenant_id, resource_type]
      );
      if (existing.rows[0]) {
        const r = await client.query(
          `UPDATE approval_chains SET levels = $1 WHERE id = $2 RETURNING *`,
          [JSON.stringify(levels), existing.rows[0].id]
        );
        return r.rows[0];
      }
      const r = await client.query(
        `INSERT INTO approval_chains (tenant_id, department_id, resource_type, levels) VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.user.tenant_id, department_id, resource_type, JSON.stringify(levels)]
      );
      return r.rows[0];
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', requireRole('admin', 'ceo'), async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const old = await db.prepare('SELECT * FROM approval_chains WHERE id = ? AND tenant_id = ?').getAsync(id, req.user.tenant_id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  try {
    await withAudit(req, {
      action: 'CONFIG', resourceType: 'approval_chain', resourceId: Number(req.params.id),
      before: old, after: null,
      note: `Xóa chain ${old.resource_type} (về legacy single-step)`,
    }, async (client) => {
      await client.query(`DELETE FROM approval_chains WHERE id = $1`, [req.params.id]);
      return { ok: true };
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
