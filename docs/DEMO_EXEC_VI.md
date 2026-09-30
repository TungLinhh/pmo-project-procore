# Kịch bản demo ngắn cho CEO và khách hàng

Tài liệu này là bản đọc nhanh trước buổi demo. Khi cần bấm từng nút, mở [DEMO_GUIDE_VI.md](DEMO_GUIDE_VI.md).

## Chuẩn bị 15 phút

Chạy từ thư mục dự án:

```bash
npm install
./backend/scripts/pg-ctl.sh start
cd backend
node src/db/init.js
cd ..
node scripts/reconcile-pilot-data.mjs --apply --output=/tmp/opencode/demo-reconciliation.json
cd backend
PORT=3000 LOGIN_RATE_MAX=1000 node src/index.js
```

Mở Terminal 2:

```bash
cd /path/to/pmo_project_procore
npm run dev:frontend
```

Mở `http://localhost:5173/login`.

Kiểm tra AI trước khi bắt đầu:

1. Đăng nhập `admin@hbg.com` / `admin123`.
2. Mở **Quản trị → Cấu hình AI**.
3. Kiểm tra có ba dòng:
   - Chat ưu tiên `0`: `nvidia/nemotron-3-ultra-550b-a55b:free`.
   - Chat ưu tiên `1`: `stealth/space-bunny-alpha`.
   - Embed: `nvidia/nemotron-3-embed-1b:free`.
4. Bấm **Test chat** và **Test embed**.
5. Không bật `AI_MOCK=1`.

Project chính: `BTE-WP4-HBC`. `HBG-MCR` là project pilot vật tư sau khi chạy reconciliation. `HBG-LVK-BCTH` là project phụ tùy chọn, chỉ dùng nếu dữ liệu đã được nạp trên máy demo.

## Kịch bản 7 phút

### 1. Dashboard

1. Đăng nhập `admin@hbg.com`.
2. Mở **Project Control Center**.
3. Chọn `BTE-WP4-HBC`.
4. Chỉ vào **Dự án được gán**, **Tiến độ**, **Quá hạn**, **Nhân lực 7 ngày**.
5. Chỉ vào **Bốn trụ cột chính**.
6. Nói: “Đây là dữ liệu đã nạp từ file công trường, không phải số nhập tay ở dashboard.”

### 2. AI có citation

1. Bấm đăng xuất.
2. Đăng nhập `pm@hbg.com` / `admin123`.
3. Mở **Nghiệp vụ → Trợ lý AI**.
4. Chọn project `BTE-WP4-HBC`.
5. Nhập:

```text
Gate nào đang chặn tiến độ? Hạng mục nào cần PM xử lý trước và bằng chứng nào cho thấy?
```

6. Bấm **Hỏi**.
7. Chỉ vào kết quả tiếng Việt và chip citation.
8. Nói: “AI chỉ đọc dữ liệu được cấp quyền và nói rõ khi thiếu dữ liệu.”

### 3. PM mô phỏng

1. Quay lại **Project Control Center**.
2. Chọn `BTE-WP4-HBC`.
3. Bấm **Lớp điều khiển**.
4. Chọn `CTL-03 — Vật tư về trễ`.
5. Nhập `14` vào **Số ngày trễ**.
6. Bấm **Mô phỏng**.
7. Đọc bảng **Trước**, **Sau**, **Rủi ro** và ghi chú.
8. Nói: “PM chỉ mô phỏng. Chưa có ngày nào bị ghi.”

### 4. CEO quyết định và rollback

1. Bấm đăng xuất.
2. Đăng nhập `ceo@hbg.com`.
3. Mở lại **Lớp điều khiển**.
4. Bấm **Apply** trên scenario vừa mô phỏng.
5. Xác nhận **Áp dụng**.
6. Chờ trạng thái `APPLIED`.
7. Bấm **Rollback** và xác nhận.
8. Nói: “AI đề xuất, CEO quyết định, mọi thay đổi có audit và rollback.”

### 5. Kết thúc

1. Bấm **Xuất Excel** trên Control Center.
2. Mở file `bao-cao-BTE-WP4-HBC.xlsx`.
3. Nói: “Số liệu có nguồn, có drill-down và có dấu vết kiểm toán.”
4. Kết thúc bằng câu: “Bước tiếp theo là UAT trên hai project pilot và ký quyết định dữ liệu.”

## Nếu AI bị quota

1. Đọc lỗi `429`, `502` hoặc `Model trả về rỗng`.
2. Chờ 30 giây.
3. Bấm **Hỏi** lại.
4. Route chính là Nemotron. Route dự phòng là Space Bunny.
5. Không chuyển sang mock trong buổi demo thật.

## Vai trò dùng trong demo

| Vai trò | Email |
|---|---|
| Admin | `admin@hbg.com` |
| CEO | `ceo@hbg.com` |
| PM | `pm@hbg.com` |
| PMO | `pmo@hbg.com` |
| Site | `site@hbg.com` |
| Procurement | `procurement@hbg.com` |
| Accounting | `accounting@hbg.com` |
| Technical | `technical@hbg.com` |

Tất cả tài khoản demo dùng mật khẩu `admin123`.
