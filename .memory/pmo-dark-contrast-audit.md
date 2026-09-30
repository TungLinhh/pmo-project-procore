---
name: pmo-dark-contrast-audit
description: Công cụ và quy tắc kiểm tra tương phản dark mode cho repo pmo_project_procore
metadata:
  type: project
---

`frontend` của `pmo_project_procore` có hai lỗi tương phản dark mode đã sửa, cần nhớ vì rất dễ tái phát:

1. **`<button>` không kế thừa `color`.** Đã thêm `color: inherit` vào rule `button` trong `frontend/src/styles/global.css`. Không có nó, mọi `<button>` không tự đặt màu (vd `<button className="row">` ở `hq/Attention.jsx`, list ở `hq/NotificationCenter.jsx`) sẽ ra chữ đen trên nền tối — tương phản ~1.2:1. Đây chính là lỗi người dùng báo ở trang "Cần xử lý".
2. **`--c-primary` hoá thành xanh sáng trong dark mode** (`#7cb9ff`), nên chữ trắng trên nó chỉ còn ~2:1. Mọi thứ nền `--c-primary` phải dùng `--c-text-i` (tối) trong dark mode: logo, avatar, nút đăng nhập, chip màu bão hoà.

Công cụ kiểm chứng: `node scripts/ui-audit-dark-contrast.mjs` (BASE_URL trỏ server đang chạy). Nó dò tự động nền hiệu dụng — phải gom các lớp background từ element lên tới lớp đục rồi composite **từ dưới lên**; composite từ trên xuống và coi kết quả là đục sẽ báo sai lớp nửa trong suốt thành màu đặc.

**Why:** không có gate nào đo tương phản; lint và test chức năng đều xanh trong khi chữ chìm hẳn vào nền.

**How to apply:** sau mỗi thay đổi CSS/màu, chạy `node scripts/ui-audit-dark-contrast.mjs` và yêu cầu `Tổng: 0`. Đừng tin mắt thường.
