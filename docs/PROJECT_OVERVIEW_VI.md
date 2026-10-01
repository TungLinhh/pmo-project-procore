# Dự án này là gì và đã làm được gì

Tài liệu dành cho người đọc hiểu **chức năng**, không cần hiểu công nghệ.

---

## 1. Vấn đề cần giải

Công trình xây dựng nhiều khu vực (khu đôi thương mại, khu resort, khu dân cư…) sinh ra
lượng giấy tờ lớn mà nằm rải rác: bản vẽ nằm trên email, danh sách vật tư nằm trong
file Excel tải về từ máy, hợp đồng nằm trong hồ sơ giấy. Kết quả:

- Không biết tiến độ thật, chỉ biết báo cáo miệng.
- Không biết hồ sơ nào trễ hạn cho tới khi bị hỏi.
- Số tiền trên giấy không khớp số tiền đã chi.
- Khi có sự cố thì tra cứu mất hàng giờ.

Hệ thống này gom những thứ đó vào một chỗ, theo dõi liên tục và báo đúng chỗ cần xử lý.

---

## 2. Ai dùng, dùng để làm gì

| Vai trò | Công việc hằng ngày trên hệ thống |
|---|---|
| **Ban điều hành (CEO)** | Xem nhiều dự án cùng lúc, biết dự án nào sắp trễ, duyệt và đóng dự án |
| **Quản lý dự án (PM)** | Theo dõi tiến độ từng hạng mục, duyệt bản vẽ và hồ sơ vật tư, lập kế hoạch nhân lực |
| **Giám sát (PMO)** | Nhìn tổng thể nhiều dự án, chỉ số KPI, dữ liệu danh mục dùng chung |
| **Giám sát công trường (Site)** | Gửi báo cáo hằng ngày, chụp ảnh tiến độ, cập nhật vật tư (dùng trên điện thoại, có thể làm khi mạng yếu) |
| **Mua sắm** | Quản lý vật tư, hợp đồng nhà cung cấp |
| **Kế toán** | Chuỗi thanh toán từ hợp đồng đến chi tiền |
| **Kỹ thuật** | Bản vẽ thi công và các hạng mục được giao xử lý |

---

## 3. Các chức năng đã có và đang chạy thật

### 3.1 Tiến độ thi công
- Lịch trình chi tiết **864 hạng mục**, chia theo **32 khu vực**.
- Biểu đồ Gantt xem tiến độ theo thời gian và theo khu.
- Biểu đồ đường cong S: so tiến độ thực tế với kế hoạch.
- Tính tỉ lệ hoàn thành, độ trễ, hạng mục nào đang chậm.
- **Nén tiến độ**: xem trước kịch bản rút ngắn lịch, xem trước tác động, rồi mới quyết định áp dụng — và có thể hoàn tác nếu không ổn.

### 3.2 Bản vẽ thi công (shop drawing)
- 200 hồ sơ bản vẽ trong dữ liệu mẫu.
- Quy trình duyệt nhiều bước: người gửi → kỹ thuật → quản lý → phê duyệt cuối.
- Ghi nhận mọi lần trả lại kèm lý do, ai trả lại, lúc nào.
- Đếm hồ sơ đang chờ ở mỗi bước.

### 3.3 Vật tư
- Danh sách vật tư theo dự án và theo hạng mục.
- Hồ sơ đề nghị cung cấp với hạn bàn giao; hệ thống **tự cảnh báo trước khi trễ**.
- Báo cáo vật tư thiếu so với khối lượng dự kiến.

### 3.4 Hợp đồng và thanh toán
- Chuỗi đầy đủ: **hợp đồng → hoá đơn → đề nghị thanh toán → chi tiền** (77 hợp đồng, 248 hoá đơn).
- Theo dõi giữ lại (bảo lãnh) và giải ngân.
- Cảnh báo hợp đồng sắp hết hiệu lực.
- Chống chi trùng: cùng một yêu cầu chi hai lần thì hệ thống chặn, báo rõ là đã xử lý.

### 3.5 Nhân lực và máy móc
- Kế hoạch nhân lực theo tháng, so với thực tế.
- Tính năng suất một số hạng mục để kiểm tra khối lượng.

### 3.6 Nhập dữ liệu từ file Excel
- Nạp file Excel công trường: cấu hình cột → xem trước → ghi vào hệ thống.
- Chạy lại nhiều lần **không tạo dữ liệu trùng**.
- Báo rõ dòng nào hợp lệ, dòng nào không và vì sao.

### 3.7 Bảng điều khiển và cảnh báo
- Trang tổng quan bốn trụ cột: tiến độ — chất lượng hồ sơ — vật tư — tiền.
- Cổng **"Cần xử lý"**: gom mọi việc trễ hạn theo bốn nhóm, bấm vào là nhảy thẳng tới nơi
  cần sửa.
- Cập nhật màn hình tự động, không phải bấm tải lại.

### 3.8 Nhiều công ty dùng chung hệ thống (nhiều "khách hàng")
- Mỗi công ty là một **tenant** riêng, dữ liệu không lẫn vào nhau — kiểm ở tầng cơ sở dữ
  liệu chứ không chỉ ở giao diện.
- Ba gói: Small / Mid / Enterprise, mỗi gói có phạm vi chức năng khác nhau.

### 3.9 An toàn
- Đăng nhập bằng mật khẩu, có thêm bước xác minh hai lớp.
- Đăng nhập một nơi thì huỷ được các phiên khác.
- Mọi thao tác quan trọng đều được ghi lại: ai, lúc nào, làm gì — không sửa được, xoá được.
- Dữ liệu nhạy cảm (số điện thoại, mã đăng nhập) được mã hoá khi lưu.
- Người ngoài có thể xoá dữ liệu của chính mình (quyền riêng tư).

---

## 4. Đợt làm việc vừa rồi — đã làm được gì

Năm đợt gần nhất, tất cả **đều đo được bằng cách chạy thật**, không chỉ sửa mã.

### Đợt 1 — Vá lỗi chết âm thầm (v0.10.1 – v0.10.4)
Sửa những chỗ người dùng bấm nút nhưng không có gì xảy ra, hoặc thấy thông báo sai:
- Tạo vật tư báo lỗi dù chức năng có thật.
- Màn hình có nút nhưng chưa nối vào chức năng (kịch bản, liên kết, ngày lễ).
- Một số tác vụ chạy nền có thể làm treo hệ thống giữa chừng.

### Đợt 2 — An toàn và hoạt động ngoại tuyến (v0.8.0 – v0.10.0)
- Chuyển sang đăng nhập bằng cơ chế an toàn hơn, có thu hồi phiên.
- Công trường gửi báo cáo được cả khi mạng yếu — dữ liệu chờ rồi tự gửi khi có mạng.
- Thêm xem mô hình 3D, đọc dữ liệu từ hệ thống kế toán, cổng thông báo thời gian thực.

### Đợt 3 — Vận hành thật thay vì chỉ chạy trên máy dev (v0.11.0)
Đây là đợt quan trọng nhất về mặt vận hành:
- **Không rò thông tin lỗi ra ngoài.** Trước đó 51 chỗ có thể trả nguyên văn lỗi cơ sở
  dữ liệu cho người dùng (bao gồm cả câu báo độ dài không giới hạn — dấu hiệu bị tấn công).
- **Tự phục hồi.** Đo thật: giết sập cơ sở dữ liệu lúc 21:09:06, hệ thống tự đứng dậy lúc
  21:09:20 — gián đoạn **14 giây**, không cần ai can thiệp.
- Sửa hai bảng chặn dữ liệu sai vì cách kiểm tra tenant bị lỗi với tác vụ nền.

### Đợt 4 — Dữ liệu mẫu nhìn như dự án thật (v0.12.0)
Trước đây lịch trình mẫu nằm ở **2019–2020**, nên mở ra thấy một dự án đã xong từ lâu
— không giống công trường đang chạy. Nay:
- Dời **66 207 dòng dữ liệu** ở 23 bảng về khoảng thời gian hôm nay.
- Dời bằng **một hằng số duy nhất** cho mọi cột ngày, nên mọi khoảng cách và quan hệ
  giữa các hạng mục **giữ nguyên tuyệt đối** — chỉ vị trí tuyệt đối thay đổi.
- Ngày nào chạy cũng ra một dự án đang triển khai.
- Ngoài ra: khi không nén được lịch, thông báo lỗi **nói rõ ngày sớm nhất có thể** thay
  vì chỉ báo chung chung.

### Đợt 5 — Ba nhánh chức năng chết không ai biết (v0.13.0 – v0.13.1)
Ba chức năng **có trong mã nguồn, chạy được, nhưng luôn hỏng âm thầm** — không ai phát
hiện vì bài kiểm cũ cũng bỏ qua:
1. **Đối soát thanh toán** — luôn báo 45 dòng sai dù dữ liệu đúng.
2. **Tìm cột tiền trong file Excel** — nhận nhầm ô chứa chữ `PAID` là cột tiền.
3. **Ghi số tiền đề nghị thanh toán** — đọc từ một ô không tồn tại.

Đo trước/sau: **45 dòng đỏ → 0 dòng đỏ**.

Thêm sổ S&P mẫu sinh tự động từ dữ liệu đang có, và sửa một lỗi khiến kết quả đối soát
**phụ thuộc vào thứ tự chạy các bài kiểm** (chạy riêng thì đúng, chạy cả bộ thì sai).

### Đợt 6 — Người mới cài được trong một lệnh (v0.14.0)
Trước đợt này, **người clone repo về không chạy được**:
- Không có script nào tạo user và database ⇒ báo lỗi không hiểu.
- Nếu bỏ qua lỗi đó, hệ thống chạy nhưng **mọi màn hình đều trống** vì dữ liệu mẫu nằm
  trong thư mục không được phép phát hành.

Nay đã có `npm run setup` — tự làm hết bốn việc trong 3 giây. Đo trên bản clone sạch:
864 hạng mục lịch, 200 hồ sơ bản vẽ, 77 hợp đồng, 32 khu vực; 12 màn nghiệp vụ trả về dữ
liệu thật.

---

## 5. Độ tin cậy hiện tại

| Hạng mục | Kết quả đo được |
|---|---|
| Bộ kiểm tra tự động | **141 bài, tất cả đạt** |
| Cổng nghiệm thu | **75/75 mục đạt** |
| Trùng lặp mã nguồn khi thêm bảng mới | 66/66 bảng an toàn |
| Thời gian tự phục hồi sau sập | 14 giây, không cần người |
| Dữ liệu mẫu sẵn sàng sau khi cài | 3 giây |

---

## 6. Việc còn lại

### 6.1 Cần người quyết định nghiệp vụ — **15 mục**

Hệ thống có 15 chỗ mà **quy định nghiệp vụ chưa rõ**, nên code đang dùng một giả định
mặc định và ghi lại để chờ ký. Danh sách ở
`docs/DATA_DECISIONS_REQUIRED.md`. Ba ví dụ dễ thấy nhất:

| Mục | Câu hỏi cần trả lời |
|---|---|
| Số 6 | Khi số tiền trong file gốc lệch với hệ thống, **lấy bên nào làm chuẩn**? |
| Số 13 | Ngày lịch dự án mẫu để ở quá khứ hay neo theo ngày chạy? (đã chọn: neo theo ngày chạy) |
| Số 16 | Có nên mở rộng bảng phân quyền để phủ hết 25 phân hệ chức năng không? |

### 6.2 Còn thiếu

| Việc | Mức độ |
|---|---|
| Ký 15 mục quyết định nghiệp vụ | Cần người quyết, không phải viết thêm code |
| Chạy UAT với người dùng thật | Chưa tổ chức — Dòng tiến độ, bản vẽ, vật tư, thanh toán, nhân lực |
| Ký số thay đổi điện thoại / đăng nhập hai lớp | Hiện dùng khoá dùng một lần, chưa gắn thiết bị thật |
| Kết nối hệ thống kế toán thật | Đã có khung, chưa nối vào phần mềm cụ thể |
| Lưu trữ tệp trên đám mây | Đang lưu ổ cứng máy chủ; giao diện đã có, chưa bật |
| Nhập từ hệ thống dự án quốc tế | Có khung, chưa chọn nhà cung cấp cụ thể |
| Nhãn màn hình chưa dịch đủ tiếng Anh | Đếm được 275 nhãn ở 29 màn; cần mở từng màn kiểm bằng mắt |
| Tách ổ đĩa lưu tệp riêng | Yêu cầu hạ tầng, không làm được trên máy này |

### 6.3 Việc người kiểm duyệt nên làm tiếp

1. Cài theo [hướng dẫn](GUIDE_VI.md) trên máy thật của bạn — nếu chỗ nào vướng, ghi lại
   bước đó vì đó là chỗ hướng dẫn còn thiếu.
2. Đăng nhập từng tài khoản ở mục 3 trong hướng dẫn, xem có vai trò nào thấy màn hình
   trống bất thường không.
3. Bấm các màn chính ở mục 4, đặc biệt **cổng "Cần xử lý"** và **luồng thanh toán** — đây
   là hai chỗ nối nhiều phần nhất.
4. Trả lời 3 câu hỏi ở mục 6.1 để hệ thống bỏ được giả định mặc định.
