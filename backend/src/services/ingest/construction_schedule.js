// Ingestion: Construction Schedule zone files (BTE CSP-*, MCR CSP-*, LVK ZONE *).
// PG-only. Mô hình A wizard: parse() returns rows, commit() inserts them.
//
// Layout-tolerant: header band located by TEXT (công việc/hạng mục,
// % hoàn thành, tình trạng, ngày bắt đầu/kết thúc, hao phí), KH/TT
// sub-columns resolved per pair, STT parsed into level fields.
// Sheet selection skips known-empty placeholders (foxz/SheetN), not by name.
import { getDb } from '../../db/index.js';
import { recordFailure } from './failures.js';
import { readSheet, readWorkbook, toText, toInt, toFloat, toDate } from '../../lib/excel.js';
import { findOrCreateZone } from './index.js';
import { norm } from '../../lib/classify.js';

function resolveZone(zoneCode) {
  if (!zoneCode) return { code: 'GEN-TD', name: 'Construction Schedule - General' };
  return { code: zoneCode, name: zoneCode };
}

function parseLevel(stt) {
  if (!stt) return { roman: null, arabic: null, sublevel: null };
  const s = String(stt).trim();
  if (/^[IVX]+$/.test(s)) return { roman: s, arabic: null, sublevel: null };
  if (/^\d+$/.test(s)) return { roman: null, arabic: parseInt(s, 10), sublevel: null };
  if (/^\d+\.\d+$/.test(s)) {
    const [a, b] = s.split('.').map(n => parseInt(n, 10));
    return { roman: null, arabic: a, sublevel: b };
  }
  return { roman: s, arabic: null, sublevel: null };
}

// Derived status: the single source of truth for UI/KPI/filter.
// (The old loose regex mapped stray 'x'/'1'/'y' marks to DONE, producing
//  160 bogus DONE rows on BTE. Raw text now lives in source_status.)
export function deriveStatus(progress, actualEnd) {
  if ((progress != null && progress >= 1) || actualEnd != null) return 'DONE';
  if (progress != null && progress > 0) return 'IN_PROGRESS';
  return 'PENDING';
}

function parseRow(row, map, rowIndex) {
  const stt = toText(row[map.sttCol]);
  const name = toText(row[map.nameCol]);
  if (!name) return null;
  const progress = map.progressCol != null ? toFloat(row[map.progressCol]) : null;
  // Raw source text kept for reference only — NEVER used for display logic.
  const sourceStatus = toText(row[map.statusCol]) || null;
  const actualEnd = map.actualEnd != null ? toDate(row[map.actualEnd]) : null;
  const status = deriveStatus(progress, actualEnd);
  // zone-title rows ('BOH', no STT, no progress/status) are labels, not tasks
  if (!stt && /^[A-Z0-9][A-Z0-9 &+.-]{1,11}$/.test(name) && progress == null && sourceStatus == null) return null;
  const { roman, arabic, sublevel } = parseLevel(stt);
  return {
    level_roman: roman, level_arabic: arabic, sublevel,
    // ordinal falls back to source row order so group rows (null STT) still
    // dedup stably on re-ingest of the same file version
    ordinal: toInt(stt) ?? rowIndex ?? null,
    name_vi: name, name_en: null,
    progress_pct: progress,
    status,
    source_status: sourceStatus,
    plan_start_date: map.planStart != null ? toDate(row[map.planStart]) : null,
    actual_start_date: map.actualStart != null ? toDate(row[map.actualStart]) : null,
    plan_end_date: map.planEnd != null ? toDate(row[map.planEnd]) : null,
    actual_end_date: map.actualEnd != null ? toDate(row[map.actualEnd]) : null,
    plan_duration_days: map.durationCol != null ? toInt(row[map.durationCol]) : null,
  };
}

// Header band by text. KH/TT sub-columns: the cell right after a plan/end
// header is its actual twin when it reads TT/thực tế/actual.
export function locateScheduleHeader(rows, maxScan = 40) {
  const N = (v) => norm(v);
  for (let r = 0; r < Math.min(maxScan, rows.length); r++) {
    const row = rows[r] || [];
    const texts = row.map(N);
    const nameCol = texts.findIndex(t => /cong viec|hang muc|noi dung|cong tac|ten cong viec/.test(t));
    if (nameCol < 0) continue;
    // confirm: same row must also carry siblings (stt left, or %/status/dates)
    // so instruction rows ('nhập hạng mục ở ...') don't hijack the match
    const rowText = texts.join(' ');
    const siblings = [
      texts.slice(Math.max(0, nameCol - 2), nameCol).some(t => /^(stt|tt|no|so tt)$/.test(t || '')),
      /% hoan thanh|% ht|tinh trang|ngay bat dau|ngay ket thuc|so ngay|hao phi/.test(rowText),
    ].filter(Boolean).length;
    if (siblings < 1) continue;
    let sttCol = -1;
    for (let c = nameCol - 1; c >= 0; c--) {
      if (/stt|\bno\b|so tt/.test(texts[c] || '')) { sttCol = c; break; }
    }
    const band = [row];
    for (let k = 1; k <= 3 && r + k < rows.length; k++) band.push(rows[r + k] || []);
    const at = (rr, c) => N((band[rr] || [])[c]);
    const findCol = (re, fromCol = 0) => {
      for (let rr = 0; rr < band.length; rr++) {
        const brow = band[rr] || [];
        for (let c = fromCol; c < brow.length + 30; c++) {
          if (re.test(at(rr, c))) return { row: r + rr, col: c };
        }
      }
      return null;
    };
    const progress = findCol(/% hoan thanh|% ht|ti en do|% thuc hien/, nameCol);
    const status = findCol(/tinh trang|trang thai|status/, nameCol);
    const start = findCol(/ngay bat dau|start/, nameCol);
    const end = findCol(/ngay ket thuc|ngay hoan thanh|finish|end/, nameCol);
    const duration = findCol(/so ngay|duration|so ngay thi cong/, nameCol);
    // actual twin = immediate right neighbor reading TT/thực tế/actual
    const twin = (hit) => {
      if (!hit) return null;
      for (let rr = 0; rr < band.length; rr++) {
        const t = at(rr, hit.col + 1);
        if (/^(tt|thuc te|actual|tt\/actual)$/.test(t)) return hit.col + 1;
      }
      return null;
    };
    let bandEnd = r;
    for (let rr = 0; rr < band.length; rr++) {
      const cells = (band[rr] || []).map(N).join(' ');
      if (/cong viec|hang muc|hoan thanh|tinh trang|ngay bat dau|ngay ket thuc|hao phi|thang|tuan|kh|tt/.test(cells)) bandEnd = r + rr;
    }
    return {
      headerRow: r, dataStart: bandEnd + 1, sttCol, nameCol,
      progressCol: progress?.col ?? null, statusCol: status?.col ?? null,
      planStart: start?.col ?? null, actualStart: twin(start),
      planEnd: end?.col ?? null, actualEnd: twin(end),
      durationCol: duration?.col ?? null,
    };
  }
  return null;
}

export async function parse(filePath, projectId, zoneCode) {
  const wb = readWorkbook(filePath);
  const { code, name } = resolveZone(zoneCode);
  const sheets = [];
  for (const sheetName of wb.SheetNames) {
    // skip known-empty placeholders; accept everything else with cells
    if (/^(foxz|sheet\d*)$/i.test(sheetName.trim())) continue;
    const rows = readSheet(filePath, sheetName);
    if (!rows.some(r => (r || []).some(v => v != null && String(v).trim() !== ''))) continue;
    const map = locateScheduleHeader(rows);
    if (!map) continue;
    const sheetRows = [];
    // Phase context: STT con kieu "1,2,3..." lap lai duoi moi de-muc La Ma
    // (I, II, ...) — giu de-muc cha gan nhat de key (roman,arabic,sub,ordinal)
    // phan biet duoc I.1 vs II.1 (khong mat 70% rows nhu truoc).
    let phaseCtx = '';
    for (let r = map.dataStart; r < rows.length; r++) {
      const row = rows[r] || [];
      const parsed = parseRow(row, map, r + 1);
      if (!parsed) continue;
      if (parsed.level_roman) {
        phaseCtx = parsed.level_roman;
      } else if (parsed.level_arabic != null || parsed.sublevel != null) {
        if (!parsed.level_roman && phaseCtx) parsed.level_roman = phaseCtx;
      } else {
        phaseCtx = '';
      }
      const wbsParts = [parsed.level_roman, parsed.level_arabic, parsed.sublevel]
        .filter((value) => value != null && value !== '')
        .map(String);
      parsed.wbs_code = wbsParts.length ? wbsParts.join('.') : `ROW-${parsed.ordinal ?? r + 1}`;
      sheetRows.push({ rowIndex: r + 1, ...parsed });
    }
    if (sheetRows.length > 0) sheets.push({ sheet: sheetName, rows: sheetRows });
  }
  return { zone: { code, name }, sheets, totalRows: sheets.reduce((s, x) => s + x.rows.length, 0) };
}

export async function commit(parsed, projectId, zoneCode, uploadId = null) {
  const db = getDb();
  const { code } = resolveZone(zoneCode);
  const zone = await findOrCreateZone(projectId, code, code);
  const zoneId = zone.id;

  const report = { doc_type: 'construction_schedule', zone: code, ok: 0, errors: 0, items: [] };
  for (const sheet of parsed.sheets) {
    for (const [idx, row] of sheet.rows.entries()) {
      try {
        // Level ve default ''/0/0 (khong NULL) de key upsert 7 cot phan biet
        // duoc I.1 vs II.1 — NULL lam UNIQUE vo hieu (NULL khac NULL).
        const lvRoman = row.level_roman || '', lvArabic = row.level_arabic ?? 0, lvSub = row.sublevel ?? 0;
        // Không đưa `status` vào `setCols`.
        // `setCols` tường minh (tiền lệ: `shop_drawing.js:213`). `status` **không** nằm
        // trong danh sách: nó là cột vòng đời do ứng dụng và baseline quản lý, và
        // `deriveStatus()` chạy lại từ tiến độ trong sheet sẽ lệch với
        // `schedule_baseline_items.status` đã snapshot — `restoreBaseline` chỉ phục
        // hồi `plan_*_date`/`plan_duration_days` nên lệch đó không tự lành.
        await db.upsert('construction_schedule_items',
          { conflictCols: ['project_id', 'zone_id', 'source_sheet', 'level_roman', 'level_arabic', 'sublevel', 'ordinal'],
            setCols: ['zone_id', 'source_sheet', 'upload_id', 'name_vi', 'name_en', 'progress_pct', 'source_status',
                      'plan_start_date', 'actual_start_date', 'plan_end_date', 'actual_end_date', 'plan_duration_days'] },
          {
            project_id: projectId, zone_id: zoneId, source_sheet: sheet.sheet, upload_id: uploadId,
            level_roman: lvRoman, level_arabic: lvArabic, sublevel: lvSub, ordinal: row.ordinal,
            name_vi: row.name_vi, name_en: row.name_en, progress_pct: row.progress_pct, status: deriveStatus(row.progress_pct, row.actual_end_date), source_status: row.source_status || null,
            plan_start_date: row.plan_start_date, actual_start_date: row.actual_start_date,
            plan_end_date: row.plan_end_date, actual_end_date: row.actual_end_date, plan_duration_days: row.plan_duration_days,
          }
        );
        const scheduleItem = await db.prepare(
          `SELECT id FROM construction_schedule_items
           WHERE project_id = ? AND zone_id = ? AND source_sheet = ?
             AND level_roman = ? AND level_arabic = ? AND sublevel = ? AND ordinal = ?`,
        ).getAsync(projectId, zoneId, sheet.sheet, lvRoman, lvArabic, lvSub, row.ordinal);
        if (scheduleItem?.id) {
          const workCode = `${row.wbs_code || `ROW-${row.ordinal ?? idx + 1}`}-${scheduleItem.id}`;
          const workItem = await db.prepare(
            `INSERT INTO work_items
               (project_id, zone_id, code, name_vi, name_en, item_type,
                planned_start_date, planned_end_date, plan_duration_days, progress_pct, source_schedule_item_id)
             VALUES (?, ?, ?, ?, ?, 'TASK', ?, ?, ?, ?, ?)
             ON CONFLICT (project_id, code) DO UPDATE SET
               name_vi = EXCLUDED.name_vi, name_en = EXCLUDED.name_en,
               planned_start_date = EXCLUDED.planned_start_date, planned_end_date = EXCLUDED.planned_end_date,
               plan_duration_days = EXCLUDED.plan_duration_days, progress_pct = EXCLUDED.progress_pct,
               source_schedule_item_id = EXCLUDED.source_schedule_item_id, updated_at = now()
             RETURNING id`,
          ).getAsync(projectId, zoneId, workCode, row.name_vi, row.name_en, row.plan_start_date,
            row.plan_end_date, row.plan_duration_days, row.progress_pct, scheduleItem.id);
          if (workItem?.id) {
            await db.prepare('UPDATE construction_schedule_items SET work_item_id = ? WHERE id = ?')
              .runAsync(workItem.id, scheduleItem.id);
          }
        }
        report.ok++;
      } catch (e) {
        recordFailure(report, { sheet: sheet.sheet, row: row.rowIndex ?? idx + 1, ref: row.name_vi, message: e.message, keep: { name: row.name_vi } });
      }
    }
  }
  return report;
}

export async function ingestConstructionSchedule(filePath, projectId, zoneCode) {
  const parsed = await parse(filePath, projectId, zoneCode);
  return await commit(parsed, projectId, zoneCode);
}
