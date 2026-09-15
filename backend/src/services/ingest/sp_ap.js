// Supplier-AP import (MSA-S&P-CTY shape): material register + per-batch
// supplier payment columns → contracts → invoices → payment_requests → payments.
//
// ISOLATED by design: the only ingestor that writes money tables. Parse and
// commit are strict about chain integrity (every payment_request has an
// invoice, every invoice a contract); unknown amounts stay null rather than
// zero so unpaid ≠ paid-by-mistake.
import { getDb } from '../../db/index.js';
import { recordFailure } from './failures.js';
import { readSheet, toText, toFloat, toDate } from '../../lib/excel.js';
import { norm } from '../../lib/classify.js';
import { locateMaterialHeader } from './material_supply.js';

function resolveZone(zoneCode) {
  if (!zoneCode) return { code: 'GEN-MAT', name: 'Material Supply - General' };
  return { code: zoneCode, name: zoneCode };
}

// Payment columns live right of the delivery block: contract value, advance,
// balance, dossier date, due forecast, due, actual-paid.
export function locatePaymentCols(rows, map) {
  if (!map) return null;
  const N = (v) => norm(v);
  const band = [];
  for (let k = 0; k <= 2; k++) band.push(rows[map.headerRow + k] || []);
  const at = (rr, c) => N((band[rr] || [])[c]);
  const from = map.actualCol != null ? map.actualCol + 1 : 0;
  const findCol = (re, skipRe = null) => {
    for (let rr = 0; rr < band.length; rr++) {
      const brow = band[rr] || [];
      for (let c = from; c < brow.length + 10; c++) {
        const t = at(rr, c);
        if (re.test(t) && !(skipRe && skipRe.test(t))) return c;
      }
    }
    return null;
  };
  return {
    valueCol: findCol(/gia tri.*(hd|hop dong)|contract value|gia tri hop/),
    advanceCol: findCol(/tam ung|advance|tt hd/),
    balanceCol: findCol(/gia tri con lai|balance|con lai/),
    dossierCol: findCol(/giao day du ho so|dossier|ho so tt/),
    dueFcCol: findCol(/den han.*du kien|due.*forecast/),
    dueCol: findCol(/ngay den han|due/, /du kien|forecast/),
    paidCol: findCol(/ngay thuc te|thuc te tt|actual|paid/),
  };
}

function parsePay(row, pay) {
  if (!pay) return null;
  const num = (c) => (c != null ? toFloat(row[c]) : null);
  const dat = (c) => (c != null ? toDate(row[c]) : null);
  const out = {
    value: num(pay.valueCol), advance: num(pay.advanceCol), balance: num(pay.balanceCol),
    dossier_date: dat(pay.dossierCol), due_forecast: dat(pay.dueFcCol), due_date: dat(pay.dueCol), paid_date: dat(pay.paidCol),
  };
  return Object.values(out).some(v => v != null) ? out : null;
}

export async function parse(filePath, projectId, zoneCode) {
  const XLSX = (await import('xlsx')).default;
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const { code, name } = resolveZone(zoneCode);
  const sheets = [];
  let skippedEmpty = 0;
  for (const sheetName of wb.SheetNames) {
    if (/^(foxz|sheet\d*)$/i.test(sheetName.trim())) continue;
    const rows = readSheet(filePath, sheetName);
    if (rows.length < 5) continue;
    const map = locateMaterialHeader(rows);
    if (!map) continue;
    const pay = locatePaymentCols(rows, map);
    const items = [];
    let current = null;
    for (let r = map.dataStart; r < rows.length; r++) {
      const row = rows[r] || [];
      const refRaw = toText(row[map.refCol]);
      const ref = refRaw ? refRaw.split(/\r?\n/)[0].trim() : null;
      const isParent = ref && /\d/.test(ref);
      const batchNo = map.batchCol != null ? toText(row[map.batchCol]) : null;
      const requestNo = map.requestNoCol != null ? toText(row[map.requestNoCol]) : null;
      const payment = parsePay(row, pay);
      const hasBatch = requestNo || payment;
      if (isParent) {
        const desc = map.descCol != null ? toText(row[map.descCol]) : null;
        const brand = row[map.brandCol] != null ? toText(row[map.brandCol]) : null;
        // ref-only label rows carry nothing — counted, not failures
        if (!desc && !brand && !hasBatch) { skippedEmpty++; continue; }
        current = {
          rowIndex: r + 1, ref_code: ref,
          description: map.descCol != null ? toText(row[map.descCol]) : null,
          contract_no: map.contractCol != null ? toText(row[map.contractCol]) : null,
          contract_date: map.contractDateCol != null ? toDate(row[map.contractDateCol]) : null,
          batches: [],
        };
        items.push(current);
        if (hasBatch) current.batches.push({ rowIndex: r + 1, batch: batchNo, request_no: requestNo, payment });
      } else if (current && hasBatch) {
        current.batches.push({ rowIndex: r + 1, batch: batchNo, request_no: requestNo, payment });
      }
    }
    if (items.length > 0) sheets.push({ sheet: sheetName, rows: items });
  }
  return { zone: { code, name }, sheets, totalRows: sheets.reduce((s, x) => s + x.rows.length, 0), skippedEmpty };
}

export async function commit(parsed, projectId, zoneCode) {
  const db = getDb();
  const report = { doc_type: 'supplier_payment', ok: 0, errors: 0, items: [], skipped_empty: parsed.skippedEmpty || 0 };
  for (const sheet of parsed.sheets) {
    for (const [idx, row] of sheet.rows.entries()) {
      // parents without any payment batch carry no AP content — skip silently
      if (!row.batches.length) continue;
      for (const [bIdx, b] of row.batches.entries()) {
        try {
          const contractNo = row.contract_no || `AP-${row.ref_code}`;
          let contract = await db.prepare('SELECT id FROM contracts WHERE project_id = ? AND contract_no = ?').getAsync(projectId, contractNo);
          if (!contract) {
            const ins = await db.prepare(
              `INSERT INTO contracts (project_id, contract_no, contract_name, signed_date, total_value) VALUES (?, ?, ?, ?, ?)`
            ).runAsync(projectId, contractNo, row.description, row.contract_date, b.payment?.value ?? null);
            contract = { id: Number(ins.lastInsertRowid) };
          }
          if (!contract) throw new Error(`Cannot resolve contract ${contractNo}`);
          const invoiceNo = b.request_no || `AP-REQ-${row.ref_code}-L${b.batch || bIdx + 1}`;
          let invoice = await db.prepare('SELECT id FROM invoices WHERE contract_id = ? AND invoice_no = ?').getAsync(contract.id, invoiceNo);
          if (!invoice) {
            const ins = await db.prepare(
              `INSERT INTO invoices (contract_id, invoice_no, invoice_date, amount, status) VALUES (?, ?, ?, ?, 'SUBMITTED')`
            ).runAsync(contract.id, invoiceNo, b.payment?.actual || b.payment?.eta || null, b.payment?.value ?? null);
            invoice = { id: Number(ins.lastInsertRowid) };
          }
          const prNo = b.request_no || invoiceNo;
          let pr = await db.prepare('SELECT id, status FROM payment_requests WHERE invoice_id = ? AND request_no = ?').getAsync(invoice.id, prNo);
          if (!pr) {
            const ins = await db.prepare(
              `INSERT INTO payment_requests (invoice_id, request_no, request_date, amount, retention_amount, due_date, status, notes) VALUES (?, ?, ?, ?, 0, ?, 'PENDING', 'imported: supplier-AP')`
            ).runAsync(invoice.id, prNo, b.payment?.dossier_date || null, b.payment?.value ?? null, b.payment?.due_date || null);
            pr = { id: Number(ins.lastInsertRowid), status: 'PENDING' };
          }
          if (b.payment?.paid_date) {
            const existing = await db.prepare('SELECT id FROM payments WHERE payment_request_id = ?').getAsync(pr.id);
            if (!existing) {
              const paidAmount = (b.payment.value ?? 0) - (b.payment.balance ?? 0);
              await db.prepare(
                `INSERT INTO payments (project_id, payment_request_id, contract_no, invoice_no, amount, paid_amount, due_date, paid_at, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PAID', 'imported: supplier-AP')`
              ).runAsync(projectId, pr.id, contractNo, invoiceNo, b.payment.value ?? null, paidAmount, b.payment.due_date || null, b.payment.paid_date);
            }
            await db.prepare(`UPDATE payment_requests SET status = 'PAID' WHERE id = ? AND status <> 'PAID'`).runAsync(pr.id);
          }
          report.ok++;
        } catch (e) {
          recordFailure(report, { sheet: sheet.sheet, row: b.rowIndex ?? idx + 1, ref: row.ref_code, message: e.message, keep: { code: row.ref_code, batch: b.batch } });
        }
      }
    }
  }
  return report;
}
