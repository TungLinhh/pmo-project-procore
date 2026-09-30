// Ingestion: Business Process (file: quy trình thực hiện dự án.xlsx)
// PG-only. Mô hình A wizard: parse() returns rows, commit() inserts them.
import { getDb, withClientTx } from '../../db/index.js';
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
  // One transaction for the whole template replace. Previously: SELECT then
  // INSERT (a TOCTOU against bp_tenant_code_idx), then DELETE of every step,
  // then the upserts — each on its own connection, so a failure mid-way left
  // the tenant-wide `project_execution` template partially replaced.
  return withClientTx(async (client) => {
  // Resolve or create process. The insert races a concurrent commit, so re-read
  // on the unique violation instead of failing the whole import.
  const proc = await client.prepare('SELECT id FROM business_processes WHERE tenant_id = ? AND code = ?').getAsync(tenantId, processCode);
  let processId;
  if (proc) {
    processId = proc.id;
  } else {
    let ins;
    try {
      ins = await client.prepare('INSERT INTO business_processes (tenant_id, code, name_vi) VALUES (?, ?, ?)').runAsync(tenantId, processCode, processCode);
    } catch (e) {
      if (String(e.code) !== '23505') throw e;
      ins = null;
    }
    if (ins && ins.lastInsertRowid) {
      processId = Number(ins.lastInsertRowid);
    } else {
      const again = await client.prepare('SELECT id FROM business_processes WHERE tenant_id = ? AND code = ?').getAsync(tenantId, processCode);
      processId = again?.id;
    }
  }
  if (!processId) throw new Error(`Cannot resolve business process ${processCode}`);
  // Idempotency: clear old steps
  await client.prepare('DELETE FROM business_process_steps WHERE process_id = ?').runAsync(processId);

  const report = { doc_type: 'business_process', ok: 0, errors: 0, items: [], process_id: processId };
  for (const sheet of parsed.sheets) {
    for (const [idx, row] of sheet.rows.entries()) {
      try {
        await client.upsert('business_process_steps',
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
  });
}

export async function ingestBusinessProcess(filePath, tenantId, processCode = 'project_execution') {
  const parsed = await parse(filePath, tenantId, processCode);
  return await commit(parsed, tenantId, processCode);
}
