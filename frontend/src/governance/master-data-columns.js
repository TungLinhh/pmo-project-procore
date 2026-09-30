// Cột hiển thị cho từng danh mục, kèm nhãn tiếng Việt.
//
// Trước đây bảng lấy **7 khoá đầu của object thô**. Hệ quả đo được: với `vendors`,
// khoá theo thứ tự cột là `id, tenant_id, code, name, tax_id, category, contact` —
// nên 2 trong 7 cột là `id` và `tenant_id`, hai thứ người dùng không cần, còn `status`
// thì bị đẩy ra ngoài. Ở bảng nhiều cột hơn, cột quan trọng rơi khỏi bảng.
//
// Danh sách dưới đây chọn đúng các cột có nghĩa với người dùng. Danh mục chưa
// khai báo thì lấy các cột còn lại sau khi bỏ `id`/`tenant_id`/`created_at`, nên
// thêm danh mục mới vẫn hiện được thay vì trống.
// Nhãn cột đi qua `th()` ở `visibleColumns()`; `Có/Không` đi qua `t()`. Cả hai
// hàm được gọi lúc render nên đổi [VI|EN] có tác dụng ngay — gọi ở cấp module
// sẽ bị tính một lần lúc nạp và đóng băng theo ngôn ngữ đầu tiên.
import { t, th } from '../i18n/index.js';

const COLUMNS = {
  vendors: [
    ['code', 'Mã'], ['name', 'Tên'], ['tax_id', 'MST'],
    ['category', 'Nhóm'], ['contact', 'Liên hệ'], ['status', 'Trạng thái'],
  ],
  workers: [
    ['code', 'Mã'], ['full_name', 'Họ tên'], ['role', 'Vai trò'],
    ['phone', 'Điện thoại'], ['team_id', 'Tổ'], ['status', 'Trạng thái'],
  ],
  teams: [
    ['code', 'Mã'], ['name', 'Tên'],
    ['lead_worker_id', 'Đội trưởng'], ['status', 'Trạng thái'],
  ],
  subcontractors: [
    ['name', 'Tên'], ['capability_summary', 'Năng lực'],
    ['is_internal_team', 'Nội bộ'], ['status', 'Trạng thái'],
  ],
  suppliers: [
    ['name', 'Tên'], ['system', 'Hệ'], ['category', 'Nhóm'],
    ['location', 'Địa điểm'], ['contact', 'Liên hệ'], ['status', 'Trạng thái'],
  ],
  departments: [
    ['code', 'Mã'], ['name_vi', 'Tên bộ phận'], ['parent_id', 'Bộ phận cha'],
  ],
  'business-processes': [['code', 'Mã'], ['name_vi', 'Tên'], ['name_en', 'Tên (EN)']],
};

// Cột nào không có nghĩa với người dùng dù có trong dữ liệu.
const HIDDEN = new Set(['id', 'tenant_id', 'created_at', 'legacy_code', 'source_sheet']);

const MAX_COLS = 7;

// Chọn danh sách cột. Việc hiện **tên tổ** thay cho mã số (`team_id`) không nằm
// ở đây mà ở `cellValue()` — hàm này chỉ chọn cột. Trước đây nó nhận tham số
// `teamNames` nhưng không dùng, kèm một comment nói ngược lại; người đọc tin
// comment và tìm nhầm chỗ xử lý tên tổ.
export function visibleColumns(resource, row) {
  // `row` là undefined khi danh sách rỗng — `in` trên undefined là TypeError, và
  // nó làm sập cả màn chứ không chỉ bảng.
  const source = row || {};
  const declared = COLUMNS[resource];
  if (declared) {
    // Chỉ giữ cột thật sự có trong dữ liệu, để bảng không rỗng ô trên bản cũ.
    // `th()` đặt ở đây chứ không ở `MasterDataList` vì đây là nơi duy nhất biết
    // nhãn tiếng Việt của từng cột; đổi ngôn ngữ thì tính lại mỗi lần render.
    return declared.filter(([key]) => key in source).map(([key, label]) => ({ key, label: th(label) }));
  }
  return Object.keys(source)
    .filter((k) => !HIDDEN.has(k))
    .slice(0, MAX_COLS)
    .map((key) => ({ key, label: key }));
}

// Giá trị để hiển thị: thay khoá ngoại bằng tên, và cắt bớt chuỗi dài.
export function cellValue(row, key, { teamNames = {}, workerNames = {} } = {}) {
  const raw = row[key];
  if (raw === null || raw === undefined || raw === '') return '—';
  if (key === 'team_id' && teamNames[raw]) return teamNames[raw];
  if (key === 'lead_worker_id' && workerNames[raw]) return workerNames[raw];
  if (key === 'is_internal_team' || typeof raw === 'boolean') return raw ? t('md.yes') : t('md.no');
  return String(raw).slice(0, 80);
}
