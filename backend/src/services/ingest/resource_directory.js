// Ingestion: Resource Directory (file: Danh sách nguồn lực công ty.xlsx)
// PG-only. Mô hình A wizard: parse() returns rows, commit() inserts them.
import { getDb } from '../../db/index.js';
import { recordFailure } from './failures.js';
import { readSheet, readWorkbook, toText, toInt, findDataStart } from '../../lib/excel.js';

const HEADER_KEYWORDS = ['stt', 'tt', 'no', 'no.'];

function isSupplierSheet(name) {
  const n = name.toLowerCase();
  return n.includes('cung cấp') || n.includes('ncc') || n.includes('supplier');
}

function parseSupplierRow(row) {
  const name = toText(row[1]);
  if (!name) return null;
  return { type: 'supplier', name, system: toText(row[2]), category: toText(row[3]), contact: toText(row[4]) };
}
function parseSubRow(row) {
  const name = toText(row[1]);
  if (!name) return null;
  return { type: 'subcontractor', name, capability_summary: toText(row[2]) };
}

export async function parse(filePath, tenantId) {
  const wb = readWorkbook(filePath);
  const sheets = [];
  for (const sheetName of wb.SheetNames) {
    const rows = readSheet(filePath, sheetName);
    const dataStart = findDataStart(rows, { codeCol: 0, nameCol: 1, headerKeywords: HEADER_KEYWORDS, maxScan: 20 });
    const sheetRows = [];
    const isSup = isSupplierSheet(sheetName);
    for (let r = dataStart; r < rows.length; r++) {
      const parsed = isSup ? parseSupplierRow(rows[r] || []) : parseSubRow(rows[r] || []);
      if (parsed) sheetRows.push({ rowIndex: r + 1, ...parsed });
    }
    if (sheetRows.length > 0) sheets.push({ sheet: sheetName, rows: sheetRows });
  }
  return { sheets, totalRows: sheets.reduce((s, x) => s + x.rows.length, 0) };
}

export async function commit(parsed, tenantId) {
  const db = getDb();
  const report = { doc_type: 'resource_directory', ok: 0, errors: 0, items: [] };
  for (const sheet of parsed.sheets) {
    for (const [idx, row] of sheet.rows.entries()) {
      try {
        if (row.type === 'supplier') {
          // Không đưa `status` vào `setCols`: `status = 'ACTIVE'` trong `row` khiến
          // mỗi lần nạp lại danh bạ **hồi sinh** nhà cung cấp đã bị ẩn
          // (`routes/master-data.js:334` đặt `INACTIVE` khi ẩn). Bản ghi bị ẩn là
          // quyết định của người dùng, không phải dữ liệu trong sheet.
          await db.upsert('suppliers',
            { conflictCols: ['tenant_id', 'name'], setCols: ['system', 'category', 'contact', 'source_sheet'] },
            { tenant_id: tenantId, name: row.name, system: row.system, category: row.category, contact: row.contact, status: 'ACTIVE', source_sheet: sheet.sheet }
          );
        } else {
          // `status` và `is_internal_team` đều do ứng dụng quản lý: `is_internal_team`
          // được đặt tay ở Dữ liệu chủ và bị ghi đè thành `false` mỗi lần nạp.
          await db.upsert('subcontractors',
            { conflictCols: ['tenant_id', 'name'], setCols: ['capability_summary'] },
            { tenant_id: tenantId, name: row.name, capability_summary: row.capability_summary, status: 'ACTIVE', is_internal_team: false }
          );
        }
        report.ok++;
      } catch (e) {
        recordFailure(report, { sheet: sheet.sheet, row: row.rowIndex ?? idx + 1, ref: row.name, message: e.message, keep: { name: row.name } });
      }
    }
  }
  return report;
}

export async function ingestResourceDirectory(filePath, tenantId) {
  const parsed = await parse(filePath, tenantId);
  return await commit(parsed, tenantId);
}
