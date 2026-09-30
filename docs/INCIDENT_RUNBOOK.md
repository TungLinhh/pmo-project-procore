# Incident runbook

Viết cho người trực vận hành (PMO / quản trị viên), không cần đọc code. Mọi lệnh đều chạy
trên server đang phục vụ, không mất dữ liệu trừ khi ghi rõ là phải backup trước.

Nguyên tắc: **AI chỉ đề xuất, parser/guard quyết định.** Provider lỗi không bao giờ được
coi là PASS. Dữ liệu nghiệp vụ không đổi theo ngôn ngữ — nếu bạn thấy dữ liệu đổi khi bật
EN, đó là bug, đừng dùng nó làm cách lách.

---

## 0. Trước khi bắt đầu

```bash
# 1. Sức khoẻ hiện tại
curl -s localhost:3000/api/health        # tiến trình còn sống
curl -s localhost:3000/api/ready         # DB còn trả lời không (503 = chết)
curl -s localhost:3000/api/health | head -c 200   # uptime_s để biết vừa restart chưa

# 2. Cấu hình production còn thiếu gì
curl -s localhost:3000/api/admin/production-readiness | head -c 400
```

`/api/ready` trả `degraded` nghĩa là DB còn sống nhưng chậm > 2s — đừng restart vội, đo
trước bằng `perf.mjs`.

---

## 1. Người dùng báo "đăng nhập không được"

| Triệu chứng | Nguyên nhân thường gặp | Xử lý |
|---|---|---|
| 401 với user thường | phiên hết hạn, bình thường | đăng nhập lại |
| 401 kể cả sau khi đúng mật khẩu | `token_version` bị bump (nghi do phát hiện tái sử dụng refresh token) | xem mục 2 |
| 429 | giới hạn đăng nhập 10 lần/phút/IP | chờ 60s; nếu là dịch vụ tự động thì xem `LOGIN_RATE_MAX` |
| 403 `PASSWORD_CHANGE_REQUIRED` | tài khoản còn mật khẩu tạm | mở màn hình đổi mật khẩu, không điều hướng vòng |
| 403 `MFA_REQUIRED` | admin/CEO bắt buộc MFA | `/api/auth/mfa/verify` |
| 401 nhưng mật khẩu chắc chắn đúng | DB user row lệch `tenant_id` | dừng, báo PMO — không sửa tay |

Không bao giờ bật `ALLOW_DEV_PASSWORD=1` để "cho qua" ở production. Muốn kiểm tra thì
chạy bản local.

---

## 2. Cảnh báo `REFRESH_TOKEN_REUSE`

Hệ thống phát hiện một refresh token đã bị dùng rồi xuất hiện lại sau khi đã xoay. Có hai
khả năng, hệ thống không tự phân biệt được nên **xoá toàn bộ phiên của tài khoản đó**:

1. **Bị đánh cắp** — đúng, hành vi này là chủ ý (chuẩn OAuth BCP).
2. **Hai tab cùng refresh** — hiếm, chỉ xảy ra trong 10 giây đầu (`REFRESH_REUSE_GRACE_MS`).

Xử lý:
1. Đọc `audit_log` dòng `REFRESH_TOKEN_REUSE` → biết user nào, family nào, thu hồi mấy phiên.
2. Bắt user đổi mật khẩu nếu nghi do bị đánh cắp.
3. Nếu là trường hợp hai tab: tăng `REFRESH_REUSE_GRACE_MS` lên 30000 (tạm thời, không deploy).

```sql
SELECT created_at, user_name, context->>'revoked_sessions' AS phiên_bi_thu_hoi
  FROM audit_log WHERE action = 'REFRESH_TOKEN_REUSE'
 ORDER BY created_at DESC LIMIT 20;
```

---

## 3. Dịch vụ realtime (SSE) không nhận thông báo

Triệu chứng: chuông không đổi số, nhưng đợi 30 giây thì tự cập nhật (đang rơi về polling).

1. Kiểm tra vé: vé SSE **dùng một lần**, 45 giây. Trình duyệt phải xin vé mới mỗi lần
   mở lại kết nối. Nếu thấy `401 Stream ticket không hợp lệ hoặc đã dùng` liên tục →
   frontend đang dùng bản build cũ (còn `?token=`), cần build lại và xoá cache.
2. Kiểm tra số subscriber: `GET /api/stream/status` (admin/CEO).
3. Stream bị cắt mỗi 90 giây là **có chủ ý** (chặn peer chết sau proxy). Client phải
   tự reconnect — nếu không, đó là bug frontend.
4. Sau 3 lần lỗi client ngừng thử và chỉ còn polling. Đó là hành vi dự phòng, không phải
   sự cố.

---

## 4. Cảnh báo "violates row-level security policy"

Job nền (digest quá hạn, TVGS escalation, AI SLA watcher) chạy **không có request**, nên
không mang `app.current_tenant`. Mọi bảng có RLS đều có lỗ hổng an toàn
(`app_tenant_unset()`) cho tình huống này. Nếu gặp lỗi này:

1. Kiểm tra bảng đó có policy dùng **helper** không:
   ```sql
   SELECT tablename FROM pg_policies
    WHERE qual LIKE '%current_setting%' AND qual NOT LIKE '%app_tenant_unset%';
   ```
   Danh sách phải **rỗng**. Dòng nào còn sót là bug (đã từng xảy ra với
   `attention_digest_runs` và `qa_inspections`).
2. Sửa bằng policy chuẩn:
   ```sql
   DROP POLICY <tên>_tenant_isolation ON <bảng>;
   CREATE POLICY <tên>_tenant_isolation ON <bảng>
     USING (app_tenant_unset() OR tenant_id = app_current_tenant())
     WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
   ```
3. **Không** sửa file migration đã apply. Thêm file mới trong `backend/drizzle/` và
   khai báo rank trong `db/migrate.js:orderedMigrationFiles`.
4. Chạy lại `node tests/e2e/digest-cron-rls.mjs`.

Digest quá hạn hôm nay không chạy được thì chạy tay:
`POST /api/jobs/overdue-digest` (admin/CEO, thêm `"force": true` để chạy lại ngày đó).

---

## 5. Ổ đĩa / storage phình to

```bash
npm run storage:gc          # báo cáo, KHÔNG xoá
npm run storage:gc -- --apply   # xoá file không còn dòng DB nào tham chiếu
```

- Chỉ xoá file **không dòng nào tham chiếu** và **cũ hơn 24h** (`--min-age-hours`).
- Có `STORAGE_DRIVER=s3` thì tool từ chối chạy — dùng bucket lifecycle rule của hạ tầng.
- Nếu số orphan tăng đột ngột: xem `file_uploads.storage_key` có dòng nào trỏ tới file
  không tồn tại (ngược lại với trường hợp này), và xem job wizard có bị bỏ dở giữa
  chừng không (`file_uploads` không có `import_batch_id` đã commit).
- `UPLOADS_DIR` phải trỏ ra volume, **không** để mặc định trong cây ứng dụng — đó là
  một trong các mục fail của `GET /api/admin/production-readiness`.

---

## 6. Backup hỏng hoặc DB chết

```bash
curl -s localhost:3000/api/admin/backups | head -c 400     # lần chạy gần nhất
ls -la $BACKUP_DIR
```

- `pg_dump` phải chạy bằng `BACKUP_DATABASE_URL` (role riêng). Role owner sẽ bị RLS cản
  và dump ra dữ liệu rỗng — đó là lý do `BACKUP_DATABASE_URL` là mục fail bắt buộc.
- Thiếu binary `pg_dump` → API trả **503**, không phải lỗi im lặng.
- Phục hồi (chỉ khi cần, **mất dữ liệu kể từ bản backup**):
  ```bash
  pg_restore -d "$PGDATABASE" --clean --if-exists "$BACKUP_DIR/<file>.dump"
  ```
  Trước khi làm: chụp lại DB hiện tại (`pg_dump -Fc` một bản nữa).

---

## 7. Bảng phình bất thường

```bash
npm run test:retention       # xem sweeper làm gì, không xoá gì ngoài chính sách
```

Sweeper chạy 1 lần/ngày lúc 00:xx và **chỉ** dọn: phiên hết hạn (`auth_refresh_tokens`,
`auth_revoked_jti`) và log AI (`ai_calls`). Mặc định **không** đụng `audit_log`, `notifications`
hay bất kỳ bảng nghiệp vụ nào.

- `audit_log` chỉ bị dọn khi PMO/CEO đặt `AUDIT_RETENTION_DAYS > 0` — đó là quyết định chính
  sách, không phải việc kỹ thuật tự quyết.
- Bảng nhỏ hơn `RETENTION_MIN_ROWS` (mặc định 10000) được giữ nguyên để DB demo/UAT còn
  bằng chứng.
- Xem kế hoạch: `GET /api/jobs/retention` (admin/CEO). Chạy tay: `POST /api/jobs/retention/run`.

---

## 8. Đối soát dữ liệu báo lệch

```bash
npm run test:reconcile                        # so GIÁ TRỊ (khối lượng/giá trị/ngày)
node scripts/reconcile-pilot-data.mjs          # báo cáo đầy đủ ra JSON
node scripts/data-decisions-required.mjs        # bảng quyết định cần PMO/CEO ký
```

SRS 9.1 yêu cầu "0% sai số khối lượng/giá trị". Đọc kết quả theo đúng thứ tự, vì
`value_mismatch_pct` **không** phải toàn bộ câu chuyện:

1. `value_fields_compared` — số trường thực sự so. Nếu bằng 0 thì không có kết luận nào.
2. `value_rows_missing_in_db` — dòng nguồn không tìm thấy trong DB. Khác 0 là mất dữ liệu.
3. `value_mismatch_pct` — tỉ lệ dòng lệch. Mỗi dòng trong `mismatches` đã ghi rõ
   file / bảng / khoá / cột.
4. `value_not_compared` — các cột **cố ý không so**, và vì sao. Đọc mục này trước khi
   kết luận "chỉ 0,5% lệch", nếu không sẽ tưởng đã so 100%.
5. `value_advisory_rows` — khác biệt ở cột mà ingest cố ý không ghi đè (ngày duyệt BQL).

Nếu công cụ báo lệch:

1. Xem `docs/DATA_DECISIONS_REQUIRED.md` — phần lớn là **quyết định nghiệp vụ**, không
   phải lỗi kỹ thuật. Không tự ý sửa dữ liệu để cho khớp.
2. Lỗi kỹ thuật thật thì sửa + thêm test, không sửa dữ liệu.
3. Số dòng lặp 36 / workbook tổng hợp 8 / 94 dòng dư: đã chặn trong code (workbook tổng
   hợp không được ghi dòng). Phần dữ liệu cũ còn lại cần PMO/CEO ký xử lý.

---

## 9. AI trả lỗi hoặc chậm

- Provider lỗi (429/5xx/quota) → trạng thái **`BLOCKED`**, tuyệt đối không phải `PASS`.
- `callChat` thử Nemotron trước, Space Bunny sau. Xem `ai_calls` để biết provider nào
  trả lời.
- Chậm là do thời gian suy luận, không phải cooldown. Reasoning timeout mặc định 120s;
  demo/UAT nên đặt `AI_REASONING_TIMEOUT_MS=45000`.
- Với demo/UAT: **không** bật `AI_MOCK=1`. Mock chỉ dùng trong test tự động.

---

## 10. Chuẩn bị phát hành

```bash
npm run test:release     # toàn bộ gate
```

Bắt buộc trước UAT, ngoài ra còn chạy:
- `node scripts/ui-audit-dark-contrast.mjs` — phải in `Tổng: 0`
- `node scripts/ui-verify-control-center.mjs`
- `npm run test:srs`

Danh sách đầy đủ và cách đọc báo cáo: `docs/RELEASE_GATE.md`.
