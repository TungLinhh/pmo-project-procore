// Mô hình A wizard endpoints for Excel upload.
// Flow:
//   1. POST /api/upload                  → upload file, returns upload_id
//   2. POST /api/upload/:id/configure     → set project/zone/doc_type
//   3. POST /api/upload/:id/preview       → parse without DB writes
//   4. POST /api/upload/:id/commit        → actually insert
//
// Additional helper endpoints (Task 2):
//   - POST /api/projects                  → create a new project
//   - POST /api/projects/:id/zones        → create a new zone for a project
import { getDb } from '../db/index.js';
import { requireAuth } from '../lib/auth.js';
import { UPLOAD_STATUS, statusFromCounts } from '../lib/upload-status.js';
import { getFilePath, fileExists } from '../lib/storage.js';
import { listSheets, detectDocType } from '../lib/excel.js';
import { findOrCreateProject, findOrCreateZone, INGESTORS } from '../services/ingest/index.js';
import { checkProjectAccess } from '../lib/project-access.js';

const tenantOf = (req) => req.user.tenant_id;

// Preview summarizer shared by configure + preview. Every ingestor returns
// sheets as { sheet, rows: [...] } — EXCEPT daily_report, whose sheets are
// { sheet, report_date, work_items, materials, manpower, acceptance }.
// Assuming s.rows exists crashed daily confirm with
// "Cannot read properties of undefined (reading 'length')".
function summarizeSheets(sheets) {
  return (sheets || []).map(s => {
    if (Array.isArray(s.rows)) {
      return { sheet: s.sheet, row_count: s.rows.length, sample: s.rows.slice(0, 3) };
    }
    if (Array.isArray(s.work_items)) {
      const secs = [s.work_items, s.materials, s.manpower, s.acceptance].map(a => (Array.isArray(a) ? a.length : 0));
      return {
        sheet: s.sheet,
        report_date: s.report_date || null,
        row_count: secs.reduce((a, b) => a + b, 0),
        sample: s.work_items.slice(0, 3).map(w => ({
          name_vi: w.name_vi, progress_pct: w.progress_pct,
          start_date: w.start_date, finish_date: w.finish_date,
        })),
      };
    }
    return { sheet: s.sheet, row_count: 0, sample: [] };
  });
}

export function registerWizardRoutes(app) {
  // List all available doc_types
  app.get('/api/upload/doc-types', requireAuth, (req, res) => {
    const types = Object.keys(INGESTORS).map(t => ({
      id: t,
      label: t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    }));
    res.json(types);
  });

  // Configure an upload: set project/zone/doc_type. Returns parsed preview.
  app.post('/api/upload/:id/configure', requireAuth, async (req, res) => {
    const db = getDb();
    const uploadId = Number(req.params.id);
    const { project_id, zone_id, doc_type, process_code, new_project, new_zone } = req.body;

    const upload = await db.prepare('SELECT * FROM file_uploads WHERE id = ?').getAsync(uploadId);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });
    if (!fileExists(upload.storage_key)) return res.status(404).json({ error: 'File not found on disk' });

    // Resolve project
    let project = null;
    if (new_project) {
      if (!new_project.code) return res.status(400).json({ error: 'new_project.code required' });
      project = await findOrCreateProject(tenantOf(req), new_project.code, new_project);
    } else if (project_id) {
      project = await db.prepare('SELECT id, code FROM projects WHERE id = ? AND tenant_id = ?').getAsync(project_id, tenantOf(req));
      if (!project) return res.status(404).json({ error: 'Project not found' });
    }
    if (!project) return res.status(400).json({ error: 'project_id or new_project required' });
    // Membership gate (new projects just added the creator as member above).
    if (!(await checkProjectAccess(req.user, project.id))) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Resolve zone
    let zoneId = null;
    let zoneCode = null;
    let zoneAutoCreated = false;
    if (new_zone) {
      if (!new_zone.code) return res.status(400).json({ error: 'new_zone.code required' });
      const z = await findOrCreateZone(project.id, new_zone.code, new_zone.name_en || new_zone.name_vi);
      zoneId = z.id;
      zoneCode = z.code;
      zoneAutoCreated = true;
    } else if (zone_id) {
      const z = await db.prepare('SELECT id, code FROM zones WHERE id = ? AND project_id = ?').getAsync(zone_id, project.id);
      if (!z) return res.status(404).json({ error: 'Zone not found in this project' });
      zoneId = z.id;
      zoneCode = z.code;
    }

    // Resolve doc_type
    const finalDocType = doc_type || upload.expected_doc_type || detectDocType(upload.original_filename);
    if (!INGESTORS[finalDocType]) return res.status(400).json({ error: `Unknown doc_type: ${finalDocType}`, available: Object.keys(INGESTORS) });

    // Save config into upload row
    await db.prepare(`
      UPDATE file_uploads SET project_id = ?, zone_id = ?, expected_doc_type = ?, status = '${UPLOAD_STATUS.CONFIGURED}'
      WHERE id = ?
    `).runAsync(project.id, zoneId, finalDocType, uploadId);

    // Run parse() so user gets preview immediately
    const fullPath = getFilePath(upload.storage_key);
    const ingestor = INGESTORS[finalDocType];
    const opts = { tenantId: tenantOf(req), projectId: project.id, zoneCode, processCode: process_code };
    try {
      const parsed = await ingestor.parse(fullPath, opts);
      // Cache parsed data as JSON in file_uploads.report_json for commit step
      await db.prepare('UPDATE file_uploads SET report_json = ? WHERE id = ?').runAsync(JSON.stringify(parsed), uploadId);
      res.json({
        upload_id: uploadId,
        project: { id: project.id, code: project.code },
        zone: parsed.zone || { code: zoneCode, name: zoneCode },
        zone_auto_created: zoneAutoCreated,
        doc_type: finalDocType,
        total_rows: parsed.totalRows,
        sheets: summarizeSheets(parsed.sheets),
        message: 'Configure OK. POST /api/upload/:id/commit to insert, or POST /api/upload/:id/preview to refresh.',
      });
    } catch (e) {
      res.status(500).json({ error: e.message, stack: e.stack });
    }
  });

  // Refresh preview (re-parse without changing config)
  app.post('/api/upload/:id/preview', requireAuth, async (req, res) => {
    const db = getDb();
    const uploadId = Number(req.params.id);
    const upload = await db.prepare('SELECT * FROM file_uploads WHERE id = ?').getAsync(uploadId);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });
    if (!upload.expected_doc_type) return res.status(400).json({ error: 'Not configured yet. POST /api/upload/:id/configure first.' });
    const ingestor = INGESTORS[upload.expected_doc_type];
    if (!ingestor) return res.status(400).json({ error: 'Unknown doc_type' });

    let zoneCode = null;
    if (upload.zone_id) {
      const z = await db.prepare('SELECT code FROM zones WHERE id = ?').getAsync(upload.zone_id);
      zoneCode = z?.code;
    }
    const fullPath = getFilePath(upload.storage_key);
    const opts = { tenantId: tenantOf(req), projectId: upload.project_id, zoneCode };
    try {
      const parsed = await ingestor.parse(fullPath, opts);
      await db.prepare('UPDATE file_uploads SET report_json = ? WHERE id = ?').runAsync(JSON.stringify(parsed), uploadId);
      res.json({
        upload_id: uploadId,
        doc_type: upload.expected_doc_type,
        total_rows: parsed.totalRows,
        sheets: summarizeSheets(parsed.sheets),
      });
    } catch (e) {
      res.status(500).json({ error: e.message, stack: e.stack });
    }
  });

  // Commit: actually insert parsed data into DB
  app.post('/api/upload/:id/commit', requireAuth, async (req, res) => {
    const db = getDb();
    const uploadId = Number(req.params.id);
    const upload = await db.prepare('SELECT * FROM file_uploads WHERE id = ?').getAsync(uploadId);
    if (!upload) return res.status(404).json({ error: 'Upload not found' });
    if (!upload.expected_doc_type) return res.status(400).json({ error: 'Not configured yet' });
    const ingestor = INGESTORS[upload.expected_doc_type];
    if (!ingestor) return res.status(400).json({ error: 'Unknown doc_type' });
    if (!upload.report_json) return res.status(400).json({ error: 'No cached preview. POST /api/upload/:id/preview first.' });

    const parsed = typeof upload.report_json === 'string' ? JSON.parse(upload.report_json) : upload.report_json;
    if (!parsed || !parsed.sheets) return res.status(400).json({ error: 'No parsed data. POST /api/upload/:id/configure or /preview first.' });
    if (upload.project_id && !(await checkProjectAccess(req.user, upload.project_id))) {
      return res.status(404).json({ error: 'Project not found' });
    }
    let zoneCode = null;
    if (upload.zone_id) {
      const z = await db.prepare('SELECT code FROM zones WHERE id = ?').getAsync(upload.zone_id);
      zoneCode = z?.code;
    }
    if (!zoneCode && parsed?.zone?.code) zoneCode = parsed.zone.code;  // fallback to parsed zone
    const opts = { tenantId: tenantOf(req), projectId: upload.project_id, zoneCode, uploadId };
    try {
      const result = await ingestor.commit(parsed, opts);
      const totalOk = result.ok || result.total?.ok || 0;
      const totalErr = result.errors || result.total?.errors || 0;
      const status = result.skipped === 'reference' ? UPLOAD_STATUS.SKIPPED_REFERENCE : statusFromCounts(totalOk, totalErr);
      await db.prepare(`
        UPDATE file_uploads SET status = ?, total_rows = ?, ok_rows = ?, error_rows = ?, report_json = ?
        WHERE id = ?
      `).runAsync(status, totalOk + totalErr, totalOk, totalErr, JSON.stringify(result), uploadId);
      res.json({ upload_id: uploadId, status, ...result });
    } catch (e) {
      await db.prepare(`UPDATE file_uploads SET status = '${UPLOAD_STATUS.FAILED}', report_json = ? WHERE id = ?`).runAsync(JSON.stringify({ error: e.message }), uploadId);
      res.status(500).json({ error: e.message, stack: e.stack });
    }
  });

  // Create a new project
  app.post('/api/projects', requireAuth, async (req, res) => {
    const db = getDb();
    const { code, name_vi, name_en, package: pkg, rev_prefix } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });
    const existing = await db.prepare('SELECT id FROM projects WHERE tenant_id = ? AND code = ?').getAsync(tenantOf(req), code);
    if (existing) return res.status(409).json({ error: 'Project code already exists', id: existing.id });
    const r = await db.prepare(`
      INSERT INTO projects (tenant_id, code, name_vi, name_en, package, rev_prefix)
      VALUES (?, ?, ?, ?, ?, ?)
    `).runAsync(tenantOf(req), code, name_vi || code, name_en || null, pkg || null, rev_prefix || null);
    const project = await db.prepare('SELECT * FROM projects WHERE id = ?').getAsync(r.lastInsertRowid);
    // Creator is always a member (else they lock themselves out under requireProjectAccess).
    // Explicit RETURNING: wrapper auto-appends RETURNING id, table has none.
    await db.prepare('INSERT INTO project_members (project_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING project_id').runAsync(project.id, req.user.id);
    res.status(201).json(project);
  });

  // Create a new zone for a project
  app.post('/api/projects/:id/zones', requireAuth, async (req, res) => {
    const db = getDb();
    const projectId = Number(req.params.id);
    const { code, name_vi, name_en } = req.body;
    if (!code) return res.status(400).json({ error: 'code is required' });
    const project = await db.prepare('SELECT id, code FROM projects WHERE id = ? AND tenant_id = ?').getAsync(projectId, tenantOf(req));
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const existing = await db.prepare('SELECT id FROM zones WHERE project_id = ? AND code = ?').getAsync(projectId, code);
    if (existing) return res.status(409).json({ error: 'Zone code already exists in this project', id: existing.id });
    const z = await findOrCreateZone(projectId, code, name_en || name_vi);
    const zone = await db.prepare('SELECT * FROM zones WHERE id = ?').getAsync(z.id);
    res.status(201).json(zone);
  });
}
