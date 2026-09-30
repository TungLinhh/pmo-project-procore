// Dòng file nguồn BTE theo **tên chuẩn** mà các bài `step1-*` viết, nhưng trên máy
// này file nằm trong `reference_sheets/2019.04.28 HBG-HBC-BCTT/` với **tên gốc**.
//
// Vấn đề gốc: `step1-03` / `step1-04` / `step1-06` viết đường dẫn như
// `TIẾN ĐỘ SHOP/MEP-BTE-SHD-BOH.xlsx`, còn dữ liệu thật là `TIẾN ĐỘ SHOP/Shop BOH.xlsx`.
// Không có bản chuẩn hoá trên máy ⇒ 3 bài đó chỉ có thể "SKIP" ⇒ **3 bài chưa từng
// chạy** với dữ liệu thật, trong khi `reconcile-values` và `demo-walkthrough` thì có.
//
// Cách sửa: dùng **đúng byte của file gốc** (không sao chép, không tạo bản nhân bản)
// và chỉ dịch **tên**. Tên chuẩn thắng nếu tồn tại, nên thư mục đã chuẩn hoá sẵn vẫn
// chạy được nguyên vẹn — đây là đường *dự phòng*, không phải đường chính.
//
// Nếu một tên không dùng được, hàm **ném lỗi kèm cả hai danh sách** để lần chạy sau
// biết ngay thiếu gì, thay vì âm thầm `SKIP` (giống đúng cái bẫy đã gặp: ba bài bị
// liệt kê "cần ngoài môi trường" trong khi hai bài kia tự chứa hoàn toàn).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_BTE_ROOT = 'reference_sheets/2019.04.28 HBG-HBC-BCTT';

// `canonical` → các tên gốc tương ứng, theo thứ tự ưu tiên.
export const BTE_FILE_ALIASES = {
  'MEP-BTE-SHD-BOH.xlsx': ['Shop BOH.xlsx'],
  'MEP-BTE-CSP-BOH.xlsx': ['TĐ BOH.xlsx'],
  // Rollup lịch. Đo 2026-09-28: **thứ tự ở đây quyết định kết quả**. Ứng viên đầu là
  // `Tiến độ thi công tổng thể các khu vực.xlsx` — tên nghe đúng nhưng **sai**: đó là
  // sổ 17 sheet theo khu vực, sheet đầu là sơ đồ (không có ô dữ liệu) ⇒ crosscheck đọc
  // được đúng **1 zone** thay vì ~17. Đúng là `HBG-BTE-WM-01.xlsx` (sheet `TĐ TỔNG`,
  // 90 dòng) — bản song song chính xác của `HBG-BTE-MSHOP-01.xlsx` cho shop.
  'MEP-BTE-CSP-01.xlsx': ['HBG-BTE-WM-01.xlsx', 'Tiến độ thi công tổng thể các khu vực.xlsx'],
  'MEP-BTE-MSA-01.xlsx': ['Vật tư GEN.xlsx', 'Vật tư BZONE.xlsx', 'Vật tư INF.xlsx'],
  'HBG-BTE-MSHOP-01.xlsx': [],
  // S&P (chỉ dùng `step1-05`/`step1-06`): file thanh toán NCC theo đợt.
  'HBG-BTE-MSA-S&P-CTY-2020.03.28.xlsx': ['HBG-MCR-MPM-01.1.xlsx', 'Tiến độ thanh toán các khu vực.xlsx'],
};

export const bteRoot = () => process.env.BTE_DATA_DIR || DEFAULT_BTE_ROOT;

/**
 * Đường dẫn tuyệt đối cho tên chuẩn, dịch sang tên gốc khi cần.
 *
 * @param {string} subdir  ví dụ `TIẾN ĐỘ SHOP`
 * @param {string} canonical tên chuẩn
 * @param {object} [opts]
 * @param {string} [opts.optional] trả `null` thay vì ném khi không có file
 * @returns {string|null}
 */
export function btePath(subdir, canonical, opts = {}) {
  const root = bteRoot();
  const direct = join(root, subdir, canonical);
  if (existsSync(direct)) return direct;
  for (const alias of BTE_FILE_ALIASES[canonical] || []) {
    const p = join(root, subdir, alias);
    if (existsSync(p)) return p;
  }
  if (opts.optional) return null;
  const tried = [canonical, ...(BTE_FILE_ALIASES[canonical] || [])];
  throw new Error(
    `Không tìm thấy "${canonical}" trong ${join(root, subdir)}.\n` +
    `  đã thử: ${tried.join(' | ')}\n` +
    `  Đặt BTE_DATA_DIR, hoặc bổ sung tên vào BTE_FILE_ALIASES trong tests/e2e/bte-files.mjs`,
  );
}

/**
 * File trong thư mục con khớp **tên chuẩn HOẶC tên gốc** — phải là **OR**, không phải
 * AND: `step1-06` cần *mọi* file `Shop *.xlsx` (14 file) chứ không riêng `Shop BOH.xlsx`.
 * Bỏ `~$` (file tạm của Excel — đọc vào chỉ ra rác).
 *
 * @param {string} subdir
 * @param {RegExp} canonicalRe mẫu trên **tên chuẩn**
 * @param {RegExp} [realRe]   mẫu trên **tên gốc**
 * @returns {string[]} đường dẫn, đã sắp xếp
 */
export function bteFiles(subdir, canonicalRe, realRe) {
  const dir = join(bteRoot(), subdir);
  const aliasToCanonical = new Map();
  for (const [canon, aliases] of Object.entries(BTE_FILE_ALIASES)) {
    for (const a of aliases) aliasToCanonical.set(a, canon);
  }
  let names = [];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((f) => !f.startsWith('~$'))
    .filter((f) => canonicalRe.test(f)
      || (realRe ? realRe.test(f) : false)
      || canonicalRe.test(aliasToCanonical.get(f) ?? ''))
    .map((f) => join(dir, f))
    .sort();
}
