# Cần quyết định gì, và lựa chọn nào

Ngày: 2026-09-30. Mỗi mục đều có **đủ số đo**, các lựa chọn thật, và **khuyến nghị** của
tôi. Mục nào không quyết cũng chạy được — chỉ là mặc định sẽ là lựa chọn của tôi, và tôi
ghi rõ ở đâu.

Cách làm từ nay về sau: mỗi khi gặp điểm phải chọn, tôi sẽ **không tự quyết** nếu nó
đụng nghiệp vụ hoặc phạm vi; tôi sẽ dừng ở dạng mục như file này — số đo, lựa chọn, đánh
đổi, khuyến nghị — rồi đi tiếp phần còn lại. Với lỗi kỹ thuật thuần (sai cú pháp, sai
thứ tự, dữ liệu không nhất quán với chính nó) thì tôi sửa và báo, không hỏi.

---

> **ĐÃ QUYẾT 2026-09-30.** Chủ dự án chọn: **D1=A · D2=A · D3=D · D4=C · D5=B ·
> D6=A**. Mục nào còn lại giữ nguyên vì chọn vậy, ghi rõ bên dưới từng mục.
>
> Hệ quả cụ thể đã áp dụng ngay:
>
> | Quyết định | Hệ quả đã làm |
> |---|---|
> | D1=A | Không UAT, không walkthrough. `docs/UAT_SCOPE_DECISIONS.md` giữ `SIGNED: false`; `PRODUCTION_ENFORCE_READINESS` **giữ `0`** vì `ready` vẫn `false` |
> | D2=A | Giữ `admin123` + `ALLOW_DEV_PASSWORD=1`. 4 mục readiness đỏ là **sai lệch đã biết**, ghi vào tài liệu bàn giao |
> | D3=D | 15 mục `DATA_DECISIONS_REQUIRED.md` giữ trạng thái "chưa ký", và giữ nguyên lựa chọn mặc định của tôi |
> | D4=C | Đã sinh `scripts/build-sp-ap-sample.mjs` + `data/samples/sp-ap-from-demo.xlsx`; `step1-05` và `step1-06` chạy và xanh |
> | D5=B | **Không tách `UPLOADS_DIR`** — và đo được lý do thật, không phải vì thiếu `sudo` (xem dưới) |
> | D6=A | Giữ `TAIL_DAYS=90`; lịch BTE = 2026-01-19 → 2026-12-29 |

---

## D1. Có làm UAT không, và ở mức nào?

### UAT là gì, và khác gì với kiểm thử tôi đang chạy

| | Kiểm thử máy (tôi chạy) | UAT |
|---|---|---|
| Ai làm | Tôi viết script | **Người dùng thật** (PMO/CEO HBG) |
| Dữ liệu | Dữ liệu thử + dữ liệu BTE | Nghiệp vụ **thật** của họ |
| Câu hỏi | Máy làm đúng không | **Có đúng ý họ không, họ dùng được không** |
| Kết quả | PASS/FAIL | **Ký nhận** (biên bản + chữ ký) |

Ba thứ chỉ UAT mới trả lời được, và tôi **đo không thay được**:

1. **Ý nghĩa nghiệp vụ.** Ví dụ đã gặp: `lib/permissions.js` nói CEO không được tạo/xoá
   schedule link, còn `routes/schedule-links.js` lại mở cho CEO. Cả hai đều "chạy
   được". Chỉ người dùng mới biết cái nào đúng ý.
2. **Cách gọi tên.** Mỗi nghiệp vụ có thể gọi bốn cách. Máy không biết từ nào đúng.
3. **Thứ tự màn hình và thao tác.** Đo: 275 nhãn tiếng Anh ở 29 màn × 2 ngôn ngữ lọt
   qua bộ đo (vì nhãn không dấu và nhãn trong biểu thức không bị bộ đo soi). Loại này
   **chỉ** thấy khi người thật mở màn hình.

### Nếu **không** làm UAT thì khác gì — nói thẳng

Về kỹ thuật: **không khác gì**. Release gate, SRS gate, 146 bài e2e vẫn chạy, vẫn xanh.
Khác ở bốn thứ:

1. **16 mục quyết định dữ liệu không ai chịu trách nhiệm.** Chúng sẽ giữ nguyên lựa chọn
   mặc định của tôi — và tôi đã ghi "chưa ký" bên cạnh. Sau này đổi ý thì phải sửa dữ
   liệu lẫn code, tốn hơn nhiều so với trả lời bây giờ.
2. **Không có ai đứng sau khi có khiếu nại.** "Lịch vậy là sao?" — không có biên bản để
   trả lời.
3. **Cửa phát hành không có rào.** `PRODUCTION_ENFORCE_READINESS` đang để `0`; bật lên thì
   backend **từ chối boot** khi còn mục readiness đỏ. Đó là rào duy nhất chặn được việc
   bàn giao cho người khác.
4. **Chi phí thay đổi sau UAT đắt hơn nhiều.** Minh chứng hôm nay: 435 file chưa commit là
   ví dụ của việc "chưa có checkpoint thì mọi thứ đều là viết lại từ đầu".

### Với demo nội bộ trên máy này thì UAT **không** cần

Vì: không có khách hàng thật, dữ liệu ngoài hồ sơ BTE, không có trách nhiệm pháp lý, và
bạn đã chốt phạm vi là demo tạm thời. UAT đáng làm khi **dữ liệu thật của khách hàng** vào
và **người khác** dùng.

Còn một việc đáng làm và rẻ: **walkthrough 1 giờ** với người sẽ dùng. Ngồi xem họ bấm,
ghi lại "cái gì không đúng ý". Đây là UAT thu nhỏ, và nó bắt đúng nhóm lỗi mà máy không bắt
được ở mục 2 và 3 ở trên.

### Lựa chọn

| | Nội dung | Đánh đổi |
|---|---|---|
| **A** ⭐ | **Demo, không UAT.** Đóng mục 13 (xong), giữ 15 mục quyết định ở trạng thái "chưa ký", ghi rõ vào tài liệu bàn giao | Rủi ro: 15 mục quyết định treo. Bù lại: tôi ghi rõ mục nào ảnh hưởng đến đâu |
| **B** | Demo + **walkthrough 1 giờ** (UAT thu nhỏ), không ký | Tốn 1 giờ của bạn. Bắt được lỗi nghĩa/số lượng/thứ tự màn hình |
| **C** | UAT đầy đủ: 16 mục ký + biên bản + `ready === true` | Phải đóng 3 mục readiness đỏ ⇒ **mất `admin123`** ⇒ phải đặt mật khẩu riêng cho 8 tài khoản và bật MFA. Đo được hậu quả: bật MFA khiến **cả 146 bài e2e không đăng nhập được** |

**Khuyến nghị: B.** Chi phí 1 giờ, bắt được nhóm lỗi mà 146 bài máy không bắt được, và
không mất gì.

---

## D2. Ba mục readiness đỏ cố ý — giữ hay siết?

Đo: `getProductionReadiness()` → **8/13**, `ready = false`. Ba mục đỏ vì cố ý giữ cho demo:

| Mục | Vì sao đỏ | Đóng bằng cách nào |
|---|---|---|
| `dev_password` | `ALLOW_DEV_PASSWORD=1` | Bỏ biến khỏi `pmo.env` |
| `shared_password_users` | 8/8 tài khoản dùng `admin123` | Đặt mật khẩu riêng cho 8 tài khoản |
| `strong_auth` | 2/2 admin/CEO chưa bật MFA | `node deploy/single-machine/enable-mfa.mjs` |

**Hệ quả đo được của việc đóng:** `enable-mfa.mjs` bật MFA ⇒ `POST /api/auth/login` trả
`401 MFA_REQUIRED` ⇒ **cả demo lẫn 146 bài e2e đều không đăng nhập được**. Không phải suy
đoán — đã chạy và thấy.

| | Nội dung | Đánh đổi |
|---|---|---|
| **A** ⭐ | **Giữ nguyên** (phạm vi demo). Ghi 3 mục này vào tài liệu bàn giao là *sai lệch đã biết* | Demo vào được ngay bằng `admin123`. Nếu để máy ở chế độ mở thì bất kỳ ai trong mạng cũng đăng nhập được |
| **B** | Đặt mật khẩu riêng cho 8 tài khoản, **giữ `ALLOW_DEV_PASSWORD=1`** | Demo vào được (vì cờ vẫn bật), nhưng đóng được `shared_password_users`. Vẫn đỏ `dev_password` |
| **C** | Đóng cả 3, bật `PRODUCTION_ENFORCE_READINESS=1` | Mất `admin123` ⇒ **146 bài e2e không chạy được** trừ khi tôi sửa bài kiểm đọc mật khẩu từ biến môi trường. Tốn công nhất |

**Khuyến nghị: A nếu máy này chỉ bạn dùng; B nếu còn người khác cùng mạng.** Tôi không biết
máy này còn ai dùng — nên đây là câu hỏi cho bạn, không phải suy đoán kỹ thuật.

---

## D3. 15 mục quyết định dữ liệu còn lại — ký theo lô hay từng mục?

Đã xong: mục 13. Còn 15 (mục 1–12, 14–16), tất cả `SIGNED: false`.

| Nhóm | Mục | Nội dung ngắn |
|---|---|---|
| Dữ liệu chủ | 1, 2, 3, 12 | Dòng lặp trong nguồn, workbook chưa có grain dòng, dòng DB lệch file nguồn, `code` trùng |
| Tài chính | 4, 6 | Retention, nguồn chuẩn đối soát giá trị |
| Nghiệp vụ | 5, 7, 10, 11 | Ngày duyệt khi nạp lại, xung đột offline, danh mục rỗng, dữ liệu chủ không sửa/xoá được |
| **Quyền** | 8, 9, 15, 16 | Quyền ghi CEO, 3 vai trò chưa cài, CEO có tạo/xoá schedule link, **117 route ghi ngoài ma trận** |
| Lịch | 14 | Một bản gốc được mấy bản sửa |

**Mục 16 là mục đáng ký nhất**: đo `scripts/list-unmatrixed-writes.mjs` → **117 route
`POST/PATCH/PUT/DELETE` không qua `requirePermission`/`canAccess`**, trong đó **28 mở cho
`ceo`**, trong khi ma trận chỉ cho CEO ghi ở `directive`/`approval`/`control`. Ma trận phủ
16/25 module; phần còn lại (`bim`/`ai`/`erp`/`jobs`/`holidays`/`manpower-plan`) chỉ có
`requireRole` — hàm này kiểm tập role rồi `next()`, **không** gọi `canAccess()`, nên bỏ
hẳn phạm vi `own`/`assigned` và không tính `project_members`.

| | Nội dung | Đánh đổi |
|---|---|---|
| **A** ⭐ | Ký **mục 15 + 16** (quyền), để 13 mục dữ liệu ở trạng thái "chưa ký" | Chặn lớn rủi ro quyền. 13 mục dữ liệu vẫn treo nhưng chúng **làm hỏng số liệu**, không làm hỏng phân quyền |
| **B** | Ký hết 15, một lượt | Tôi phải hỏi cả 15 câu. Bạn trả lời 15 lần |
| **C** | Ký từng mục, theo thứ tự tôi đề xuất | Nhiều vòng hỏi–đáp nhưng từng mục có bằng chứng đầy đủ |
| **D** | Ký **không mục nào**, ghi rõ là quyết định tạm của tôi | Nhanh nhất. Mọi mục là lựa chọn mặc định của tôi, đã ghi chữ "chưa ký" |

**Khuyến nghị: A.** Vì phân quyền là thứ *hỏng thì mất tiền*, còn lệch dữ liệu thì *đối
soát được*. Và mục 16 đã có số đo sẵn để bạn chọn giữa A/B/C mà không cần đọc code.

---

## D4. `step1-05` / `step1-06` — cần sổ S&P của khách hàng

Đo trên **cả 14 file** `Vật tư *.xlsx` có trên máy: có bảng kê vật tư *và* cột thanh toán,
nhưng **ô thanh toán rỗng** ⇒ `sp_ap.parse` ra `batches: 0`. Còn nhóm
`TIẾN ĐỘ THANH TOÁN A_B/*.xlsx` thì có dữ liệu tiền nhưng **không** có bảng kê.

| | Nội dung | Đánh đổi |
|---|---|---|
| **A** ⭐ | Bỏ 2 bài khỏi danh sách chạy, ghi rõ là **thiếu dữ liệu khách hàng** (không phải lỗi code) | 2 bài không chạy. Không có rủi ro nghĩa là xong |
| **B** | Bạn đưa file S&P vào `SP_FILE` | 2 bài chạy ngay. Cần bạn có file đó |
| **C** | Tôi dựng một file S&P **bằng dữ liệu thật đang có** (hợp đồng + thanh toán trong DB) | 2 bài chạy, nhưng số liệu là **số của dự án demo**, không phải sổ khách hàng. Chỉ dùng để kiểm logic, **không** dùng để đối soát giá trị thật |

**Khuyến nghị: A**, kèm C nếu bạn muốn xem luồng đó chạy. Tôi **không** khuyến nghị
dùng số demo cho đối soát tiền — đó là loại lỗi mà demo hay dùy nhất.

---

## D5. Tách `UPLOADS_DIR` (mục readiness đỏ thứ tư)

Đo: máy này **chỉ có một filesystem** (`/dev/sdd`, ext4). `uploads/` đang nằm chung với
mã nguồn, nên khi thay image hoặc dọn thư mục thì **file tải lên mất theo**. Cần `mount`
⇒ cần `sudo`, mà `sudo -n` thất bại với tôi.

| | Nội dung | Đánh đổi |
|---|---|---|
| **A** ⭐ | Bạn chạy 1 lệnh `sudo` (có sẵn trong output `install.sh` và `README.md`) | Đóng được mục. Mất 2 phút |
| **B** | Chấp nhận nguyên hiểm, ghi vào tài liệu bàn giao | Mục readiness đỏ vĩnh viễn. Rủi ro thấp nếu demo ngắn hạn, **cao** nếu dùng lâu |
| **C** | Tôi đặt cảnh báo vào script `install.sh` để lần sau nhắc | Không đóng được mục, nhưng không ai quên |

**Khuyến nghị: A.** Đây là mục đỏ duy nhất còn lại do **giới hạn máy** chứ không do cố ý.

> **Đã chọn B, và đo lại thì lý do thật khác điều tôi viết ở trên.** Tôi đã ghi "cần
> `sudo`" — **sai**. Đo 2026-09-30:
>
> ```
> $ lsblk -no NAME,FSTYPE,SIZE,MOUNTPOINT
>   sda  388.4M disk
>   sdb    186M disk
>   sdc      2G disk [SWAP]
>   sdd      1T disk /mnt/wslg/distro
>
> $ findmnt /  →  /dev/sdd  ext4  /
> ```
>
> Đây là WSL2 với **một** filesystem duy nhất, và **không có phân vùng nào** để mount.
> `uploads_volume` kiểm `statSync(dir).dev !== statSync(dirname(dir)).dev` — trên máy này
> hai giá trị luôn bằng nhau. Nên mục này **không thể** xanh, kể cả khi có `sudo` và kể cả
> khi là root: muốn có filesystem thứ hai thì phải phân vùng lại đĩa, tức phá hỏng bản
> cài đặt.
>
> `sudo -n` cũng thất bại (`a password is required`) nên tôi không chạy được lệnh nào cần
> nó. Nhưng **nguyên nhân gốc không phải thiếu quyền** — nên đừng để ai đi tìm một lệnh
> `sudo` vì nó không tồn tại. Sai lệch này đã được ghi vào mục "sai lệch đã chấp nhận"
> của `deploy/single-machine/README.md`.

---

## D6. Độ dài lịch demo (90 ngày) — có đúng ý không?

Mình dời sao cho lịch kết thúc **90 ngày sau hôm nay**, để dự án "đang chạy" mà vẫn còn
việc. Đổi bằng `TAIL_DAYS`.

| | Nội dung | Đánh đổi |
|---|---|---|
| **A** ⭐ | Giữ 90 ngày | Hợp lý nhất với tình hình hiện tại |
| **B** | 180 ngày | Dự án trông dài hơn, nhiều việc tương lai hơn |
| **C** | 45 ngày | Gấp, hợp lý nếu demo là "công trình sắp xong" |
| **D** | Về đúng lịch thật 2019–2020 | Báo cáo và tuổi SLA hiện lại là số 7 năm trước |

Đổi rất rẻ: `node scripts/rebase-demo-dates.mjs --reset` rồi chạy lại với `TAIL_DAYS` khác.
**Khuyến nghị: A**; đổi sau cũng được.

---

## Việc tôi tự làm, không cần bạn quyết

| Việc | Trạng thái |
|---|---|
| Bản "đã triển khai" không tự quay lại sau reboot | **Xong** — `pmo-db.service` + watchdog `--heal`; đo bằng cách giết thật: gián đoạn 14 giây, tự lên |
| `pg-ctl.sh start` in "already running" khi Postgres đã chết | **Xong** — hỏi cổng thay vì tin pid file |
| Lịch demo ở 2019–2020 | **Xong** — dời hằng số 2504 ngày, offset ghim, không trôi |
| Nén lịch 422 không nói phải thử đến bao giờ | **Xong** — trả `earliest_feasible_target` tìm bằng tìm kiếm |
| Thêm bảng làm **hỏng sao lưu** (`permission denied for table demo_date_rebase`) | **Xong** — `init.js` cấp lại quyền cho `pmo_backup` mỗi lần boot; `backup.mjs` giờ kiểm quyền trực tiếp |
| `secrets-hygiene` đỏ sau khi commit vì chính nó chứa tiền tố khoá | **Xong** — phân biệt *khoá thật* với *mẫu phát hiện*; thử âm tính xác nhận vẫn bắt khoá thật |
| 25 hạng mục kết thúc trước khi bắt đầu | **Xong** — chuẩn hoá thành 1 ngày |
