#!/usr/bin/env node
// Sinh workbook S&P (bảng kê thanh toán NCC) **từ dữ liệu thật đang có trong DB**.
//
// ── Vì sao có công cụ này ─────────────────────────────────────────────────────────
// `tests/e2e/step1-05-sp-ap.mjs` và `step1-06-bte-dashboard.mjs` cần một sổ S&P thật.
// Đo 2026-09-28 trên toàn bộ `reference_sheets/`: 14 file có bảng kê vật tư *và* cột
// thanh toán, nhưng **ô thanh toán rỗng** ⇒ `sp_ap.parse` ra `batches: 0`. Nhóm
// `TIẾN ĐỘ THANH TOÁN A_B/*.xlsx` có dữ liệu tiền nhưng **không** có bảng kê.
// Thiếu đúng `HBG-BTE-MSA-S&P-CTY-2020.03.28.xlsx` — sổ của khách hàng.
//
// Quyết định của chủ dự án 2026-09-30 (phương án C): **dựng file từ dữ liệu đang có**,
// không chờ sổ khách hàng.
//
// ── CẢNH BÁO QUAN TRỌNG: file này KHÔNG dùng để đối soát giá trị ────────────────
// Số trong file là số của **dự án demo**, không phải sổ của khách hàng. Nó dùng để
// **kiểm logic** (parse → commit → chuỗi hợp đồng → hóa đơn → PR → thanh toán), tuyệt đối
// không dùng cho `npm run test:reconcile` hay bất kỳ đối soát tiền nào. Tôi đã khuyến
// nghị phương án A (ghi là thiếu dữ liệu) và chủ dự án chọn C — nên ghi rõ ở đây để
// không ai sau này lấy nhầm làm số thật.
//
// ── Vì sao sinh bằng công cụ chứ không làm file tay ───────────────────────────────
// Vì mọi thứ phải **tái lập được**. File tay thì không ai biết nó lấy từ đâu, và một
// lần sửa header là hỏng im lặng. Ở đây: chạy lại là ra file, và mỗi cột đều truy
// được về một trường trong DB.
//
// ── Cấu trúc sheet bám đúng `locateMaterialHeader` + `locatePaymentCols` ───────────
// `sp_ap.js:locatePaymentCols` dò từ `map.actualCol + 1`, nên khối thanh toán **phải nằm
// bên phải** cột "ngày thực tế giao". `contractDateCol` dò từ `deliveryAnchor`, nên
// "ngày ký" **phải nằm sau** "thời gian giao". Hai ràng buộc này không có trong tài liệu
// nào, chỉ có trong code — đây là lý do bố cục cột ở dưới được ghi chú từng dòng.
//
// Dùng:  node scripts/build-sp-ap-sample.mjs [đường/dẫn/xuất.xlsx]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { needSync } from '../backend/src/lib/optional-dep.js';
import { getDb, closeDb } from '../backend/src/db/index.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = process.argv[2] || join(ROOT, 'data/samples/sp-ap-from-demo.xlsx');

const xlsx = needSync('xlsx');

// ── Bố cục cột ───────────────────────────────────────────────────────────────────
// `norm()` bỏ dấu + hạ chữ thường, nên tiêu đề tiếng Việt khớp regex.
// Số thứ tự KHÔNG tùy ý: hai ràng buộc ở trên chi phối nó.
const COLS = [
  'Ma hieu',            // 0  refCol
  'Ten vat tu',         // 1  descCol
  'So HD',              // 2  contractCol
  'Nha cung cap',       // 3  supplierCol
  'Nhan hieu',          // 4  brandCol
  'Yeu cau so',         // 5  requestNoCol
  'Lan giao',           // 6  batchCol
  'Thoi gian giao',     // 7  deliveryAnchor — mốc để các cột sau dò từ đây
  'Ngay yeu cau',       // 8  reqDateCol
  'Ngay ky hop dong',   // 9  contractDateCol — phải SAU deliveryAnchor
  'Ngay du kien',       // 10 etaCol
  'Ngay thuc te giao',  // 11 actualCol — khối tiền bắt đầu từ cột 12
  'Nghiem thu',         // 12 acceptCol
  'Status',             // 13
  'Ghi chu',            // 14 remarkCol
  'Gia tri hop dong',   // 15 valueCol   ┐
  'Tam ung',            // 16 advanceCol │
  'Gia tri con lai',    // 17 balanceCol  ├ khối thanh toán, phải SAU actualCol
  'Ho so TT',           // 18 dossierCol  │
  'Den han du kien',    // 19 dueFcCol    │
  'Ngay den han',       // 20 dueCol      │
  'Ngay thuc te TT',    // 21 paidCol     ┘
];

const NOTICE = 'BANG KE THANH TOAN NCC — dung de KIEM LOGIC ingest; KHONG dung de doi soat gia tri '
  + '(so la cua du an demo, khong phai so cua khach hang)';

const db = getDb();

// Chỉ lấy PR ở trạng thái mà `commit()` còn chuyển được sang PAID. `commit` chạy
// `UPDATE … WHERE status IN ('PENDING','APPROVED')`; PR đã PAID sẽ khớp 0 dòng ⇒ nó
// **cố ý** ném lỗi. Lấy cả PAID vào là bài kiểm đỏ vì dữ liệu, không phải vì parser.
const rows = await db.prepare(`
  SELECT pr.request_no, pr.request_date::text, pr.due_date::text, pr.amount::float8 AS amount,
         pr.status,
         i.invoice_no,
         c.contract_no, c.contract_name, c.signed_date::text, c.total_value::float8 AS contract_value,
         p.code AS project_code,
         (SELECT count(*)::int FROM payments pay WHERE pay.payment_request_id = pr.id) AS paid_rows
    FROM payment_requests pr
    JOIN invoices  i ON i.id = pr.invoice_id
    JOIN contracts c ON c.id = i.contract_id
    JOIN projects  p ON p.id = c.project_id
   WHERE pr.status IN ('PENDING','APPROVED')
     AND pr.amount IS NOT NULL AND pr.amount > 0
   -- Một số yêu cầu thanh toán **trùng số** ở dữ liệu demo: đo 2026-09-30, 133 dòng
   -- nhưng chỉ 125 'request_no' khác nhau ('HBG-BTE-YCVT-HVAC-' xuất hiện 4 lần).
   --
   -- Để nguyên thì 'commit' **lỗi**, và lỗi này **đúng**: nó khoá invoice theo
   -- '(contract_id, invoice_no)' và 'invoice_no = request_no', nên dòng thứ hai trùng số
   -- sẽ trỏ về cùng một payment request — cái mà dòng trước đã chuyển sang PAID ⇒
   -- 'UPDATE … WHERE status IN ('PENDING','APPROVED')' khớp 0 dòng ⇒ ném lỗi
   -- "only PENDING or APPROVED can be imported as PAID". Importer đang cảnh báo đúng;
   -- dữ liệu mới là thứ sai. Bảng kê thật thì một số yêu cầu = một dòng, nên ta lấy
   -- mỗi số một lần — và **không** bịa số hậu tố, để số trong file vẫn là số thật.
   -- 125 dòng vẫn vượt ngưỡng > 50 mà 'step1-05' đòi.
   ORDER BY pr.request_no, c.contract_no, pr.id
   -- DISTINCT ON phải đi cùng ORDER BY để lấy dòng đại diện xác định
`).allAsync().then((all) => {
  const seen = new Set();
  return all.filter((r) => {
    const k = r.request_no;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
});

await closeDb();

if (!rows?.length) {
  console.error('Không có payment_request nào ở trạng thái PENDING/APPROVED với amount > 0.');
  console.error('Cần dữ liệu chuỗi hợp đồng → hóa đơn → PR trước khi sinh file.');
  process.exit(1);
}

// Mỗi PR = một hạng mục cha (ref có chữ số) và là chính batch của nó. `parse` đếm
// `totalRows` = số hạng mục cha, và bài kiểm đòi `> 50` — nên mỗi hỏa đơn một hàng là
// đủ và cũng sát thực tế: mỗi đợt thanh toán là một dòng bảng kê.
// Ngày phải viết theo định dạng `lib/excel.js:toDate` thật sự hiểu: nó nhận `Date` hoặc
// chuỗi `dd/mm/yyyy` / `dd-mm-yyyy`, và **không** hiểu `YYYY-MM-DD` ⇒ trả `null`.
//
// Đo 2026-09-30: tôi viết ISO ⇒ mọi cột ngày (`paid_date`, `due_date`, `contract_date`,
// `request_date`…) ra `null` ⇒ `commit` không tạo dòng `payments` nào, trong khi `parse`
// vẫn ra 133 hạng mục và `errors = 0`. Cũng là lỗi **im lặng**.
//
// Dùng `dd/mm/yyyy` thay vì đối tượng `Date` để không có phép chuyển múi giờ nào xen vào:
// `toDate(Date)` cắt `toISOString()` (theo UTC) nên Date nửa đêm giờ địa phương lệch một
// ngày ở múi dương.
const VN = (d) => {
  const t = new Date(`${String(d).slice(0, 10)}T00:00:00Z`);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(t.getUTCDate())}/${p(t.getUTCMonth() + 1)}/${t.getUTCFullYear()}`;
};
const daysAgo = (n) => VN(new Date(Date.now() - n * 86400000).toISOString());

const data = rows.map((r, i) => {
  // Cứ mỗi 3 dòng thì một dòng "đã trả" — đủ để bài kiểm có dòng PAID để spot-check,
  // và vẫn giữ dòng chưa trả để nhánh không-paid cũng được chạy.
  const isPaid = i % 3 === 0;
  const value = Number(r.amount);
  // `commit` tính `paidAmount = value - balance` và bắt buộc 0 ≤ paidAmount ≤ value.
  // Dòng đã trả ⇒ balance = 0 (trả hết); dòng chưa trả ⇒ balance = value ⇒ chưa trả gì.
  const balance = isPaid ? 0 : value;
  return {
    // `isParent` trong parser là `ref && /\\d/.test(ref)` — bắt buộc có chữ số.
    ref_code: `VT-${String(i + 1).padStart(4, '0')}`,
    description: r.contract_name || r.contract_no,
    contract_no: r.contract_no,
    supplier: 'DEMO NCC',
    brand: '',
    request_no: r.request_no,
    batch: 1,
    delivery: '',
    req_date: r.request_date ? VN(r.request_date) : null,
    contract_date: r.signed_date ? VN(r.signed_date) : null,
    eta: r.due_date ? VN(r.due_date) : null,
    actual: r.paid_rows > 0 || isPaid ? daysAgo(30 - (i % 60)) : null,
    accept: '',
    status: isPaid ? 'PAID' : 'PENDING',
    remark: `project ${r.project_code}`,
    value,
    advance: 0,
    balance,
    dossier: r.request_date ? VN(r.request_date) : null,
    due_forecast: r.due_date ? VN(r.due_date) : null,
    due: r.due_date ? VN(r.due_date) : null,
    paid_date: isPaid ? daysAgo(20 - (i % 15)) : null,
  };
});

// Bản đầu gộp tiêu đề cảnh báo **vào cùng dòng** header: `[NOTICE, '', ...COLS]`.
// `locateMaterialHeader` thấy `Ma hieu` ở **cột 2** nên mọi cột lệch 2, và hàng dữ liệu
// (bắt đầu ở cột 0) lệch với header ⇒ `paidCol = null` ⇒ **không dòng nào có ngày trả**
// ⇒ `payments = 0`. Đo 2026-09-30. Lỗi này im lặng: `parse` vẫn ra 122 hạng mục, chỉ là
// nhánh "đã trả" chạy vào 0 dòng.
//
// Nên tiêu đề nằm ở **dòng riêng**, và hàng header khớp **đúng** bố cục hàng dữ liệu.
const header = COLS;
const body = data.map((d) => [
  d.ref_code, d.description, d.contract_no, d.supplier, d.brand, d.request_no, d.batch,
  d.delivery, d.req_date, d.contract_date, d.eta, d.actual, d.accept, d.status, d.remark,
  d.value, d.advance, d.balance, d.dossier, d.due_forecast, d.due, d.paid_date,
]);

// Ghi số thật (number), không ghi chuỗi "1.234,5". `lib/excel.js:toFloat` chỉ thay dấu
// phẩy đầu tiên rồi `parseFloat`, nên chuỗi tiền kiểu Việt sẽ ra số sai âm thầm — đúng
// cái bẫy `value-compare` đã ghi.
const ws = xlsx.utils.aoa_to_sheet([[NOTICE], header, ...body]);
ws['!cols'] = COLS.map((c, i) => ({ wch: i === 1 ? 42 : Math.max(12, c.length + 2) }));
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, 'TIEN DO THANH TOAN NCC');

mkdirSync(dirname(OUT), { recursive: true });
// Không dùng `xlsx.writeFile`: bản `@e965/xlsx` ở đây là build không binding `fs`
// ⇒ `Error: cannot save file`. Sinh buffer rồi tự ghi — không phụ thuộc binding nào.
const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
writeFileSync(OUT, buf);

const paid = data.filter((d) => d.paid_date).length;
console.log(`Đã sinh: ${OUT}`);
console.log(`  ${data.length} hạng mục · ${paid} dòng đã trả (có Ngay TT thuc te) · ${data.length - paid} dòng chưa trả`);
console.log(`  tổng giá trị: ${data.reduce((s, d) => s + d.value, 0).toLocaleString('vi-VN')} đ`);
console.log('  ⚠ Số của DỰ ÁN DEMO — dùng để kiểm logic ingest, KHÔNG dùng để đối soát giá trị.');
console.log('  Chạy:  SP_FILE=' + OUT + ' node tests/e2e/step1-05-sp-ap.mjs');
