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

export default router;
