# Quyết định dữ liệu cần PMO/CEO ký trước UAT

Sinh tự động từ `/tmp/opencode/recon.json` (nguồn: `2026-09-25T23:22:59.794Z`).
Chạy lại: `node scripts/reconcile-pilot-data.mjs --output=/tmp/opencode/recon.json && node scripts/data-decisions-required.mjs`

> Tài liệu này **không** tự quyết. Nó gom bằng chứng để quyết định mất vài phút
> thay vì phải dựng lại từ báo cáo thô.

## 1. Dòng lặp trong nguồn

Tổng 36 dòng lặp trong 8 file. Parser hiện **ghi đè theo khóa**, nên dòng bị ghi đè là mất thông tin, không phải bình thường.

| File | Project | Loại | Dòng nguồn | Khóa duy nhất | Lặp | Khóa bị lặp (mẫu) |
|---|---|---|---:|---:|---:|---|
| HBG-MCR-MM-01.xlsx | HBG-MCR | material | 29 | 26 | 3 | `BTE-WP4-HBC-MAA-MEP-PLB-009`×2, `BTE-WP4-HBC-MAA-MEP-HVAC-007`×2, `BTE-WP4-HBC-MAA-MEP-HVAC-008`×2 |
| Shop BOH.xlsx | BTE-WP4-HBC | shop | 46 | 45 | 1 | `BTE-WP4-HBC-SHD- MEP-PLB-PID-BOH-003`×2 |
| Shop BSN.xlsx | BTE-WP4-HBC | shop | 7 | 6 | 1 | `BTE-WP4-HBC-SHD-MEP-HVAC-HVA-FBC-001`×2 |
| Shop INF.xlsx | BTE-WP4-HBC | shop | 43 | 25 | 18 | `BTE-WP4-HBC-SHD- MEP-PLB-PL-INF-0001`×2, `BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-2001`×2, `BTE-WP4-HBC-SHD- MEP-PLB-PED-INF-2001`×2, `BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3001`×2, `BTE-WP4-HBC-SHD- MEP-PLB-PWS-INF-3002`×2 |
| Shop LOB & SPA.xlsx | BTE-WP4-HBC | shop | 27 | 26 | 1 | `BTE-WP4-HBC-SHD- MEP-PLB-PL-LOB -003`×2 |
| TĐ BOH.xlsx | BTE-WP4-HBC | construction | 122 | 121 | 1 | `TĐ .BOH|VI|2||2`×2 |
| TĐ CLUSTER VILLA.xlsx | BTE-WP4-HBC | construction | 27 | 21 | 6 | `TĐ .CLUSTER VILLA|II|1||1`×2, `TĐ .CLUSTER VILLA|II|2||2`×2, `TĐ .CLUSTER VILLA|II|3||3`×2, `TĐ .CLUSTER VILLA|II|4||4`×2, `TĐ .CLUSTER VILLA|II|5||5`×2 |
| TĐ Hạ Tầng.xlsx | BTE-WP4-HBC | construction | 79 | 74 | 5 | `TĐ INF|VIII|1||1`×2, `TĐ INF|VIII|2||2`×2, `TĐ INF|VIII|3||3`×2, `TĐ INF|VIII|4||4`×2, `TĐ INF|VIII|5||5`×2 |

**Quyết định cần ký (chọn 1):**

- [ ] A. Giữ dòng có `updated_at`/revision mới nhất — cần bổ sung cột revision vào nguồn.
- [ ] B. Giữ dòng đầu tiên theo thứ tự sheet — hiện là hành vi ngầm, cần ghi rõ.
- [ ] C. Từ chối commit file có dòng lặp, yêu cầu PMO sửa nguồn — an toàn nhất, nhiều công việc nhất.

Khuyến nghị kỹ thuật: **C** cho các file có dòng lặp lớn (Shop INF 18 dòng), **B** kèm cảnh báo cho các file lặp 1 dòng.

## 2. Workbook tổng hợp chưa có grain dòng

| File | Project | Loại | Dòng nguồn | Dòng DB hiện có | Ghi chú |
|---|---|---|---:|---:|---|
| HBG-MCR-MM-01.1.xlsx | HBG-MCR | material | 0 | 0 | summary/unsupported workbook; keep as source evidence until its row grain is confirmed |
| Tiến độ  vật tư tổng thể các khu vực.xlsx | BTE-WP4-HBC | material | 0 | 0 | summary/unsupported workbook; keep as source evidence until its row grain is confirmed |
| Sơ đồ shop tổng thể các khu vực.xlsx | BTE-WP4-HBC | shop | 0 | 0 | summary/unsupported workbook; keep as source evidence until its row grain is confirmed |
| HBG-MCR-MPM-01.1.xlsx | HBG-MCR | payment | 0 | 0 | summary/unsupported workbook; keep as source evidence until its row grain is confirmed |
| Tiến độ thanh toán các khu vực.xlsx | BTE-WP4-HBC | payment | 0 | 0 | summary/unsupported workbook; keep as source evidence until its row grain is confirmed |
| HBG-BTE-WM-01.xlsx | BTE-WP4-HBC | construction | 0 | 0 | summary/unsupported workbook; keep as source evidence until its row grain is confirmed |
| Sơ  đồ khu vực thi công.xlsx | BTE-WP4-HBC | construction | 0 | 0 | summary/unsupported workbook; keep as source evidence until its row grain is confirmed |
| Tiến độ thi công tổng thể các khu vực.xlsx | BTE-WP4-HBC | construction | 48 | 122 | chưa commit |

**Vấn đề đã thấy trong dữ liệu:** một workbook tổng hợp đã **ghi 74 dòng** vào DB, trùng grain với các file TĐ theo khu vực. Đây là nguyên nhân trực tiếp của sai khác ở mục 3 và là rủi ro đếm trùng tiến độ.

**Quyết định cần ký:**

- [ ] A. Loại workbook tổng hợp khỏi phạm vi nạp (giữ file làm bằng chứng nguồn) — khuyến nghị.
- [ ] B. Định nghĩa grain dòng cho từng workbook tổng hợp rồi nạp như nguồn chính.

Đã thêm chốt an toàn trong code: file tổng hợp **không được ghi dòng** khi commit (xem `lib/aggregate-workbook.js`).

## 3. Dòng DB không còn khớp file nguồn

| File | Project | Loại | Dòng parser đọc | Dòng trong DB | Lệch | upload_id |
|---|---|---|---:|---:|---:|---|
| HBG-MCR-MM-01.xlsx | HBG-MCR | material | 29 | 26 | -3 | — |
| Vật tư GEN.xlsx | BTE-WP4-HBC | material | 10 | 15 | +5 | — |
| Vật tư INF.xlsx | BTE-WP4-HBC | material | 5 | 15 | +10 | — |
| Shop BOH.xlsx | BTE-WP4-HBC | shop | 46 | 45 | -1 | — |
| Shop BSN.xlsx | BTE-WP4-HBC | shop | 7 | 6 | -1 | — |
| Shop INF.xlsx | BTE-WP4-HBC | shop | 43 | 25 | -18 | — |
| Shop LOB & SPA.xlsx | BTE-WP4-HBC | shop | 27 | 26 | -1 | — |
| Tiến độ thi công tổng thể các khu vực.xlsx | BTE-WP4-HBC | construction | 48 | 122 | +74 | — |
| TĐ BOH.xlsx | BTE-WP4-HBC | construction | 122 | 121 | -1 | — |
| TĐ CLUSTER VILLA.xlsx | BTE-WP4-HBC | construction | 27 | 21 | -6 | — |
| TĐ Hạ Tầng.xlsx | BTE-WP4-HBC | construction | 79 | 77 | -2 | — |

Lệch dương = DB đang có dòng mà file nguồn hiện tại không tạo ra. Cần biết dòng đó đến từ đâu trước khi xoá:

- `Vật tư GEN.xlsx`: +5 dòng, upload ? (?)
- `Vật tư INF.xlsx`: +10 dòng, upload ? (?)
- `Tiến độ thi công tổng thể các khu vực.xlsx`: +74 dòng, upload ? (?)

**Quyết định cần ký:** xoá các dòng thừa, hay giữ và ghi nhận nguồn gốc?

- [ ] A. Xoá dòng thừa sau khi PMO xác nhận nguồn gốc (khuyến nghị — khớp `mismatch_files: 0`).
- [ ] B. Giữ nguyên và ghi chú là số liệu bổ sung ngoài workbook.

## 4. Tài chính và retention

- Hiện tại: 78 hợp đồng, 249 hóa đơn, 249 yêu cầu chi, 4 khoản chi.
- Yêu cầu chi còn retention nhưng chưa chi: 1.
- Số liệu tài chính trên dashboard lấy trực tiếp từ bảng giao dịch; **chưa có** trường nào đánh dấu "đã đối soát với hồ sơ gốc".

**Quyết định cần ký:** có bắt buộc đối soát từng hóa đơn với hồ sơ gốc trước UAT không? Nếu có, cần thêm trạng thái `reconciled` và bước nghiệp vụ tương ứng.

## 5. Ngày duyệt và phản hồi BQL khi nạp lại file (ADVISORY)

`shop_drawings` cố ý **không** ghi đè các cột này khi re-ingest: `approval_date`,
`bql_l1..5_date`, `bql_l1..5_response`. Lý do có trong code: ghi `EXCLUDED.bql_l*_response`
lên một cấp đã duyệt sẽ vượt `checkTransition` và chuỗi phê duyệt ở `routes/shop.js`.

Hệ quả: nạp lại file shop mới sẽ **giữ ngày duyệt cũ** dù file mới ghi ngày khác. Lượt đối soát gần nhất bắt được 12 dòng như vậy. Đây là hành vi đúng theo thiết kế hiện tại, nên **không tính vào tỉ lệ lỗi** — nhưng nó là một câu hỏi nghiệp vụ.

**Quyết định cần ký (chọn 1):**

- [ ] A. Giữ nguyên như hiện tại — ngày duyệt là sự kiện của ứng dụng, file không được sửa. *(khuyến nghị)*
- [ ] B. File mới được ghi đè ngày, nhưng chỉ khi cấp chưa từng được duyệt, và ghi lại `reingested_at` để truy vết.

## 6. Đối soát giá trị (SRS 9.1) và nguồn chuẩn

Lượt đối soát giá trị so **6667 trường**: 882/915 dòng khoá duy nhất khớp tuyệt đối, **33 dòng lệch (0.49%)**, 0 dòng mất.

- Cột cố ý **không so** (8): materials.progress_pct (suy ra từ số lô đã giao); materials.procurement_status (deriveProcurementStatus); shop_drawings.status (enum suy ra); shop_drawings.rs1/rs2 dates (nguồn không có); shop_drawings.notes (không được ghi xuống DB); shop_drawings.approval_date + bql_l*_date/response (ADVISORY: upsert cố ý không ghi đè khi re-ingest để không vượt checkTransition); construction_schedule_items.status (deriveStatus từ progress + actual_end); construction_schedule_items.name_en (nguồn không có).
- Cột advisory, báo ra nhưng không tính lỗi: 12 dòng.
- Dữ liệu hiện tại của `BTE-WP4-HBC` **KHÔNG** bắt nguồn từ `reference_sheets/` (file_uploads không chứa hash của các file đó; sheet trong DB là `MEP-BTE-CSP-*`, `TĐ .BOH`, `TĐ INF`).

Nếu dữ liệu không đến từ `reference_sheets/` thì các dòng lệch là khác biệt giữa hai nguồn, không phải lỗi ingest.

**Quyết định cần ký (chọn 1):**

- [ ] A. `reference_sheets/` là nguồn chuẩn → nạp lại toàn bộ, chấp nhận các dòng đổi giá trị.
- [ ] B. Dữ liệu hiện tại là chuẩn → `reference_sheets/` chỉ là tư liệu tham khảo, loại khỏi phạm vi đối soát.
- [ ] C. Hai nguồn khác thời gian → cần quy tắc "nguồn mới hơn thắng" theo ngày, và một cột revision trong nguồn.

Chạy lại số liệu mục này: `npm run test:reconcile`.

## 7. Ai quyết định xung đột đồng bộ offline?

Route cho phép `chủ hàng đợi | admin | CEO`, nhưng cổng phân quyền dùng `daily_report.write` nên chặn CEO trước khi route kịp kiểm tra — CEO và PMO thấy nút nhưng luôn nhận 403. Đã sửa cho khớp (CEO vào được, PMO bị ẩn nút). Còn một câu hỏi nghiệp vu chưa tự quyết:

- [ ] A. Chỉ admin + CEO quyết (hiện tại) — giám đốc dự án chỉ xem hàng đợi.
- [ ] B. Thêm giám đốc dự án — mỗi người tự quyết xung đột dữ liệu của mình.
- [ ] C. Tự động theo mốc thời gian — bản mới hơn thắng, không cần người can thiệp.

## 8. Quyền ghi cho CEO

Giao diện từng hiện nút cho CEO ở năng suất hạng mục, báo cáo ngày và vật tư hiện trường, nhưng ma trận quyền đặt `write: false` cho cả ba nên bấm luôn nhận 403. Đã ẩn nút cho CEO cho khớp ma trận. Cần xác nhận đây là chủ ý:

- [ ] A. Giữ nguyên — CEO chỉ xem và ra chỉ thị, không ghi vận hành.
- [ ] B. Cho CEO ghi năng suất hạng mục (sửa `work_item.write` cho CEO).
- [ ] C. Cho CEO ghi báo cáo ngày và vật tư hiện trường.

## 9. Ba vai trò trong đặc tả chưa cài: DATA_ADMIN, EDITOR, VIEWER

Đặc tả mục 36 liệt kê 9 vai trò; ma trận quyền hiện chỉ cài 7 + ADMIN. Hệ thống an toàn vì tạo tài khoản qua SSO bị chặn bởi ràng buộc `default_role`, nhưng nếu thêm tài khoản trực tiếp với vai trò lạ thì người đó sẽ thấy menu mà không làm được gì.

- [ ] A. Không cài — bỏ 3 vai trò khỏi đặc tả để khớp thực tế.
- [ ] B. Cài VIEWER (chỉ đọc toàn tenant) cho vai trò khách / kiểm toán.
- [ ] C. Cài cả 3 đúng theo đặc tả.

## 10. Danh mục `Vendors` / `Workers` / `Teams` còn trống — lấy dữ liệu từ đâu?

Ba tab này vốn đã có ở máy chủ nhưng không mở tab nào, nên không ai nhập được gì.
Đã mở tab và nút `Thêm mới`; với tenant của `admin@hbg.com` cả ba đang **rỗng**
(`workers` và `teams` rỗng toàn hệ thống; `vendors` có đúng 1 dòng nhưng thuộc
tenant 2).

Không tự điền vì đây là dữ liệu người thật. Cần người quyết:

**Đã chọn C theo chỉ đạo ngày 2026-09-27** (cho phép dùng danh mục bịa để demo):
`init.js` tạo 5 NCC + 4 tổ + 8 công nhân, mã `NCC-DEMO-01`, `TỔ-TC-01`, `NV-001`,
đặt theo đúng quy ước `TEST n` mà 30 nhà cung cấp và 75 nhà thầu phụ sẵn có đang dùng.
Dữ liệu nằm trong `backend/src/db/master-data-seed.js`.

Vẫn cần người quyết cho bước sau, khi UAT thật:

- [ ] A. Giữ nguyên dữ liệu giả — chấp nhận màn Dữ liệu chủ không phản ánh đơn vị thật.
- [ ] B. Thay bằng danh mục thật của đơn vị trước khi khách hàng xem.
- [ ] C. Thay một phần: giữ tổ và bộ phận, thay danh sách NCC và công nhân.

## 11. Dữ liệu chủ chỉ tạo được, không sửa/xoá được — có cần không?

Kiểm tra thật: máy chủ chỉ có `PATCH /master-data/departments/:id`. Bảy danh mục
còn lại **không có** `PUT`/`DELETE`, và UI vì thế không có nút sửa/xoá. Đây là
**tính năng còn thiếu**, không phải lỗi giao diện — nên không tự thêm, vì cách xoá
là quyết định nghiệp vụ:

- Nhà cung cấp đã được hợp đồng tham chiếu thì xoá thế nào? Chặn xoá, hay cho
  xoá mềm (`status = INACTIVE`)?
- Công nhân đã ghi vào báo cáo ngày thì sửa `full_name` có làm sai dữ liệu lịch sử?
- Có cần giữ lại mọi bản sửa (lịch sử thay đổi master data) không?

- [ ] A. Không cần — quản lý danh mục qua import/nạp file, như hiện tại.
- [ ] B. Chỉ thêm **sửa**, không thêm xoá. An toàn về tham chiếu; sửa tên vẫn để
      lại dấu vết trong `audit_log`.
- [ ] C. Thêm cả sửa và xoá mềm (`status`), chặn xoá cứng khi bản ghi đã được tham
      chiếu, và ghi mọi thay đổi vào nhật ký kiểm tra.

## Chữ ký

| Vai trò | Người | mục 1 | mục 2 | mục 3 | mục 4 | mục 5 | mục 6 | mục 7 | mục 8 | mục 9 | mục 10 | Ngày |
|---|---|---|---|---|---|---|---|---|---|---|---|
| PMO | | | | | | | | | | | |
| CEO | | | | | | | | | | | |

Không điền trước. UAT chỉ `SIGNED` khi hai dòng trên có chữ ký và `ready=true`.

## 12. `code` của danh mục chủ có được phép trùng không? (2026-09-27)

**Tình trạng:** `vendors`, `workers`, `teams`, `cost_codes`, `resources` **không có**
ràng buộc `UNIQUE` nào trên `code`. Chỉ `subcontractors` và `suppliers` có
`UNIQUE (tenant_id, name)`. Kiểm chứng: tạo hai NCC cùng mã `NCC-DEMO-01` thì cả hai
đều được, HTTP 201.

**Vì sao phải hỏi:** mã là khoá nghiệp vụ — nó được ghi vào hợp đồng, chuỗi duyệt,
báo cáo. Hai bản ghi cùng mã thì "tra cứu theo mã" trả về hai kết quả, và người
đọc báo cáo không biết đang nói về bên nào. Nhưng nếu nghiệp vụ thật sự cho phép
trùng (ví dụ cùng một nhà thầu phụ có mã khác theo từng hạng mục), thì cấm là sai.

**Phương án:**

| | Cách làm | Đánh đổi |
|---|---|---|
| **A** | Thêm `CREATE UNIQUE INDEX ... (tenant_id, code)` | Sạch nhất, tra cứu theo mã chắc chắn một kết quả. Nhưng phải rà dữ liệu hiện có trước; nếu đang trùng thì phải xoá hoặc đánh số lại trước khi thêm — và đổi mã làm dữ liệu lịch sử không khớp |
| **B** | Cho phép trùng, thêm cảnh báo khi trùng (không chặn) | Không phá dữ liệu hiện có. Nhưng người dùng vẫn có thể tạo bản ghi trùng mà không bị chặn |
| **C** | Unique một phần: chỉ cấm trùng khi `status = 'ACTIVE'` | Cho phép lưu trữ lịch sử trùng mã mà vẫn không trùng trong danh sách dùng được. Cần partial index; phức tạp hơn |

**Tôi chưa làm gì** với mục này: thêm index lên dữ liệu đang chạy là thay đổi không
đảo ngược được nếu đã có dữ liệu trùng. Phần đã làm là **hiện cảnh báo trong giao diện**
khi mã trùng, và chặn sửa `code` (xem mục 11.6 trong `docs/CODEBASE_BUG_AUDIT.md`).

**Cần người ký chọn:** A, B hay C. Nếu A, cần thêm một lượt rà dữ liệu trùng ở
chính DB đang dùng.

## 13. Ngày lịch của dự án demo nằm ở 2019-2020, còn "hôm nay" là 2026 (2026-09-28)
> **ĐÃ QUYẾT 2026-09-30 — không còn chờ ký.** Chọn phương án: **dựng lịch demo tương đối
> so với hiện tại**, giữ nguyên hình dạng lịch gốc. Đã thực hiện bằng
> `scripts/rebase-demo-dates.mjs` (dời **một hằng số** mọi cột ngày gắn dự án, nên mọi
> khoảng cách và quan hệ phụ thuộc được giữ nguyên), offset ghim trong `demo_date_rebase`
> để chạy lại không trôi.
>
> **Đo trước → sau:** `BTE-WP4-HBC` 2019-03-13 → 2020-02-20 **trở thành** 2026-01-19 →
> 2026-12-29 (bắt đầu 254 ngày trước, kết thúc +90 ngày). Thời lượng trung bình giữ
> nguyên 22,2 ngày. Ba mục bị ghi nhận thêm khi làm:
>
> 1. **Dời ngày KHÔNG làm nén lịch khả thi.** `mapToCalendar` dàn hạng mục chưa làm ra từ
>    `todayStr()`, nên `calendar_end` vẫn là 2027-06-25 (268 ngày tới) **y hệt** trước và
>    sau khi dời. Đã sửa riêng: response 422/preview giờ kèm `earliest_feasible_target` —
>    ngày đích nhỏ nhất dùng được, **tìm ra** chứ không đoán (đoán `calendar_end + 1` cho
>    2027-06-26 thì dùng vào vẫn không khả thi, vì đổi mục tiêu thì lịch tính ra cũng đổi).
>    Đo: gợi ý 2027-07-24, dùng vào thật sự `feasible=true`.
> 2. **Phải dời mọi bảng, không chỉ lịch** — 19 bảng gắn dự án + 4 bảng nối gián tiếp
>    (`schedule_baseline_items` qua `baseline_id`, `invoices` qua `contract_id`,
>    `payment_requests` qua `invoice_id`, `daily_work_items` qua `daily_report_id`).
>    Dời lịch mà không dời payment/contract thì demo tự mâu thuẫn.
> 3. **Ô đang ở hiện tại thì giữ nguyên, không dời.** Công cụ chỉ dời ô còn nằm trong quá
>    khứ. Lý do cụ thể: `attention_digest_runs.digest_date` = 2026-09-26→29 (lịch sử
>    **cron**; dời 2504 ngày ⇒ thành 2033 ⇒ cron tưởng hôm nay chưa chạy digest) và
>    `projects.end_date` của BTE = 2027-01-20 (đã ở hiện tại; dời ⇒ 2033).
>
> **Phát sinh thêm:** 25 hạng mục có `plan_end_date = plan_start_date − 1 ngày` (lỗi dữ
> liệu nguồn, nhóm "Hệ thống cấp thoát nước"; dời hằng số không thể tạo ra). Đã chuẩn
> hoá thành hạng 1 ngày bằng `--fix-inverted`; chạy lại báo 0 nên idempotent. Cột
> `plan_duration_days` không dùng làm chuẩn được — chỉ 14/716 dòng khớp khoảng ngày.
>
> **Còn lại của mục này:** không có gì chặn. Xem `tests/e2e/demo-dates-relative.mjs`.



**Đo được:** `construction_schedule_items` của dự án demo chính (`BTE-WP4-HBC`) có
`plan_start_date`/`plan_end_date` từ 2019-07 tới 2020-02. `runCompression()`
(`backend/src/routes/schedule-compress.js`) neo mọi tính toán vào
`todayStr()` — hôm nay — nên:

- `targetDays = dateDiffDays(hôm nay, ngày đích)` ra **âm**;
- `mapToCalendar(..., anchor = hôm nay)` dàn lịch ra **tương lai**;
- kết quả: `calendar end 2027-06-23` > mọi ngày đích thử ⇒ **luôn 422**.

Đã thử 8 ngày đích trên dự án 1 và dự án 3: không ngày nào khả thi. Tức hai tính
năng **nén lịch** và **điều chỉnh deadline** hiện không dùng được với dữ liệu demo.
Thông điệp 500/422 cũng gây hiểu nhầm: nó nói *"infeasible on current data"* trong
khi 2027-06-23 là ngày mai — tức lỗi diễn đạt, không phải dữ liệu hỏng.

| | Phương án | Đánh đổi |
|---|---|---|
| **A** | Dựng lịch demo **tương đối so với `now` lúc seed** (`ngày bắt đầu = hôm nay − 10 tháng`, kéo dài về tương lai) | Dùng được ngay cả tính năng nén lịch. Nhưng **mọi ngày trong báo cáo và bảng tính sẽ đổi** ⇒ phải chạy lại `npm run test:reconcile` (SRS 9.1 "0% sai số") và rà lại mọi ảnh chụp có ngày. Lịch sử trở thành "vừa tạo" nên ít giống dự án thật đã 3 năm |
| **B** | Giữ nguyên lịch 2019-2020 (đúng dự án thật) | Số liệu lịch giống thực tế. Nhưng phải **chấp nhận** rằng nén lịch / điều chỉnh deadline không dùng được trên dữ liệu demo, và nên sửa thông điệp 422 để nói rõ "lịch đã ở quá khứ so với hôm nay" thay vì "infeasible on current data" |
| **C** | B (giữ lịch) **và** sửa thông điệp lỗi cho đúng nguyên nhân | Không đụng dữ liệu, người dùng hiểu vì sao. Nhưng UAT vẫn không demo được tính năng |

**Tôi chưa làm gì** với mục này: A đụng `value-reconcile` và mọi báo cáo có ngày, B/C
đụng hành vi lỗi hiển thị. Cả hai đều là quyết định nghiệp vụ, không phải lỗi kỹ thuật.

**Cần người ký chọn:** A, B hay C. Nếu UAT cần demo nén lịch thì bắt buộc phải chọn A
— nếu không, nên chọn C để ít nhất thông điệp lỗi không gây hiểu nhầm.

## 14. `revision_number` của material submittal: một bản gốc được có mấy bản sửa?

Phát hiện khi viết `tests/e2e/concurrency.mjs`: 6 request song song tạo bản sửa của
cùng một bản gốc đều thành công và **cả 6 đều ghi `revision_number = 1`**. Cấu trúc
hiện tại là `revision_number = parent.revision_number + 1` cùng `parent_submittal_id`
— tức một **chuỗi tuyến tính**, mỗi bản sửa là bản tiếp theo của bản trước.

Tôi đã sửa theo cách **không cần người ký**: index unique trên
`(parent_submittal_id, revision_number)` + khoá `FOR UPDATE` + trả **409** khi bản gốc
đã có bản sửa. Còn lại một câu hỏi nghiệp vụ mà tôi **không** tự quyết:

| | Phương án | Đánh đổi |
|---|---|---|
| **A** | Giữ như hiện tại: một bản gốc chỉ có **một** bản sửa; muốn sửa tiếp thì sửa trên bản sửa (chuỗi) | Đúng với cấu trúc đang có. Nhưng hai người cùng bấm "gửi bản sửa" thì một người phải bấm lại |
| **B** | Cho phép **nhiều nhánh**: mỗi nhánh một `revision_number`, thêm `revision_path` | Đúng nghiệp vụ thật (sửa song song nhiều bản). Nhưng đổi schema, đổi hợp đồng API, phải sửa mọi nơi đọc `revision_number` |
| **C** | Cho phép nhiều bản sửa nhưng **cùng số thứ tự** (đánh số theo thứ tự tạo, `2a/2b`) | Nhẹ hơn B nhưng vẫn phải quyết định cách hiển thị và cách so sánh hai bản |

**Cần người ký chọn:** A (giữ nguyên) hay B/C (cho phép nhiều nhánh). Hiện đang ở A
và **không mất dữ liệu** — hai bản sửa cùng số thứ tự đã bị chặn bằng index unique.

## 15. CEO có được phép **tạo/sửa/xoá liên kết lịch** (schedule links) không? (2026-09-28)

Đây là mục **quyền**, không phải dữ liệu, nhưng cùng loại: hai chỗ trong hệ thống
**mâu thuẫn nhau** và tôi không tự chọn.

| Nơi | Nói gì |
|---|---|
| `lib/permissions.js:129-132` — ma trận **chuẩn** | CEO: `schedule: { read: 'all', write: false }`, kèm comment thiết kế *"CEO: Toàn bộ / **Ghi: Chỉ Directive**"* |
| `routes/schedule-links.js:59,113,141` | `requireRole('admin', 'ceo', 'pm', 'pmo')` — **có** CEO |

Đo 2026-09-28: `POST /api/projects/1/schedule-links` với token CEO trả **400** (qua được
lớp quyền, dừng ở validation) trong khi `POST` với token SITE trả **403**. Tức CEO đang
**tạo được** liên kết phụ thuộc giữa các hạng mục, trái với "chỉ ghi Directive".

Vì sao tôi **không** tự sửa: ở mục `schedule-scenarios` (đợt 16) mâu thuẫn là rõ —
`AGENTS.md` ghi "PM/PMO simulate only, **CEO/Admin decide**" và ma trận có
`control: { apply: 'all' }`, nên tôi sửa bảng ánh xạ route cho khớp ý định đó (CEO apply
kịch bản, nhưng vẫn không ghi lịch thường). Ở `schedule-links` thì **không có** văn bản
nào nói CEO được hay không được: ma trận nói không, route nói có.

| | Phương án | Đánh đổi |
|---|---|---|
| **A** | **Ma trận thắng**: bỏ `'ceo'` khỏi `requireRole` của `schedule-links` (và `auto-chain`) | CEO mất khả năng dựng phụ thuộc lịch. Đúng với comment "Ghi: Chỉ Directive". Phải cập nhật `USER_GUIDE_VI.md` nếu tài liệu có mô tả CEO làm việc này |
| **B** | **Route thắng**: cho CEO `schedule.write` trong ma trận | CEO ghi được dữ liệu lịch, mở rộng quyền ngoài phạm vi "chỉ Directive" — cần người ký chịu trách nhiệm |
| **C** | Tách: CEO được `read` + `auto-chain` (tính chuỗi, không ghi dữ liệu) nhưng không `POST`/`DELETE` link | Giữ nguyên ý định kiểm soát, vẫn cho CEO chạy lại chuỗi phụ thuộc |

**Cần người ký chọn A / B / C.** Hiện đang ở **B** (route thắng) vì đó là hành vi đang
chạy, và tôi không đổi hành vi đang chạy khi hai nguồn trái nhau mà chưa ai chọn.

## 16. Ma trận quyền chỉ phủ 16/25 module — 117 route ghi không đi qua ma trận (2026-09-28)

`lib/permissions.js` tự mô tả là *"canonical role model"*, nhưng nó chỉ phủ 16 module
nghiệp vụ. Mọi hệ thống còn lại chốt quyền **chỉ bằng `requireRole(...)`** — hàm này
kiểm đúng tập role rồi `next()`, **không** gọi `canAccess()`, nên bỏ qua hẳn phạm vi
(`own` / `assigned`) và không hề tính `project_members`.

Đo 2026-09-28 bằng `scripts/list-unmatrixed-writes.mjs`: **117** route
`POST/PATCH/PUT/DELETE` không gọi `requirePermission`/`canAccess`/`checkProjectAccess`.
Trong đó **28** mở cho `ceo`, trong khi ma trận chỉ cho CEO ghi ở `directive`,
`approval`, `control`.

Các module **ngoài** ma trận (không phải lỗi, là khoảng trống thiết kế):

| Nhóm | Route ghi | Đang mở cho |
|---|---|---|
| BIM | `POST /projects/:id/bim/models`, `POST /bim/models/:id/link-zone` | admin, ceo, pm, site |
| AI | `PUT /ai/config`, `POST /ai/test`, `POST /ai/backfill`, `POST /ai/drafts/:id/approve|dismiss` | admin, ceo |
| ERP | `POST /erp/profiles`, `DELETE /erp/profiles/:id`, `POST /erp/vendors/import|confirm` | admin, ceo, procurement, accounting |
| Jobs | `POST /jobs/escalate-tvgs|overdue-digest|retention/run|ai-sla-watch|erp-push` | admin, ceo, accounting |
| Danh mục | `POST /holidays`, `DELETE /holidays/:id`, `PUT /projects/:id/manpower-plan` | admin, ceo, pm, pmo |
| Admin/SSO | `PATCH /users/:id`, `POST /users/:id/reset-password`, `PUT|DELETE /admin/sso` | không `requireRole` (chỉ `requireAuth`) |

**Vì sao tôi không tự sửa:** thêm module nào vào ma trận, và cho ai quyền ghi, là quyết
định nghiệp vụ — giống mục 15. Hơn nữa 28 chỗ kia **đang chạy** như vậy và không có văn
bản nào mâu thuẫn, nên không có bằng chứng rằng đó là *sai*; chỉ là chưa ai ghi lại.

| | Phương án | Đánh đổi |
|---|---|---|
| **A** | Ghi rõ "ma trận phủ 16 module, phần còn lại do `requireRole` quyết" — bổ sung dòng này vào `USER_GUIDE_VI.md` | Không đổi hành; chỉ ghi lại hiện trạng để người đọc không tưởng ma trận phủ hết |
| **B** | Đưa dần vào ma trận (`bim`, `ai`, `erp`, `jobs`, `holidays`, `manpower-plan`), thêm phạm vi `own`/`assigned` | Bảo mật chặt hơn; cần người ký chốt quyền từng module, và phải cập nhật `USER_GUIDE_VI.md` |
| **C** | Làm B cho nhóm nhạy cảm (`ai/config`, `ai/test`, `erp/profiles`, `admin/sso`, `users/:id`) trước, phần còn lại để sau | Ít rủi ro hồi quy; phạm vi hẹp nhất |

**Cần người ký chọn A / B / C.** Hiện giữ nguyên hành vi đang chạy.
