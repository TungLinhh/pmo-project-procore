// Ingestion router — dispatches by doc_type
// Each ingestor now exposes parse() (read file → rows) and commit() (rows → DB).
// ingest() is a backward-compatible wrapper that calls parse() then commit().
//
// Wizard flow (Mô hình A):
//   1. POST /api/upload         → upload file, returns upload_id
//   2. POST /api/upload/:id/configure → set project_id, zone_id, doc_type
//   3. POST /api/upload/:id/preview   → returns parsed rows (no DB writes)
//   4. POST /api/upload/:id/commit    → actually inserts the rows
import { ingestDailyReport } from './daily_report.js';
import { ingestBusinessProcess } from './business_process.js';
import { ingestShopDrawing } from './shop_drawing.js';
import { ingestConstructionSchedule } from './construction_schedule.js';
import { ingestMaterialSupply } from './material_supply.js';
import { ingestSubcontractorDirectory } from './subcontractor_directory.js';
import { ingestResourceDirectory } from './resource_directory.js';
import { ingestRFALog } from './rfa_log.js';
import { ingestGenericTabular } from './generic_tabular.js';
import { ingestProjectLevel } from './project_level.js';
import { getDb } from '../../db/index.js';

const GENERIC_TYPES = new Set(['manpower_master_plan', 'shop_master', 'work_management', 'other_approved', 'file_index', 'zone_map', 'payment_progress']);
const PROJECT_LEVEL_TYPES = new Set(['construction_schedule', 'shop_drawing', 'material_supply']);

// Map doc_type → { parse(filePath, opts), commit(parsed, opts) }
import { parse as parseDailyReport, commit as commitDailyReport } from './daily_report.js';
import { parse as parseBusinessProcess, commit as commitBusinessProcess } from './business_process.js';
import { parse as parseShopDrawing, commit as commitShopDrawing } from './shop_drawing.js';
import { parse as parseConstructionSchedule, commit as commitConstructionSchedule } from './construction_schedule.js';
import { parse as parseMaterialSupply, commit as commitMaterialSupply } from './material_supply.js';
import { parse as parseSubcontractorDirectory, commit as commitSubcontractorDirectory } from './subcontractor_directory.js';
import { parse as parseResourceDirectory, commit as commitResourceDirectory } from './resource_directory.js';
import { parse as parseRFALog, commit as commitRFALog } from './rfa_log.js';
import { parse as parseGenericTabular, commit as commitGenericTabular } from './generic_tabular.js';
import { parse as parseProjectLevel, commit as commitProjectLevel } from './project_level.js';
import { parse as parseSpAp, commit as commitSpAp } from './sp_ap.js';
import { parse as parsePaymentAr, commit as commitPaymentAr } from './payment_ar.js';

export const INGESTORS = {
  daily_report: {
    parse: (fp, opts) => parseDailyReport(fp, opts.projectId),
    commit: (parsed, opts) => commitDailyReport(parsed, opts.projectId),
  },
  business_process: {
    parse: (fp, opts) => parseBusinessProcess(fp, opts.tenantId, opts.processCode || 'project_execution'),
    commit: (parsed, opts) => commitBusinessProcess(parsed, opts.tenantId, opts.processCode || 'project_execution'),
  },
  shop_drawing: {
    parse: (fp, opts) => parseShopDrawing(fp, opts.projectId, opts.zoneCode),
    commit: (parsed, opts) => commitShopDrawing(parsed, opts.projectId, opts.zoneCode, opts.uploadId),
  },
  construction_schedule: {
    parse: (fp, opts) => parseConstructionSchedule(fp, opts.projectId, opts.zoneCode),
    commit: (parsed, opts) => commitConstructionSchedule(parsed, opts.projectId, opts.zoneCode, opts.uploadId),
  },
  material_supply: {
    parse: (fp, opts) => parseMaterialSupply(fp, opts.projectId, opts.zoneCode),
    commit: (parsed, opts) => commitMaterialSupply(parsed, opts.projectId, opts.zoneCode, opts.uploadId),
  },
  subcontractor_directory: {
    parse: (fp, opts) => parseSubcontractorDirectory(fp, opts.projectId),
    commit: (parsed, opts) => commitSubcontractorDirectory(parsed, opts.projectId, opts.tenantId),
  },
  resource_directory: {
    parse: (fp, opts) => parseResourceDirectory(fp, opts.tenantId),
    commit: (parsed, opts) => commitResourceDirectory(parsed, opts.tenantId),
  },
  rfa_log: {
    parse: (fp, opts) => parseRFALog(fp, opts.projectId),
    commit: (parsed, opts) => commitRFALog(parsed, opts.projectId),
  },
  // Supplier-AP: same register grain as material_supply + payment columns.
  // The ONLY ingestor writing money tables (contracts/invoices/PRs/payments).
  supplier_payment: {
    parse: (fp, opts) => parseSpAp(fp, opts.projectId, opts.zoneCode),
    commit: (parsed, opts) => commitSpAp(parsed, opts.projectId, opts.zoneCode),
  },
  // AR (phải thu từ CĐT): writes ONLY ar_contracts/ar_lines, never AP tables.
  payment_ar: {
    parse: (fp, opts) => parsePaymentAr(fp, opts.projectId),
    commit: (parsed, opts) => commitPaymentAr(parsed, opts.projectId, opts.zoneCode, opts.uploadId),
  },
};

for (const t of GENERIC_TYPES) {
  INGESTORS[t] = {
    parse: (fp, opts) => parseGenericTabular(fp, opts.projectId, { docType: t }),
    commit: (parsed, opts) => commitGenericTabular(parsed, opts.projectId, { docType: t }),
  };
}

// Reference-only stub: work-breakdown navigators (SƠ ĐỒ CÂY) carry data in
// drawing shapes, not cells — nothing to parse. parse() succeeds with zero
// rows so the file is *classified*, commit() reports a skip (not a failure)
// so the review queue shows SKIPPED_REFERENCE with a reason.
INGESTORS.work_breakdown = {
  parse: async (fp, opts) => ({ zone: null, sheets: [], totalRows: 0, reference_only: true, note: 'Drawing-shapes only, no cell data' }),
  commit: async (parsed, opts) => ({ ok: 0, errors: 0, skipped: 'reference', items: [], note: 'Reference file, nothing committed' }),
};

// Backward-compatible: parse + commit in one call
export async function ingest(filePath, docType, opts) {
  const i = INGESTORS[docType];
  if (!i) {
    if (PROJECT_LEVEL_TYPES.has(docType)) {
      // Project-level: parse each sheet, return parsed per sheet
      return await ingestProjectLevel.parse(filePath, opts.projectId, { docType });
    }
    throw new Error(`Doc type '${docType}' not yet supported. Add an ingestor.`);
  }
  const parsed = await i.parse(filePath, opts);
  return await i.commit(parsed, opts);
}

// Project-level file (multi-zone summary)
export async function ingestProjectLevelFile(filePath, projectId, docType) {
  if (!PROJECT_LEVEL_TYPES.has(docType)) {
    throw new Error(`Doc type '${docType}' not supported for project-level ingestion`);
  }
  return await ingestProjectLevel.parse(filePath, projectId, { docType });
}

export async function findOrCreateProject(tenantId, projectCode, extra = {}) {
  const db = getDb();
  let project = await db.prepare('SELECT id FROM projects WHERE tenant_id = ? AND code = ?').getAsync(tenantId, projectCode);
  if (!project) {
    const r = await db.prepare(`
      INSERT INTO projects (tenant_id, code, name_vi, name_en, package, rev_prefix)
      VALUES (?, ?, ?, ?, ?, ?)
    `).runAsync(tenantId, projectCode, extra.name_vi || projectCode, extra.name_en || null, extra.package || null, extra.rev_prefix || null);
    project = { id: Number(r.lastInsertRowid) };
  }
  return project;
}

export async function findOrCreateZone(projectId, zoneCode, zoneName = null) {
  const db = getDb();
  const code = String(zoneCode).trim();
  if (!code) return null;
  let zone = await db.prepare('SELECT id, code FROM zones WHERE project_id = ? AND code = ?').getAsync(projectId, code);
  if (!zone) {
    const r = await db.prepare('INSERT INTO zones (project_id, code, name_vi, name_en) VALUES (?, ?, ?, ?)').runAsync(projectId, code, zoneName || code, zoneName || code);
    zone = { id: Number(r.lastInsertRowid), code };
  }
  return zone;
}
