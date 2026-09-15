// Ingestion: Shop Drawing zone files (BTE SHD-*, MCR Shop *, ...).
// PG-only. Mô hình A wizard: parse() returns rows, commit() inserts them.
//
// Layout-tolerant by design: real files are clone-copied templates with
// 2-3 tier merged headers at shifting rows/columns. parse() locates the
// header band by TEXT (mã hiệu / tên bản vẽ / lần N / ngày phê duyệt) and
// derives every data column from it — no fixed column indexes.
import { getDb } from '../../db/index.js';
import { recordFailure } from './failures.js';
import { readSheet, toText, toFloat, toDate, findDataStart } from '../../lib/excel.js';
import { findOrCreateZone } from './index.js';
import { norm } from '../../lib/classify.js';

const HEADER_KEYWORDS = ['mã hiệu', 'mã', 'tên', 'name', 'stt', 'tt', 'drawing code'];

function resolveZone(zoneCode) {
  if (!zoneCode) return { code: 'GEN-SHOP', name: 'Shop Drawing - General' };
  return { code: zoneCode, name: zoneCode };
}

const CODE_VALUE_RE = /^[A-Z0-9]{2,}-[A-Z0-9][A-Z0-9 _&+./-]*-\d{2,}[A-Z]?$/i;

function looksLikeCode(v) {
  if (!v || v.length > 80) return false;
  // real files pad dashes with spaces: 'HBG - MCR - CA - E - 001'
  return CODE_VALUE_RE.test(v.replace(/\s*-\s*/g, '-'));
}

// Locate the header band by text. Returns column map + first data row, or null.
export function locateShopHeader(rows, maxScan = 40) {
  const N = (v) => norm(v);
  for (let r = 0; r < Math.min(maxScan, rows.length); r++) {
    const row = rows[r] || [];
    const texts = row.map(N);
    let codeCol = texts.findIndex(t => /^(ma hieu|drawing code|ma bv|ma hieu ban ve)$/.test(t));
    const nameCol = texts.findIndex(t => /ten ban ve|drawing name|ten hieu/.test(t));
    if (nameCol < 0) continue;
    if (codeCol < 0) {
      // No code header (MCR-style): find the column holding code-shaped values.
      const hits = new Map();
      for (let rr = r + 1; rr < Math.min(r + 31, rows.length); rr++) {
        const cand = rows[rr] || [];
        for (let c = 0; c < Math.min(cand.length, 80); c++) {
          const v = toText(cand[c]);
          if (looksLikeCode(v)) hits.set(c, (hits.get(c) || 0) + 1);
        }
      }
      let best = null;
      for (const [c, n] of hits) {
        if (n >= 2 && (best == null || n > hits.get(best))) best = c;
      }
      if (best == null) continue;
      codeCol = best;
    }
    // band = this row + up to 3 following rows (tier-2/3 sub-headers)
    const band = [row];
    for (let k = 1; k <= 3 && r + k < rows.length; k++) band.push(rows[r + k] || []);
    const at = (rr, c) => N((band[rr] || [])[c]);
    const findInBand = (re, fromCol = 0, toCol = 400) => {
      for (let rr = 0; rr < band.length; rr++) {
        for (let c = fromCol; c < Math.min(toCol, (band[rr] || []).length + 50); c++) {
          if (re.test(at(rr, c))) return { row: r + rr, col: c };
        }
      }
      return null;
    };
    const progress = findInBand(/% ht|% hoan thanh|% complete/);
    const approval = findInBand(/ngay phe duyet|approval date/);
    const note = findInBand(/ghi chu|remark|note/);
    // rounds: 'lần N' anchors, then plan/actual/reply/date within each block
    const rounds = [];
    const roundAnchors = [];
    const seenLevels = new Set();
    for (let rr = 0; rr < band.length; rr++) {
      for (let c = 0; c < (band[rr] || []).length + 60; c++) {
        const m = /lan\s*(\d)/.exec(N((band[rr] || [])[c]));
        if (m && !seenLevels.has(Number(m[1]))) { seenLevels.add(Number(m[1])); roundAnchors.push({ level: Number(m[1]), col: c }); }
      }
    }
    roundAnchors.sort((a, b) => a.col - b.col);
    const bandEndCol = approval ? approval.col : (row.length + 60);
    for (const a of roundAnchors) {
      const nextAnchor = roundAnchors.find(x => x.col > a.col);
      const end = Math.min(nextAnchor ? nextAnchor.col : bandEndCol, a.col + 12);
      const within = (re) => {
        for (let rr = 0; rr < band.length; rr++) {
          for (let c = a.col; c < end; c++) {
            if (re.test(N((band[rr] || [])[c]))) return c;
          }
        }
        return null;
      };
      rounds.push({
        level: a.level,
        plan: within(/du kien|ke hoach|planned|plan/),
        actual: within(/thuc te|actual/),
        reply: within(/\bbql\b|phan hoi|reply|feedback|client/),
        date: null, // resolved below: first date col after reply
      });
    }
    // date = first 'ngày'-ish col at/after reply within the round block
    for (const rd of rounds) {
      const a = roundAnchors.find(x => x.level === rd.level);
      const nextAnchor = roundAnchors.find(x => x.col > a.col);
      const end = Math.min(nextAnchor ? nextAnchor.col : bandEndCol, a.col + 12);
      for (let rr = 0; rr < band.length; rr++) {
        for (let c = (rd.reply ?? a.col); c < end; c++) {
          if (/ngay|date/.test(N((band[rr] || [])[c])) && c !== rd.reply) { rd.date = c; break; }
        }
        if (rd.date != null) break;
      }
    }
    // MCR-style variant: plan/actual are tier-1 columns LEFT of the first
    // round anchor (I/J 'ngày dự kiến/thực tế trình'), replies live in the
    // Lần-block. Override round 1 with the tier-1 columns when present.
    if (rounds.length) {
      const firstAnchorCol = roundAnchors[0].col;
      let tierPlan = null;
      let tierActual = null;
      for (let rr = 0; rr < band.length && (tierPlan == null || tierActual == null); rr++) {
        for (let c = 0; c < firstAnchorCol; c++) {
          const t = N((band[rr] || [])[c]);
          if (tierPlan == null && /du kien|ke hoach|planned|plan/.test(t)) tierPlan = c;
          if (tierActual == null && /thuc te|actual/.test(t)) tierActual = c;
        }
      }
      if (tierPlan != null || tierActual != null) {
        if (tierPlan != null) rounds[0].plan = tierPlan;
        if (tierActual != null) rounds[0].actual = tierActual;
      }
    }
    // data starts after the last header-ish row of the band
    let bandEnd = r;
    for (let rr = 0; rr < band.length; rr++) {
      const cells = (band[rr] || []).map(N).join(' ');
      if (/lan\s*\d|du kien|thuc te|bql|ngay|tuan|week|ma hieu|ten ban ve|phe duyet|ghi chu/.test(cells)) bandEnd = r + rr;
    }
    return {
      headerRow: r, dataStart: bandEnd + 1, codeCol, nameCol,
      progressCol: progress?.col ?? null, approvalCol: approval?.col ?? null, noteCol: note?.col ?? null,
      rounds: rounds.sort((a, b) => a.level - b.level),
    };
  }
  return null;
}

function parseRow(row, map) {
  const drawingCode = toText(row[map.codeCol]);
  // drawing codes always carry digits ('...-BOH-001'); section/group labels don't
  if (!drawingCode || !/\d/.test(drawingCode)) return null;
  const out = {
    drawing_code: drawingCode,
    name_vi: toText(row[map.nameCol]),
    name_en: null,
    progress_pct: map.progressCol != null ? toFloat(row[map.progressCol]) : null,
    planned_submit_date: null,
    actual_submit_date: null,
    approval_date: map.approvalCol != null ? toDate(row[map.approvalCol]) : null,
    note: map.noteCol != null ? toText(row[map.noteCol]) : null,
  };
  map.rounds.slice(0, 5).forEach((rd, i) => {
    const n = i + 1;
    out[`bql_l${n}_response`] = rd.reply != null ? toText(row[rd.reply]) : null;
    out[`bql_l${n}_date`] = rd.date != null ? toDate(row[rd.date]) : null;
    out[`bql_l${n}_comment`] = null;
    if (n === 1) {
      out.planned_submit_date = rd.plan != null ? toDate(row[rd.plan]) : null;
      out.actual_submit_date = rd.actual != null ? toDate(row[rd.actual]) : null;
    }
  });
  for (let n = map.rounds.length + 1; n <= 5; n++) {
    out[`bql_l${n}_response`] = null;
    out[`bql_l${n}_date`] = null;
    out[`bql_l${n}_comment`] = null;
  }
  out.rs1_planned_date = null;
  out.rs1_actual_date = null;
  out.rs2_planned_date = null;
  out.rs2_actual_date = null;
  return out;
}

export async function parse(filePath, projectId, zoneCode) {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const { code, name } = resolveZone(zoneCode);
  const sheets = [];
  for (const sheetName of wb.SheetNames) {
    if (!sheetName.toUpperCase().startsWith('SHOP') && sheetName !== 'SHOP OTH') continue;
    const rows = readSheet(filePath, sheetName);
    const map = locateShopHeader(rows);
    if (!map) continue;
    const sheetRows = [];
    for (let r = map.dataStart; r < rows.length; r++) {
      const row = rows[r] || [];
      const parsed = parseRow(row, map);
      if (parsed) sheetRows.push({ rowIndex: r + 1, ...parsed });
    }
    sheets.push({ sheet: sheetName, rows: sheetRows });
  }
  return { zone: { code, name }, sheets, totalRows: sheets.reduce((s, x) => s + x.rows.length, 0) };
}

export async function commit(parsed, projectId, zoneCode, uploadId = null) {
  const db = getDb();
  const { code } = resolveZone(zoneCode);
  const zone = await findOrCreateZone(projectId, code, code);
  const zoneId = zone.id;

  const report = { doc_type: 'shop_drawing', zone: code, ok: 0, errors: 0, items: [] };
  for (const sheet of parsed.sheets) {
    for (const [idx, row] of sheet.rows.entries()) {
      try {
        await db.upsert('shop_drawings',
          { conflictCols: ['project_id', 'drawing_code'] },
          {
            project_id: projectId, zone_id: zoneId, source_sheet: sheet.sheet, upload_id: uploadId,
            drawing_code: row.drawing_code, name_vi: row.name_vi, name_en: row.name_en,
            progress_pct: row.progress_pct,
            planned_submit_date: row.planned_submit_date, actual_submit_date: row.actual_submit_date,
            bql_l1_response: row.bql_l1_response, bql_l1_date: row.bql_l1_date, bql_l1_comment: row.bql_l1_comment,
            bql_l2_response: row.bql_l2_response, bql_l2_date: row.bql_l2_date, bql_l2_comment: row.bql_l2_comment,
            bql_l3_response: row.bql_l3_response, bql_l3_date: row.bql_l3_date, bql_l3_comment: row.bql_l3_comment,
            bql_l4_response: row.bql_l4_response, bql_l4_date: row.bql_l4_date, bql_l4_comment: row.bql_l4_comment,
            bql_l5_response: row.bql_l5_response, bql_l5_date: row.bql_l5_date, bql_l5_comment: row.bql_l5_comment,
            rs1_planned_date: row.rs1_planned_date, rs1_actual_date: row.rs1_actual_date,
            rs2_planned_date: row.rs2_planned_date, rs2_actual_date: row.rs2_actual_date,
            approval_date: row.approval_date,
          }
        );
        report.ok++;
      } catch (e) {
        recordFailure(report, { sheet: sheet.sheet, row: row.rowIndex ?? idx + 1, ref: row.drawing_code, message: e.message, keep: { code: row.drawing_code } });
      }
    }
  }
  return report;
}

// Backward compat
export async function ingestShopDrawing(filePath, projectId, zoneCode) {
  const parsed = await parse(filePath, projectId, zoneCode);
  return await commit(parsed, projectId, zoneCode);
}
