// Ingestion: Business Process (file: quy trình thực hiện dự án.xlsx)
// PG-only. Mô hình A wizard: parse() returns rows, commit() inserts them.
import { getDb } from '../../db/index.js';
import { recordFailure } from './failures.js';
import { readSheet, toText, toInt, findDataStart } from '../../lib/excel.js';

const HEADER_KEYWORDS = ['stt', 'tt', 'tiến trình', 'quy trình', 'bước'];

function parseRow(row) {
  const ordinal = toInt(row[0]);
  const name = toText(row[1]);
  if (!ordinal || !name) return null;
  return {
    ordinal,
    name_vi: name,
    content_vi: toText(row[2]),
    responsibility_vi: toText(row[3]),
    verification_vi: toText(row[4]),
  };
}

export async function parse(filePath, tenantId, processCode = 'project_execution') {
  const rows = readSheet(filePath, 'Quy trình thực hiện dự án');
  const dataStart = findDataStart(rows, { codeCol: 0, nameCol: 1, headerKeywords: HEADER_KEYWORDS, maxScan: 15 });
  const sheetRows = [];
  for (let i = dataStart; i < rows.length; i++) {
    const parsed = parseRow(rows[i] || []);
    if (parsed) sheetRows.push({ rowIndex: i + 1, ...parsed });
  }
  return { processCode, sheets: [{ sheet: 'Quy trình thực hiện dự án', rows: sheetRows }], totalRows: sheetRows.length };
}

export async function commit(parsed, tenantId, processCode = 'project_execution') {
  const db = getDb();
  // Resolve or create process
  const proc = await db.prepare('SELECT id FROM business_processes WHERE tenant_id = ? AND code = ?').getAsync(tenantId, processCode);
  let processId;
  if (proc) {
    processId = proc.id;
  } else {
    const ins = await db.prepare('INSERT INTO business_processes (tenant_id, code, name_vi) VALUES (?, ?, ?)').runAsync(tenantId, processCode, processCode);
    processId = Number(ins.lastInsertRowid);
  }
  // Idempotency: clear old steps
  await db.prepare('DELETE FROM business_process_steps WHERE process_id = ?').runAsync(processId);

  const report = { doc_type: 'business_process', ok: 0, errors: 0, items: [], process_id: processId };
  for (const sheet of parsed.sheets) {
    for (const [idx, row] of sheet.rows.entries()) {
      try {
        await db.upsert('business_process_steps',
          { conflictCols: ['process_id', 'ordinal'] },
          {
            process_id: processId, ordinal: row.ordinal, name_vi: row.name_vi,
            content_vi: row.content_vi, responsibility_vi: row.responsibility_vi, verification_vi: row.verification_vi,
          }
        );
        report.ok++;
        report.items.push({ ordinal: row.ordinal, name: row.name_vi });
      } catch (e) {
        recordFailure(report, { sheet: sheet.sheet ?? null, row: row.rowIndex ?? idx + 1, ref: row.name_vi, message: e.message, keep: { ordinal: row.ordinal, name: row.name_vi } });
      }
    }
  }
  return report;
}

export async function ingestBusinessProcess(filePath, tenantId, processCode = 'project_execution') {
  const parsed = await parse(filePath, tenantId, processCode);
  return await commit(parsed, tenantId, processCode);
}
