// Danh mục demo cho `Vendors (NCC)`, `Workers`, `Teams`.
//
// Ba bảng này có đủ ở máy chủ từ trước nhưng không seeder nào điền, nên ba tab
// ở màn Dữ liệu chủ luôn trống — không phân biệt được "chưa nhập" với "tính năng
// hỏng".
//
// **Vì sao đặt ở đây, không phải script riêng:** `docs/DEMO_EXEC_VI.md` liệt kê đúng
// chuỗi chuẩn bị demo là `init.js` → `reconcile-pilot-data.mjs`. Dữ liệu chèn tay
// ngoài chuỗi đó sẽ biến mất ở lần demo kế tiếp trên máy mới, và người demo tưởng
// tính năng hỏng. Nên nó phải là một phần của `init.js`.
//
// **Vì sao đặt tên `TEST n`:** 75 nhà thầu phụ và 30 nhà cung cấp sẵn có trong DB đã
// là dữ liệu bịa theo đúng quy ước này (`NCC TEST 1..30`, `Nhà thầu phụ TEST 1..75`).
// Đặt tên khác sẽ khiến dữ liệu trông như từ hai nguồn khác nhau. Số thứ tự cũng
// được giữ: `suppliers` đã tới `TEST 30` và `subcontractors` tới `TEST 75`.
//
// **Đây là dữ liệu giả.** Không dùng làm căn cứ nghiệm thu nghiệp vụ; xem
// `docs/DATA_DECISIONS_REQUIRED.md` mục 10.
//
// Idempotent: theo `code` ổn định, chạy lại không nhân bản.
// `vendors` KHÔNG có cột `system` (chỉ `suppliers` mới có) và không có ràng buộc
// unique nào ngoài khoá chính — nên `code` ổn định là thứ giữ idempotency.
// `tax_id` để số 0: mã số thuế thật gắn với một doanh nghiệp có thật, bịa số trùng
// thì nguy hiểm hơn bịa một số vô nghĩa.
export const VENDOR_SEED = [
  { code: 'NCC-DEMO-01', name: 'Công ty CP Cơ khí & Thép Đại Phát', category: 'Thiết bị', tax_id: '0000000001', contact: '090 111 22 01' },
  { code: 'NCC-DEMO-02', name: 'Công ty CP Thiết bị Cơ điện Thanh Hà', category: 'Thiết bị', tax_id: '0000000002', contact: '090 111 22 02' },
  { code: 'NCC-DEMO-03', name: 'Công ty CP Vật tư hoàn thiện Minh Châu', category: 'Vật tư', tax_id: '0000000003', contact: '090 111 22 03' },
  { code: 'NCC-DEMO-04', name: 'Công ty CP Thiết bị vệ sinh Bảo Long', category: 'Thiết bị', tax_id: '0000000004', contact: '090 111 22 04' },
  { code: 'NCC-DEMO-05', name: 'Công ty CP Công trình kiến trúc Nam Việt', category: 'Dịch vụ', tax_id: '0000000005', contact: '090 111 22 05' },
];

export const TEAM_SEED = [
  { code: 'TỔ-TC-01', name: 'Tổ thi công kết cấu' },
  { code: 'TỔ-TC-02', name: 'Tổ thi công hoàn thiện' },
  { code: 'TỔ-KT-01', name: 'Tổ kỹ thuật MEP' },
  { code: 'TỔ-AT-01', name: 'Tổ an toàn' },
];

export const WORKER_SEED = [
  { code: 'NV-001', full_name: 'Nguyễn Văn An', role: 'Trưởng nhóm kết cấu', team: 'TỔ-TC-01' },
  { code: 'NV-002', full_name: 'Trần Thị Bình', role: 'Kỹ sư MEP', team: 'TỔ-KT-01' },
  { code: 'NV-003', full_name: 'Lê Quốc Cường', role: 'Thợ hoàn thiện', team: 'TỔ-TC-02' },
  { code: 'NV-004', full_name: 'Phạm Thị Duyên', role: 'Giám sát hiện trường', team: 'TỔ-TC-01' },
  { code: 'NV-005', full_name: 'Hoàng Văn Em', role: 'Kỹ sư an toàn', team: 'TỔ-AT-01' },
  { code: 'NV-006', full_name: 'Vũ Thị Phượng', role: 'Thợ điện', team: 'TỔ-KT-01' },
  { code: 'NV-007', full_name: 'Đặng Hữu Giang', role: 'Thợ xây', team: 'TỔ-TC-01' },
  { code: 'NV-008', full_name: 'Bùi Khánh Hà', role: 'Trưởng nhóm hoàn thiện', team: 'TỔ-TC-02' },
];
