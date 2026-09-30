// Ingest a "tổng thể" file (multi-zone summary). PG-only. Mô hình A wizard.
import { getDb } from '../../db/index.js';
import { recordFailure } from './failures.js';
import { readSheet, readWorkbook, toText, toInt, toFloat, toDate, findDataStart } from '../../lib/excel.js';
import { findZoneByName } from '../../lib/zone_matcher.js';
import { findOrCreateZone } from './index.js';

const HEADER_KEYWORDS = ['stt', 'tt', 'hạng mục', 'nội dung', 'tiến độ', 'khu vực'];

function parseSheetRows(rows, dataStart, docType) {
  const out = [];
  // `||` swallows a legitimate 0 % and falls through to a *different* column,
  // so a row reporting 0 % was stored with another column's value while the
  // report still counted it as ok. First non-null wins, 0 included.
  const firstNumber = (...values) => {
    for (const value of values) {
      const n = toFloat(value);
      if (n != null) return n;
    }
    return null;
  };
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r] || [];
    if (docType === 'shop_drawing') {
      const code = toText(row[5]) || toText(row[1]);
      const name = toText(row[6]) || toText(row[2]);
      if (!code && !name) continue;
      if (code && /^[0-9.]+$/.test(code)) continue;
      out.push({ drawing_code: code, name_vi: name, progress_pct: firstNumber(row[7], row[3]) });
    } else if (docType === 'material_supply') {
      const code = toText(row[5]) || toText(row[1]);
      const name = toText(row[6]) || toText(row[2]);
      if (!code && !name) continue;
      if (code && /^[0-9.]+$/.test(code)) continue;
      out.push({ material_code: code, name_vi: name, progress_pct: firstNumber(row[7], row[3]), request_date_1: toDate(row[8]) || toDate(row[4]) });
    } else {
      // construction_schedule
      const stt = toText(row[3]) || toText(row[0]);
      const name = toText(row[5]) || toText(row[4]);
      if (!stt && !name) continue;
      if (name && /^[0-9.]+$/.test(name)) continue;
      if (stt && /^(Stt|Hạng|%)\b/i.test(stt)) continue;
      const romanMatch = stt.match(/^([IVX]+)\.?$/);
      const romanMap = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
      out.push({
        ordinal: romanMatch ? romanMap[romanMatch[1]] : toInt(stt),
        name_vi: name || stt,
        progress_pct: firstNumber(row[9], row[8], row[7], row[2]),
        plan_start_date: toDate(row[6]) || toDate(row[3]),
        plan_end_date: toDate(row[10]) || toDate(row[7]),
      });
    }
  }
  return out;
}

export async function parse(filePath, projectId, options = {}) {
  const db = getDb();
  const wb = readWorkbook(filePath);
  const zones = await db.prepare('SELECT id, code FROM zones WHERE project_id = ?').allAsync(projectId);
  const sheets = [];
  for (const sheetName of wb.SheetNames) {
    if (sheetName.toLowerCase().includes('sơ đồ') || sheetName.toLowerCase().includes('index')) continue;
    const m = sheetName.match(/(?:TĐ|Shop|Vật tư)\s+(.+)/i);
    if (!m) continue;
    const zoneName = m[1].trim();
    let zoneId = findZoneByName(zoneName, zones);
    let zoneAutoCreated = false;
    if (!zoneId) {
      const created = await findOrCreateZone(projectId, zoneName.toUpperCase().replace(/\s+/g, ''), zoneName);
      zoneId = created.id;
      zones.push({ id: created.id, code: created.code });
      zoneAutoCreated = true;
    }
    const rows = readSheet(filePath, sheetName);
    const dataStart = findDataStart(rows, { codeCol: 3, nameCol: 5, headerKeywords: HEADER_KEYWORDS, maxScan: 30 });
    const sheetRows = parseSheetRows(rows, dataStart, options.docType);
    if (sheetRows.length > 0) sheets.push({ sheet: sheetName, zone_id: zoneId, zone_name: zoneName, zone_auto_created: zoneAutoCreated, rows: sheetRows });
  }
  return { docType: options.docType, sheets, totalRows: sheets.reduce((s, x) => s + x.rows.length, 0) };
}

export async function commit(parsed, projectId, opts = {}) {
  const db = getDb();
  const docType = parsed.docType;
  const uploadId = opts.uploadId ?? null;
  const report = { doc_type: docType, ok: 0, errors: 0, items: [], zone_splits: {} };

  for (const sheet of parsed.sheets) {
    for (const [idx, row] of sheet.rows.entries()) {
      try {
        if (docType === 'shop_drawing') {
          await db.upsert('shop_drawings',
            { conflictCols: ['project_id', 'drawing_code'] },
            { project_id: projectId, zone_id: sheet.zone_id, source_sheet: sheet.sheet, upload_id: uploadId, drawing_code: row.drawing_code, name_vi: row.name_vi, progress_pct: row.progress_pct }
          );
        } else if (docType === 'material_supply') {
          // Không ghi đè `progress_pct` khi dòng đã tồn tại — xem `material_supply.js`
          // để biết vì sao (null sẽ xoá sạch tiến độ nhập trong ứng dụng).
          await db.upsert('materials',
            { conflictCols: ['project_id', 'zone_id', 'material_code'], setCols: ['zone_id', 'source_sheet', 'upload_id', 'name_vi', 'request_date_1'] },
            { project_id: projectId, zone_id: sheet.zone_id, source_sheet: sheet.sheet, upload_id: uploadId, material_code: row.material_code, name_vi: row.name_vi, progress_pct: row.progress_pct, request_date_1: row.request_date_1 }
          );
        } else {
          // `setCols` tường minh (tiền lệ `shop_drawing.js:213`). Ở đây `row`
          // không có `status` nên vốn đã không ghi đè cột vòng đời — chốt lại cho
          // chắc, và để danh sách cột đọc được ý nghĩa.
          await db.upsert('construction_schedule_items',
            { conflictCols: ['project_id', 'zone_id', 'source_sheet', 'level_roman', 'level_arabic', 'sublevel', 'ordinal'],
              setCols: ['zone_id', 'source_sheet', 'upload_id', 'name_vi', 'progress_pct', 'plan_start_date', 'plan_end_date'] },
            { project_id: projectId, zone_id: sheet.zone_id, source_sheet: sheet.sheet, upload_id: uploadId, level_roman: '', level_arabic: 0, sublevel: 0, ordinal: row.ordinal, name_vi: row.name_vi, progress_pct: row.progress_pct, plan_start_date: row.plan_start_date, plan_end_date: row.plan_end_date }
          );
        }
        report.ok++;
        report.zone_splits[sheet.zone_name] = (report.zone_splits[sheet.zone_name] || 0) + 1;
      } catch (e) {
        recordFailure(report, { sheet: sheet.sheet, row: row.rowIndex ?? idx + 1, ref: row.drawing_code || row.material_code || row.name_vi || null, message: e.message });
      }
    }
  }
  return report;
}

export async function ingestProjectLevel(filePath, projectId, options = {}) {
  const parsed = await parse(filePath, projectId, options);
  return await commit(parsed, projectId, options);
}
