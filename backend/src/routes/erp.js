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
    `SELECT id, name, sftp_host, sftp_port, sftp_user, secret_env, remote_path, enabled, created_at
     FROM erp_profiles WHERE tenant_id = ? ORDER BY id`
  ).allAsync(req.user.tenant_id);
  res.json(rows);
});

router.post('/profiles', async (req, res) => {
  const db = getDb();
  const { name, sftp_host, sftp_port = 22, sftp_user, secret_env, remote_path } = req.body || {};
  if (!name || !sftp_host || !sftp_user || !secret_env || !remote_path) {
    return res.status(400).json({ error: 'name, sftp_host, sftp_user, secret_env, remote_path required' });
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(secret_env)) {
    return res.status(400).json({ error: 'secret_env must be an ENV VAR NAME (e.g. ACME_SFTP_PASSWORD)' });
  }
  try {
    const row = await withAudit(req, {
      action: 'CREATE', resourceType: 'erp_profile', resourceId: 0,
      after: { name, sftp_host, sftp_port, sftp_user, secret_env, remote_path },
      note: `ERP profile ${name} → ${sftp_user}@${sftp_host}:${remote_path} (secret in ${secret_env})`,
    }, async (client) => {
      const r = await client.query(
        `INSERT INTO erp_profiles (tenant_id, name, sftp_host, sftp_port, sftp_user, secret_env, remote_path)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, name) DO UPDATE SET sftp_host = EXCLUDED.sftp_host, sftp_port = EXCLUDED.sftp_port,
           sftp_user = EXCLUDED.sftp_user, secret_env = EXCLUDED.secret_env, remote_path = EXCLUDED.remote_path
         RETURNING id, name, sftp_host, sftp_port, sftp_user, secret_env, remote_path, enabled, created_at`
      , [req.user.tenant_id, name, sftp_host, sftp_port, sftp_user, secret_env, remote_path]);
      return r.rows[0];
    });
    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: e.message });
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

export default router;
