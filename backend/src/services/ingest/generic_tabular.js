// Generic ingestor for tabular files. PG-only. Mô hình A wizard.
import { getDb } from '../../db/index.js';
import { recordFailure } from './failures.js';
import { readSheet, toText, toInt, findDataStart } from '../../lib/excel.js';

const COL_COUNT = 10;
const HEADER_KEYWORDS = ['stt', 'tt', 'no', 'no.'];

function parseRow(row, colCount) {
  const ordinal = toInt(row[0]);
  if (!ordinal) return null;
  const out = { ordinal };
  for (let c = 0; c < colCount; c++) out[`col_${c + 1}`] = toText(row[c + 1]);
  return out;
}

export async function parse(filePath, projectId, options = {}) {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const docType = options.docType || 'generic';
  const sheets = [];
  for (const sheetName of wb.SheetNames) {
    const rows = readSheet(filePath, sheetName);
    if (rows.length < 3) continue;
    const dataStart = findDataStart(rows, { codeCol: 0, nameCol: 1, headerKeywords: HEADER_KEYWORDS, maxScan: 40 });
    const sheetRows = [];
    for (let r = dataStart; r < rows.length; r++) {
      const parsed = parseRow(rows[r] || [], COL_COUNT);
      if (parsed) sheetRows.push({ rowIndex: r + 1, ...parsed });
    }
    if (sheetRows.length > 0) sheets.push({ sheet: sheetName, rows: sheetRows });
  }
  return { docType, sheets, totalRows: sheets.reduce((s, x) => s + x.rows.length, 0) };
}

export async function commit(parsed, projectId, options = {}) {
  const db = getDb();
  const docType = parsed.docType || options.docType || 'generic';
  const report = { doc_type: docType, ok: 0, errors: 0, items: [] };
  for (const sheet of parsed.sheets) {
    for (const [idx, row] of sheet.rows.entries()) {
      try {
        const rowData = { project_id: projectId, doc_type: docType, source_sheet: sheet.sheet, ordinal: row.ordinal };
        for (let c = 0; c < COL_COUNT; c++) rowData[`col_${c + 1}`] = row[`col_${c + 1}`];
        await db.upsert('generic_sheets',
          { conflictCols: ['project_id', 'doc_type', 'source_sheet', 'ordinal'] },
          rowData
        );
        report.ok++;
      } catch (e) {
        recordFailure(report, { sheet: sheet.sheet, row: row.rowIndex ?? idx + 1, message: e.message });
      }
    }
  }
  return report;
}

export async function ingestGenericTabular(filePath, projectId, options = {}) {
  const parsed = await parse(filePath, projectId, options);
  return await commit(parsed, projectId, options);
}
