# Sổ tay sử dụng PMO — O‑NEXUS

Hướng dẫn thao tác từng bước, theo đúng thứ tự người dùng phải làm. Mọi nhãn nút,
tên cột và thông báo trong tài liệu này được ghi **đúng nguyên văn** như xuất hiện trên
màn hình (tiếng Việt có dấu), để bạn tìm thấy và bấm đúng.

**Cách đọc tài liệu**

| Ký hiệu | Ý nghĩa |
|---|---|
| `Nút` | Tên nút bạn bấm |
| `Ô` | Ô nhập liệu, kèm nhãn hiện thấy |
| → | Bấm theo thứ tự từ trên xuống |
| ⚠️ | Cạm bẫy đã biết — đọc trước khi làm |
| ⓘ | Hạn chế có thật của hệ thống, không phải lỗi |

Dữ liệu nghiệp vụ **không đổi theo ngôn ngữ**. Nút `VI | EN` chỉ đổi tên menu, tên
cột bảng và khung giao diện; nội dung các trang vẫn tiếng Việt.

---

## 1. Đăng nhập

### 1.1 Bước thông thường

1. Mở `http://<địa-chỉ-máy-chủ>:3000` → trang **Đăng nhập**.
2. Ô `Email / Username` → gõ email, ví dụ `pm@hbg.com`.
3. Ô `Mật khẩu` → gõ mật khẩu.
4. → `ĐĂNG NHẬP`.

Sau khi đăng nhập thành công:

- Tài khoản `site@hbg.com` → vào thẳng màn **Công trường** (`/field`).
- Các vai trò khác → vào **Project Control Center** (`/hq`).

ⓘ Bản demo (chạy bằng `npm run dev`) có sẵn 7 nút tài khoản, bấm vào để điền sẵn email
+ mật khẩu. Bản production **không** có các nút này và các ô để trống.

### 1.2 Tài khoản demo (mật khẩu chung: `admin123`)

| Vai trò | Email | Dùng để làm gì |
|---|---|---|
| Quản trị | `admin@hbg.com` | Toàn quyền, cấu hình hệ thống |
| CEO | `ceo@hbg.com` | Xem toàn bộ, ra chỉ thị, duyệt cấp cao |
| PM | `pm@hbg.com` | Quản lý dự án được gán |
| PMO | `pmo@hbg.com` | Vận hành, duyệt, kiểm soát |
| Hiện trường | `site@hbg.com` | Cập nhật tiến độ, báo cáo ngày, ảnh |
| Kỹ thuật | `technical@hbg.com` | Tiến độ, báo cáo ngày, hồ sơ bản vẽ |
| Mua sắm | `procurement@hbg.com` | Vật tư, thầu phụ, nhà cung cấp |
| Kế toán | `accounting@hbg.com` | Hợp đồng, hóa đơn, thanh toán |

### 1.3 Khi hệ thống yêu cầu xác thực 2 bước (MFA)

1. Màn hiện `Xác thực 2 bước`.
2. Ô `Mã xác thực` → gõ 6 chữ số từ app Authenticator → → `XÁC NHẬN`.
3. Nếu nhập sai → `Sai mã xác thực`. Nhập lại.

→ `← Quay lại đăng nhập` nếu nhập sai email.

### 1.4 Khi hệ thống bắt đổi mật khẩu tạm

1. Màn hiện `Đổi mật khẩu` với dòng nhắc tài khoản của bạn.
2. Ô `Mật khẩu mới` → gõ **ít nhất 10 ký tự**.
3. Ô `Nhập lại mật khẩu mới` → gõ lại y hệt.
4. → `ĐỔI MẬT KHẨU`.

Nếu 2 mật khẩu không khớp → `Mật khẩu nhập lại không khớp`. Nếu dưới 10 ký tự →
`Mật khẩu tối thiểu 10 ký tự`.

Sau khi đổi mật khẩu, **mọi phiên đăng nhập khác của bạn đều bị đăng xuất**.

ⓘ `Quên mật khẩu?` — hệ thống **không có** chức năng tự đặt lại. Hãy liên hệ quản
trị viên, họ dùng trang *Bảo mật* hoặc chức năng đặt lại mật khẩu cho tài khoản.

### 1.5 Đăng nhập bằng SSO

Nút `Đăng nhập bằng SSO` chuyển sang IdP của công ty.
ⓘ Nếu tài khoản chưa được bật SSO, màn hiện `Tài khoản chưa bật SSO — liên hệ admin`.

### 1.6 Thông báo lỗi khi đăng nhập

| Hiện ra | Nguyên nhân | Xử lý |
|---|---|---|
| `Sai email hoặc mật khẩu` | sai thông tin | kiểm tra lại, chú ý hoa/thường |
| `Quá nhiều lần thử, vui lòng đợi một phút rồi thử lại` | quá 10 lần/phút từ cùng IP | chờ 60 giây |
| `Email này thuộc nhiều đơn vị. Chọn tenant để tiếp tục.` | cùng email ở 2 tenant | chọn đơn vị ở ô `Đơn vị / Tenant` |
| `Mật khẩu mới tối thiểu 10 ký tự` | mật khẩu quá ngắn | gõ dài hơn |
| `Sai mật khẩu hiện tại` | sai mật khẩu cũ khi đổi | nhập lại |

---

## 2. Làm quen giao diện

### 2.1 Khung chung (màn `/hq`)

```
┌──────────────────────────────────────────────────────────┐
│ [☰] O‑NEXUS      ● Đã đồng bộ 12:04   [VI|EN] [🌙] [🔔] [👤] │
├────────────┬─────────────────────────────────────────────┤
│ Tổng quan  │                                             │
│  · Project Control Center                               │
│  · Bảo mật                                              │
│ Nghiệp vụ  │            Nội dung trang                    │
│  · Dự án · Tiến độ · Bản vẽ shop · Vật tư              │
│  · Nhân lực & Thiết bị · QA/QC · Thanh toán             │
│  · Sự cố · Cần xử lý · Trợ lý AI · Thư viện BIM         │
│ Vận hành   │                                             │
│  · Vận hành & Hiệu năng · Sao lưu · Cấu hình điều khiển│
│ Quản trị   │                                             │
│  · Tải lên · Thông báo · Dữ liệu chủ · Phê duyệt        │
│  · Cấu hình duyệt · Nhật ký kiểm tra · Cấu hình AI      │
│  · SSO & Dữ liệu                                        │
└────────────┴─────────────────────────────────────────────┘
```

### 2.2 Các nút trên thanh trên cùng

| Nút | Tác dụng |
|---|---|
| `Đã đồng bộ 12:04` | Chỉ báo: trang vừa tải dữ liệu xong lúc mấy giờ |
| `VI` / `EN` | Đổi ngôn ngữ khung giao diện và tên cột bảng — xem mục 2.2.1 về phạm vi đã dịch |
| 🌙 / ☀️ | Chuyển Dark mode / Light mode, nhớ lại lần sau |
| 🔔 | Chuông thông báo (mọi vai trò đều thấy) |
| `Đăng xuất` | Thoát tài khoản |

### 2.2.1 Phạm vi nút `VI` / `EN` — nói thẳng để không bất ngờ

Nút `VI | EN` đã phủ **toàn bộ** giao diện: khung, menu, tiêu đề màn, tên cột bảng,
nhãn thẻ số liệu, nút bấm, ô nhập, thông báo lỗi, và **thanh phân trang** kèm đơn
vị tính.

Dữ liệu nghiệp vụ **giữ nguyên ngôn ngữ nhập** — tên hợp đồng, tên nhà cung cấp, tên
hạng mục, tên dự án không được dịch máy. Đó là chủ ý: dữ liệu nhập sai ngôn ngữ thì
tra cứu không khớp. Tên sản phẩm `O-NEXUS` cũng giữ nguyên.

ⓘ Câu hỏi mẫu ở tab `Trợ lý AI` **gửi đi bằng tiếng Việt** kể cả khi bạn đang xem
tiếng Anh. Đó là thứ gửi vào hệ thống chứ không phải chữ hiển thị: dữ liệu và từ
khoá tra cứu đều tiếng Việt, hỏi bằng tiếng Anh sẽ cho câu trả lời kém hơn. Nhãn
nút bên cạnh thì có dịch.

ⓘ Khi đổi ngôn ngữ, màn đang mở đổi **ngay**, không phải tải lại trang. Thấy màn nào
phải tải lại mới đổi thì báo lỗi — nghĩa là component đó thiếu `useLang()`.

ⓘ Ngôn ngữ được nhớ **theo tài khoản**, không phải theo máy: bấm nút là hệ thống lưu
vào hồ sơ (`users.locale`), nên đổi ở một máy rồi mở máy khác vẫn giữ ngôn ngữ đó.
Không có màn cài đặt riêng — chỉ dùng nút này.

Xem `docs/CODEBASE_BUG_AUDIT.md` mục 11 để biết còn màn nào chưa dịch, theo thứ tự
nào; có máy đo và kiểm tự động chặn việc tăng thêm.

ⓘ Nếu thấy màn nào hiện nửa tiếng Việt nửa tiếng Anh, đó là hạn chế đã biết, không
phải lỗi hiển thị. Báo lại màn đó sẽ được đưa lên đầu danh sách.

### 2.3 Thu gọn / mở rộng menu

Nút `Mở rộng menu` thu sidebar còn thanh icon, nút `Thu menu thành thanh icon` mở lại.
Trạng thái được nhớ. Mỗi nhóm menu có nút thu gọn riêng (`Thu gọn` / `Mở rộng`) và trạng
thái cũng được nhớ.

ⓘ Trên điện thoại, menu tự ẩn; bấm nút `Mở menu` để mở.

### 2.4 Chuông thông báo

1. Bấm 🔔 → panel mở ra.
2. Dòng đầu: `Đánh dấu tất cả đã đọc` (chỉ hiện khi còn thông báo chưa đọc).
3. Hai nút lọc: `Tất cả (n)` · `Chưa đọc (n)`.
4. Bấm một dòng thông báo → hệ thống đánh dấu đã đọc và **mở thẳng màn hình liên quan**.

ⓘ Chuông làm mới mỗi 30 giây, và tức thì khi có việc mới (kết nối realtime).
ⓘ Chỉ hiện **50 thông báo mới nhất**. Muốn xem đầy đủ vào menu `Thông báo`.
ⓘ Mở nhiều tab cùng lúc an toàn: hệ thống tự xử lý khi hai tab cùng làm mới phiên.

### 2.5 Chọn dự án

Hầu hết màn hình nghiệp vụ đều cần chọn dự án trước:

1. Bấm ô chọn dự án (placeholder `Chọn dự án...`).
2. Gõ mã hoặc tên để lọc — hỗ trợ phím `↑` `↓` để di chuyển, `Enter` chọn, `Esc` đóng.
3. Bấm vào dòng cần chọn.

ⓘ Nếu không chọn, hệ thống mặc định dự án `BTE-WP4-HBC` khi có.

### 2.6 Bảng có phân trang

Dưới bảng có dòng `Hiển thị 1–25 / 132 vật tư`, nút `‹` `›` và ô chọn số dòng/trang
(25 / 50 / 100).

### 2.7 Bảng có phân trang ở đâu, không có ở đâu

**Đã có thanh phân trang** (đổi trang bằng `‹` `›`, đổi số dòng 25/50/100):

| Màn hình | Tổng hiển thị |
|---|---|
| `Sự cố` | toàn bộ |
| `Bản vẽ shop` | toàn bộ |
| `QA/QC` | toàn bộ |
| `Thư viện BIM` | toàn bộ |
| `Vật tư` | toàn bộ |
| `Chi tiết tiến độ` | toàn bộ |
| `Nhật ký kiểm tra` | **tới hạn, phân trang ở máy chủ** — bản ghi có gần 7.000 dòng |

**Chưa có phân trang, và cần biết trước:**

| Màn hình | Chỉ thấy tối đa | Ghi chú |
|---|---|---|
| `Phê duyệt` | 20 mỗi loại (shop / vật tư / thanh toán) | **Có** — mỗi nhóm có thanh phân trang riêng |
| `Nhân lực & Thiết bị` | 8 tuần gần nhất có dữ liệu | Không — đây là cửa sổ thời gian cố ý |

ⓘ Mọi bảng đã phân trang đều hiện `Đang hiện a–b / N`. Nếu dữ liệu vượt quá
mức tải một lần, màn hiện thêm dòng `Đang hiện N / M …` — nghĩa là còn dữ liệu
ngoài trang này, không phải đã xem hết.

ⓘ `Phê duyệt` lấy **20 mỗi loại** vì đó là **hàng đợi việc**, không phải trang duyệt
dữ liệu — nhưng vẫn có thanh phân trang riêng cho từng nhóm, nên lấy được phần còn
lại. Trước đây màn báo `còn N nữa` mà không lấy được; giờ bấm `›` là ra phần tiếp.

### 2.8 Thao tác bằng bàn phím

| Phím | Tác dụng |
|---|---|
| `Tab` / `Shift+Tab` | di chuyển giữa các nút, ô nhập. Viền vàng hiện quanh nút đang chọn |
| `Esc` | đóng hộp thoại đang mở; ở ô chọn dự án thì đóng danh sách |
| `Enter` | xác nhận nút đang chọn. Ở hộp thoại xác nhận, focus mặc định nằm ở nút `Hủy` nên `Enter` một lần không bao giờ chạy nhầm hành động không hoàn tác được |
| `↑` `↓` | di chuyển trong danh sách của ô chọn dự án |

Khi mở một hộp thoại, focus tự nhảy vào trong đó và `Tab` bị giữ ở đó — không chạy
mất ra các nút của trang nằm sau lớp phủ. Khi đóng, focus trả về đúng nút đã mở
hộp thoại, nên bạn tiếp tục được ngay.

---

## 3. Nạp dữ liệu từ file Excel

Đây là bước đầu tiên của mọi dự án: không có file thì bốn trụ cột chỉ toàn số 0.

Có **hai** đường nạp. Chọn theo số lượng file:

| Số file | Dùng đường nào |
|---|---|
| 1 file | `/upload` → chế độ `1 file` (xem trước trước khi ghi) |
| Nhiều file, cả thư mục, hoặc 1 file `.zip` | `/upload` → chế độ `Nhiều file / cả folder / .zip` → rồi làm ở màn `Tải lên` |

### 3.1 Đường 1 — nạp 1 file (4 bước, có xem trước)

Vào menu `Tải lên`, hoặc gõ `/upload`.

Thanh bước hiển thị: `Upload` → `Cấu hình` → `Xem trước` → `Hoàn tất`.

**Bước 1 — `Upload`**

1. Bấm nút `1 file` (nếu đang ở chế độ khoá hàng loạt).
2. Kéo–thả file vào ô `Drop Excel file here, hoặc click để chọn`, hoặc bấm vào ô đó để mở
   hộp chọn tập tin.
3. Kiểm tra tên file và dung lượng hiện ra.
   - Muốn đổi file → bấm `Chọn file khác`.
4. → `Upload →`

**Bước 2 — `Cấu hình`**

1. Ô `Dự án *` → chọn dự án.
   - Chưa có dự án? → bấm `+ Mới`, nhập `Code (vd: BTE-WP5-HBC)`, `Tên tiếng Việt`, → `Tạo`.
2. Ô `Zone` → chọn khu vực (ví dụ `BOH`).
   - Chưa có zone? → bấm `+ Mới`, nhập `Zone code (vd: BOH)`, `Tên (tùy chọn)`, → `Tạo`.
   - Để trống → hệ thống tự dùng zone mặc định `GEN-*` của đúng loại tài liệu.
3. Ô `Loại tài liệu *` → chọn loại (xem bảng 3.2).
   - Thường hệ thống **tự đoán** từ tên file; nếu không đoán được, ô này vẫn trống và
     nút `Xem trước →` không bấm được.
4. → `Xem trước →`

**Bước 3 — `Xem trước`**

1. Kiểm tra 4 dòng tóm tắt: `Project:`, `Zone:`, `Loại:`, `Tống rows:`.
2. Mỗi sheet hiện số dòng và **3 dòng mẫu đầu tiên** để đối chiếu cột.
3. → `Xác nhận Insert`

ⓘ Xem trước chỉ hiện 3 dòng/sheet và **không** cảnh báo dòng nào sai. Muốn kiểm tra
cả file, hãy mở file Excel gốc. Lỗi chỉ hiện ở bước 4.

**Bước 4 — `Hoàn tất`**

| Hiện ra | Ý nghĩa |
|---|---|
| `✓ Insert thành công!` | Mọi dòng đã ghi |
| `! Hoàn tất với lỗi` | Có dòng lỗi — xem 2 số bên dưới |
| `<n> rows OK` | Số dòng đã ghi thành công |
| `<n> rows lỗi` | Số dòng không ghi được |
| `Zone: <mã>` | Zone đã dùng |

→ `Đóng`

### 3.2 18 loại tài liệu

| Mã nội bộ | Tên hiển thị trong ô chọn |
|---|---|
| `daily_report` | Daily Report |
| `business_process` | Business Process |
| `shop_drawing` | Shop Drawing |
| `construction_schedule` | Construction Schedule |
| `material_supply` | Material Supply |
| `subcontractor_directory` | Subcontractor Directory |
| `resource_directory` | Resource Directory |
| `rfa_log` | Rfa Log |
| `supplier_payment` | Supplier Payment |
| `payment_ar` | Payment Ar |
| `manpower_master_plan` | Manpower Master Plan |
| `shop_master` | Shop Master |
| `work_management` | Work Management |
| `other_approved` | Other Approved |
| `file_index` | File Index |
| `zone_map` | Zone Map |
| `payment_progress` | Payment Progress |
| `work_breakdown` | Work Breakdown |

ⓘ Hệ thống đoán loại từ tên file theo các từ khoá: `shop`/`bql`/`shd-` → bản vẽ shop;
`tĐ`/`td`/`schedule`/`csp-` → tiến độ thi công; `vật tư`/`vat tu`/`msa` → vật tư;
`báo cáo`/`daily` → báo cáo ngày; `bãi tràm`/`công nợ` → thanh toán phải thu… Từ khoá
ngắn phải đứng riêng, nên `outdoor.xlsx` sẽ **không** bị hiểu là tiến độ.

### 3.3 Giới hạn kích thước

| Loại | Giới hạn | Vượt thì |
|---|---|---|
| 1 file (đường 1) | 50 MB | `File vượt quá giới hạn 50MB` |
| File `.zip` | 200 MB | từ chối |
| Số entry trong `.zip` | 500 | `Too many entries (>500)` |
| Tổng dung lượng giải nén | 1 GB | `Total uncompressed size >1GB` |
| 1 entry sau giải nén | 50 MB | bỏ qua entry đó, ghi `SKIPPED_FORMAT` |

### 3.4 Đường 2 — nạp hàng loạt

1. Vào `/upload` (mặc định đã ở chế độ `Nhiều file / cả folder / .zip`).
2. Bấm `Chọn nhiều file` — chọn một hoặc nhiều file `.xlsx`.
   - Nếu chọn **đúng 1 file `.zip`**, hệ thống tự mở file nén và lấy các file `.xlsx` bên
     trong. File `.xls` cũ, file `~$...` (file khoá của Office) và file không phải
     `.xlsx` sẽ bị bỏ qua và ghi rõ lý do.
3. Hoặc bấm `Chọn cả folder` — chọn cả thư mục dự án.
4. Danh sách hiện từng dòng với trạng thái: `chờ stage` → `đang upload...` → `staged #<id>`.
5. → `Stage N files`
6. Hệ thống tự chuyển sang màn `Tải lên` (hàng đợi review) — làm tiếp theo mục 3.5.

### 3.5 Màn `Tải lên` — hàng đợi review

Đây là màn bắt buộc sau khi nạp hàng loạt, và cũng là nơi xử lý file nạp nhầm loại.

**Cột bộ lọc `Filter`** (góc trên bên phải):

| Lựa chọn | Ý nghĩa |
|---|---|
| `Needs review` (mặc định) | File chưa gán loại, hoặc loại chưa nhận diện được |
| `Staged` | Mọi file đã nạp, chưa chốt |
| `Skipped (with reason)` | File bị bỏ qua, kèm lý do |
| `Committed` | File đã ghi vào hệ thống |
| `All` | Tất cả |

> ℹ️ **Danh sách này KHÔNG phải toàn bộ file của khách hàng.** Server quét theo lô
> tới khi đủ dòng bạn được phép xem, nên nếu bạn chỉ có quyền trên một vài dự án thì
> những dòng của dự án khác **không tính vào giới hạn** — trước đây chúng ăn hết chỗ
> khiến hàng đợi trông trống trong khi bạn có việc. Khi có dòng bị ẩn vì thiếu quyền,
> màn hình hiện dòng cảnh báo *"Ẩn N file vì bạn không có quyền xem — danh sách này
> KHÔNG rỗng"*. Hết cửa sổ thì hiện *"Còn nhiều hơn nữa…"*.

**Quy trình từng file**

1. Bấm `Classify staged` → hệ thống đoán loại và khu vực cho các file đang chờ.
   - ⚠️ Sau khi đoán xong, các file đã đoán đúng sẽ **biến mất khỏi** `Needs review`.
     Chuyển sang `Staged` để thấy lại.
2. Bấm `Confirm` trên dòng cần xử lý.
3. Chọn dự án ở ô `-- project --` (hoặc bấm `+ Dự án mới` để tạo).
4. Gõ loại tài liệu ở ô `doc_type`.
   - ⚠️ Đây là **ô chữ tự do, không có danh sách gợi ý**. Gõ sai chính tả sẽ nhận
     `Unknown doc_type: ...` nhưng phải bấm `Configure →` mới biết. Dùng đúng tên trong
     bảng 3.2.
5. → `Configure →` (dòng chuyển sang `CONFIGURED`)
6. Bấm `Commit` → file được ghi thật vào bảng nghiệp vụ.
7. (Tùy chọn) Bấm `Xem rows` để xem dữ liệu đã ghi.

**Các nút khác**

| Nút | Tác dụng |
|---|---|
| `Refresh` | Tải lại danh sách |
| `Xem rows` / `Ẩn rows` | Xem dữ liệu đã ghi (chỉ với file `SUCCESS`/`PARTIAL`) |

⚠️ Màn này **không có** ô chọn Zone — file sẽ vào zone mặc định `GEN-*` của loại tài liệu.
Nếu cần gắn zone cụ thể, dùng đường 1 (mục 3.1) và chọn Zone ở bước `Cấu hình`.

### 3.6 Trạng thái của một file

| Trạng thái | Nghĩa |
|---|---|
| `STAGED` | Đã nhận file, chưa gán loại |
| `CONFIGURED` | Đã gán dự án/zone/loại, sẵn sàng ghi |
| `SUCCESS` | Đã ghi, không dòng lỗi nào |
| `PARTIAL` | Đã ghi, có ít nhất 1 dòng lỗi |
| `FAILED` | Không ghi được dòng nào |
| `SKIPPED_LOCKED` | File có mật khẩu |
| `SKIPPED_REFERENCE` | File tham chiếu (chỉ hình vẽ, bảng tổng hợp) — có lý do kèm theo |
| `SKIPPED_FORMAT` | Không phải `.xlsx`, hoặc `.xls` cũ |

⚠️ File không ra dòng nào vẫn mang trạng thái `SUCCESS` với `0 rows OK`. Không có
nghĩa là file sai — chỉ là hệ thống không tìm thấy dòng nào đọc được.

⚠️ Nạp lại **cùng một file** (cùng nội dung) sẽ dùng lại đúng bản ghi cũ và giữ nguyên
dự án/zone đã gán. File **không** lên đầu danh sách vì thời điểm tạo không đổi — nếu
không thấy file vừa nạp, hãy bấm `Refresh` rồi xem tab `Staged`.

### 3.7 Nạp lại file đã ghi

Muốn sửa dữ liệu từ file đã nạp:

1. Nạp lại file (cùng nội dung) → hệ thống dùng lại bản ghi cũ.
2. Bấm `Confirm` để phân tích lại (bắt buộc) — nút `Commit` chỉ hiện với file
   `CONFIGURED`.
3. → `Commit`.

ⓘ Chạy lại không tạo dòng trùng: mỗi loại tài liệu có cơ chế ghi đè theo khoá riêng
(mã hạng mục, mã bản vẽ, mã vật tư…). Riêng `Daily Report` thay thế toàn bộ nội dung
cũ của ngày đó.

---

## 4. Project Control Center — màn khởi đầu

Đây là màn bạn thấy ngay sau khi đăng nhập (`/hq`).

### 4.1 Thanh chọn

1. Ô `Dự án` → chọn dự án (xem mục 2.5).
2. Ô `Kỳ · Thi công` → chọn khoảng thời gian:
   `Toàn bộ thời gian` (mặc định) · `Hôm nay` · `Tuần này` · `Tháng này` · `Tháng trước` ·
   `Khoảng tuỳ chọn`.
   - Chọn `Khoảng tuỳ chọn` sẽ hiện thêm 2 ô ngày `Từ` và `Đến`, và bộ lọc có hiệu lực
     ngay.
   - ⓘ Bộ lọc thời gian **chỉ áp dụng cho trụ cột Thi công**. Các trụ cột khác và các
     thẻ KPI tổng luôn tính trên toàn bộ dữ liệu — đó là lý do hai con số "Quá hạn" có
     thể khác nhau.
3. Nút trên đầu trang:

| Nút | Ai thấy | Tác dụng |
|---|---|---|
| `Lớp điều khiển` | Admin, CEO, PM, PMO | Mở bảng mô phỏng kịch bản điều khiển |
| `Tải Excel` | Admin, PM | Mở hộp thoại nạp nhanh 1 file |
| `In / PDF` | Tất cả | Mở báo cáo dạng HTML để in |
| `Xuất Excel` | Tất cả | Tải báo cáo dự án gồm 6 sheet |

### 4.2 Dải cổng kiểm soát (G1–G5)

Ngay dưới tiêu đề dự án là dải 5 con số `Cổng`. Mỗi cổng có 3 trạng thái:

| Màu | Nghĩa |
|---|---|
| Xanh | `OPEN` — điều kiện đã đạt, được phép làm bước sau |
| Vàng | `WAITING` — chưa đạt ngưỡng |
| Xám | `DISABLED` — ngưỡng bị tắt |

Di chuột lên một cổng sẽ hiện lý do bằng tiếng Việt. Ngưỡng mặc định:

| Cổng | Điều kiện |
|---|---|
| `G1` | ≥ 80% bản vẽ đã duyệt |
| `G2` | ≥ 80% bản vẽ đã duyệt |
| `G3` | ≥ 70% vật tư đã về |
| `G4` | ≥ 1% khối lượng hoàn thành |
| `G5` | ≥ 50% giá trị đã chi |

Thay đổi ngưỡng ở màn `Cấp hình điều khiển`.

### 4.3 Bốn thẻ số liệu

| Thẻ | Nội dung |
|---|---|
| `Dự án được gán` | Số dự án bạn có quyền truy cập |
| `Tiến độ · dự án đang xem` | % hoàn thành trung bình + `x/y hạng mục hoàn thành` |
| `Quá hạn` | Số hạng mục trễ tiến độ (toàn dự án, **không** theo bộ lọc kỳ) |
| `Nhân lực 7 ngày` | Lượt người tại công trường trong 7 ngày |

### 4.4 Bốn trụ cột

Thẻ nào cũng bấm được để mở màn chi tiết tương ứng.

**Thẻ `L3 — Thi công`** (thẻ đầu tiên)

- Vòng tròn: % hoàn thành + số hạng mục xong.
- 3 lát: `Đã xong`, `Đang thi công`, `Quá hạn`.
- 4 dòng số: `{n} xong / {t}` · `{n} đang làm` · `{n} quá hạn` · `{n} NL 7 ngày`.
- 2 ô: `Kế hoạch cuối` (theo S-curve) · `Khu vực` (số khu vực).
- Biểu đồ: S-curve kế hoạch/thực tế và thanh tiến độ theo từng khu vực.
- → `Chi tiết →` mở màn `Tiến độ`.

⚠️ Nếu thấy `Chờ G2 45/80% · G3 60/70%` nghĩa là các cổng liên quan chưa mở. Hệ thống
**hiện cảnh báo nhưng vẫn cho ghi dữ liệu** — đây là chính sách đang chờ PMO quyết.

**Thẻ `L1 — Bản vẽ shop`**
Badge `{n}% duyệt`; vòng tròn; 4 lát `Đã duyệt` / `Đang xem xét` / `Bản sửa` / `Chờ xử lý`;
2 ô `Tống bản vẽ`, `Quá hạn nộp`; S-curve riêng. → mở màn `Bản vẽ shop`.

**Thẻ `L2 — Vật tư`**
Badge `{n} trễ` hoặc `OK`; vòng tròn giữa là **số mã vật tư**; 4 dòng `{n} đã về`,
`{n} đang giao`, `{n} quá hạn giao`, `{n} chờ MSB/PO`; 2 ô `Đang xử lý`, `Ghi chú phản hồi`.
→ mở màn `Vật tư`.

**Thẻ `L4 — Thanh toán`**
Badge `{n} quá hạn` hoặc `OK`; vòng tròn % đã chi; 4 lát `Đã thanh toán` / `Đã duyệt` /
`Đã gửi` / `Quá hạn`; 2 ô `Tổng hồ sơ`, `Chờ xử lý`. → mở màn `Thanh toán`.

**Thẻ phụ `+ QA/QC`**
Badge `{n} không đạt` hoặc `Kiểm soát`; 4 ô `Đang mở`, `Đạt`, `Không đạt`, `Tổng`.
→ `Mở nghiệm thu →`

### 4.5 Bảng `Hoạt động gần đây`

4 cột: `Thời gian` · `Sự kiện` · `Chi tiết` · `Trạng thái`.
Hiện 4 dòng gần nhất. Trạng thái = tên người thao tác, hoặc `hệ thống` nếu là job nền.

ⓘ Bảng này chỉ hiện 4 dòng. Muốn xem toàn bộ, vào màn `Nhật ký kiểm tra` (nếu có quyền).

### 4.6 Nút `Tải Excel` (nạp nhanh)

1. Bấm `Tải Excel` (Admin/PM).
2. Chọn file `.xlsx` / `.xls`.
3. → `Tải lên`

⚠️ Đường này **ghi thẳng**, không có bước xem trước và không hỏi loại tài liệu. File phải
có tên nhận diện được (chứa `shop`, `TĐ`, `vật tư`…). Nếu không nhận diện được, hệ thống
**từ chối** kèm hướng dẫn — trước đây file đó bị ghi nhầm vào bảng hạng mục tiến độ.
Muốn chọn loại thủ công, hãy dùng `/upload`.

---

## 5. Tiến độ — màn `Chi tiết tiến độ`

### 5.1 Bộ lọc

1. `Dự án` → chọn.
2. `Zone` → `Tất cả` hoặc một khu vực cụ thể.
3. `Trạng thái` → `Tất cả` / `Hoàn thành` / `Đang thực hiện` / `Chờ bắt đầu`.
4. Ô `Tìm theo tên hạng mục...` → gõ. Ô này tìm cả trong tên hạng mục và **tên sheet nguồn**.

ⓘ Mỗi lần gõ là một lần tải dữ liệu mới từ máy chủ.
⚠️ Sau khi lọc, danh sách `Zone` chỉ còn những zone còn dữ liệu. Muốn xem lại tất cả zone,
bấm `Tất cả` hoặc tải lại trang.

### 5.2 Bảng hạng mục — 7 cột

`Zone` · `Cấp` · `Tên hạng mục` · `Sheet nguồn` · `Tiến độ` · `Kết thúc KH` · `Sức khỏe`

Cột `Sức khỏe` có 4 giá trị: `ON TRACK` (xanh) · `WATCH` (vàng) · `BEHIND` (cam) ·
`OVERDUE` (đỏ).

ⓘ Màn này **không sửa được** tiến độ. Việc cập nhật tiến độ làm ở ứng dụng hiện
trường (mục 9).

### 5.3 Xem chi tiết một hạng mục

1. Bấm bất kỳ dòng nào → hộp thoại chi tiết mở ra.
2. Hộp thoại hiện: `Tiến độ`, `Trạng thái`, `Bắt đầu (KH)`, `Bắt đầu (TT)`,
   `Kết thúc (KH)`, `Kết thúc (TT)`, `Số ngày KH`, `Health`.
3. Link `tải file gốc` → tải đúng file Excel đã nạp dòng này.
4. Nút `Tạo issue` → mở hộp thoại tạo sự cố gắn với hạng mục này.

**Tạo issue từ hạng mục**

1. Bấm `Tạo issue`.
2. Ô `Tiêu đề *` → điền (mặc định đã điền tên hạng mục).
3. Ô `Severity` → `Critical` / `High` / `Medium` (mặc định) / `Low`.
4. Ô `Mô tả (tự điền từ task)` → có thể sửa.
5. → `Tạo` → hệ thống chuyển sang màn chi tiết sự cố.

### 5.6 Bảng điều khiển trên cùng trang

Phía trên bảng có bảng điều khiển lịch thi công:

- `Deadline dự án (hiện tại …)` + ô ngày + nút `Đổi deadline & xin AI đề xuất`.
- `Tự động chuỗi links` → tạo liên kết phụ thuộc giữa các hạng mục.
- Bảng liên kết: chọn hạng mục trước / loại `FS|SS|FF` / hạng mục sau / độ trễ → `+ Link`.
  Bấm `×` để xoá một liên kết.
- Nếu gói có tính năng nén tiến độ: `Mục tiêu xong trước` + `Xem trước`, và
  `Nghỉ thi công (từ → đến)` + `+ Thêm`, kèm bảng kịch bản với nút `Rollback` / `Sửa` /
  `Xóa`.

⚠️ Nút `Đổi deadline` chỉ dành cho Admin/CEO/PMO. Nếu bạn là vai trò khác và thấy nút,
bấm sẽ nhận thông báo không đủ quyền.

---

## 6. Bản vẽ shop — màn `Bản vẽ shop`

### 6.1 Bộ lọc

1. Ô `Project` → chọn dự án.
2. Ô `Zone` → `All` hoặc một zone.
3. Ô `Search code / name...` → gõ. Tìm được theo mã, tên, zone và cả tên trạng thái.

### 6.2 Bảng — 10 cột

`Zone` · `Code` · `Name` · `State` · `Planned` · `Actual` · `Approval` · `L1` · `L2` · `As-built`

Cột `State` có 5 giá trị: `PENDING` · `REVIEW` · `REVISION` · `APPROVED` · `REJECTED`.
Cột `L1` / `L2` hiện `P` (đạt), `F` (không đạt), `C` (có điều kiện), hoặc `—`.

ⓘ Bảng này **chỉ đọc**, không sửa được tên hay ngày. Việc sửa bản vẽ làm ở màn `Phê duyệt`.
ⓘ Chỉ hiện 200 bản vẽ mới nhất.
ⓘ Bảng **không** có phân trang; con số trên các thẻ thống kê phía trên **đổi theo bộ lọc**
đang gõ.

### 6.3 Ghi nhận as-built

Chỉ làm được với bản vẽ đã `APPROVED` và chưa ghi nhận as-built.

1. Tìm dòng cần xử lý → bấm nút `Ghi nhận` ở cột `As-built`.
2. Ô `Danh số thay đổi, ngày cập nhật...` → gõ ghi chú (không bắt buộc).
3. → `Ghi nhận as-built`

Kết quả: `Đã ghi nhận as-built {mã}`.

⚠️ Mỗi bản vẽ chỉ ghi nhận as-built **một lần**. Bấm lần hai sẽ nhận
`As-built đã được cập nhật bởi phiên khác`.

---

## 7. Vật tư — màn `Vật tư`

### 7.1 Bộ lọc

1. `Dự án` → chọn.
2. `Trạng thái` → `Tất cả` hoặc một trong: `Đã đề nghị` · `Đang chuẩn bị MSB` ·
   `MSB đã duyệt` · `Đã phát hành PO` · `Đang sản xuất` · `Đang vận chuyển` ·
   `Đã về` · `Đã nghiệm thu`.
3. Ô `Tìm mã hoặc tên vật tư...` → gõ. Tìm theo mã, tên VI, tên EN, zone, trạng thái.

### 7.2 Vòng đời vật tư — bấm nút theo thứ tự

Mỗi dòng có một nút ở cột `Thao tác` để chuyển sang bước kế tiếp. Nhãn nút thay đổi
theo trạng thái hiện tại:

| Trạng thái hiện tại | Bấm nút | Kết quả |
|---|---|---|
| `Đã đề nghị` | `Chuẩn bị MSB` | `Đang chuẩn bị MSB` |
| `Đang chuẩn bị MSB` | `Gửi duyệt` | `MSB đã duyệt` |
| `MSB đã duyệt` | `Phát hành PO` | `Đã phát hành PO` |
| `Đã phát hành PO` | `Bắt đầu vận chuyển` | `Đang vận chuyển` |
| `Đang vận chuyển` | `Ghi nhận đã về` | `Đã về` |
| `Đã về` | `Nghiệm thu đạt` | `Đã nghiệm thu` (kết thúc) |

ⓘ Bước `Nghiệm thu đạt` chỉ dành cho vai trò Admin và Site.
ⓘ Trạng thái `Đang sản xuất` và `Từ chối` chỉ xuất hiện khi nạp từ file; nút trên
màn này không tạo ra hai trạng thái này.

### 7.3 Thêm vật tư thủ công

1. → `Thêm vật tư`.
2. Ô `Mã vật tư *` → bắt buộc. Ví dụ `MEP-PLB-001`. Trống → `Mã vật tư bắt buộc`.
3. Ô `Mã zone` → nhập **mã số của zone** (ví dụ `3`). Để trống nếu chưa gắn zone.
   - ⚠️ Đây là mã nội bộ của zone, không phải mã zone kiểu `BOH`. Nhập sai sẽ nhận
     `Zone not found`.
4. Ô `Tên tiếng Việt` → không bắt buộc.
5. Ô `Tên tiếng Anh` → không bắt buộc.
6. Ô `Tiến độ (0-100%)` → gõ số, chấp nhận cả `50` và `50,5`.
7. → `Lưu`

### 7.4 Bảng — 7 cột

`Mã` · `Tên (VI)` · `Tên (EN)` · `Zone` · `Tiến độ nhập` · `Vòng đời` · `Thao tác`

ⓘ Bộ lọc và tìm kiếm **không** làm đổi các thẻ số liệu phía trên (chúng tính trên toàn
bộ dữ liệu, không theo bộ lọc).
ⓘ Bảng này **không sửa inline được** — muốn đổi % nhập phải nạp lại file.
ⓘ Chỉ hiện 500 vật tư đầu tiên.

---

## 8. Nhân lực & Thiết bị

Trang này có 5 tab.

### 8.1 Tab `Workers` — thực tế tại công trường

Bảng: `Role` · `Today (TT)` · `Kế hoạch tuần` · `% KH` · `Lũy kế TT` · `Status`

Cột `Status`: `ĐỦ` (≥ 90% kế hoạch) · `THIẾU` (≥ 50%) · `THẤP` (< 50%).

ⓘ Cột `Today (TT)` là tổng người của **kỳ báo cáo mới nhất trong 30 ngày**, không
phải riêng hôm nay. Nếu công trường 2 tuần không báo cáo, số này vẫn là của kỳ cũ.
ⓘ `Kế hoạch tuần` lấy theo tuần bạn chọn ở tab `Kế hoạch & Loading`, còn thẻ `% Huy
động` phía trên lại tính theo tuần hiện tại — hai con số có thể lệch nhau khi bạn đổi tuần.

### 8.2 Tab `Kế hoạch & Loading` — nhập kế hoạch tuần (PMO)

1. Ô `Tuần (thứ Hai)` → chọn ngày bất kỳ trong tuần cần nhập; hệ thống tự quy về thứ Hai.
2. Ô `Loại` → `Nhân lực` hoặc `Thiết bị`.
3. Ô `Role/Chuyên môn` (hoặc `Thiết bị` nếu Loại = Thiết bị) → gõ tên, ví dụ `Thợ điện`.
4. Ô `Số lượng` → gõ số nguyên từ 0 đến 100000.
5. → `Lưu kế hoạch`

Kết quả: `Đã lưu KH {role}: {n} người (tuần {ngày})` hoặc
`Đã lưu TB {role}: {n} máy (tuần {ngày})`.

ⓘ Muốn sửa hoặc bỏ một dòng kế hoạch: nhập lại **đúng tên role** và **đúng tuần** với
số lượng mới (ghi đè). Muốn bỏ hẳn thì nhập số lượng `0`. Hệ thống không có nút xoá.

Các bảng còn lại trong tab:
- Bảng đường cong huy động: `Tuần` · `Kế hoạch` · `Thực tế` · `% Huy động` (8 tuần gần nhất).
- Bảng thiết bị của tuần đang chọn: `Thiết bị (tuần MM-DD)` · `Số lượng`.
- Bảng huy động thiết bị: `Tuần` · `Máy KH` · `Máy TT` · `Huy động`.

### 8.3 Tab `Năng suất hạng mục`

1. Ô `Hạng mục` → chọn hạng mục.
2. Ô `Role/chuyên môn` → gõ (mặc định `Thợ điện`).
3. Ô `Từ` / `Đến` → chọn khoảng thời gian (mặc định hôm nay). `Đến` phải sau `Từ`.
4. Ô `KH` → khối lượng kế hoạch. Ô `TT` → khối lượng thực tế.
5. Ô `Headcount KH` / `Headcount TT` → số người kế hoạch và thực tế.
6. → `Lưu năng suất`

Bảng: `Hạng mục` · `Kỳ` · `Role` · `KH` · `TT` · `Lệch` · `Headcount KH` · `Headcount TT`

ⓘ Nhập lại **cùng hạng mục + cùng kỳ + cùng role** sẽ **ghi đè** dòng cũ, không tạo
dòng mới.
ⓘ Ô `Hạng mục` **không lọc** bảng bên dưới — bảng luôn hiện tất cả dòng của dự án.

### 8.4 Tab `Subcontractors` và `Suppliers`

Chỉ xem danh sách thầu phụ / nhà cung cấp (không thêm sửa ở màn này).
ⓘ Đây là danh sách **toàn tenant**, không lọc theo dự án.

---

## 9. QA/QC — nghiệm thu công việc

### 9.1 Tạo hạng mục nghiệm thu

1. Chọn dự án.
2. Ô `Mã` → bắt buộc, ví dụ `QA-01`. Trùng mã trong dự án sẽ nhận
   `Mã nghiệm thu đã tồn tại trong dự án`.
3. Ô `Hạng mục` → bắt buộc.
4. Ô `Người nghiệm thu` → không bắt buộc.
5. Ô `-- Zone --` → chọn khu vực (không bắt buộc).
6. Ô ngày (mặc định hôm nay) → ngày nghiệm thu.
7. Ô `Ghi chú` → không bắt buộc.
8. → `Thêm`

### 9.2 Ghi kết quả

| Trạng thái hiện tại | Nút bấm | Kết quả |
|---|---|---|
| `Đang mở` | `Đạt` | `Đạt` |
| `Đang mở` | `Không đạt` | `Không đạt` |
| `Không đạt` | `Đạt` hoặc `Mở lại` | `Đạt` hoặc `Đang mở` |
| `Đạt` | `Mở lại` | `Đang mở` |

Bảng: `Mã` · `Hạng mục` · `Zone` · `Người kiểm tra` · `Ngày` · `Trạng thái` · `Thao tác`

ⓘ Không có nút sửa hay xoá hạng mục nghiệm thu. Mã sai thì không xoá được.
ⓘ Chỉ hiện 100 hạng mục mới nhất.

---

## 10. Thanh toán

### 10.1 Luồng đầy đủ

```
Hợp đồng  →  Hóa đơn  →  Yêu cầu chi  →  Thanh toán
```

Bảng hiển thị 3 bảng con gộp theo từng hợp đồng, 10 cột: `Hóa đơn` · `Ngày` ·
`Giá trị (VND)` · `VAT` · `Payment request` · `Giá trị` · `Retention` ·
`Hạn thanh toán` · `Trạng thái` · `Thao tác`.

### 10.2 Tạo yêu cầu chi

1. → `Thêm payment request`.
2. Ô `Contract *` → chọn hợp đồng.
3. Ô `Invoice *` → chọn hóa đơn (tự động bật sau khi chọn hợp đồng).
4. Ô `Request No *` → gõ, ví dụ `REQ-2026-001`. Trùng trong cùng hóa đơn sẽ bị từ chối.
5. Ô `Amount (VND) *` → số tiền yêu cầu, phải lớn 0.
6. Ô `Retention` → phần giữ lại (mặc định 0).
7. Ô `Due date` → hạn thanh toán (không bắt buộc).
8. → `Tạo`

Kết quả: `Đã tạo payment request: {mã}`.

ⓘ Tổng `Amount` + `Retention` của các yêu cầu đang mở **không được vượt** giá trị
hóa đơn. Vượt sẽ nhận `amount + retention_amount cannot exceed invoice amount`.

### 10.3 Duyệt / từ chối yêu cầu chi

1. Tìm dòng có trạng thái `Chờ xử lý` hoặc `Đã gửi`.
2. → `Duyệt` hoặc `Từ chối` → hộp thoại xác nhận hiện số tiền → xác nhận.
3. Kết quả: `{mã}: đã duyệt` hoặc `{mã}: đã từ chối`.

ⓘ Vai trò được duyệt: Admin, Kế toán, PM, PMO. CEO **không** duyệt ở màn này.

### 10.4 Chi tiền

1. Tìm dòng trạng thái `Đã duyệt` → bấm `Chi tiền`.
2. Hộp thoại mở ra, hiện tổng phải trả, đã trả cùng hóa đơn, retention còn giữ.
3. Ô `Số tiền thanh toán` → **đã điền sẵn và không sửa được**; phải đúng bằng giá trị yêu
   cầu.
4. Ô `Ngày chi` → chọn ngày (mặc định hôm nay).
5. Ô `Retention giữ` → phải **đúng bằng** retention của yêu cầu.
6. Ô `VAT đã chi` → không bắt buộc.
7. Ô `Phương thức` → `Chuyển khoản` / `Tiền mặt` / `Thẻ`.
8. Ô `Ghi chú` → không bắt buộc.
9. → `Xem lại và chi` → hộp thoại xác nhận lần hai → xác nhận.

Kết quả: `Đã ghi payment #{id}` và dòng mới xuất hiện ở bảng `Payment ledger đã ghi`.

ⓘ Chỉ Admin và Kế toán chi được.
ⓘ Nếu mạng rớt giữa chừng, bấm lại `Xem lại và chi` sẽ **không** chi trùng — hệ thống
dùng khoá idempotency và trả về đúng bản ghi cũ.
ⓘ Yêu cầu đã `Đã thanh toán` là hẻm, không quay lại được.

### 10.5 Nhận lại retention

Chỉ sau khi yêu cầu đã `Đã thanh toán` và còn retention giữ:

1. Bấm `Release` ở dòng tương ứng.
2. Hộp thoại xác nhận nêu rõ số tiền sẽ được ghi thêm → xác nhận.
3. Kết quả: `Đã release retention`.

### 10.6 Bộ lọc

- Ô `Tìm request` → tìm theo hợp đồng, hóa đơn, mã yêu cầu, trạng thái.
- Ô `Trạng thái` → `Tất cả` / `Chờ xử lý` / `Đã gửi` / `Đã duyệt` / `Từ chối` /
  `Đã thanh toán`.

### 10.7 Khoản phải thu (AR)

Hai bảng: `Dự án` · `Khách hàng` · `Giá trị HĐ` · `Đã TU/TT` · `Còn lại HĐ` ·
`HĐ đã xuất` · `Đủ ĐK TT ngay`, và bảng chi tiết `Loại` · `Hạng mục` · `Số HĐ/chứng từ` ·
`Ngày` · `Giá trị (VND)` · `Ghi chú`.
Ô `Chi tiết sheet` chọn sheet muốn xem.

ⓘ Ô `Chi tiết sheet` ghi "hiện 100" — bảng chi tiết chỉ hiện 100 dòng đầu.

### 10.8 Kết nối ERP (gói Enterprise)

| Nút | Tác dụng |
|---|---|
| `Xuất AP ledger (CSV)` | Tải sổ cái chi trả NCC |
| `Nhập NCC (CSV)` | Nạp danh sách nhà cung cấp từ file |
| `Đẩy SFTP` | Đẩy file lên máy chủ NCC (chọn profile trước) |
| `Xác nhận MST` | Gắn mã số thuế cho NCC khớp trong hệ thống |


---

## 11. Sự cố

### 11.1 Danh sách

Bộ lọc: `Project` · `Severity` (`All`/`Critical`/`High`/`Medium`/`Low`) · `Status`
(`All`/`Open`/`Ack`/`In Progress`/`Resolved`/`Closed`) · `Category`
(`All`/`Progress`/`Quality`/`Material`/`Payment`/`Design`/`Safety`) · ô `Search...`.

Bảng 7 cột: `ID` · `Severity` · `Title` · `Category` · `Source` · `Status` · `Created`.

ⓘ Bấm vào một dòng để mở màn chi tiết sự cố.
ⓘ ⓘ **Chỉ hiện 200 sự cố mới nhất** và **không có phân trang**.

### 11.2 Tạo sự cố

1. → `Tạo issue`.
2. Ô `Tiêu đề *` → bắt buộc. Trống → `Tiêu đề bắt buộc`.
3. Ô `Severity` → chọn mức độ.
4. Ô `Category` → chọn nhóm.
5. Ô `Mô tả` → mô tả chi tiết (không bắt buộc).
6. → `Tạo` → `Đã tạo issue #{id}`.

⚠️ Vai trò tạo được: Admin, PM (dự án mình quản lý), Site, Kỹ thuật (dự án được gán).
PMO / CEO / Mua sắm / Kế toán sẽ nhận thông báo không đủ quyền.

### 11.3 Chi tiết sự cố

1. Bấm `← Quay lại` để quay lại danh sách.
2. Hàng thông tin: mức độ, trạng thái, nguồn, dự án, hạn.
3. Khối `Chỉ thị từ CEO / PMO`: xem các chỉ thị đã ban cho sự cố này.

**Gửi chỉ thị (CEO / PMO / Admin)**

1. Gõ nội dung vào ô textarea (ví dụ: Ưu tiên nhà cung cấp HVAC X, họp lại thứ 6 tuần
   sau với vendor để chốt timeline).
2. Tích các đối tượng ở dòng `Gửi tới:` — mặc định đã tích PM và PMO.
3. → `Gửi chỉ thị` → `Đã gửi chỉ thị và ghi audit`.

ⓘ Khung `Nhật ký kiểm tra` ở dưới hiện 50 dòng gần nhất của sự cố.

ⓘ Sự cố **không có** bước chuyển trạng thái trên giao diện — mọi sự cố tạo ra đều ở
trạng thái `Open`. Việc xử lý được ghi nhận bằng chỉ thị, không đổi trạng thái.

---

## 12. Cần xử lý — việc quá hạn

Màn này **chỉ đọc và điều hướng**, không có nút thay đổi trạng thái.

1. Ô `Dự án` → chọn.
2. → `Làm mới` để quét lại.

Bốn nhóm việc, mỗi nhóm là một thẻ với số đếm:

| Nhóm | Điều kiện quá hạn |
|---|---|
| Tiến độ quá hạn | `Ngày kết thúc KH` < hôm nay và chưa hoàn thành |
| Shop chờ duyệt quá 3 ngày | Chưa có ngày duyệt và đã quá 3 ngày từ ngày nộp |
| Vật tư quá SLA | Quá hạn SLA hoặc quá 7 ngày kể từ ngày nộp, chưa duyệt/từ chối |
| Thanh toán quá hạn | `Hạn thanh toán` < hôm nay và chưa thanh toán/từ chối |

- Mỗi dòng có nhãn mức độ `Cao` / `Trung bình` / `Thấp` và số ngày trễ.
- **Bấm bất kỳ dòng nào** để mở thẳng màn hình có hạng mục đó.
- Nút `Xem tất cả {n}` xuất hiện khi nhóm có nhiều hơn 5 mục (mặc định chỉ hiện 5).

ⓘ Nhóm "Tiến độ" hiển thị **ngày kết thúc** ở cột mã, không phải mã hạng mục.

---

## 13. Phê duyệt

Trung tâm gom 3 hàng đợi chờ duyệt. Chọn dự án ở góc trên bên phải rồi → `Refresh`.

Thống kê: `Pending` · `Shop review` · `Material submittal` · `Payment request`.

### 13.1 Duyệt bản vẽ shop

Dòng hiện: `Shop` + mã bản vẽ, trạng thái, `Submitted: {người} · Revision: {n}`.

| Nút | Khi nào dùng |
|---|---|
| `Approve` | Duyệt cấp hiện tại (L1 → L5 tuỳ chuỗi duyệt của bộ phận) |
| `Reject` | Từ chối, bắt buộc nhập lý do |
| `View Details` | Xem toàn bộ dữ liệu bản vẽ (dạng JSON thô) |

**Quy trình duyệt:** bấm `Approve` → hộp thoại xác nhận → xác nhận. Hệ thống báo
`Shop drawing #{id} đã qua L{n}`. Nếu là cấp cuối, báo `đã APPROVED`.

**Quy trình từ chối:** bấm `Reject` → ô `Lý do reject (bắt buộc) sẽ được lưu vào audit
log:` → gõ lý do → `Xác nhận Reject`.

⚠️ Trên giao diện chỉ có `Approve` (tức là trả lời **P — đạt**). Muốn trả lời **F —
không đạt** ở một cấp, phải dùng `Reject` cho toàn bản vẽ.
⚠️ Nếu chuỗi duyệt nhiều cấp, phải mở `Approve` **từng cấp một**, không duyệt thẳng.

### 13.2 Duyệt hồ sơ vật tư (Material Submittal)

Dòng hiện: `Submittal` + mã, `Revision: {n} · SLA: {ngày}`, cảnh báo `⚠️ OVERDUE` nếu quá hạn,
và trạng thái mẫu vật lý.

1. (Bắt buộc) Ghi nhận mẫu vật lý trước:
   - `Mẫu đạt` → `Đã ghi nhận mẫu vật lý đạt`
   - `Mẫu không đạt` → `Đã ghi nhận mẫu vật lý không đạt tại hiện trường`
2. → `Approve` → xác nhận.

⚠️ Nút `Approve` **không bấm được** cho tới khi mẫu vật lý ở trạng thái `ACCEPTED`.
Thông báo lỗi: `Mẫu vật lý phải được ghi nhận ACCEPTED trước khi duyệt MSB`.

ⓘ **Sửa lại hồ sơ thì sửa trên bản mới nhất.** Mỗi bản sửa tạo một dòng mới với số
thứ tự `parent + 1`, nên lịch sử là một **chuỗi**: `bản 0 → bản 1 → bản 2`. Nếu bấm
tạo bản sửa trên một bản đã có bản sửa, hệ thống từ chối với
`Hồ sơ này đã có bản sửa — hãy sửa trên bản mới nhất` và **không** tạo thêm dòng.
Trước đây hai người bấm cùng lúc sẽ tạo ra hai dòng cùng số thứ tự, gây lệch số
hiển thị với nhau.

### 13.3 Duyệt yêu cầu chi

Dòng hiện: `Payment` + mã, `Amount: {số} · Due: {ngày}`.
→ `Approve` / `Reject` (nhập lý do) như mục 10.3.

ⓘ Chỉ hiện 20 hồ sơ mỗi loại, không có phân trang.

---

## 14. Trợ lý AI

> **Nguyên tắc bất di bất dịch: AI chỉ ĐỀ XUẤT.** Không có bước nào AI tự ghi vào hồ sơ
> dữ liệu, tự gửi thông báo, hay tự đổi kế hoạch. Người dùng luôn phải bấm xác nhận.
> Nếu nhà cung cấp AI lỗi hoặc hết hạn mức, kết quả hiển thị là **lỗi / không đủ dữ
> liệu**, tuyệt đối không phải "đạt".

Trang có 3 tab: `Hỏi đáp` · `Đề xuất` · `Cập nhật tiến độ`.

Mỗi tab có một dải `Gợi ý sử dụng` (hoặc `Cách viết để AI đọc đúng`) nằm ngay dưới
thanh tab. Dải này **mặc định đóng** để không chen vào nội dung — bấm vào để mở. Ở
tab `Hỏi đáp` và `Cập nhật tiến độ` có các **nút câu mẫu**; bấm một nút là câu đó được
điền thẳng vào ô nhập, không cần gõ tay.

### 14.1 Tab `Hỏi đáp` — chỉ đọc, không ghi gì

1. Chọn dự án (hoặc `Tất cả dự án`).
2. Gõ câu hỏi, ví dụ: `submittal nào đang quá hạn TVGS?`
3. → `Hỏi`

Trong dải `Gợi ý sử dụng` có sẵn 6 câu mẫu bấm được, mỗi câu bám một nhóm dữ liệu
thật trong hệ thống: `Submittal nào quá hạn?` · `Bản vẽ chờ duyệt` · `Hạng mục trễ
tiến độ` · `Vật tư chậm giao` · `Cần Ban điều hành quyết` · `Dòng tiền tháng này`.

Ba điều cần biết trước khi hỏi:

- AI chỉ đọc dữ liệu của **đúng những dự án bạn được phép xem**. Muốn hỏi rộng hơn,
  chọn `Tất cả dự án` ở ô dự án.
- Hỏi theo từ khoá có trong hệ thống (TVGS, quá hạn, MSB, PO) cho câu trả lời sắp
  hơn câu hỏi chung chung.
- Tab này **không ghi gì** vào hệ thống. Muốn cập nhật tiến độ, sang tab `Cập nhật
  tiến độ`.

Câu trả lời có **badge trích dẫn** bên dưới, ví dụ `shop_drawing:12`. Bấm badge để mở
thẳng màn hình nguồn để tự kiểm chứng.

Phía dưới câu trả lời hiện dòng kỹ thuật: `{provider}/{model} · {tình trạng} · {số ms}`.

ⓘ Nếu hệ thống không tìm được dữ liệu có thể kiểm chứng, nó **không** đoán mà trả lời
`Không đủ dữ liệu trong phạm vi bạn được phép xem để trả lời câu hỏi này.`
ⓘ Nếu mô hình không dẫn nguồn, hệ thống **không** dùng câu trả lời đó, mà dán nguyên văn
đoạn dữ liệu đã truy xuất kèm cảnh báo.

### 14.2 Tab `Cập nhật tiến độ` — đề xuất tiến độ

**Bước 1 — nhờ AI đề xuất**

1. Chọn `Project` (bắt buộc).
2. Gõ mô tả, ví dụ: `Cập nhật hạng mục ROW-3863-3863 lên 65%, đang vướng MSB, PM cần xử lý
   trước.`
3. → `Tạo đề xuất AI` → `AI đã tạo đề xuất cập nhật`

**Xem trước trước khi bấm** — ngay dưới ô nhập, hệ thống hiện bảng
`Hệ thống sẽ đọc được` với 3 dòng, cập nhật theo từng chữ bạn gõ:

| Dòng | Khi nào đủ | Ghi thế nào |
|---|---|---|
| `Số phần trăm` | bắt buộc | `65%` hoặc `45,5%` (dấu phẩy thập phân) |
| `Mã hạng mục` | bắt buộc | `hạng mục ROW-3863` hoặc `mã: BOH-102` |
| `Ngày báo cáo` | tuỳ chọn | `2026-09-30` |

Dòng nào thiếu thì hiện màu cảnh báo. Chưa chọn dự án thì thay bằng `Chọn dự án
trước.`; đã chọn dự án mà vẫn thiếu thì hiện `Thiếu thông tin bắt buộc — đề xuất sẽ
báo "Còn thiếu" thay vì ghi.` Đủ cả ba thì thay bằng `Đủ thông tin — có thể tạo đề
xuất.`

ⓘ Mã hạng mục ghi **sau từ khoá** (`hạng mục …`, `mã: …`, `wbs …`) là dạng chắc chắn.
Ghi mã trần (`BOH-102 lên 45%`) hệ thống phải đoán, và thẻ xem trước sẽ ghi rõ
`(đoán — nên ghi rõ hơn)`. Nếu nhiều mã cùng khớp, đề xuất báo thiếu `work_item_id`.

Trong dải `Cách viết để AI đọc đúng` có 3 mẫu bấm được: `Đủ thông tin` ·
`Có ngày báo cáo` · `Dùng dấu phẩy thập phân`.

**Bước 2 — xem trước**

Thẻ ngay dưới form hiện: `Hiện tại: {x}% · Đề xuất: {y}%`.

Nếu AI thiếu dữ liệu, thẻ hiện `Còn thiếu: {trường}` và **không có nút áp dụng**.

**Bước 3 — CEO/Admin áp dụng**

1. → `Áp dụng tiến độ`
2. Hộp thoại xác nhận: `Thao tác này ghi tiến độ thật vào work item/schedule, có audit và
   có thể rollback.` → `Áp dụng`
3. → `Đã áp dụng tiến độ và ghi audit`

**Bước 4 — hoàn tác nếu cần**

Nút `Rollback` → xác nhận → `Đã rollback tiến độ`.

ⓘ Người không phải CEO/Admin sẽ thấy dòng `CEO/Admin sẽ xem preview và áp dụng.`
ⓘ Nếu dữ liệu gốc đã đổi sau lúc xem trước, hệ thống từ chối với
`Dữ liệu đã thay đổi sau preview; hãy tạo proposal mới` và không ghi gì.

ⓘ **Rollback bị từ chối khi lịch đã đổi.** Nếu sau khi áp dụng còn người khác (hoặc
kịch bản khác) đã kéo lịch, `Rollback` trả
`Lịch đã thay đổi sau khi kịch bản này được áp dụng; rollback sẽ ghi đè dữ liệu mới hơn`
và **không** đụng vào lịch. Hệ thống cố ý không cho hoàn tác đè lên thay đổi mới hơn
— nếu cứ cho, một thao tác hoàn tác sẽ âm thầm xoá công sức của người khác mà không
có dấu vết. Cách xử lý: hoàn tác hoặc áp dụng xong kịch bản mới nhất rồi hãy rollback
kịch bản cũ.

ⓘ **Áp dụng hai lần cùng một kịch bản.** Nếu hai người bấm `Áp dụng` gần như cùng
lúc thì đúng một người thắng, người còn lại nhận
`đã áp dụng — hãy rollback trước rồi chạy lại`. Trạng thái không bị ghi đè hai lần.

### 14.3 Tab `Đề xuất` — hộp thư AI

Ba nút lọc: `pending` · `approved` · `dismissed`.

| Nút | Tác dụng |
|---|---|
| `Duyệt & gửi` | Duyệt đề xuất và gửi thông báo tới người liên quan |
| `Bỏ qua` | Chuyển sang trạng thái bỏ qua |

⚠️ **Không** phải đề xuất nào cũng dẫn tới việc ghi dữ liệu. Riêng đề xuất lịch
(`schedule_replan`), việc bấm `Duyệt & gửi` **không** đổi ngày kế hoạch. Muốn thay đổi
thật, phải vào màn `Chi tiết tiến độ` → bảng điều khiển → `Áp dụng làm baseline`
(CEO/Admin).

⚠️ Riêng đề xuất tiến độ: **đừng** bấm `Duyệt & gửi` ở tab này. Đó là thao tác của tab
`Cập nhật tiến độ`; bấm nhầm ở đây sẽ vô hiệu hoá đề xuất.

Dải `Đề xuất này là gì, nên bấm gì?` ngay dưới thanh lọc trạng thái tóm tắt đúng
những điều trên, kèm nguồn sinh đề xuất: `Theo dõi SLA AI` chạy mỗi giờ cho
submittal quá hạn, và khi đổi deadline dự án.

---

## 15. Thư viện BIM (gói Enterprise)

1. Chọn dự án ở ô `Chọn dự án...`.
2. Ô file → chọn file `.ifc` (tối đa 200 MB).
3. Ô `Zone (vd: BOH, để trống = đoán từ tên file)` → không bắt buộc.
4. → `Tải lên`

Bảng 8 cột: `File` · `Zone` · `Dung lượng` · `Tầng` · `Spaces` · `Schema` · `Tải về` ·
`Viewer 3D`.

**Gắn khu vực cho model**

1. Bấm `Gợi ý` ở cột `Zone` → hệ thống đoán và hiện các nút gợi ý.
2. Bấm nút đúng mã zone → `Đã gán zone`.

ⓘ Hệ thống **không tự gán** zone — luôn phải bấm `Gợi ý` rồi chọn.
ⓘ Hạn mức mỗi dự án là 2 GB; vượt sẽ nhận `Project BIM quota exceeded (2GB)`.

**Xem 3D**

1. Bấm `Mở 3D` → mở viewer.
2. Trong viewer: 9 chip ẩn/hiện theo nhóm `Tường`, `Sàn`, `Cột`, `Dầm`, `Mái`, `Thang`,
   `Cửa sổ`, `Cửa`, `Khác`. Kéo để xoay, cuộn để zoom.
3. Nếu model lỗi hoặc không có hình học → bấm `Tải file .ifc gốc`.
ⓘ Model quá 50 MB không dựng được trong trình duyệt.

---

## 16. OTD — tỉ lệ đúng hạn

Chưa có trong menu; truy cập bằng đường dẫn `/hq/otd`.

1. Ô `Dự án` → chọn.
2. Ô `Grace days (cho phép trễ tối đa)` → gõ số (0–30), mặc định 0. Mỗi lần gõ là một
   lần tải lại.

Kết quả: ô tổng kết `{pct}%`, `{x} / {y} đúng hạn`, khoảng `From {ngày} → {ngày}`, và
`{n} trễ hạn` nếu có.

Hai bảng: theo `Zone` (`Zone` · `Total` · `On-time` · `OTD %`) và xu hướng 6 tháng
(`Tháng` · `Total` · `On-time` · `OTD %`).

ⓘ Mặc định OTD chỉ tính các hạng mục có `Ngày kết thúc KH` **trong tháng hiện tại**, còn
bảng xu hướng thì tính 6 tháng — hai con số khác phạm vi.
ⓘ Hạng mục **chưa hoàn thành** nhưng còn trong hạn vẫn được tính là "đúng hạn".


---

## 17. Ứng dụng hiện trường (điện thoại)

Đăng nhập bằng `site@hbg.com` sẽ vào thẳng khu vực này. Menu gồm 5 tác vụ.

### 17.1 Màn công trường (`/field`)

1. Thẻ `Dự án đang làm` → hệ thống tự chọn dự án đầu tiên. Muốn đổi: bấm ô chọn,
   gõ mã/tên, bấm dòng.
2. Thẻ `Tác vụ hôm nay` → 5 nút:

| Nút | Dẫn tới | Dùng để |
|---|---|---|
| `Báo cáo ngày` | `/field/daily-report` | Tạo báo cáo ngày, thêm tổ đội, đính kèm ảnh |
| `Chụp ảnh / sự cố` | `/field/issue` | Chụp ảnh hiện trường, xem sự cố |
| `Cập nhật tiến độ` | `/field/daily-progress` | Cập nhật % tiến độ hạng mục |
| `Vật tư sử dụng` | `/field/material` | Ghi nhận vật tư tại hiện trường |
| `Nhân lực & thiết bị` | `/field/manpower` | Ghi nhận công nhân / máy của ca |

3. Thẻ `Báo cáo gần đây (n)` → bấm một dòng để xem lại báo cáo đó.
4. Nút `Offline / Sync Queue` → màn hàng đợi offline.

### 17.2 Thanh trạng thái đồng bộ (hiện ở mọi màn hiện trường)

| Dòng | Nghĩa |
|---|---|
| `Offline — sẽ sync khi có mạng` | Mất mạng |
| `Đã lưu local — chờ sync` | Có việc đang chờ gửi |
| `Đã đồng bộ tất cả` | Không còn việc chờ |
| `Queue: N` | Số việc đang chờ |

ⓘ **Chỉ tiến độ hạng mục** mới được lưu khi offline. Vật tư, nhân lực, ảnh và báo cáo
ngày đều cần mạng ngay lập tức — nếu mất mạng giữa chừng, dữ liệu nhập sẽ mất.

### 17.3 Cập nhật tiến độ (màn duy nhất hỗ trợ offline)

1. Ô `Dự án` → chọn.
2. Ô `Zone` → chọn khu vực. (Chưa chọn zone thì không hiện phần bên dưới.)
3. Ô `Hạng mục` → chọn. Ô này tự điền giá trị % và ghi chú của hạng mục đã chọn.
4. Ô `Tiến độ (%)` → gõ số **từ 0 đến 100**.
5. Ô `Ghi chú` → gõ vướng mắc (không bắt buộc).
6. → `Lưu tiến độ`

| Tình huống | Kết quả |
|---|---|
| Có mạng | `Đã lưu tiến độ: {n}%` → tự về màn công trường |
| Mất mạng | `Đã lưu offline {n}% — sẽ gửi khi có mạng (xem /field/sync)` |

ⓘ Ô `Ghi chú` **không** được gửi khi offline. Mất mạng thì chỉ giữ lại phần trăm.
ⓘ Danh sách hạng mục chỉ hiện 100 hạng mục đầu của zone; zone rộng hơn cần bấm lại từ đầu.

### 17.4 Báo cáo ngày

1. Chọn `Dự án` → hệ thống tự tạo (hoặc mở) báo cáo hôm nay.
2. Màn hiện `Report #{id} — {ngày}`.
3. → `+ Thêm nhân sự` → hệ thống hỏi lần lượt ba câu:
   - `Mã vai trò (VD: tho, mason, electrician)` — bắt buộc
   - `Tên vai trò tiếng Việt (VD: Thợ hồ)` — bỏ trống được
   - `Số người?` — mặc định `1`
4. Chọn ảnh ở ô `Đính kèm ảnh` → `Đã tải {n} ảnh`.
5. Bấm một ảnh để xem kích thước lớn.

ⓘ Phần `Ngày` / `Thời tiết (sáng/chiều)` / `Ghi chú` chỉ hiện khi hệ thống **không** tự
tạo được báo cáo hôm nay — thường là đường đi bình thườn bạn sẽ không thấy.

### 17.5 Chụp ảnh / sự cố

1. Chọn dự án.
2. → `Chụp / chọn ảnh` → chọn ảnh (mở camera hoặc thư viện ảnh).
3. → `Đã upload {n} ảnh vào báo cáo hôm nay`.

Danh sách sự cố của dự án hiện bên dưới (tối đa 3 dòng).

ⓘ Tối đa **20 ảnh**, mỗi ảnh tối đa **10 MB**.
⚠️ Màn này **không có chức năng tạo sự cố** — tên màn là `Chụp ảnh / sự cố` nhưng thực
tế chỉ gửi ảnh và xem danh sách. Muốn tạo sự cố, vào màn `Sự cố` trên trang web.

### 17.6 Vật tư sử dụng

1. Chọn `Dự án`.
2. Ô `Mã vật tư *` → bắt buộc, ví dụ `XI-MANG-PCB40`.
3. Ô `Tên vật tư` → không bắt buộc.
4. Ô `Số lượng / ghi chú dùng` → không bắt buộc.
5. → `Ghi nhận vật tư`

ⓘ Ô `Số lượng / ghi chú dùng` được lưu ở dạng **ghi chú chữ**, **không phải** trường
số lượng có thể cộng dồn. Nếu cần số lượng chuẩn để đối soát, nhập từ file vật tư ở
trang web.
⚠️ Bấm hai lần cùng một mã sẽ tạo **hai dòng**. Kiểm tra danh sách trước khi bấm lại.

### 17.7 Nhân lực & thiết bị

1. Chọn `Dự án` → hệ thống tự tải danh sách tổ đội hôm nay.
2. Ô `Loại` → `Nhân lực` hoặc `Thiết bị`.
3. Ô `Tổ đội *` (hoặc `Tên thiết bị *`) → gõ tên, ví dụ `Tổ điện`.
4. Ô `Số người *` (hoặc `Số máy *`) → gõ số **nguyên** từ 0 trở lên.
5. → `Thêm tổ đội` → `Đã thêm tổ đội` hoặc `Đã thêm thiết bị`.

⚠️ Bấm nhiều lần cùng một tổ đội sẽ **cộng dồn thành nhiều dòng**, làm tổng nhân lực
sai. Kiểm tra danh sách trước khi bấm lại.
⚠️ Nhập số thập phân hoặc số âm sẽ bị từ chối bởi máy chủ với thông báo tiếng Anh.

### 17.8 Xem lại báo cáo

Bấm một dòng ở thẻ `Báo cáo gần đây` → màn chi tiết (chỉ đọc).
Hiện 4 số liệu tổng, ghi chú và trạng thái. → `Quay lại`.

### 17.9 Hàng đợi offline

Vào `Offline / Sync Queue`.

**Hàng đợi trên máy**

- Danh sách mục đang chờ gửi. Bấm `Gửi lại ngay` để thử gửi lại toàn bộ.
- Mục nào lỗi vĩnh viễn (sai dữ liệu) hiện nút `Xóa mục lỗi` — bấm là xoá hẳn, không
  thể hoàn tác.
- Dòng trống: `Trống — mọi thứ đã đồng bộ`.

**Hàng đợi trên máy chủ (xung đột)** — dành cho Admin/CEO/PMO:

1. Mỗi mục có 2 nút:
   - `Giữ server` — giữ dữ liệu trên máy chủ, bỏ bản offline. Xác nhận `Giữ bản
     server, bỏ bản offline?`
   - `Dùng offline` — ghi đè dữ liệu máy chủ bằng bản offline. Xác nhận `Ghi đè server
     bằng bản offline?`
2. Xác nhận bằng hộp thoại của trình duyệt.

ⓘ Số `Conflicts (server thắng)` luôn hiện 0 vì hệ thống chỉ trả về các mục đang chờ.

---

## 18. Dữ liệu chủ (Master Data)

Vai trò vào được: Quản trị, PMO, Mua sắm.

Có 10 tab: `Vendors (NCC)` · `Workers` · `Teams` · `Subcontractors` · `Suppliers` ·
`Business Processes` · `Projects` · `Departments` · `KPI Targets (43.10)` · `Holidays`.

### 18.1 Xem dữ liệu

1. Bấm tên tab ở đầu bảng.
2. Ô `Tìm trong danh mục...` → lọc.
3. Bấm `Làm mới` để tải lại.

ⓘ Bảng có thanh phân trang như các màn khác: `Đang hiện a–b / N bản ghi`, đổi trang
bằng `‹` `›`, đổi số dòng 25/50/100. Trước đây màn này cắt cứng 200 dòng không báo.
ⓘ Tab `Business Processes`: bấm một dòng để xem các bước của quy trình.

### 18.2 Thêm mới

1. → `Thêm mới`.
2. Điền các ô theo danh mục:

| Danh mục | Ô bắt buộc | Ô khác |
|---|---|---|
| Vendors (NCC) | `Tên *` | `Mã`, `MST`, `Liên hệ`, `Nhóm` |
| Workers | `Họ tên *` | `Mã`, `SĐT`, `Vai trò` |
| Teams | `Tên *` | `Mã` |
| Subcontractors | `Tên *` | `Năng lực` |
| Suppliers | `Tên *` | `Hệ`, `Nhóm`, `Liên hệ`, `Địa điểm` |
| Business Processes | `Mã *` và `Tên *` | `Mô tả` |
| Departments | `Mã *` và `Tên bộ phận *` | — |
| Holidays | `Ngày` (YYYY-MM-DD) và `Tên ngày nghỉ` | — |

3. → `Lưu`

Kết quả: `Đã tạo #{id}`.

ⓘ Chỉ những danh mục **tạo được** mới có nút `Thêm mới`. Tab `Projects` và
`KPI Targets (43.10)` hiện dòng gợi ý trỏ đúng chỗ tạo thật:
`Projects` → màn `Tải lên`, bước `Cấu hình`, nút `+ Mới` ·
`KPI Targets` → đặt theo dự án qua `POST /projects/:id/kpi-targets`.

### 18.3 Sửa một bản ghi

Ở cuối mỗi dòng có cột `Thao tác` với hai nút.

1. Bấm nút **bút chì** (kéo chuột lên để thấy chữ `Sửa`).
2. Sửa ô cần đổi. Các ô **đã điền sẵn dữ liệu cũ** — nếu form tải lên rỗng, đừng
   bấm `Lưu`, hãy quay lại và báo lỗi.
3. → `Lưu`.

Kết quả: `Đã lưu thay đổi`, và bảng quay về danh sách với tên mới.

**Ô nào không cho sửa, và vì sao:**

| Không sửa được | Vì sao |
|---|---|
| `Mã` | Mã là khoá nghiệp vụ — nó được ghi vào hợp đồng, chuỗi duyệt, báo cáo. Sửa nó âm thầm làm dữ liệu lịch sử không còn khớp với danh mục hiện tại. Cần đổi mã thì tạo bản ghi mã mới. |
| `Đội trưởng` (Teams), `Tổ` (Workers), `Bộ phận cha` (Departments) | Đã có kiểm tra riêng ở màn chuyên biệt, gồm cả chống vòng lặp. Ghi từ form chung sẽ bỏ qua những kiểm tra đó. |

Nếu gửi một cột không được phép, hệ thống trả `400` và **liệt kê đúng các cột được
phép sửa** — không phải câu chung chung.

Trạng thái chỉ nhận 4 giá trị: `Đang dùng` · `Đã ẩn` · `Đã đóng` · `Đã gộp`. Nhập giá
trị khác, hệ thống báo lỗi **kèm luôn danh sách giá trị hợp lệ** thay vì báo
"Lỗi máy chủ" chung chung.

ⓘ Trước đây gõ sai trạng thái ra thông báo `Lỗi máy chủ` — đó là lỗi có sẵn ở
chức năng thêm mới, không chỉ ở chức năng sửa. Nay đã sửa.

### 18.4 Ẩn một bản ghi (xoá mềm)

1. Bấm nút **thùng rác** (kéo chuột lên để thấy chữ `Ẩn`).
2. Hộp thoại hỏi lại. → `Ẩn`.

**"Ẩn" KHÔNG phải xoá hẳn.** Bản ghi vẫn còn trong hệ thống, chỉ không hiện trong
danh sách nữa. Lý do: hợp đồng, báo cáo ngày, phiếu vật tư đã tham chiếu tới bản
ghi này; xoá hẳn sẽ làm hỏng dữ liệu lịch sử theo kiểu không nhận ra ngay.

- Bản ghi ẩn hiện **mờ đi** nếu bật công tắc `Hiện N bản ghi đã ẩn`.
- Bấm nút **làm mới** trên dòng đó để **kích hoạt lại** → bản ghi trở lại như cũ.
- Mọi thao tác sửa / ẩn / kích hoạt lại đều được ghi vào nhật ký kiểm tra
  (`Sửa …` · `Ẩn …` · `Kích hoạt lại …`).

ⓘ Hệ thống **không có** chức năng xoá hẳn danh mục, cố ý.
ⓘ Tab `Business Processes` không có nút Ẩn: bảng đó không có cột trạng thái, ẩn sẽ
luôn báo lỗi. Tab đó vẫn sửa được.
ⓘ Số bản ghi đang bị ẩn hiện ngay cạnh ô tìm, không biến mất im lặng. Khi không còn
bản ghi nào bị ẩn thì công tắc tự biến mất.

ⓘ Trước đây màn này **không có** nút sửa hoặc xoá — muốn sửa phải tạo bản ghi mới.
Nay đã có, xem 18.3 và 18.4.
ⓘ Cột hiện theo danh mục, có nhãn tiếng Việt: `MÃ` · `TÊN` · `MST` · `NHÓM` ·
`LIÊN HỆ` · `TRẠNG THÁI`. Cột `TỔ` và `ĐỘI TRƯỞNG` hiện **tên**, không phải số thứ tự
trong DB. Trước đây bảng lấy 7 khoá đầu của dữ liệu thô nên `id` và `tenant_id` chiếm
mất 2 chỗ, và cột quan trọng ở bảng nhiều cột bị đẩy ra ngoài.

**Dữ liệu demo trong ba tab này là dữ liệu GIẢ**, do `init.js` tạo:

| Danh mục | Mã | Quy ước |
|---|---|---|
| `Vendors (NCC)` | `NCC-DEMO-01`…`05` | tên công ty bịa, MST `0000000001`…`05` |
| `Teams` | `TỔ-TC-01`, `TỔ-TC-02`, `TỔ-KT-01`, `TỔ-AT-01` | trùng mã bộ phận `TC`/`KT`/`AT` đã có |
| `Workers` | `NV-001`…`NV-008` | 8 công nhân, mỗi tổ có 1 đội trưởng |

ⓘ MST để số `0` hết: mã số thuế thật gắn với một doanh nghiệp có thật, bịa số trùng
thì nguy hiểm hơn bịa một số vô nghĩa.
ⓘ Không dùng dữ liệu này làm căn cứ nghiệm thu nghiệp vụ. Xem
`docs/DATA_DECISIONS_REQUIRED.md` mục 10.

### 18.3 Ngày nghỉ

- Ô ngày + ô `Tên ngày nghỉ` → `Thêm` → `Đã thêm ngày nghỉ {ngày}`.
- Bấm `×` để xoá ngày nghỉ của tenant → hộp thoại xác nhận.
- ⓘ Ngày nghỉ toàn hệ thống (lịch Việt Nam) là **chỉ đọc**, do hệ thống nạp sẵn.
- ⓘ Ngày nghỉ tenant tự thêm sẽ được tính vào lịch nén tiến độ.

---

## 19. Cấu hình duyệt

Vai trò: Quản trị, CEO (gói có tính năng chuỗi duyệt).

### 19.1 Xem chuỗi duyệt hiện tại

Bảng `Chains hiện tại`: `Resource` · `Bộ phận` · `Levels` + nút `Xóa`.
Rỗng: `Chưa có chain — đang chạy legacy single-step`.

### 19.2 Thêm / sửa chuỗi duyệt

1. Ô `Resource` → `shop_drawing` hoặc `material_submittal`.
2. Ô `Bộ phận (trống = default)` → chọn bộ phận, hoặc để trống cho toàn tenant.
3. Bấm `+ Level` để thêm cấp (tối đa 5). Chọn vai trò cho từng cấp.
   - Ô nhãn tùy chọn, ví dụ `Nhãn (vd: Trưởng BP)`.
   - Bấm `− Level` để bỏ cấp cuối (tối thiểu 1 cấp).
4. → `Lưu chain` → `Đã lưu chain`

ⓘ Lưu là **ghi đè** theo (Resource + Bộ phận). Sửa chuỗi cũ phải chọn lại Resource và
Bộ phận rồi gõ lại toàn bộ cấp.
⚠️ Bấm `Xóa` sẽ **không** có cảnh báo về các hồ sơ đang duyệt dở; chúng sẽ trở về
duyệt 1 bước.

### 19.3 Cơ cấu bộ phận

Bảng `Bộ phận` · `Thuộc`. Chọn bộ phận cha để dựng cây (chuỗi duyệt kế thừa từ
dưới lên). Chọn bộ phận làm cha của chính nó hoặc của con sẽ bị từ chối.

---

## 20. Cấu hình điều khiển

Vai trò: Quản trị, CEO, PMO.

### 20.1 Ngưỡng đèn sức khoẻ

1. Chọn dự án.
2. Ô `Phạm vi` → `Dự án này` hoặc `Toàn tenant (mặc định)`.
3. Bảng `Chỉ số` · `Ngữ nghĩa` · `Vàng tại` · `Đỏ tại` · `Đang áp dụng`:

| Chỉ số | Ngữ nghĩa | Chiều |
|---|---|---|
| `overdue_items` | Hạng mục trễ tiến độ | Càng lớn càng xấu |
| `approval_pct` | % duyệt shopdrawing | Càng nhỏ càng xấu |
| `payment_overdue` | Thanh toán quá hạn | Càng lớn càng xấu |
| `material_delayed` | Vật tư chậm / trọng yếu | Càng lớn càng xấu |

4. → `Lưu ngưỡng`

ⓘ Ô ngưỡng **phải có số** ở cả 2 cột. Xoá trắng sẽ bị từ chối, không ghi 0.
ⓘ Cột `Đang áp dụng` cho biết đang dùng `Mặc định`, `Tenant` hay `Dự án`.

### 20.2 Cổng liên trụ cột

1. Ô `Phạm vi` → `Dự án này` hoặc `Toàn tenant (mặc định)`.
2. Bảng `Gate` · `Điều kiện` · `Mở` · `Ngưỡng %` · `Trạng thái` · `Đang áp dụng`:

| Cổng | Điều kiện |
|---|---|
| `G1 shop → material` | Duyệt bản vẽ mới được trình MSB |
| `G2 shop → manpower` | Duyệt BPTC mới được huy động thi công |
| `G3 material → manpower` | Vật tư về đủ mới huy động hiệu quả |
| `G4 manpower → payment` | Khối lượng hoàn thành → hồ sơ thanh toán |
| `G5 payment → material` | Dòng tiền thu → khả năng đặt hàng đợt sau |

3. Tích `Mở` để bật/tắt cổng. Gõ ngưỡng 0–100 nếu muốn đổi.
4. → `Lưu gate`

ⓘ Ghi với `Phạm vi = Toàn tenant` sẽ áp dụng cho **mọi dự án**, kể cả những dự án
chưa chọn.


---

## 21. Vận hành & Hiệu năng

Vai trò vào được: Quản trị, CEO, PM, PMO.

### 21.0 Bản demo trên máy này chạy như một dịch vụ

ⓘ Nếu mở `http://127.0.0.1:3000` mà không lên, đừng tự khởi động lại bằng tay — dịch vụ
đã được cài sẵn và tự khởi động lại khi chết. Xem `deploy/single-machine/README.md`.

| Việc | Lệnh |
|---|---|
| Xem dịch vụ có sống không | `systemctl --user status pmo-api.service` |
| Khởi động lại | `systemctl --user restart pmo-api.service` |
| Đọc log | `tail -f deploy/single-machine/logs/api.log` |
| Cài lại (idempotent) | `bash deploy/single-machine/install.sh` |

Phân biệt hai triệu chứng, vì chúng khác nhau và dễ nhầm:

| Triệu chứng | Nghĩa là |
|---|---|
| `/api/health` **trả 200** | Tiến trình còn sống. **Không** khẳng định gì về Postgres. |
| `/api/ready` trả 200 | Postgres thật sự sẵn sàng. Đây là chỉ số dùng cho canh gác. |
| Trang không mở được | Kiểm `systemctl --user status pmo-api.service` trước. |

ⓘ `pmo-watchdog.timer` gọi `/api/ready` mỗi 30 giây. Phải canh `ready` chứ không phải
`health`: `health` cố ý **không** chạm cơ sở dữ liệu, nên nó vẫn trả 200 khi Postgres đã
chết — đúng tình huống đã xảy ra, demo hỏng im lặng gần 12 giờ.

### 21.1 Đo hiệu năng

1. → `Đo hiệu năng ngay` → `Đang đo…` → kết quả `Đạt NFR: max {n} ms < 3000 ms`
   hoặc `Chưa đạt: max {n} ms (ngưỡng 3000 ms)`.

Bảng chi tiết: `Đường dẫn API` · `HTTP` · `Thời gian` · `Cache` · `Kết quả`.

### 21.2 Checklist môi trường phát hành

Banner `Đủ điều kiện phát hành` / `Chưa đủ điều kiện phát hành`, kèm
`{n} đạt / {n} lỗi / {n} cảnh báo`.

Bảng `Kiểm tra` · `Kết quả` · `Chi tiết` với 13 mục: biến môi trường, khoá mã hoá,
mật khẩu demo, tài khoản SSO, tài khoản DB, cấu hình sao lưu, thư mục upload, và bắt
buộc bật MFA.

ⓘ Nếu vai trò của bạn không đủ quyền đọc, hiện `Không đọc được checklist: Forbidden`.

ⓘ **Bản demo trên máy này: 8/13 mục đạt, 4 mục lỗi và 1 cảnh báo — và điều đó là cố ý.**
Xem bảng "Sai lệch đã chấp nhận" trong `deploy/single-machine/README.md` để biết mục nào
cần sửa thật và mục nào được mở có chủ đích (giữ mật khẩu `admin123` để trình diễn, và
`UPLOADS_DIR` chưa tách được vì máy chỉ có một filesystem nên cần `sudo`). Đừng tưởng rằng
checklist đỏ là hỏng: nó đang đúng báo trạng thái thật.

### 21.3 Tác vụ nền chạy tay

| Thẻ | Nhịp | Nút | Kết quả |
|---|---|---|---|
| `Chuyển cấp TVGS` | Mỗi giờ | `Chạy ngay` | `{n} lượt chuyển cấp` |
| `Theo dõi SLA AI` | Mỗi giờ | `Chạy ngay` | `{n} bản nháp` |
| `Tóm tắt việc quá hạn` | Hằng ngày | `Chạy ngay` | gom việc quá hạn thành thông báo |
| `Dọn log vận hành` | 00:xx | `Chạy ngay` | xoá phiên hết hạn và log AI cũ |
| `Lập chỉ mục AI` | Thủ công | `Chạy ngay` | đánh chỉ mục tìm kiếm lại |
| `Sao lưu hàng ngày` | 02:00 | (không có nút) | Xem màn `Sao lưu` |

ⓘ Nút `Chạy ngay` chỉ hiện với **Quản trị và CEO** — đúng những vai trò máy chủ cho
phép. Vai trò khác thấy thẻ nhưng không thấy nút, thay vì bấm xong nhận lỗi.

⚠️ **Sau khi đổi model embed ở màn `Cấu hình AI`, phải quay lại đây bấm
`Lập chỉ mục AI` → `Chạy ngay`.** Nếu không, tìm kiếm của Trợ lý AI vẫn dùng chỉ mục
cũ và trả kết quả sai.

ⓘ Mỗi thẻ hiện 2 dòng: `Lần cuối` và `Kết quả`.

### 21.4 Tổng hợp đa dự án

Bảng `Dự án` · `Sức khỏe` · `Shop duyệt` · `MSB chờ` · `Vật tư quá hạn` ·
`Nhân lực hôm nay` · `Issues mở / nặng`.

---

## 22. Bảo mật (cá nhân)

Mọi vai trò đều vào được màn này.

### 22.1 Bật xác thực 2 bước (MFA)

1. → `Bật MFA — tạo secret`.
2. Dòng `Secret (nhập tay vào app Authenticator):` hiện mã bí mật và mã QR.
3. Nhập mã bí mật vào app Authenticator.
4. Ô `Mã 6 số từ app` → gõ mã 6 chữ số app sinh ra.
5. → `Xác nhận & bật` → `Đã bật MFA cho tài khoản`

⚠️ Bấm `Bật MFA — tạo secret` lần thứ hai sẽ làm mã cũ vô hiệu. Chỉ bấm một lần,
chờ nhập mã xong.

**Tắt MFA**

1. Ô `Mật khẩu hiện tại` → gõ mật khẩu.
2. → `Tắt MFA` → `Đã tắt MFA`

### 22.2 Đổi mật khẩu

1. Ô `Mật khẩu hiện tại` → gõ mật khẩu đang dùng.
2. Ô `Mật khẩu mới` → **ít nhất 10 ký tự**.
3. Ô `Nhập lại mật khẩu mới` → gõ lại y hệt.
4. → `Đổi mật khẩu` → `Đã đổi mật khẩu (các phiên khác bị đăng xuất)`

### 22.3 Đăng nhập SSO

- Ô `Email công ty` → gõ email → → `Liên kết SSO ngay`.
- Gỡ liên kết: → `Hủy liên kết SSO` → `Đã hủy liên kết SSO`.

### 22.4 Quyền riêng tư (PDPL)

- Tải toàn bộ dữ liệu của bạn: → `Tải dữ liệu của tôi (JSON)`.
- Sửa tên hiển thị: ô `Tên hiển thị (tự hiệu chỉnh)` → → `Lưu tên`.
- Đồng ý nhận thông báo: bấm nút trạng thái `ĐANG CHO PHÉP` / `ĐÃ RÚT`.
  - ⓘ Nút hiển thị **trạng thái hiện tại**; bấm nghĩa là **rút lại**, không phải bật.
  - ⓘ Rút đồng ý thông báo sẽ tắt cả email lẫn Zalo.
- Yêu cầu xoá tài khoản: ô `Lý do (không bắt buộc)` → → `Yêu cầu xóa tài khoản` →
  xác nhận.
  - ⓘ Yêu cầu phải được quản trị viên duyệt mới thực hiện. Xoá là **ẩn danh vĩnh
    viễn** và không thể khôi phục.

### 22.5 Phiên đăng nhập

ⓘ **Không có màn hình quản lý phiên.** Cách duy nhất để đăng xuất mọi thiết bị là đổi
mật khẩu.

---

## 23. SSO & Dữ liệu (quản trị)

Vai trò: Quản trị, CEO.

### 23.1 Cấu hình SSO

1. Ô `Issuer (URL IdP)` → ví dụ `https://idp.congty.vn`. Bắt buộc.
2. Ô `Client ID` → bắt buộc.
3. Ô `Tên biến môi trường chứa secret` → tên biến trên máy chủ (mặc định
   `SSO_CLIENT_SECRET`). Secret **không** lưu trong cơ sở dữ liệu.
4. Tích `Bật SSO cho tenant`.
5. Tích `Tự cấp tài khoản mới` và chọn `Quyền mặc định khi tự cấp`.
6. → `Kiểm tra kết nối IdP` để thử trước.
7. → `Lưu cấu hình`

Xoá: → `Xóa cấu hình` → xác nhận `Xóa cấu hình?`.

ⓘ Tên biến môi trường gõ sai vẫn được lưu, nhưng SSO sẽ không hoạt động. Kiểm tra
lại tên biến với quản trị viên máy chủ.

### 23.2 Mã hoá dữ liệu

Badge `ĐÃ BẬT (DATA_ENC_KEY)` hoặc `CHƯA BẬT — đang lưu plaintext (chỉ dev)`, kèm
danh sách cột đang được mã hoá.

ⓘ `vendors.tax_id` giữ dạng chữ thường để khớp với ERP; được bảo vệ bằng phân quyền.

### 23.3 Hàng đợi yêu cầu dữ liệu (DSR)

Duyệt: → `Duyệt` hoặc → `Từ chối`, kèm ô `Ghi chú duyệt (không bắt buộc)`.

ⓘ Ô ghi chú là **một ô dùng chung** cho cả hàng đợi — ghi chú soạn cho yêu cầu này sẽ
bị áp cho yêu cầu khác nếu bạn không sửa lại.

---

## 24. Sao lưu dữ liệu

Vai trò: Quản trị, CEO.

1. → `Sao lưu ngay` → hộp thoại
   `Chạy pg_dump toàn DB bây giờ? Các bản cũ hơn chính sách giữ sẽ bị xóa.` → xác nhận.
2. Kết quả: `Đã sao lưu {tên file} ({dung lượng})`.

Bốn số liệu: `Lần cuối` · `Chạy tiếp theo` · `Đang giữ` · `Thư mục`.

Bảng `Các bản sao lưu`: `File` · `Dung lượng` · `Thời điểm`. Rỗng:
`Chưa có bản nào — bấm "Sao lưu ngay" hoặc chờ lịch đêm.`

ⓘ **Không có nút tải về, xoá hay khôi phục.** Khôi phục phải dùng `pg_restore` ngoài hệ
thống.
ⓘ Thời gian hiển thị là giờ máy chủ.

---

## 25. Nhật ký kiểm tra

Vai trò: Quản trị, CEO, PMO (và cần gói có tính năng xuất nhật ký).

### 25.1 Bộ lọc

| Ô | Tìm theo |
|---|---|
| `Search note/user...` | tên người, ghi chú, thay đổi trường |
| `Project ID` | mã dự án |
| `Resource type` | ví dụ `shop_drawing` |
| `Action` | ví dụ `CREATE`, `APPROVE` |
| `User ID` | mã người |
| `From` | ngày bắt đầu |
| `To` | ngày kết thúc |

→ `🔍 Lọc` để áp dụng. `Clear` để xoá ô (phải bấm `🔍 Lọc` lại).

ⓘ Ô `To` giờ bao gồm **trọn ngày** đã chọn. Trước đây chọn hôm nay sẽ mất hết sự
kiện trong ngày.

### 25.2 Bảng

Cột `Time` · `Action` · `Resource` · `Context` · `Actor` · `Note`.

Bấm mũi tên `▼` ở đầu dòng để mở rộng, xem khối `BEFORE` và `AFTER` so sánh trước /
sau, kèm `Field changes` nếu có.

### 25.3 Xuất

→ `📥 Export CSV` hoặc `📥 Export JSON` — xuất theo đúng bộ lọc đang áp dụng.

ⓘ Có thanh phân trang ở dưới bảng: `Đang hiện a–b / N dòng nhật ký`. Trước đây màn này
tải một lần 200 dòng rồi hiện, nên với bản ghi có hàng nghìn dòng thì phần lớn không
bao giờ xuất hiện mà không có dấu hiệu gì.
ⓘ Số `Total events` là số dòng **của trang đang xem**, không phải tổng toàn hệ thống —
tổng nằm ở thanh phân trang.

---

## 26. Cấu hình AI

Vai trò: Quản trị, CEO (gói Enterprise).

### 26.1 Xem và kiểm tra

Bảng `Routing hiện tại`: `Mục đích` · `Provider` · `Model` · `Key env` · `Có key` ·
`Ưu tiên` · `Bật`.

- `Có key`: `✓` nếu có, `✗ thiếu` nếu thiếu (dòng đỏ).
- → `Test chat` / `Test embed` để gọi thật nhà cung cấp → `OK: {provider}/{model}`.

### 26.2 Thêm tuyến định tuyến

1. Chọn `Mục đích` → `chat` hoặc `embed`.
2. Chọn `Provider` → `openai` / `anthropic` / `google` / `openrouter`.
3. Ô `Model` → gõ, ví dụ `nvidia/nemotron-3-ultra-550b-a55b:free`.
4. Ô `Ưu tiên` → số nhỏ hơn được thử trước.
5. → `Thêm & lưu`

ⓘ Biến chứa API key được chọn tự động theo provider
(`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`).
Key **không** lưu trong cơ sở dữ liệu.

⚠️ Không có ô bật/tắt từng tuyến. Muốn tắt thì phải xoá dòng đó. Xoá **không có xác
nhận** và thay thế toàn bộ bảng — nếu xoá hết tuyến `chat` hoặc `embed` sẽ bị từ chối.

### 26.3 Trần chi AI

Ô `Trần chi/tháng (USD)` → → `Lưu trần`.

ⓘ Hệ thống **chặn cứng**: khi tổng chi trong tháng đạt trần, mọi lệnh gọi AI bị từ chối
với thông báo `AI monthly cap exceeded ($20) — raise tenants.ai_monthly_cap_usd`.
Màn hình này chỉ hiện dạng chữ `{đã dùng} / {trần}`, **không** cảnh báo đỏ.

⚠️ Đổi model `embed` sẽ đánh dấu chỉ mục tìm kiếm là cũ. Sau khi lưu, vào màn
`Vận hành & Hiệu năng` → thẻ `Lập chỉ mục AI` → `Chạy ngay` để đánh lại.

---

# PHỤ LỤC A — Ma trận vai trò

| Màn hình | Quản trị | CEO | PM | PMO | Hiện trường | Kỹ thuật | Mua sắm | Kế toán |
|---|---|---|---|---|---|---|---|---|
| Control Center | xem + nạp + điều khiển | xem + điều khiển | xem + nạp + điều khiển | xem + điều khiển | xem | xem | xem | xem |
| Dự án | sửa bộ phận | sửa bộ phận | xem | xem | xem | xem | xem | xem |
| Tiến độ | đọc + tạo issue | đọc | đọc + tạo issue | đọc | đọc | đọc | đọc | đọc |
| Bản vẽ shop | ghi as-built | đọc | ghi as-built | đọc | ghi as-built | ghi as-built | đọc | đọc |
| Vật tư | đầy đủ | đọc | đầy đủ dự án mình | đọc | ghi vật tư dự án được gán | đọc | ghi vật tư dự án được gán | đọc |
| Nhân lực — kế hoạch tuần | nhập | nhập | xem | nhập | xem | xem | xem | xem |
| Nhân lực — năng suất | nhập | xem | nhập | nhập | nhập | nhập | xem | xem |
| QA/QC | đầy đủ | đọc | đầy đủ | đọc | đầy đủ | đầy đủ | đọc | đọc |
| Thanh toán | duyệt + chi | đọc | duyệt | duyệt | không thấy | đọc | đọc | duyệt + chi |
| Sự cố | tạo | đọc | tạo (dự án mình) | đọc | tạo (dự án được gán) | tạo (dự án được gán) | đọc | đọc |
| Phê duyệt | duyệt | duyệt | duyệt | duyệt | không thấy | không thấy | không thấy | duyệt |
| Trợ lý AI | đủ | áp dụng được | xem | xem | không thấy | không thấy | không thấy | không thấy |
| Nạp dữ liệu | được | **không** | được | được | được (dự án được gán) | được | được | được |
| Dữ liệu chủ | đủ | đọc | không thấy | đủ | không thấy | không thấy | đủ | không thấy |
| Bảo mật (cá nhân) | có | có | có | có | có | có | có | có |
| SSO & Dữ liệu | đủ | đủ | không thấy | không thấy | không thấy | không thấy | không thấy | không thấy |
| Sao lưu | đủ | đủ | không thấy | không thấy | không thấy | không thấy | không thấy | không thấy |
| Nhật ký kiểm tra | xem | xem | không thấy | xem | không thấy | không thấy | không thấy | không thấy |
| Cấu hình AI | đủ | đủ | không thấy | không thấy | không thấy | không thấy | không thấy | không thấy |

ⓘ Cột "Cấu hình điều khiển" và "Cấu hình duyệt" chỉ mở cho Quản trị, CEO, PMO (duyệt)
và Quản trị, CEO (duyệt).

---

# PHỤ LỤC B — Bảng trạng thái

| Nhóm | Trạng thái |
|---|---|
| Sức khoẻ dự án | `ON TRACK` · `WATCH` · `BEHIND` · `CRITICAL` |
| Bản vẽ shop | `DRAFT` → `SUBMITTED` → `APPROVED` / `REJECTED` → `SUBMITTED` |
| Hồ sơ vật tư | `DRAFT` → `SUBMITTED` → `APPROVED` / `REJECTED` |
| Yêu cầu chi | `DRAFT` → `PENDING` / `SUBMITTED` → `APPROVED` / `REJECTED` → `PAID` |
| Vật tư (vòng đời) | `REQUESTED` → `MSB_PREPARING` → `MSB_APPROVED` → `PO_ISSUED` → `IN_TRANSIT` → `DELIVERED` → `ACCEPTED` |
| QA/QC | `OPEN` → `PASSED` / `FAILED`; `FAILED` → `OPEN` / `PASSED`; `PASSED` → `OPEN` |
| Nạp file | `STAGED` · `CONFIGURED` · `SUCCESS` · `PARTIAL` · `FAILED` · `SKIPPED_*` |

⚠️ Mọi chuyển trạng thái đều được máy chủ kiểm tra. Chuyển sai trạng thái sẽ nhận
`Invalid transition: ...` và **không** ghi gì.

---

# PHỤ LỤC C — Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| Bấm nút thấy `Forbidden: role '...' cannot write ...` | vai trò chưa có quyền ghi | xem Phụ lục A |
| Thấy `Project not found` (404) khi mở dự án | bạn không phải thành viên dự án đó | nhờ quản trị gán bạn vào dự án |
| Thấy `Payment request phải APPROVED mới chi được` | chưa duyệt yêu cầu chi | duyệt trước ở màn `Thanh toán` hoặc `Phê duyệt` |
| Thấy `Mẫu vật lý phải được ghi nhận ACCEPTED trước khi duyệt MSB` | chưa ghi nhận mẫu | bấm `Mẫu đạt` ở màn `Phê duyệt` |
| Thấy `Chain N levels: duyệt từng level` | chuỗi duyệt nhiều cấp | duyệt từng cấp một, từ L1 lên |
| Thấy `L1 đã có quyết định; không thể ghi đè` | cấp này đã có kết quả rồi | xem lại lịch sử; nếu cần duyệt lại, nhờ quản trị xử lý |
| Thấy `Unknown doc_type: ...` | gõ sai loại tài liệu ở màn `Tải lên` | dùng đúng tên trong bảng mục 3.2 |
| Thấy `File vượt quá giới hạn 50MB` | file quá lớn | tách nhỏ file hoặc nén thành `.zip` |
| Thấy `identical file is already attached to another project` | nạp lại đúng file đó cho dự án khác | xác nhận đúng dự án; muốn chuyển dự án thì xoá bản cũ trước |
| Thấy `Không tải được dự án` / trang trắng | mất mạng | tải lại trang |
| Hai trụ cột cho hai con số khác nhau | bộ lọc `Kỳ` chỉ áp dụng cho trụ cột Thi công | xem mục 4.1 |
| Nút `Áp dụng tiến độ` bấm mà không đổi | dữ liệu nguồn đã thay đổi sau lúc xem trước | tạo đề xuất mới |
| Thấy `AI monthly cap exceeded` | đã hết trần chi AI tháng này | quản trị nâng trần ở màn `Cấu hình AI` |
| Thấy `Ký hiệu: vật tư sử dụng` nhưng không cộng dồn được | số lượng được lưu ở dạng ghi chú | nhập từ file vật tư ở trang web |

