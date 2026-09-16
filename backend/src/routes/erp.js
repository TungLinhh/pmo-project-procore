// ERP profiles + push log (Wave 3 C2). Admin/CEO/accounting, Enterprise flag.
// Push itself is manual (POST /api/jobs/erp-push) — no auto-cron in v1:
// accountants pull on their close schedule; automation comes after the manual
// loop proves itself. Mount: /api/erp.
import { Router } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireFeature } from '../lib/entitlements.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);
router.use(requireRole('admin', 'ceo', 'accounting'));
router.use(requireFeature('erp-export'));

router.get('/profiles', async (req, res) => {
  const db = getDb();
  // Secret values never leave env: present only as a boolean.
  const rows = await db.prepare(
    `SELECT id, name, connector, sftp_host, sftp_port, sftp_user, secret_env, remote_path, config, enabled, created_at
     FROM erp_profiles WHERE tenant_id = ? ORDER BY id`
  ).allAsync(req.user.tenant_id);
  res.json(rows);
});

router.post('/profiles', async (req, res) => {
  const db = getDb();
  const { name, connector = 'sftp', sftp_host, sftp_port = 22, sftp_user, secret_env, remote_path, config = {} } = req.body || {};
  if (!['sftp', 'fast', 'webhook'].includes(connector)) return res.status(400).json({ error: 'connector must be sftp|fast|webhook' });
  if (!name || !secret_env) return res.status(400).json({ error: 'name + secret_env required' });
  if (!/^[A-Z][A-Z0-9_]*$/.test(secret_env)) {
    return res.status(400).json({ error: 'secret_env must be an ENV VAR NAME (e.g. ACME_SFTP_PASSWORD)' });
  }
  if (connector === 'sftp' && (!sftp_host || !sftp_user || !remote_path)) {
    return res.status(400).json({ error: 'sftp needs sftp_host, sftp_user, remote_path' });
  }
  if (connector === 'webhook') {
    const url = config?.url;
    if (!url || !/^https?:\/\//.test(url)) return res.status(400).json({ error: 'webhook needs config.url (http/https)' });
  }
  if (connector === 'fast' && !(config?.base_url)) {
    return res.status(400).json({ error: 'fast needs config.base_url' });
  }
  try {
    const row = await withAudit(req, {
      action: 'CREATE', resourceType: 'erp_profile', resourceId: 0,
      after: { name, connector, sftp_host, sftp_port, sftp_user, secret_env, remote_path, config },
      note: `ERP profile ${name} [${connector}] (secret in ${secret_env})`,
    }, async (client) => {
      const r = await client.query(
        `INSERT INTO erp_profiles (tenant_id, name, connector, sftp_host, sftp_port, sftp_user, secret_env, remote_path, config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (tenant_id, name) DO UPDATE SET connector = EXCLUDED.connector, sftp_host = EXCLUDED.sftp_host,
           sftp_port = EXCLUDED.sftp_port, sftp_user = EXCLUDED.sftp_user, secret_env = EXCLUDED.secret_env,
           remote_path = EXCLUDED.remote_path, config = EXCLUDED.config
         RETURNING id, name, connector, sftp_host, sftp_port, sftp_user, secret_env, remote_path, config, enabled, created_at`
      , [req.user.tenant_id, name, connector, sftp_host || null, sftp_port, sftp_user || null, secret_env, remote_path || null, JSON.stringify(config || {})]);
      return r.rows[0];
    });
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/erp/webhooks/test {profile_id} — fires a ping event at the sub.
router.post('/webhooks/test', async (req, res) => {
  const db = getDb();
  const { profile_id } = req.body || {};
  const p = await db.prepare('SELECT * FROM erp_profiles WHERE id = ? AND tenant_id = ?').getAsync(profile_id, req.user.tenant_id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (p.connector !== 'webhook') return res.status(422).json({ error: 'profile is not a webhook' });
  try {
    const { deliverWebhook } = await import('../lib/erp-webhook.js');
    res.json(await deliverWebhook({ tenantId: req.user.tenant_id, profile: p, event: { type: 'ping', data: { profile: p.name } } }));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete('/profiles/:id', async (req, res) => {
  const db = getDb();
  const p = await db.prepare('SELECT * FROM erp_profiles WHERE id = ? AND tenant_id = ?').getAsync(req.params.id, req.user.tenant_id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  try {
    await withAudit(req, {
      action: 'DELETE', resourceType: 'erp_profile', resourceId: Number(p.id),
      before: { name: p.name }, after: null, note: `Xóa ERP profile ${p.name}`,
    }, async (client) => {
      await client.query('DELETE FROM erp_profiles WHERE id = $1', [p.id]);
      return { ok: true };
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/push-log', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare(
    `SELECT l.*, p.name AS profile_name FROM erp_push_log l
     LEFT JOIN erp_profiles p ON p.id = l.profile_id
     WHERE l.tenant_id = ? ORDER BY l.created_at DESC LIMIT 100`
  ).allAsync(req.user.tenant_id));
});

// --- vendor import: parse CSV (memory, ≤5MB) → trigram suggestions, no writes.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function parseVendorCsv(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const split = (l) => l.split(',').map((c) => c.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1, 501).map(split).filter((c) => c.some(Boolean));
  return { headers, rows };
}

// POST /api/erp/vendors/import (multipart `file`) — suggest-only matching.
router.post('/vendors/import', requireFeature('erp-export'), requireRole('admin', 'ceo', 'procurement', 'accounting'), upload.single('file'), async (req, res) => {
  const db = getDb();
  if (!req.file) return res.status(400).json({ error: 'No file (field: file)' });
  const { headers, rows } = parseVendorCsv(req.file.buffer.toString('utf8'));
  const nameIdx = headers.findIndex((h) => ['name', 'ten', 'vendor', 'ncc'].includes(h));
  const taxIdx = headers.findIndex((h) => ['tax_id', 'taxid', 'mst', 'tax'].includes(h));
  if (nameIdx < 0) return res.status(400).json({ error: 'CSV needs a name/ten column' });
  const vendors = await db.prepare('SELECT id, name, tax_id FROM vendors WHERE tenant_id = ?').allAsync(req.user.tenant_id);
  const suggestions = [];
  for (const cols of rows) {
    const name = (cols[nameIdx] || '').trim();
    if (!name) continue;
    const tax = taxIdx >= 0 ? (cols[taxIdx] || '').trim() : '';
    let best = null;
    for (const v of vendors) {
      const sim = await db.prepare('SELECT similarity(?, ?) AS s').getAsync(name, v.name);
      if (!best || sim.s > best.similarity) best = { vendor_id: v.id, vendor_name: v.name, current_tax_id: v.tax_id, similarity: Number(sim.s.toFixed(3)) };
    }
    suggestions.push({ name, tax_id: tax, match: best && best.similarity >= 0.4 ? best : null });
  }
  res.json({ rows: rows.length, suggestions: suggestions.slice(0, 200) });
});

// POST /api/erp/vendors/confirm {vendor_id, tax_id} — the ONLY write path.
router.post('/vendors/confirm', requireFeature('erp-export'), requireRole('admin', 'ceo', 'procurement', 'accounting'), async (req, res) => {
  const db = getDb();
  const { vendor_id, tax_id } = req.body || {};
  if (!Number.isInteger(vendor_id) || !tax_id || typeof tax_id !== 'string') {
    return res.status(400).json({ error: 'vendor_id (int) + tax_id (string) required' });
  }
  const v = await db.prepare('SELECT * FROM vendors WHERE id = ? AND tenant_id = ?').getAsync(vendor_id, req.user.tenant_id);
  if (!v) return res.status(404).json({ error: 'Not found' });
  try {
    const row = await withAudit(req, {
      action: 'UPDATE', resourceType: 'vendor', resourceId: vendor_id,
      before: { tax_id: v.tax_id }, after: { tax_id: tax_id.trim() },
      fieldChanges: [{ field: 'tax_id', from: v.tax_id, to: tax_id.trim() }],
      note: `ERP confirm tax_id cho ${v.name}`,
    }, async (client) => {
      const r = await client.query('UPDATE vendors SET tax_id = $1 WHERE id = $2 RETURNING id, name, tax_id', [tax_id.trim(), vendor_id]);
      return r.rows[0];
    });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/erp/fast/vendors?profile_id= — pull vendor tax list (suggest-only;
// writes go through /erp/vendors/confirm like CSV matches).
router.get('/fast/vendors', requireRole('admin', 'ceo', 'procurement', 'accounting'), async (req, res) => {
  const pid = Number(req.query.profile_id);
  if (!Number.isInteger(pid)) return res.status(400).json({ error: 'profile_id required' });
  try {
    const { pullFastVendors } = await import('../lib/erp-fast.js');
    const db = getDb();
    const profile = await db.prepare('SELECT * FROM erp_profiles WHERE id = ? AND tenant_id = ?').getAsync(pid, req.user.tenant_id);
    if (!profile) return res.status(404).json({ error: 'Not found' });
    const vendors = await pullFastVendors({ tenantId: req.user.tenant_id, profileId: pid });
    // Attach local matches (same trigram rule as CSV import).
    const local = await db.prepare('SELECT id, name, tax_id FROM vendors WHERE tenant_id = ?').allAsync(req.user.tenant_id);
    const out = [];
    for (const v of vendors) {
      let best = null;
      for (const l of local) {
        const sim = await db.prepare('SELECT similarity(?, ?) AS s').getAsync(v.name, l.name);
        if (!best || sim.s > best.similarity) best = { vendor_id: l.id, vendor_name: l.name, current_tax_id: l.tax_id, similarity: Number(sim.s.toFixed(3)) };
      }
      out.push({ ...v, match: best && best.similarity >= 0.4 ? best : null });
    }
    res.json({ count: out.length, vendors: out.slice(0, 200) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export default router;
