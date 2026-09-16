// Master data — generic CRUD cho vendors, subcontractors, suppliers, workers, teams, cost_codes
// Cú pháp: GET /api/master-data/:resource trả về list, POST để tạo mới

import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

const TABLES = {
  vendors: 'vendors',
  subcontractors: 'subcontractors',
  suppliers: 'suppliers',
  workers: 'workers',
  teams: 'teams',
  cost_codes: 'cost_codes',
  resources: 'resources',
  business_processes: 'business_processes',
  'business-processes': 'business_processes',
  departments: 'departments',
};

router.get('/:resource', async (req, res) => {
  const table = TABLES[req.params.resource];
  if (!table) return res.status(404).json({ error: `Unknown resource: ${req.params.resource}` });
  const db = getDb();
  // departments is tenant-scoped (chains resolve per tenant).
  if (table === 'departments') {
    return res.json(await db.prepare('SELECT * FROM departments WHERE tenant_id = ? ORDER BY id LIMIT 500').allAsync(req.user.tenant_id));
  }
  res.json(await db.prepare(`SELECT * FROM ${table} ORDER BY id LIMIT 500`).allAsync());
});

router.post('/:resource', async (req, res) => {
  const table = TABLES[req.params.resource];
  if (!table) return res.status(404).json({ error: `Unknown resource` });
  const db = getDb();
  const data = { ...(req.body || {}), tenant_id: req.user.tenant_id };
  const cols = Object.keys(data);
  if (!cols.length) return res.status(400).json({ error: 'Empty body' });
  // Resource-specific validation: required human columns per table.
  // (The old regex-only filter accepted any valid-looking column and 500'd
  // on unknown ones with no hint about what a resource actually needs.)
  const REQUIRED = {
    vendors: ['name'], subcontractors: ['name'], suppliers: ['name'],
    workers: ['full_name'], teams: ['name'], cost_codes: ['code'],
    resources: ['name'], business_processes: ['code'], departments: ['code', 'name_vi'],
  };
  const required = REQUIRED[table] || ['name'];
  const missing = required.filter(c => data[c] == null || String(data[c]).trim() === '');
  if (missing.length) return res.status(400).json({ error: `${table} requires: ${missing.join(', ')}` });
  // Whitelist common columns
  const safe = cols.filter(c => /^[a-z_]+$/i.test(c));
  if (!safe.length) return res.status(400).json({ error: 'No valid columns' });
  // Nested departments (Wave D2): parent must live in this tenant.
  // No cycle check needed on CREATE — a brand-new row has no children, so it
  // cannot close a loop by construction. PATCH validates acyclicity.
  if (table === 'departments' && data.parent_id != null) {
    const parent = await db.prepare('SELECT id FROM departments WHERE id = ? AND tenant_id = ?').getAsync(data.parent_id, req.user.tenant_id);
    if (!parent) return res.status(404).json({ error: 'Parent department not found in this tenant' });
  }
  const placeholders = safe.map((_, i) => `$${i + 1}`).join(', ');
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: table, resourceId: 0,
      context: {},
      after: data,
      note: `Tạo ${table}`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO ${table} (${safe.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        // pg doesn't serialize objects — stringify JSON columns (e.g. levels) explicitly.
        safe.map(c => (data[c] !== null && typeof data[c] === 'object' ? JSON.stringify(data[c]) : data[c]))
      );
      return ins.rows[0];
    });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/master-data/departments/:id — rename / reparent (Wave D2).
// parent_id validated same-tenant + acyclic; null detaches to root.
router.patch('/departments/:id', async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const old = await db.prepare('SELECT * FROM departments WHERE id = ? AND tenant_id = ?').getAsync(id, req.user.tenant_id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const { code, name_vi, parent_id = undefined } = req.body || {};
  if (parent_id !== undefined) {
    const { validateDeptParent } = await import('../lib/approval.js');
    const v = await validateDeptParent(db, req.user.tenant_id, id, parent_id);
    if (!v.ok) return res.status(422).json({ error: v.error });
  }
  const patch = {};
  if (code !== undefined) patch.code = String(code);
  if (name_vi !== undefined) patch.name_vi = String(name_vi);
  if (parent_id !== undefined) patch.parent_id = parent_id;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
  try {
    const result = await withAudit(req, {
      action: 'UPDATE', resourceType: 'departments', resourceId: id,
      before: { code: old.code, name_vi: old.name_vi, parent_id: old.parent_id },
      after: { ...old, ...patch },
      fieldChanges: Object.keys(patch).map((k) => ({ field: k, from: old[k], to: patch[k] })),
      note: `Sửa bộ phận ${old.code}`,
    }, async (client) => {
      const cols = Object.keys(patch);
      const r = await client.query(
        `UPDATE departments SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1} RETURNING *`,
        [...cols.map((c) => patch[c]), id]
      );
      return r.rows[0];
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
