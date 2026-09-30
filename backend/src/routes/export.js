// AP ledger CSV export (Wave 3 C2): tenant-scoped, byte-stable columns.
// Vendor import/confirm + profiles/push live in routes/erp.js.
// Mount: /api/export. Enterprise flag.

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireFeature } from '../lib/entitlements.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { need } from '../lib/optional-dep.js';
import { errorBody } from '../lib/error-body.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

// Byte-stable AP ledger columns (golden fixture test pins this order).
export const AP_LEDGER_COLS = [
  'project_code', 'contract_no', 'contract_name', 'vendor_name', 'vendor_tax_id',
  'invoice_no', 'invoice_date', 'invoice_amount', 'invoice_vat',
  'request_no', 'request_date', 'request_amount', 'retention_amount', 'request_status',
  'paid_amount', 'paid_at', 'paid_method',
];

const csvCell = (v) => {
  if (v == null) return '';
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function buildApLedger(projectId) {
  const db = getDb();
  return db.prepare(
    `SELECT p.code AS project_code, c.contract_no, c.contract_name,
            v.name AS vendor_name, v.tax_id AS vendor_tax_id,
            i.invoice_no, i.invoice_date, i.amount AS invoice_amount, i.vat_amount AS invoice_vat,
            pr.request_no, pr.request_date, pr.amount AS request_amount,
            pr.retention_amount, pr.status AS request_status,
            pay.paid_amount, pay.paid_at, pay.paid_method
     FROM contracts c
     JOIN projects p ON p.id = c.project_id
     LEFT JOIN vendors v ON v.id = c.vendor_id
     LEFT JOIN invoices i ON i.contract_id = c.id
     LEFT JOIN payment_requests pr ON pr.invoice_id = i.id
     LEFT JOIN payments pay ON pay.payment_request_id = pr.id
     WHERE c.project_id = ?
     ORDER BY c.contract_no, i.invoice_date, pr.request_date`
  ).allAsync(projectId);
}

// GET /api/export/ap-ledger.csv?project_id= — tenant-scoped via requireProjectAccess.
router.get('/ap-ledger.csv', requireFeature('erp-export'), async (req, res) => {
  const pid = Number(req.query.project_id);
  if (!Number.isInteger(pid)) return res.status(400).json({ error: 'project_id required' });
  const { checkProjectAccess } = await import('../lib/project-access.js');
  if (!(await checkProjectAccess(req.user, pid))) return res.status(404).json({ error: 'Not found' });
  const rows = await buildApLedger(pid);
  const lines = [AP_LEDGER_COLS.join(',')];
  for (const r of rows) lines.push(AP_LEDGER_COLS.map((c) => csvCell(r[c])).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="ap-ledger-${pid}-${Date.now()}.csv"`);
  res.send('\ufeff' + lines.join('\n')); // BOM for Excel VN
});

const reportLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });

// Browser-printable bilingual report. `print=1` opens the browser print dialog;
// users can choose "Save as PDF" without a heavyweight server-side renderer.
router.get('/project-report.html', reportLimiter, async (req, res) => {
  const pid = Number(req.query.project_id);
  if (!Number.isInteger(pid)) return res.status(400).json({ error: 'project_id required' });
  const lang = req.query.lang === 'en' ? 'en' : 'vi';
  const { checkProjectAccess } = await import('../lib/project-access.js');
  if (!(await checkProjectAccess(req.user, pid))) return res.status(404).json({ error: 'Not found' });
  try {
    const { buildProjectPrintHtml } = await import('../lib/project-report-html.js');
    const html = await buildProjectPrintHtml(pid, lang, req.query.print === '1');
    if (!html) return res.status(404).json({ error: 'Not found' });
    await withAudit(req, {
      action: 'EXPORT', resourceType: 'project_report', resourceId: pid,
      context: { project_id: pid, format: 'print_html', lang },
      after: { format: 'print_html', lang }, note: `Xuất báo cáo in project ${pid} (${lang})`,
    }, null);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(html);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

// GET /api/export/project-report.xlsx?project_id= — workbook 6 sheets FR-1.9.
// GĐ1 cho mọi plan (không gắn flag Enterprise): RBAC schedule-read + project
// access. Xuất dữ liệu nhạy cảm được audit và rate-limit ở route.
router.get('/project-report.xlsx', reportLimiter, async (req, res) => {
  const pid = Number(req.query.project_id);
  if (!Number.isInteger(pid)) return res.status(400).json({ error: 'project_id required' });
  const { checkProjectAccess } = await import('../lib/project-access.js');
  if (!(await checkProjectAccess(req.user, pid))) return res.status(404).json({ error: 'Not found' });
  try {
    const { buildProjectReport } = await import('../lib/project-report.js');
    const XLSX = await need('xlsx');
    const built = await buildProjectReport(pid);
    if (!built) return res.status(404).json({ error: 'Not found' });
    const buf = XLSX.write(built.wb, { type: 'buffer', bookType: 'xlsx' });
    await withAudit(req, {
      action: 'EXPORT', resourceType: 'project_report', resourceId: pid,
      context: { project_id: pid, format: 'xlsx' }, after: { format: 'xlsx', bytes: buf.length },
      note: `Xuất Excel project ${pid}`,
    }, null);
    const safe = String(built.code || pid).replace(/[^A-Za-z0-9-_]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="bao-cao-${safe}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.send(buf);
  } catch (e) {
    res.status(e.status || 500).json(errorBody(e));
  }
});

export default router;
