// Ingestion: RFA Log (file: HBG-MCR-MM-01.xlsx, etc.)
// PG-only. Mô hình A wizard: parse() returns rows, commit() inserts them.
import { getDb } from '../../db/index.js';
import { recordFailure } from './failures.js';
import { readSheet, toText, toInt, toDate, findDataStart } from '../../lib/excel.js';

const HEADER_KEYWORDS = ['stt', 'tt', 'no', 'no.', 'rfa', 'mcr', 'mã'];

function parseRow(row) {
  const ordinal = toInt(row[0]);
  const rfaCode = toText(row[1]) || toText(row[2]);
  if (!ordinal || !rfaCode) return null;
  return {
    ordinal,
    rfa_code: rfaCode,
    description_vi: toText(row[3]),
    date_ma: toDate(row[6]),
    date_sp: toDate(row[10]),
    date_pm: toDate(row[10]),
    date_tp: toDate(row[10]),
    date_sh: toDate(row[10]),
    approval_date: toDate(row[12]),
  };
}

export async function parse(filePath, projectId) {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheets = [];
  for (const sheetName of wb.SheetNames) {
    const rows = readSheet(filePath, sheetName);
    if (rows.length < 5) continue;
    const dataStart = findDataStart(rows, { codeCol: 0, nameCol: 1, headerKeywords: HEADER_KEYWORDS, maxScan: 40 });
    const sheetRows = [];
    for (let r = dataStart; r < rows.length; r++) {
      const row = rows[r] || [];
      const parsed = parseRow(row);
      if (parsed) sheetRows.push({ rowIndex: r + 1, ...parsed });
    }
    if (sheetRows.length > 0) sheets.push({ sheet: sheetName, rows: sheetRows });
  }
  return { sheets, totalRows: sheets.reduce((s, x) => s + x.rows.length, 0) };
}

export async function commit(parsed, projectId) {
  const db = getDb();
  const report = { doc_type: 'rfa_log', ok: 0, errors: 0, items: [] };
  for (const sheet of parsed.sheets) {
    for (const [idx, row] of sheet.rows.entries()) {
      try {
        await db.upsert('rfa_log',
          { conflictCols: ['project_id', 'rfa_code'] },
          {
            project_id: projectId, source_sheet: sheet.sheet,
            ordinal: row.ordinal, rfa_code: row.rfa_code, description_vi: row.description_vi,
            date_ma: row.date_ma, date_sp: row.date_sp, date_pm: row.date_pm,
            date_tp: row.date_tp, date_sh: row.date_sh, approval_date: row.approval_date,
          }
        );
        report.ok++;
      } catch (e) {
        recordFailure(report, { sheet: sheet.sheet, row: row.rowIndex ?? idx + 1, ref: row.rfa_code, message: e.message, keep: { code: row.rfa_code } });
      }
    }
  }
  return report;
}

export async function ingestRFALog(filePath, projectId) {
  const parsed = await parse(filePath, projectId);
  return await commit(parsed, projectId);
}
