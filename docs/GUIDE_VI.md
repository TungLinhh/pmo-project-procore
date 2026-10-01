# Hướng dẫn cài và chạy

Dành cho người muốn tự cài hệ thống và xem thử. Không cần biết lập trình.

---

## 1. Cần cài gì trước

| Cần | Phiên bản | Tải ở đâu |
|---|---|---|
| Node.js | 22 trở lên | <https://nodejs.org> |
| PostgreSQL | 16 trở lên | <https://www.postgresql.org/download/> |

Cài xong mở terminal (trên Windows dùng PowerShell), gõ:

```bash
node --version     # cần hiện v22.x trở lên
npm --version
psql --version     # cần hiện v16 trở lên
```

Ba dòng này phải chạy được thì mới đi tiếp được.

> **Nếu gõ `psql` mà báo không tìm thấy:** chưa cài PostgreSQL, hoặc đã cài nhưng
> chưa thêm thư mục bin của nó vào PATH. Cách sửa khác nhau theo hệ điều hành — xem
> [mục 6](#6-khi-gặp-lỗi).

---

## 2. Cài hệ thống

```bash
git clone https://github.com/TungLinhh/pmo-project-procore.git
cd pmo-project-procore
npm install
npm run setup
npm run dev
```

Bốn lệnh, xong là mở trình duyệt vào **http://localhost:5173**.

`npm run setup` mất khoảng **3 giây**. Nó tự làm bốn việc:

1. Bật PostgreSQL
2. Tạo user và database cho hệ thống
3. Tạo bảng dữ liệu
4. Nạp dữ liệu dự án mẫu

Bạn **không cần** làm gì thêm. `npm run setup` chạy lại bao nhiêu lần cũng được, không
làm hỏng dữ liệu.

---

## 3. Đăng nhập

Mọi tài khoản mẫu đều dùng chung mật khẩu: **`admin123`**

| Email | Bạn sẽ thấy được gì |
|---|---|
| `admin@hbg.com` | Toàn quyền — nên dùng tài khoản này để xem hết |
| `ceo@hbg.com` | Gói nhìn sếp: nhiều dự án, duyệt, đóng dự án |
| `pm@hbg.com` | Quản lý dự án: duyệt bản vẽ, vật tư |
| `pmo@hbg.com` | Giám sát: xem nhiều dự án, số liệu KPI |
| `site@hbg.com` | Công trường: báo cáo hằng ngày, ảnh, nhân lực (dùng trên điện thoại) |
| `procurement@hbg.com` | Mua sắm: vật tư, hợp đồng |
| `accounting@hbg.com` | Kế toán: chuỗi thanh toán |
| `technical@hbg.com` | Kỹ thuật: bản vẽ và hạng mục được giao |

**Nên bắt đầu với `admin@hbg.com`** để xem toàn bộ chức năng.

Dữ liệu mẫu là một dự án tên **BTE-WP4-HBC** — công trình xây dựng nhiều khu vực (32
khu), có lịch trình, hồ sơ bản vẽ, danh sách vật tư, hợp đồng và thanh toán đã nhập sẵn.
Ngày trong lịch được đặt **tương đối với hôm nay**, nên bạn luôn thấy một dự án đang
chạy, không phải dữ liệu cũ.

---

## 4. Nên xem thử những gì

Theo thứ tự dễ hiểu nhất:

| Bước | Vào đâu | Xem gì |
|---|---|---|
| 1 | Trang chủ | Tổng quan: dự án nào đang chạy, tiến độ bao nhiêu, hồ sơ gì đang trễ hạn |
| 2 | Tiến độ thi công | Lịch Gantt 864 hạng mục theo 32 khu vực, biểu đồ S-curve tiến độ |
| 3 | Bản vẽ thi công | 200 hồ sơ bản vẽ chờ duyệt, thấy quy trình duyệt nhiều bước |
| 4 | Vật tư | Danh sách vật tư, hồ sơ đề nghị, hạn bàn giao và cảnh báo trễ |
| 5 | Hợp đồng & Thanh toán | 77 hợp đồng nối thành chuỗi: hợp đồng → hoá đơn → đề nghị thanh toán → chi |
| 6 | Nhân lực | Kế hoạch và thực tế nhân lực, máy theo từng tháng |
| 7 | Cổng "Cần xử lý" | Danh sách việc quá hạn, bấm vào là nhảy thẳng tới nơi cần sửa |

Muốn hiểu nghiệp vụ chi tiết từng màn: **docs/USER_GUIDE_VI.md**

---

## 5. Các lệnh thường dùng

```bash
npm run dev          # chạy app (cửa sổ này phải mở giữ nguyên)
npm run build        # đóng gói giao diện
npm start            # chạy bản hoàn chỉnh ở http://localhost:3000
npm run setup        # cài đặt lại từ đầu (an toàn, chạy lại được)
npm test             # chạy bộ kiểm tra cơ bản
```

Bản chạy thật một cổng (không cần hai cửa sổ):

```bash
npm install && npm run build && npm start
```

---

## 6. Khi gặp lỗi

**`npm: command not found`** hoặc `node: command not found`
→ Node.js chưa cài, hoặc cài xong chưa khởi động lại terminal. Đóng terminal, mở lại.

**`role "pmo_user" does not exist`** hoặc `permission denied for schema public`
→ PostgreSQL chưa có user/database cho hệ thống. Chạy:

```bash
npm run setup:postgres
```

Nếu vẫn lỗi, báo lệnh sau lấy quyền admin rồi chạy tiếp (đổi `tênuser-postgres` cho
đúng tên user PostgreSQL trên máy bạn):

```bash
sudo -u <tênuser-postgres> npm run setup:postgres
```

**`Postgres không chạy ở 127.0.0.1:5433`**
→ Chưa bật PostgreSQL. Bật lên rồi chạy lại `npm run setup`. Muốn dùng cổng khác:

```bash
DB_PORT=5432 npm run setup
```

**Cổng 3000 hoặc 5173 đã bị chiếm** → chương trình khác đang dùng. Đóng nó, hoặc chạy
cổng khác:

```bash
PORT=3100 npm run dev
```

**`relation "..." does not exist`** khi nạp dữ liệu → bảng chưa tạo xong. Chạy lại:

```bash
node backend/src/db/init.js && npm run demo:seed
```

**Mọi màn hình đều trống** → thiếu bước nạp dữ liệu mẫu:

```bash
npm run demo:seed
```

---

## 7. Muốn xoá sạch và cài lại từ đầu

```bash
psql -U pmo_user -d postgres -c "DROP DATABASE IF EXISTS pmo"
npm run setup
```

Lệnh này **xoá hết dữ liệu** trong database mẫu, kể cả thay đổi bạn đã tự thử. Chỉ
làm khi bạn muốn bắt đầu sạch.

---

## 8. Chạy bằng Docker (nếu bạn quen Docker hơn)

```bash
git clone https://github.com/TungLinhh/pmo-project-procore.git
cd pmo-project-procore
docker compose up --build
```

Xong mở **http://localhost:3000**. Docker tự cài đặt PostgreSQL, tạo bảng và nạp dữ
liệu — không cần chạy `npm run setup`.

---

## 9. Với người kỹ thuật

| Nội dung | Ở đâu |
|---|---|
| Đặc tả kỹ thuật đầy đủ | `docs/PRODUCT_TECHNICAL_DOCUMENTATION.md` |
| Hướng dẫn nghiệp vụ từng màn | `docs/USER_GUIDE_VI.md` |
| Cấu trúc kỹ thuật và SRS | `docs/srs/` |
| Cấu hình đầy đủ | `.env.example` |

Biến môi trường quan trọng: `DATABASE_URL` (ưu tiên cao nhất), hoặc nhóm
`DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME`. Mặc định local là
`127.0.0.1:5433`, database `pmo`, user `pmo_user`. Khi đưa lên máy chủ thật **bắt buộc**
đặt `JWT_SECRET` (chuỗi bí mật dài ít nhất 32 ký tự).
