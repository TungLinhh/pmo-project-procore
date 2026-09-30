// Supplier-AP import (MSA-S&P-CTY shape): material register + per-batch
// supplier payment columns → contracts → invoices → payment_requests → payments.
//
// ISOLATED by design: the only ingestor that writes money tables. Parse and
// commit are strict about chain integrity (every payment_request has an
// invoice, every invoice a contract); unknown amounts stay null rather than
// zero so unpaid ≠ paid-by-mistake.
import { getDb } from '../../db/index.js';
import { recordFailure } from './failures.js';
import { readSheet, readWorkbook, toText, toFloat, toDate } from '../../lib/excel.js';
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
  // Band CHỈ gồm các dòng tiêu đề, **không gồm dòng dữ liệu**.
  //
  // Bản đầu lấy `headerRow … headerRow + 2` thẳng. Với sheet một dòng tiêu đề, dòng
  // `headerRow + 1` và `+ 2` là **dữ liệu** — và `findCol` quét cả chúng. Đo 2026-09-30:
  // cột `Status` chứa chữ `PAID` ở dòng dữ liệu đầu tiên, nên `paidCol` dò ra **giá trị
  // `"PAID"` tại cột 13** thay vì cột "Ngày TT thực tế" ở cột 21 ⇒ mọi dòng đều không có
  // ngày trả ⇒ `payments = 0`, trong khi `parse` vẫn ra 122 hạng mục và `commit` báo
  // `errors: 0`. Lỗi **im lặng và rất dễ nhầm là "không có dữ liệu trả"**.
  //
  // `map.dataStart` đã cho biết dòng dữ liệu bắt đầu ở đâu (do `locateMaterialHeader`
  // dò băng tiêu đề rồi chốt). Nên band = các dòng tiêu đề thật, vẫn hỗ trợ header nhiều
  // dòng nhưng không bao giờ đọc vào ô dữ liệu.
  const headerRows = Math.max(1, Math.min(3, (map.dataStart ?? map.headerRow + 3) - map.headerRow));
  const band = [];
  for (let k = 0; k < headerRows; k++) band.push(rows[map.headerRow + k] || []);
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
  const wb = readWorkbook(filePath);
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
  // Imports can mark a request PAID, which checkTransition() treats as
  // APPROVED->PAID, so the approval trail has to name someone. The importer is
  // the system acting on behalf of the uploader. CEO is role='pmo' + is_ceo=1,
  // not a role value (see permissions.js).
  const approvedBy = await db.prepare(
    `SELECT u.id FROM users u WHERE u.tenant_id = (SELECT tenant_id FROM projects WHERE id = ?)
       AND (u.role IN ('admin','accounting') OR u.is_ceo) ORDER BY u.id LIMIT 1`
  ).getAsync(projectId);
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
            if (b.payment.value == null || b.payment.balance == null) {
              throw new Error('paid_date present but contract value/balance is unknown; manual reconciliation required');
            }
            const value = Number(b.payment.value);
            const balance = Number(b.payment.balance);
            if (!Number.isFinite(value) || !Number.isFinite(balance)) {
              throw new Error('paid_date present but contract value/balance is unknown; manual reconciliation required');
            }
            const paidAmount = value - balance;
            if (paidAmount < 0 || paidAmount > value) {
              throw new Error(`invalid paid amount ${paidAmount} for value ${value}`);
            }
            // `paid_amount` PHẢI bằng `amount` của payment request — đúng bất biến
            // `routes/payment.js:381` cưỡng chế (`paid_amount must equal the approved
            // request amount`). Trước đây ghi `amount = value, paid_amount = value`
            // với `value` là **giá trị hợp đồng** trong sheet, khác `pr.amount` (tiền
            // của đợt này) ⇒ mọi khoản nạp vào đều không đi qua nổi kiểm tra đó.
            // Comment cũ mô tả ý định đúng nhưng code chưa làm theo.
            // `pr` ở đây **không có trường `amount`**: nhánh tạo mới gán
            // `{ id, status }`, còn nhánh tìm thấy thì `SELECT id, status`. Nên
            // `Number(pr.amount ?? 0)` ra `0` **mọi lần** và mọi dòng đã trả đều ném
            // `has no usable amount`.
            //
            // Đo 2026-09-30: nhánh PAID của importer **chưa từng chạy được** — nó bị che
            // vì cả 14 file `Vật tư *.xlsx` trên máy đều có ô thanh toán **rỗng**, nên
            // không dòng nào có `paid_date` để đi vào nhánh này. Sửa bằng cách đọc
            // `amount` từ DB (nguồn chân lý) thay vì tin object in-memory; chỉ tốn
            // thêm một truy vấn, và chỉ trên nhánh đã trả.
            const prRow = await db.prepare('SELECT amount FROM payment_requests WHERE id = ?').getAsync(pr.id);
            const requestAmount = Number(prRow?.amount ?? 0);
            if (!Number.isFinite(requestAmount) || requestAmount <= 0) {
              throw new Error(`payment request ${prNo} has no usable amount; manual reconciliation required`);
            }
            const existing = await db.prepare('SELECT id FROM payments WHERE payment_request_id = ?').getAsync(pr.id);
            if (!existing) {
              await db.prepare(
                `INSERT INTO payments (project_id, payment_request_id, contract_no, invoice_no, amount, paid_amount, due_date, paid_at, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PAID', 'imported: supplier-AP')`
              ).runAsync(projectId, pr.id, contractNo, invoiceNo, requestAmount, requestAmount, b.payment.due_date || null, b.payment.paid_date);
            }
            // PENDING -> PAID bỏ qua `checkTransition` và chốt "PR phải APPROVED mới
            // chi được" của route, nên dòng PAID không có dấu vết duyệt. Ghi lại
            // người duyệt trước khi đổi trạng thái.
            //
            // `status IN ('PENDING','APPROVED')` — trước đây là `status <> 'PAID'`,
            // cho phép **PR đã bị từ chối** nhảy thẳng lên PAID, trái với ma trận
            // chuyển trạng thái (`lib/transitions.js`: REJECTED chỉ về DRAFT/PENDING).
            // PR ở trạng thái khác thì câu UPDATE không khớp dòng nào ⇒ `runAsync`
            // trả `rowCount = 0`; đó là hành vi đúng, nhưng phải nói rõ thay vì im
            // lặng. Nên ta kiểm `rowCount` và báo lỗi dòng nếu không chuyển được.
            const flipped = await db.prepare(
              `UPDATE payment_requests
                  SET status = 'PAID',
                      approved_by = COALESCE(approved_by, ?),
                      approved_date = COALESCE(approved_date, CURRENT_DATE)
                WHERE id = ? AND status IN ('PENDING', 'APPROVED')`
            ).runAsync(approvedBy?.id ?? null, pr.id);
            // `runAsync()` trả `{ lastInsertRowid, changes }` — **không** có `rowCount`
            // (`backend/src/db/index.js:218`). Đo 2026-09-30: `flipped.rowCount` luôn
            // `undefined` ⇒ `!undefined` là đúng ⇒ **mọi** dòng đã trả đều ném lỗi, và
            // nhánh PAID của importer S&P **chưa từng chạy được**. Nó bị che vì cả 14 file
            // `Vật tư *.xlsx` trên máy đều có ô thanh toán rỗng ⇒ không dòng nào có
            // `paid_date` để đi vào đây.
            //
            // Lưu ý khi đọc code: 5 chỗ khác cũng viết `.rowCount` (`routes/shop.js`,
            // `routes/payment.js` ×2, `routes/qa.js`, `routes/projects.js`,
            // `routes/schedule-compress.js`) nhưng chúng gọi **`client.query()` thô**,
            // mà `pg` trả `rowCount` thật. Chỉ chỗ này đi qua shim `db.prepare()` nên sai.
            // Phân biệt bằng cách xem kết quả lấy từ đâu, không phải tên trường.
            if (!flipped.changes) {
              const current = await db.prepare('SELECT status FROM payment_requests WHERE id = ?').getAsync(pr.id);
              throw new Error(
                `payment request ${prNo} is ${current?.status || 'unknown'}; only PENDING or APPROVED can be imported as PAID`,
              );
            }
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
