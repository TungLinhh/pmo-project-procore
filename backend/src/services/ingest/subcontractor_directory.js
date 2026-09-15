// Ingestion: Subcontractor Directory (file: Quy trình thuê thầu phụ, tổ đội.xlsx)
// PG-only. Mô hình A wizard: parse() returns rows, commit() inserts them.
import { getDb } from '../../db/index.js';
import { recordFailure } from './failures.js';
import { readSheet, toText, toInt, findDataStart } from '../../lib/excel.js';

const HEADER_KEYWORDS = ['stt', 'tt', 'no', 'no.'];

function parseRow(row) {
  const name = toText(row[1]);
  if (!name) return null;
  return {
    name,
    capability_summary: toText(row[2]),
    status: toText(row[8]) || 'ACTIVE',
    is_internal_team: false,
  };
}

export async function parse(filePath, projectId) {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheets = [];
  for (const sheetName of wb.SheetNames) {
    const rows = readSheet(filePath, sheetName);
    const dataStart = findDataStart(rows, { codeCol: 0, nameCol: 1, headerKeywords: HEADER_KEYWORDS, maxScan: 20 });
    const sheetRows = [];
    for (let r = dataStart; r < rows.length; r++) {
      const parsed = parseRow(rows[r] || []);
      if (parsed) sheetRows.push({ rowIndex: r + 1, ...parsed });
    }
    if (sheetRows.length > 0) sheets.push({ sheet: sheetName, rows: sheetRows });
  }
  return { sheets, totalRows: sheets.reduce((s, x) => s + x.rows.length, 0) };
}

export async function commit(parsed, projectId, tenantId) {
  const db = getDb();
  if (tenantId == null) throw new Error('commit: tenantId required');
  const report = { doc_type: 'subcontractor_directory', ok: 0, errors: 0, items: [] };
  for (const sheet of parsed.sheets) {
    for (const [idx, row] of sheet.rows.entries()) {
      try {
        await db.upsert('subcontractors',
          { conflictCols: ['tenant_id', 'name'] },
          { tenant_id: tenantId, name: row.name, capability_summary: row.capability_summary, status: row.status, is_internal_team: row.is_internal_team }
        );
        report.ok++;
      } catch (e) {
        recordFailure(report, { sheet: sheet.sheet, row: row.rowIndex ?? idx + 1, ref: row.name, message: e.message, keep: { name: row.name } });
      }
    }
  }
  return report;
}

export async function ingestSubcontractorDirectory(filePath, projectId, tenantId) {
  const parsed = await parse(filePath, projectId);
  return await commit(parsed, projectId, tenantId);
}
