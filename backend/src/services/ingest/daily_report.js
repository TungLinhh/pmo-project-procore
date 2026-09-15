// Ingestion: Daily Report (LAWRENCE STING C20 style)
// File: Báo cáo công việc C20 ngày 23.5.2021.xlsx — each sheet = 1 day
// PG-only. Mô hình A wizard.
import { getDb } from '../../db/index.js';
import { fieldFromDbError } from './failures.js';
import { readSheet, toDate, toInt, toFloat, toText } from '../../lib/excel.js';

function parseSheetDate(sheetName) {
  const m = sheetName.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseWorkItems(rows) {
  const items = [];
  let currentParent = null;
  for (let r = 27; r <= 37; r++) {
    const row = rows[r] || [];
    const tt = toInt(row[0]);
    const name = toText(row[1]);
    const blocker = toText(row[2]);
    if (tt && name && !/Tổng cộng|^Total$/i.test(name)) {
      currentParent = { parent_index: items.length, ordinal: tt, name_vi: name, blocker_notes: blocker, system_type: null, manpower_rate: null, start_date: null, finish_date: null, lost_days: null, progress_pct: null };
      items.push({ ...currentParent, parent_id: null });
    }
    const subTT = toInt(row[7]);
    const subName = toText(row[8]);
    if (subName) {
      items.push({
        parent_index: currentParent ? items.length - 1 : null,
        parent_id: null,  // resolved during commit
        ordinal: subTT,
        name_vi: subName,
        blocker_notes: null,
        system_type: name && /MECHANICAL/i.test(name) ? 'MECHANICAL' : (name && /ELECTRICAL/i.test(name) ? 'ELECTRICAL' : null),
        manpower_rate: toFloat(row[10]),
        start_date: toDate(row[11]),
        finish_date: toDate(row[12]),
        lost_days: toInt(row[13]),
        progress_pct: toFloat(row[14]),
      });
    }
  }
  return items;
}

function parseMaterials(rows) {
  const items = [];
  for (let r = 42; r <= 57; r++) {
    const row = rows[r] || [];
    const subTT = toInt(row[7]);
    const name = toText(row[8]);
    if (name) {
      items.push({
        ordinal: subTT, name_vi: name,
        start_date: toDate(row[11]), finish_date: toDate(row[12]),
        lost_days: toInt(row[13]), progress_pct: toFloat(row[14]),
      });
    }
  }
  return items;
}

function parseManpower(rows) {
  const items = [];
  for (let r = 63; r <= 82; r++) {
    const row = rows[r] || [];
    const role = toText(row[10]);
    if (role) items.push({ role_name: role, cumulative_qty: toInt(row[19]), today_qty: toInt(row[25]), consumed_qty: toInt(row[31]) });
  }
  return items;
}

function parseAcceptance(rows) {
  const items = [];
  for (let r = 63; r <= 77; r++) {
    const row = rows[r] || [];
    const tt = toInt(row[0]);
    if (tt) {
      const raw = toInt(row[2]);
      items.push({ ordinal: tt, acceptance_type: 'material', status: raw === 0 ? null : raw });
    }
  }
  return items;
}

export async function parse(filePath, projectId) {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheets = [];
  for (const sheetName of wb.SheetNames) {
    const reportDate = parseSheetDate(sheetName);
    if (!reportDate) continue;
    const rows = readSheet(filePath, sheetName);
    sheets.push({
      sheet: sheetName,
      report_date: reportDate,
      prepared_by: toText(rows[1]?.[24]) || null,
      work_items: parseWorkItems(rows),
      materials: parseMaterials(rows),
      manpower: parseManpower(rows),
      acceptance: parseAcceptance(rows),
    });
  }
  return { sheets, totalRows: sheets.reduce((s, x) => s + x.work_items.length + x.materials.length + x.manpower.length + x.acceptance.length, 0) };
}

export async function commit(parsed, projectId) {
  const db = getDb();
  const report = { doc_type: 'daily_report', sheets: [], total: { ok: 0, errors: 0 } };

  for (const sheet of parsed.sheets) {
    try {
      const reportUpsert = await db.upsert('daily_reports',
        { conflictCols: ['project_id', 'report_date'] },
        { project_id: projectId, report_date: sheet.report_date, prepared_by: sheet.prepared_by, source_sheet_name: sheet.sheet }
      );
      const dailyReportId = reportUpsert.lastInsertRowid;

      // Idempotency: clear children
      for (const tbl of ['daily_work_items', 'daily_materials', 'daily_manpower', 'daily_acceptance', 'daily_safety', 'daily_recommendations']) {
        await db.prepare(`DELETE FROM ${tbl} WHERE daily_report_id = ?`).runAsync(dailyReportId);
      }

      let ok = 0, errors = 0;
      let nWork = 0, nMat = 0, nMp = 0, nAcc = 0;
      const failures = [];
      const fail = (row, ref, message, keep = {}) => {
        errors++;
        failures.push({
          sheet: sheet.sheet, row, field: fieldFromDbError(message),
          message: String(message || 'unknown error'), ref, ...keep, error: String(message || 'unknown error'),
        });
      };
      // Work items: insert all, then update parent_id.
      // NOTE: mapped to the REAL daily_work_items schema
      // (blocker_notes/system_type/manpower_rate/start/finish/lost_days never
      //  existed as columns — every daily commit used to fail 100%).
      const insertedIds = [];
      for (const [wiIdx, item] of sheet.work_items.entries()) {
        try {
          const notes = [item.blocker_notes, item.manpower_rate != null ? `rate ${item.manpower_rate}` : null].filter(Boolean).join(' | ') || null;
          const r = await db.prepare(`
            INSERT INTO daily_work_items (daily_report_id, parent_id, ordinal, name_vi, system_vi, progress_pct, plan_start_date, plan_end_date, lag_days, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).runAsync(dailyReportId, null, item.ordinal, item.name_vi, item.system_type, item.progress_pct, item.start_date, item.finish_date, item.lost_days, notes);
          insertedIds.push(Number(r.lastInsertRowid));
          ok++; nWork++;
        } catch (e) { fail(item.rowIndex ?? wiIdx + 1, item.name_vi || null, e.message, { ordinal: item.ordinal }); }
      }
      for (let i = 0; i < sheet.work_items.length; i++) {
        if (sheet.work_items[i].parent_index !== null && sheet.work_items[i].parent_index !== undefined) {
          const parentId = insertedIds[sheet.work_items[i].parent_index];
          if (parentId) {
            await db.prepare('UPDATE daily_work_items SET parent_id = ? WHERE id = ?').runAsync(parentId, insertedIds[i]);
          }
        }
      }
      for (const [mIdx, m] of sheet.materials.entries()) {
        try {
          const notes = [`STT ${m.ordinal ?? '?'}`, [m.start_date, m.finish_date].filter(Boolean).join('→') || null, m.lost_days != null ? `chậm ${m.lost_days} ngày` : null, m.progress_pct != null ? `${m.progress_pct * 100}%` : null].filter(Boolean).join(' · ') || null;
          await db.prepare(`
            INSERT INTO daily_materials (daily_report_id, name_vi, notes)
            VALUES (?, ?, ?)
          `).runAsync(dailyReportId, m.name_vi, notes);
          ok++; nMat++;
        } catch (e) { fail(m.rowIndex ?? mIdx + 1, m.name_vi || null, e.message, { ordinal: m.ordinal }); }
      }
      for (const [mpIdx, m] of sheet.manpower.entries()) {
        try {
          const notes = [m.cumulative_qty != null ? `lũy kế ${m.cumulative_qty}` : null, m.consumed_qty != null ? `đã dùng ${m.consumed_qty}` : null].filter(Boolean).join(', ') || null;
          await db.prepare(`
            INSERT INTO daily_manpower (daily_report_id, role_name_vi, headcount, notes)
            VALUES (?, ?, ?, ?)
          `).runAsync(dailyReportId, m.role_name, m.today_qty, notes);
          ok++; nMp++;
        } catch (e) { fail(m.rowIndex ?? mpIdx + 1, m.role_name || null, e.message); }
      }
      for (const [aIdx, a] of sheet.acceptance.entries()) {
        try {
          await db.prepare(`
            INSERT INTO daily_acceptance (daily_report_id, ordinal, name_vi, notes)
            VALUES (?, ?, ?, ?)
          `).runAsync(dailyReportId, a.ordinal, a.acceptance_type, a.status != null ? `status ${a.status}` : null);
          ok++; nAcc++;
        } catch (e) { fail(a.rowIndex ?? aIdx + 1, a.acceptance_type || null, e.message, { ordinal: a.ordinal }); }
      }
      // rollup counts (FieldHome "N items · M manpower" reads these)
      await db.prepare('UPDATE daily_reports SET work_items_count = ?, materials_count = ?, manpower_count = ?, acceptance_count = ? WHERE id = ?')
        .runAsync(nWork, nMat, nMp, nAcc, dailyReportId);
      report.sheets.push({ sheet: sheet.sheet, status: errors ? 'PARTIAL' : 'OK', daily_report_id: dailyReportId, ok, errors, failures });
      report.total.ok += ok;
      report.total.errors += errors;
    } catch (e) {
      report.sheets.push({ sheet: sheet.sheet, status: 'FAILED', error: e.message });
      report.total.errors++;
    }
  }
  return report;
}

export async function ingestDailyReport(filePath, projectId) {
  const parsed = await parse(filePath, projectId);
  return await commit(parsed, projectId);
}
