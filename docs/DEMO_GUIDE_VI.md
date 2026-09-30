# Hướng dẫn demo PMO từ đầu đến cuối

File này là kịch bản chính cho presenter. Làm theo từng bước, không cần biết trước mã nguồn.

**Mục tiêu buổi demo:** khách thấy dữ liệu bốn trụ cột, AI trả lời có nguồn, PM mô phỏng thay đổi, CEO quyết định và rollback.

**Thời lượng khuyến nghị:** 25 đến 35 phút.

> Chỉ dùng tài khoản demo trên máy local. Không dùng `admin123` cho production.

---

## 1. Biết trước dữ liệu và tài khoản

### Vai trò demo

| Email | Mật khẩu | Dùng để demo |
|---|---|---|
| `admin@hbg.com` | `admin123` | Mở đầu, cấu hình AI, upload, báo cáo |
| `pm@hbg.com` | `admin123` | Xem dự án được giao, hỏi AI, mô phỏng |
| `ceo@hbg.com` | `admin123` | Xem portfolio, áp dụng hoặc rollback quyết định |
| `site@hbg.com` | `admin123` | Báo cáo ngày và cập nhật tiến độ ngoài công trường |
| `procurement@hbg.com` | `admin123` | Xem vật tư và vòng đời giao hàng |
| `accounting@hbg.com` | `admin123` | Xem hợp đồng, invoice, payment request |
| `pmo@hbg.com` | `admin123` | Xem governance, KPI và dự án được giao |
| `technical@hbg.com` | `admin123` | Xem shopdrawing trong phạm vi được giao |

### Project nên dùng

- **`BTE-WP4-HBC`**: project chính, đã nạp dữ liệu Excel thật. Dùng project này cho toàn bộ demo.
- **`HBG-MCR`**: project pilot vật tư sau khi chạy reconciliation. Dùng khi cần giải thích dữ liệu nguồn.
- **`HBG-LVK-BCTH`**: project phụ có thể xuất hiện sau khi nạp dữ liệu demo cũ; không bắt buộc cho lần demo đầu.

Không hard-code số liệu trong lời dẫn. Đọc số đang hiển thị trên màn hình. Số lượng có thể tăng sau mỗi lần ingest.

---

## 2. Chuẩn bị máy trước buổi demo

### 2.0. Chọn cách chạy

**Cách khuyến nghị cho người mới:** dùng native theo các bước 2.1 đến 2.10. **Cách Docker:** nếu máy đã cài Docker Desktop, chạy:

```bash
docker compose up --build
```

Mở `http://localhost:3000/login`. Container init tự migrate/seed; không cần chạy Vite. Đặt `OPENROUTER_API_KEY` trong shell hoặc file `.env` trước khi compose nếu cần AI thật. Docker local chỉ dùng cho demo; không dùng mật khẩu này cho production.

### 2.1. Mở Terminal 1 tại thư mục dự án

Kiểm tra phiên bản:

```bash
node --version
npm --version
./backend/scripts/pg-ctl.sh status
```

Cần Node.js 22 trở lên và PostgreSQL 16.

### 2.2. Cài dependency

Chạy một lần trong thư mục dự án:

```bash
npm install
```

### 2.3. Bật PostgreSQL

Nếu máy dùng PostgreSQL local của dự án:

```bash
./backend/scripts/pg-ctl.sh start
```

Nếu PostgreSQL đã chạy ở port khác, không chạy lệnh trên. Hãy đặt `DATABASE_URL` trong `backend/.env` đúng port đang dùng.

Kiểm tra:

```bash
./backend/scripts/pg-ctl.sh status
```

Kết quả mong đợi:

```text
PG: running on 127.0.0.1:5433
```

### 2.4. Chuẩn bị file môi trường

Không ghi secret vào tài liệu hoặc screenshot.

```bash
test -f backend/.env || cp .env.example backend/.env
```

Mở `backend/.env` và kiểm tra các biến sau:

```dotenv
DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo
OPENROUTER_API_KEY=...
```

`JWT_SECRET` không cần nhập cho demo local. Không bật `AI_MOCK=1` khi cần demo API thật.

### 2.5. Chạy migration và seed

Chạy từ thư mục `backend` để `dotenv` đọc `backend/.env`:

```bash
cd backend
node src/db/init.js
```

Đọc dòng cuối. Phải thấy:

```text
✅ Database ready
```

Lệnh này có tính idempotent. Chạy lại không xóa dữ liệu.

### 2.6. Nạp dữ liệu demo từ file nguồn

Nếu database vừa tạo hoặc màn hình Control Center chưa có số liệu, dùng Terminal 1 và chạy đúng hai lệnh này. Lệnh `git rev-parse` tự đưa terminal về thư mục gốc, không phụ thuộc bạn đang đứng ở `backend` hay root:

```bash
cd "$(git rev-parse --show-toplevel)"
node scripts/reconcile-pilot-data.mjs --apply --output=/tmp/opencode/demo-reconciliation.json
cd backend
```

Lệnh này đọc `reference_sheets/2019.04.28 HBG-HBC-BCTT/`, nạp idempotent vào BTE, tạo project pilot `HBG-MCR` nếu cần, rồi ghi báo cáo đối soát. Chạy lại vẫn được. Kiểm tra:

```bash
cat /tmp/opencode/demo-reconciliation.json | tail -20
```

Không xem `mismatch_files: 0` là bằng chứng UAT tài chính. Các dòng trùng và workbook tổng hợp chưa được xác nhận vẫn được ghi riêng trong báo cáo.

### 2.7. Kiểm tra model fallback

Migration `9999am_space_bunny_fallback.sql` và seed demo trong `init.js` tự tạo route Nemotron, Space Bunny và embed cho database local mới. Không cần sửa DB bằng tay.

Cách kiểm tra nhanh:

```bash
curl -s http://127.0.0.1:3000/api/ready
```

Sau khi backend chạy, mở **Quản trị → Cấu hình AI**. Bảng phải có:

1. Chat ưu tiên `0`: `nvidia/nemotron-3-ultra-550b-a55b:free`.
2. Chat ưu tiên `1`: `stealth/space-bunny-alpha`.
3. Embed: `nvidia/nemotron-3-embed-1b:free`.

Nếu thiếu dòng thứ hai, chạy lại `node src/db/init.js`.

### 2.8. Khởi động backend

Giữ Terminal 1 tại thư mục `backend`, chạy:

```bash
PORT=3000 LOGIN_RATE_MAX=1000 node src/index.js
```

Không đóng terminal này trong lúc demo.

Kiểm tra ở Terminal 2:

```bash
curl -s http://127.0.0.1:3000/api/ready
```

Kết quả phải chứa:

```json
{"status":"ok"}
```

### 2.9. Khởi động frontend

Mở Terminal 2, trở về thư mục dự án:

```bash
cd /path/to/pmo_project_procore
npm run dev:frontend
```

Mở trình duyệt:

```text
http://localhost:5173/login
```

Không mở `frontend/dist` bằng file manager. Dùng URL Vite để có proxy `/api`.

### 2.10. Kiểm tra sạch trước khi demo

Trong trình duyệt:

1. Mở `/login`.
2. Nhập `admin@hbg.com` và `admin123`.
3. Bấm **ĐĂNG NHẬP**.
4. Kiểm tra sidebar có nhóm **Tổng quan**, **Nghiệp vụ**, **Vận hành**, **Quản trị**.
5. Bấm **Cấu hình AI**.
6. Bấm **Test chat** và **Test embed**.
7. Hai test phải trả thông báo `OK`.

Nếu `Test chat` báo quota, bấm lại sau khi quota hồi. Route fallback được hệ thống thử tự động sau route chính.

---

## 3. Use case 1: AI hỏi đáp có citation

Đây là use case quan trọng nhất. Dành khoảng 7 phút.

### Bước 1. Đăng nhập vai PM

1. Bấm nút đăng xuất ở cuối sidebar.
2. Đăng nhập `pm@hbg.com` / `admin123`.
3. Chờ URL có `/hq`.

### Bước 2. Mở Trợ lý AI

1. Bấm nhóm **Nghiệp vụ**.
2. Bấm **Trợ lý AI**.
3. Kiểm tra tab **Hỏi đáp** đang được chọn.

### Bước 3. Chọn project

1. Bấm ô chọn project.
2. Gõ `BTE`.
3. Chọn `BTE-WP4-HBC`.
4. Không chọn **Tất cả dự án** trong lần demo đầu.

### Bước 4. Hỏi câu có dữ liệu thật

Nhập câu sau:

```text
Gate nào đang chặn tiến độ? Hạng mục nào cần PM xử lý trước và bằng chứng nào cho thấy?
```

Bấm **Hỏi**.

### Bước 5. Đọc kết quả

Nói theo trình tự:

1. Đọc tiêu đề **Trợ lý AI**.
2. Đọc đoạn trả lời tiếng Việt.
3. Chỉ vào các chip citation như `#issue:...`.
4. Nói: “Khi có đủ dữ liệu, hệ thống yêu cầu model gắn mã nguồn cho từng kết luận.”
5. Nếu chip là issue, bấm chip để mở issue.
6. Nếu AI nói **không đủ dữ liệu**, nói: “Hệ thống nói rõ khi nào không có bằng chứng.”

Nếu gặp `429`, `502`, hoặc `Model trả về rỗng`:

1. Đọc thông báo lỗi.
2. Chờ 30 giây.
3. Bấm **Hỏi** lại.
4. Nếu cần xem route, quay lại tài khoản Admin và mở **Quản trị → Cấu hình AI**.

### Bước 6. Kiểm tra không tự thay đổi dữ liệu

1. Quay lại **Project Control Center**.
2. Bấm **Hoạt động gần đây**.
3. Chỉ ra cột người thực hiện và thời gian.
4. Nói: “AI chỉ đọc và trả lời. Việc ghi baseline hoặc gửi chỉ thị vẫn là thao tác của con người.”

### Use case 1b: AI tạo đề xuất cập nhật tiến độ

1. Đăng nhập `pm@hbg.com`, mở **Nghiệp vụ → Trợ lý AI** và chọn project `BTE-WP4-HBC`.
2. Chọn tab **Cập nhật tiến độ**.
3. Nhập:
   ```text
   Cập nhật hạng mục .6-3647 lên 65%, đang vướng MSB, PM cần xử lý trước.
   ```
4. Bấm **Tạo đề xuất AI**. Nếu thiếu mã hoặc phần trăm, hệ thống vẫn tạo proposal ở trạng thái **Cần bổ sung** và liệt kê trường còn thiếu.
5. Khi đủ dữ liệu, xem before/after, fingerprint, citation và lý do. Bấm **Áp dụng tiến độ** bằng tài khoản CEO/Admin.
6. Mở **Tiến độ** để xác nhận work item/schedule được cập nhật; mở **Hoạt động gần đây** để xem audit `AI_PROPOSAL_APPLY`.
7. Nếu dữ liệu đã đổi sau preview, hệ thống trả `409` và yêu cầu tạo proposal mới. CEO/Admin có thể rollback từ card proposal.

> AI không tự ghi khi người dùng nhập. Quyền apply là hành động của người có thẩm quyền.

---

## 4. Use case 2: PM mô phỏng, CEO quyết định, rollback

Dành khoảng 10 phút.

### Bước 1. PM mở Control Center

1. Đăng nhập `pm@hbg.com`.
2. Bấm **Project Control Center** trong nhóm **Tổng quan**.
3. Chọn `BTE-WP4-HBC`.
4. Bấm **Lớp điều khiển**.

### Bước 2. Chọn kịch bản

1. Ở ô **Kịch bản**, chọn `CTL-03 — Vật tư về trễ`.
2. Ở ô **Số ngày trễ**, nhập `14`.
3. Bấm **Mô phỏng**.

### Bước 3. Đọc kết quả

Chỉ vào các dòng:

- **Trước** và **Sau**.
- **Mốc hoàn thành**.
- **Số hạng mục bị ảnh hưởng**.
- **Rủi ro**.
- Các ghi chú tiếng Việt.

Nói: “Đây mới là mô phỏng. Không có ngày nào bị sửa.”

### Bước 4. Kiểm tra phân quyền

1. Nhìn phần quyền quyết định.
2. PM/PMO phải thấy dòng: **PM/PMO chỉ mô phỏng. CEO/Admin mới có thể áp dụng.**
3. Không có nút **Áp dụng làm baseline** cho PM.

### Bước 5. CEO áp dụng

1. Bấm đăng xuất.
2. Đăng nhập `ceo@hbg.com`.
3. Mở lại **Project Control Center** và project `BTE-WP4-HBC`.
4. Bấm **Lớp điều khiển**.
5. Chọn scenario vừa tạo trong bảng bên dưới.
6. Bấm **Apply**.
7. Đọc hộp xác nhận, bấm **Áp dụng**.
8. Chờ thông báo thành công.
9. Kiểm tra trạng thái scenario là `APPLIED`.

### Bước 6. CEO rollback

1. Bấm **Rollback** ở scenario `APPLIED`.
2. Bấm **Rollback** trong hộp xác nhận.
3. Chờ thông báo thành công.
4. Kiểm tra ngày trở lại giá trị trước.

Nói: “Có version, có log, có rollback. Không có thao tác ghi ngày không được phép.”

---

## 5. Use case 3: Site nhập dữ liệu ngoài công trường

Dành khoảng 5 phút.

### Bước 1. Đăng nhập Site

1. Đăng xuất.
2. Đăng nhập `site@hbg.com` / `admin123`.
3. Site tự vào `/field`.

### Bước 2. Mở báo cáo ngày

1. Bấm **Báo cáo ngày** trong menu Field.
2. Chọn `BTE-WP4-HBC` ở ô **Project**.
3. Hệ thống tự tải hoặc tạo báo cáo hôm nay. Chờ dòng `Report #...`.
4. Bấm **+ Thêm nhân sự**.
5. Nhập mã vai trò, ví dụ `tho-dien`.
6. Nhập tên vai trò `Thợ điện`.
7. Nhập số người thực tế, ví dụ `7`.
8. Bấm **OK** trong các hộp thoại. Thông báo **Đã thêm manpower** là kết quả thành công.

### Bước 3. Cập nhật tiến độ

1. Quay lại menu Field.
2. Bấm **Cập nhật tiến độ**.
3. Chọn project.
4. Chọn **Zone**.
5. Chọn **Hạng mục**.
6. Nhập **Tiến độ (%)**, ví dụ `50`.
7. Bấm **Lưu tiến độ**.
8. Kiểm tra thông báo **Đã lưu tiến độ: 50%**.

Nói: “Số nhập tại nguồn, dashboard cấp trên không nhập lại tổng.”

### Bước 4. Quay lại PM để thấy dữ liệu

1. Đăng xuất.
2. Đăng nhập `pm@hbg.com`.
3. Mở **Project Control Center**.
4. Chọn project.
5. Bấm **Thử lại** nếu trang đang tải lỗi.
6. Chỉ vào dòng **Nhân lực 7 ngày** hoặc số liệu liên quan.

---

## 6. Use case 4: Năng suất theo hạng mục

Dành khoảng 3 phút. Dùng khi khách hỏi về định mức và actual theo từng hạng mục.

1. Đăng nhập `pm@hbg.com` hoặc `pmo@hbg.com`.
2. Mở **Nghiệp vụ → Nhân lực & Thiết bị**.
3. Chọn `BTE-WP4-HBC`.
4. Bấm tab **Năng suất hạng mục**.
5. Ở ô **Hạng mục**, chọn một dòng.
6. Nhập **Role/chuyên môn**, kỳ **Từ/Đến**, **KH**, **TT**, **Headcount KH** và **Headcount TT**.
7. Bấm **Lưu năng suất**.
8. Chỉ vào cột **Lệch**. Giá trị dương là actual vượt định mức; số âm là actual thấp hơn định mức.

Nếu chưa có dữ liệu, dòng sẽ ghi **Chưa có định mức/actual theo hạng mục**. Bấm lại **Lưu năng suất** với cùng kỳ và role sẽ cập nhật dòng cũ, không tạo bản trùng.

---

## 7. Use case 5: Vật tư và thanh toán

Dành khoảng 5 phút.

### Procurement

1. Đăng nhập `procurement@hbg.com`.
2. Mở **Nghiệp vụ → Materials**.
3. Chọn `BTE-WP4-HBC`.
4. Đọc các cột **Mã**, **Tiến độ nhập**, **Vòng đời** và **Thao tác**.
5. Nói về trạng thái `REQUESTED`, `MSB_PREPARING`, `PO_ISSUED`, `IN_TRANSIT`, `DELIVERED`, `ACCEPTED`.
6. Nếu có quyền, bấm nút trạng thái kế tiếp ở cột **Thao tác**, ví dụ **Chuẩn bị MSB** hoặc **Gửi duyệt**.

### Accounting

1. Đăng xuất.
2. Đăng nhập `accounting@hbg.com`.
3. Mở **Nghiệp vụ → Payment**.
4. Chọn `BTE-WP4-HBC`.
5. Chỉ vào chuỗi **Contract → Invoice → Payment Request → Payment**.
6. Bấm **Duyệt** ở một request được phép, nếu có.
7. Bấm **Xem lại và chi** ở request `APPROVED`.
8. Kiểm tra ledger phía dưới.

Không tạo số tiền lớn trong demo. Nếu cần số liệu mới, dùng một request nhỏ và ghi rõ đây là dữ liệu demo.

---

## 8. Use case 6: Nguồn dữ liệu và báo cáo

Dành khoảng 4 phút.

1. Đăng nhập `admin@hbg.com`.
2. Mở **Project Control Center**.
3. Chọn `BTE-WP4-HBC`.
4. Bấm **In / PDF** để in trang hiện tại.
5. Bấm **Xuất Excel**.
6. Mở file `bao-cao-BTE-WP4-HBC.xlsx`.
7. Chỉ vào các sheet dữ liệu, số tiền và nguồn tương ứng.
8. Nói: “Số liệu không nhập tay lần hai. Mỗi dòng có upload và lineage.”

Nếu cần mở queue upload:

1. Bấm nhóm **Quản trị**.
2. Bấm **Uploads**.
3. Bấm **Classify staged**.
4. Chọn đúng project.
5. Chọn loại tài liệu.
6. Bấm **Configure →**.
7. Đọc preview.
8. Bấm **Commit** sau khi kiểm tra.

---

## 9. Vai trò và phân quyền cần nói khi khách hỏi

| Thao tác | Admin | CEO | PM | PMO | Site | Procurement | Accounting |
|---|---:|---:|---:|---:|---:|---:|---:|
| Xem project được giao | Có | Tất cả | Có | Có | Có | Có | Có |
| Mở Control Center | Có | Có | Có | Có | Không | Không | Không |
| Mô phỏng control layer | Có | Có | Có | Có | Không | Không | Không |
| Apply/rollback baseline | Có | Có | Không | Không | Không | Không | Không |
| Nhập tiến độ | Có | Không | Có | Không | Có được giao | Không | Không |
| Duyệt shop/material | Có | Theo quyền | Project được giao | Không | Theo quyền | Theo quyền | Theo quyền |
| Chi tiền | Có | Theo quyền | Không | Không | Không | Không | Có |
| Cấu hình AI | Có | Có | Không | Không | Không | Không | Không |

Server trả `404` khi user không thuộc project. Server trả `403` khi user thuộc project nhưng sai vai trò.

---

## 10. Câu hỏi thường gặp

### AI trả lời `429` hoặc `502`

- Quota provider đang bị giới hạn.
- Route chính là Nemotron.
- Route dự phòng là `stealth/space-bunny-alpha`.
- Chờ 30 giây rồi bấm **Hỏi** lại.
- Kiểm tra **Cấu hình AI → Test chat**.
- Không chuyển sang mock trong buổi demo thật.

### Không thấy **Trợ lý AI**

1. Kiểm tra tenant đang đăng nhập.
2. Kiểm tra role.
3. Kiểm tra gói có feature `ai-assistant`.
4. Kiểm tra backend có log route AI.
5. Đăng nhập `admin@hbg.com` để kiểm tra cấu hình.

### Không thấy **Lớp điều khiển**

- Chỉ Admin, CEO, PM và PMO có quyền mô phỏng.
- PM/PMO không thấy nút Apply là đúng phân quyền.
- CEO/Admin mới áp dụng baseline.

### Số liệu không khớp tài liệu cũ

- Tài liệu cũ có số liệu trước khi ingest lại.
- Mở `docs/SRS_DATA_RECONCILIATION.md`.
- Chạy lại `scripts/reconcile-pilot-data.mjs`.
- Không sửa số trong dashboard để ép khớp tài liệu.

### PostgreSQL không khởi động

```bash
./backend/scripts/pg-ctl.sh status
./backend/scripts/pg-ctl.sh logs
./backend/scripts/pg-ctl.sh start
```

Nếu `pg_ctl` không có trong PATH, đặt `PGBIN` đúng rồi chạy lại.

### Cổng đã dùng

```bash
lsof -i :3000
lsof -i :5173
lsof -i :5433
```

Đừng xóa dữ liệu để giải quyết cổng. Đóng tiến trình cũ hoặc đổi cổng theo lệnh trong tài liệu kỹ thuật.

---

## 11. Checklist trước khi vào phòng họp

- [ ] PostgreSQL trả `running`.
- [ ] `node src/db/init.js` in `Database ready`.
- [ ] Backend `/api/health` và `/api/ready` trả `status=ok` (`/api/ready` mới xác nhận DB thật).
- [ ] Frontend mở được `http://localhost:5173/login`.
- [ ] Cấu hình AI có Nemotron, Space Bunny và embed.
- [ ] `Test chat` và `Test embed` trả `OK`.
- [ ] `BTE-WP4-HBC` có dữ liệu.
- [ ] Không còn project test `CMP-*`, `REAL-*`, `GATE-*`.
- [ ] Đã mở trước các tab Control Center, Trợ lý AI, Materials và Payment.
- [ ] Đã đăng nhập thử PM, CEO và Site.
- [ ] Không bật `AI_MOCK=1`.
- [ ] Không dùng tài khoản thật trong demo.

Sau buổi demo, rollback mọi scenario đã áp dụng. Không chạy reset database trên máy demo.
