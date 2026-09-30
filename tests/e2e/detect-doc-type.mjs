// Phân loại loại tài liệu theo tên file — `lib/excel.js:detectDocType`.
//
// Vì sao bài này tồn tại (đo 2026-09-28): `POST /api/upload` từ chối file mà không nhận
// diện được loại, và **chính thông điệp lỗi** bảo người dùng đặt tên theo các từ khoá
// "tiến độ", "báo cáo", "shop", "vật tư". Nhưng probe 20 tên file tiếng Việt thực tế cho
// thấy bộ phân loại trả `unknown` cho chính những tên đó khi dùng dấu gạch nối — dấu phân
// cách phổ biến nhất ngoài đời — vì chuẩn hoá cũ chỉ thay `_` bằng khoảng trắng:
//
//   tien-do.xlsx            → unknown   (đúng ra construction_schedule)
//   ban-ve-shop.xlsx        → unknown   (đúng ra shop_drawing)
//   vat-tu-thang9.xlsx      → unknown   (đúng ra material_supply)
//   bao-cao-thanh-toan.xlsx → unknown   (đúng ra payment_progress)
//
// Vì sao phải có **cả** phần hồi quy: khi thêm biến thể chuẩn hoá, bộ phân loại từng
// gán sai 4 tên thật của dự án demo — nổi bật là `BTE-SHOP-CSP-01.xlsx` ra
// `shop_drawing` thay vì `construction_schedule`, vì `shop` trong tên mã dự án khớp luật
// `shop ` và **che mất** mã `csp-` đứng sau nó. Bài này ghim cả hai chiều.
//
//   node tests/e2e/detect-doc-type.mjs
import { detectDocType } from '../../backend/src/lib/excel.js';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

// --- 1) Tên file thực tế trên dự án xây dựng: dấu gạch nối, không dấu, gõ nửa dấu -----
// Đây là phần đã **đỏ** trước khi sửa.
const REAL = [
  ['tien-do.xlsx', 'construction_schedule'],
  ['tien-do-t9.xlsx', 'construction_schedule'],
  ['TienDoThang9.xlsx', 'construction_schedule'],
  ['tiến độ tháng 9.xlsx', 'construction_schedule'],
  ['tien độ tháng 9.xlsx', 'construction_schedule'],
  ['khoang-cach-10-2026.xlsx', 'construction_schedule'],
  ['ban-ve-shop.xlsx', 'shop_drawing'],
  ['bản vẽ shop.xlsx', 'shop_drawing'],
  ['bản vẽ shop 01.xlsx', 'shop_drawing'],
  ['vat-tu-thang9.xlsx', 'material_supply'],
  ['vật tư tháng 9.xlsx', 'material_supply'],
  ['bao-cao-daily.xlsx', 'daily_report'],
  ['báo cáo ngày 12-9.xlsx', 'daily_report'],
  ['bao-cao-thanh-toan.xlsx', 'payment_progress'],
  ['thanh toán đợt 3.xlsx', 'payment_progress'],
  ['hop-dong-thau.xlsx', 'unknown'],
  ['hinh-anh-hien-truong.xlsx', 'unknown'],
  ['data.xlsx', 'unknown'],
  ['x.xlsx', 'unknown'],
  ['123.xlsx', 'unknown'],
];

let bad = 0;
for (const [name, want] of REAL) {
  const got = detectDocType(name);
  if (got !== want) { bad += 1; console.log(`     ${name}: ra "${got}", cần "${want}"`); }
}
ok(bad === 0, `${REAL.length - bad}/${REAL.length} tên file thực tế được nhận diện đúng`);

// --- 2) Không hồi quy trên tên thật của dự án demo -------------------------------
// Danh sách này đã đúng **trước** bản sửa; nếu bản sửa đổi kết quả thì đã phá dữ liệu.
// **Kỳ vọng lấy từ kết quả thật của `HEAD`**, không phải từ trí nhớ. Lần đầu viết
// bài này tôi ghi `BTE-WP4-SHOP.xlsx` → `shop_drawing` và `BTE-MCR-MPM.xlsx` →
// `manpower_master_plan`; đo lại HEAD cho `unknown` và `payment_ar`. Nếu bản sửa đã cải
// thiện tên đó thì **đó là kết quả mong muốn**, không phải hồi quy — nên phần này chỉ
// ghim những tên mà HEAD cho ra đúng như mong đợi, và phần `IMPROVED` dưới đây ghim
// những tên HEAD trả `unknown` còn bản sửa nhận diện được.
const REGRESSION = [
  ['BTE-MSHOP-MASTER.xlsx', 'shop_master'],
  ['BTE-WM-01.xlsx', 'work_management'],
  ['BTE-MCR-MM.xlsx', 'rfa_log'],
  ['BTE-MSA-SUPPLY.xlsx', 'material_supply'],
  ['tiến độ thi công BTE.xlsx', 'construction_schedule'],
  ['báo cáo công việc ngày 5.xlsx', 'daily_report'],
  // `báo cáo` chung phải nhường cho nhóm danh mục riêng.
  ['báo cáo tài nguyên.xlsx', 'resource_directory'],
  ['nguồn lực BTE.xlsx', 'resource_directory'],
  ['bãi tràm.xlsx', 'payment_ar'],
  ['sơ đồ khu vực BTE.xlsx', 'zone_map'],
  ['sơ đồ cây toàn dự án.xlsx', 'work_breakdown'],
  ['quy trình thực hiện.xlsx', 'business_process'],
  ['thầu phụ BTE.xlsx', 'subcontractor_directory'],
  ['duyệt khác BTE.xlsx', 'rfa_log'],
  ['file start.xlsx', 'file_index'],
  ['SHOP01.xlsx', 'shop_drawing'],
  ['shop drawing BTE.xlsx', 'shop_drawing'],
  // Mã dự án chứa `SHOP` nhưng mã tài liệu `csp-` phải thắng — đây là chỗ bản sửa
  // từng sai trong lúc làm (ra `shop_drawing`), nên phải ghim.
  ['BTE-SHOP-CSP-01.xlsx', 'construction_schedule'],
  ['BTE-SHOP-SHD-01.xlsx', 'shop_drawing'],
];

// HEAD trả `unknown` cho những tên này; bản sửa nhận diện được. Đây là **cải thiện**,
// ghim lại để không ai vô tình siết luật và làm mất.
const IMPROVED = [
  ['BTE-WP4-SHOP.xlsx', 'shop_drawing'],
  ['BTE-SHOP-01.xlsx', 'shop_drawing'],
];
let reg = 0;
for (const [name, want] of REGRESSION) {
  const got = detectDocType(name);
  if (got !== want) { reg += 1; console.log(`     ${name}: ra "${got}", trước đây "${want}"`); }
}
ok(reg === 0, `${REGRESSION.length - reg}/${REGRESSION.length} tên dự án demo giữ nguyên kết quả cũ`);

let gained = 0;
for (const [name, want] of IMPROVED) {
  const got = detectDocType(name);
  if (got !== want) { gained += 1; console.log(`     ${name}: ra "${got}", cần "${want}"`); }
}
ok(gained === 0, `${IMPROVED.length - gained}/${IMPROVED.length} tên HEAD trả "unknown" nay nhận diện được`);

// --- 3) Không đoán bừa: tên không liên quan phải vẫn là `unknown` -----------------
// Nếu bỏ hẳn chốt này thì "sửa" bằng cách khớp rộng sẽ cho điểm 1&2 mà phá luồng
// nạp: `POST /api/upload` **từ chối** file `unknown`, và bỏ chốt này là biến mọi tên file
// thành hợp lệ — đúng cái lỗi ta vừa sửa.
const STAY_UNKNOWN = [
  'data.xlsx', 'x.xlsx', '123.xlsx', 'hop-dong-thau.xlsx', 'hinh-anh.xlsx',
  'abc-def-ghi.xlsx', '2026.xlsx', 'final-final-v2.xlsx',
];
let over = 0;
for (const name of STAY_UNKNOWN) {
  const got = detectDocType(name);
  if (got !== 'unknown') { over += 1; console.log(`     ${name}: ra "${got}", phải là "unknown"`); }
}
ok(over === 0, `${STAY_UNKNOWN.length - over}/${STAY_UNKNOWN.length} tên không liên quan vẫn bị từ chối đúng`);

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
