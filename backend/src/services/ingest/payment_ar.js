// Ingestion: AR — công nợ phải thu từ CĐT (folder TIẾN ĐỘ THANH TOÁN A_B).
// File: '1. Bãi Tràm.xlsx' — sheet Sum (per-client rollup) + per-project
// sheets (contract header + invoice/payment sub-rows).
// PG-only. Mô hình A wizard: parse() returns rows, commit() inserts them.
//
// ISOLATED by design: writes ONLY ar_contracts/ar_lines, never the AP chain
// (contracts/invoices/payment_requests). Unknown amounts stay null.
import { getDb } from '../../db/index.js';
import { recordFailure } from './failures.js';
import { readSheet, toText, toInt, toFloat, toDate } from '../../lib/excel.js';
import { norm } from '../../lib/classify.js';

const SKIP_SHEETS = /^(foxz|sheet\d*)$/i;

function num(v) {
  const n = toFloat(v);
  return n;
}
function dat(v) {
  const d = toDate(v);
  if (d) return d;
  const t = toText(v);
  return t || null;
}

// ---- Sum sheet: header row carries 'ten khach hang' ----
function parseSummary(rows) {
  let hr = -1;
  for (let r = 0; r < Math.min(40, rows.length); r++) {
    if (/ten khach hang/.test(norm((rows[r] || []).join(' ')))) { hr = r; break; }
  }
  if (hr < 0) return null;
  const out = [];
  for (let r = hr + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = [toText(row[1]), toText(row[2])].filter(Boolean).join(' — ');
    if (/tong cong/.test(norm(name))) continue;
    const vals = [3, 4, 5, 6, 7, 8, 9, 10, 11].map(c => num(row[c]));
    const ordinal = toInt(row[0]) ?? r + 1;
    if (toInt(row[0]) == null && !vals.some(v => v != null)) continue;
    out.push({
      kind: 'summary', ordinal,
      project_name: toText(row[1]), client_name: toText(row[2]),
      contract_value: vals[0], settled_value: vals[1], paid_value: vals[2],
      remaining_value: vals[3], invoiced_value: vals[4], due_now_value: vals[5],
      forecast_1: vals[6], forecast_2: vals[7], invoice_debt: vals[8],
      note: toText(row[12]),
    });
  }
  return out;
}

// ---- Detail sheet: contract header row carries 'so hop dong' ----
function locateDetailBlocks(rows, hr) {
  const band = [rows[hr] || [], rows[hr + 1] || []].map(r => r.map(norm));
  const at = (rr, c) => band[rr]?.[c] || '';
  const ncols = Math.max(band[0].length, band[1].length) + 5;
  const findIn = (re, from = 0, to = ncols) => {
    for (let c = from; c < to; c++) {
      for (let rr = 0; rr < 2; rr++) if (re.test(at(rr, c))) return c;
    }
    return null;
  };
  const refCol = findIn(/so hop dong/);
  if (refCol == null) return null;
  let invStart = findIn(/hoa don/, refCol);
  let payStart = findIn(/tam ung/, (invStart ?? refCol) + 1);
  if (invStart == null) invStart = refCol + 4; // fallback: right of settled block
  if (payStart == null || payStart <= invStart) payStart = invStart + 3;
  const kind = (c) => {
    const t = `${at(0, c)} ${at(1, c)}`;
    if (/ngay/.test(t)) return 'date';
    if (/\bso\b|so hd/.test(t)) return 'no';
    if (/gia tri/.test(t)) return 'amount';
    return null;
  };
  const group = (from, to) => {
    const g = { date: null, no: null, amount: null };
    for (let c = from; c < to; c++) {
      const k = kind(c);
      if (k === 'date' && g.date == null) g.date = c;
      else if (k === 'no' && g.no == null) g.no = c;
      else if (k === 'amount' && g.amount == null) g.amount = c;
    }
    return g;
  };
  return {
    refCol,
    dateCol: findIn(/ngay ky/),
    valueCol: findIn(/gia tri hop dong/),
    settledCol: findIn(/quyet toan/),
    inv: group(invStart, payStart),
    pay: group(payStart, ncols),
  };
}

function parseDetail(rows) {
  let hr = -1;
  for (let r = 0; r < Math.min(40, rows.length); r++) {
    if (/so hop dong/.test(norm((rows[r] || []).join(' ')))) { hr = r; break; }
  }
  if (hr < 0) return null;
  const map = locateDetailBlocks(rows, hr);
  if (!map) return null;
  const out = [];
  let currentOrdinal = null;
  let currentLabel = null;
  for (let r = hr + 2; r < rows.length; r++) {
    const row = rows[r] || [];
    const stt = toInt(row[0]);
    const label = toText(row[1]);
    if (stt != null) { currentOrdinal = stt; currentLabel = label; }
    if (stt != null && (label || toText(row[map.refCol]))) {
      out.push({
        kind: 'contract', ordinal: stt, rowIndex: r + 1,
        label, ref_no: toText(row[map.refCol]), ref_date: map.dateCol != null ? dat(row[map.dateCol]) : null,
        amount: map.valueCol != null ? num(row[map.valueCol]) : null,
        note: map.settledCol != null && num(row[map.settledCol]) != null ? `quyết toán ${num(row[map.settledCol])}` : null,
      });
    }
    const g = (grp) => ({
      date: grp.date != null ? dat(row[grp.date]) : null,
      no: grp.no != null ? toText(row[grp.no]) : null,
      amount: grp.amount != null ? num(row[grp.amount]) : null,
    });
    const inv = g(map.inv);
    if (inv.amount != null || inv.no != null || inv.date != null) {
      out.push({ kind: 'invoice', ordinal: currentOrdinal, rowIndex: r + 1, label: currentLabel, ref_no: inv.no, ref_date: inv.date, amount: inv.amount, note: null });
    }
    const pay = g(map.pay);
    if (pay.amount != null || pay.date != null) {
      out.push({ kind: 'payment', ordinal: currentOrdinal, rowIndex: r + 1, label: currentLabel, ref_no: pay.no, ref_date: pay.date, amount: pay.amount, note: null });
    }
  }
  return out;
}

export async function parse(filePath, projectId) {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const sheets = [];
  for (const sheetName of wb.SheetNames) {
    if (SKIP_SHEETS.test(sheetName.trim())) continue;
    const rows = readSheet(filePath, sheetName);
    if (!rows.some(r => (r || []).some(v => v != null && String(v).trim() !== ''))) continue;
    const summary = parseSummary(rows);
    if (summary && summary.length > 0) {
      sheets.push({ sheet: sheetName, kind: 'summary', rows: summary });
      continue;
    }
    const monthly = parseMonthly(rows);
    if (monthly && monthly.length > 0) {
      sheets.push({ sheet: sheetName, kind: 'monthly', rows: monthly });
      continue;
    }
    const detail = parseDetail(rows);
    if (detail && detail.length > 0) sheets.push({ sheet: sheetName, kind: 'detail', rows: detail });
  }
  return { sheets, totalRows: sheets.reduce((s, x) => s + x.rows.length, 0) };
}

// ---- Monthly HSTT dossier sheet (e.g. HBG-BTE-MPM-01.1 'TĐ - HSTT'):
// one row per month: plan / submitted / approved / paid amounts + flags ----
function parseMonthly(rows) {
  let hr = -1;
  for (let r = 0; r < Math.min(40, rows.length); r++) {
    const t = norm((rows[r] || []).join(' '));
    if (/dien giai/.test(t) && /ho so thanh toan/.test(t)) { hr = r; break; }
  }
  if (hr < 0) return null;
  const out = [];
  for (let r = hr + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const stt = toInt(row[0]);
    const label = toText(row[1]);
    if (stt == null && !(label && /thang \d/i.test(label))) continue;
    if (!label || /noi dung chung/i.test(label)) continue;
    const material = num(row[3]);
    const plan = num(row[4]);
    const submitted = num(row[5]);
    const approved = num(row[6]);
    const paid = num(row[7]);
    if ([material, plan, submitted, approved, paid].every(v => v == null)) continue;
    const fmt = (k, v) => (v != null ? `${k} ${v}` : null);
    const note = [fmt('vật liệu', material), fmt('KH', plan), fmt('đệ trình', submitted), fmt('duyệt', approved)].filter(Boolean).join(' · ') || null;
    out.push({
      kind: 'dossier', ordinal: stt ?? r + 1, rowIndex: r + 1,
      label, ref_no: stt != null ? `đợt ${stt}` : null, ref_date: null,
      amount: paid, note,
    });
  }
  return out;
}

export async function commit(parsed, projectId, zoneCode, uploadId = null) {
  const db = getDb();
  const report = { doc_type: 'payment_ar', ok: 0, errors: 0, items: [] };
  for (const sheet of parsed.sheets || []) {
    try {
      if (sheet.kind === 'summary') {
        for (const [idx, row] of sheet.rows.entries()) {
          try {
            await db.upsert('ar_contracts',
              { conflictCols: ['project_id', 'source_sheet', 'ordinal'] },
              {
                project_id: projectId, source_sheet: sheet.sheet, upload_id: uploadId,
                ordinal: row.ordinal, project_name: row.project_name, client_name: row.client_name,
                contract_value: row.contract_value, settled_value: row.settled_value,
                paid_value: row.paid_value, remaining_value: row.remaining_value,
                invoiced_value: row.invoiced_value, due_now_value: row.due_now_value,
                forecast_1: row.forecast_1, forecast_2: row.forecast_2,
                invoice_debt: row.invoice_debt, note: row.note,
              });
            report.ok++;
          } catch (e) {
            recordFailure(report, { sheet: sheet.sheet, row: row.rowIndex ?? idx + 1, ref: row.client_name || row.project_name, message: e.message });
          }
        }
      } else {
        // idempotency: lines are position-based, clear-then-insert per sheet
        await db.prepare('DELETE FROM ar_lines WHERE project_id = ? AND source_sheet = ?').runAsync(projectId, sheet.sheet);
        for (const [idx, row] of sheet.rows.entries()) {
          try {
            await db.prepare(`
              INSERT INTO ar_lines (project_id, source_sheet, upload_id, kind, ordinal, label, ref_no, ref_date, amount, note)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).runAsync(projectId, sheet.sheet, uploadId, row.kind, row.ordinal, row.label, row.ref_no || null, row.ref_date || null, row.amount, row.note || null);
            report.ok++;
          } catch (e) {
            recordFailure(report, { sheet: sheet.sheet, row: row.rowIndex ?? idx + 1, ref: row.label, message: e.message });
          }
        }
      }
    } catch (e) {
      recordFailure(report, { sheet: sheet.sheet, row: null, ref: null, message: e.message });
    }
  }
  return report;
}

export async function ingestPaymentAR(filePath, projectId) {
  const parsed = await parse(filePath, projectId);
  return await commit(parsed, projectId);
}
