# Báo cáo bug codebase — 2026-09-25

Phạm vi: auth/session, phân quyền, tenant/project scope, upload/wizard, workflow, field UI, AI và kiểm thử. Mức `đã sửa` chỉ được ghi sau khi có test hoặc kiểm tra runtime; mức `còn lại` là gap cần backlog/UAT.

## Đã sửa trong vòng này

| Mức | Vấn đề | Thay đổi | Kiểm chứng |
|---|---|---|---|
| High | API client serialize body hai lần sau 401 retry | `frontend/src/api/index.js` không mutate `opts.body`, hỗ trợ object/string | build + frontend lint; cần test browser retry riêng |
| High | Logout chỉ xóa access token | HQ/Field gọi `auth.logout()`, revoke refresh server | cần UI session test |
| High | Đổi password làm UI giữ token đã bị thu hồi | `/api/me/password` trả access+refresh mới; client lưu token mới | SRS auth tests + cần UI regression |
| High | Refresh token race | Claim atomic `UPDATE ... WHERE revoked_at IS NULL RETURNING` | `p2-jwt-auth` PASS |
| High | ERP push bị permission map nhầm module | `/jobs/erp-push` map payment read/write | `test:srs` pass |
| High | KPI update bị permission map từ chối | thêm `PUT /kpi-targets/:id` | `test:srs` pass |
| High | Submittal create/list/parent thiếu project scope | `checkProjectAccess`, parent cùng project | `test:srs` pass |
| High | Đường upload plural bị permission map bỏ sót | thêm `/api/uploads` | `test:srs` pass |
| High | classify/review/crosscheck đọc upload không thuộc scope | `canAccessUpload`, project/row check | cần upload-row test |
| High | Hash upload có thể bị gán sang project khác | `stageFile` trả 409 nếu hash đã thuộc project khác | cần same-hash test |
| High | Submittal transition/reopen race | CAS `WHERE status = old.status`, thêm `REOPEN` | `test:srs`, cần concurrency test |
| High | Shop transition/level ghi đè quyết định | CAS status + chặn level đã có response | shop approval tests |
| High | Field reset progress 0% khi chọn item | prefill progress/notes từ item | cần browser field test |
| Medium | Shop REJECTED hiển thị REVIEW | `ShopList.stateOf` đọc canonical `status` | UI lint/build |
| High | Material `progress_pct: 0` bị thành NULL | giữ số 0 hợp lệ | cần zero-progress test |
| Critical | Supplier AP có `paid_date` nhưng thiếu amount/balance vẫn PAID | reject thủ công, không tạo payment giả | `npm run test:sp-ap` PASS |

## Đợt sửa tiếp — tiền độ, phạm vi dự án, ingest, production gate

| Mức | Vấn đề | Thay đổi | Kiểm chứng |
|---|---|---|---|
| P0 | `payments` INSERT lệch 3 cột: `contract_no` nhận `request_no`, `vat_amount=0`, không ghi `due_date` → S-curve tiền mất dòng kế hoạch | `routes/payment.js` join `c.contract_no`, `i.vat_amount`, `pr.due_date` | `payment-sla.mjs` 3 assertion mới PASS |
| P0 | ERP push không kiểm tra membership → ACCOUNTING đẩy ledger của dự án khác | `jobs.js` gọi `checkProjectAccess`; `pushFastPRs` nhận `projectId` (trước đẩy **toàn tenant**) | `tests/e2e/erp-push-scope.mjs` PASS |
| P0 | `GET /api/audit` trả cả tenant cho mọi role (`before`/`after` của dự án khác) | `routes/audit.js` lọc theo `context.project_id` thuộc dự án người gọi; admin/CEO vẫn tenant-wide | `tests/e2e/audit-scope.mjs` PASS |
| P0 | `.dockerignore` không chặn `backend/.env` → secret nằm trong image layer; `db/index.js` auto-load fallback | thêm `**/.env`, `**/.env.*`, `backend/.env`, `**/*.{pem,key,cert,p12}` | kiểm tra file; **cần rotate key đã lọt** |
| P1 | Re-import shop drawing ghi đè quyết định BQL trong app (kể cả NULL) | `db.upsert(..., setCols: [...])` chỉ cập nhật cột kế hoạch | `shop-approval.mjs` PASS |
| P1 | `retention_held: 0` + `retention_amount > 0` ⇒ retention không bao giờ release được | từ chối `held != declared`; `retention_status` suy từ `held` | `payment-sla.mjs` PASS |
| P1 | `PUT /api/kpi-targets/:id` không có project check | `requireResourceProject` trước matrix | `test:release` PASS |
| P1 | Hai `POST /kpi-targets` đồng thời tạo 2 bản ghi `effective_to IS NULL` → dashboard đếm trùng KPI | migration `9999ap` unique index một bản ghi mở; `pg_advisory_xact_lock` ở cả POST và PUT | `schema.mjs` PASS |
| P1 | Unique index mà `db.upsert()` cần chỉ có trong `init.js`, không có trong ledger | chuyển vào `9999ap_upsert_unique_indexes.sql` (rank 43) | `db/init.js` áp dụng thành công |
| P1 | Hai `POST /upload/:id/commit` cho cùng upload xen kẽ DELETE-then-INSERT | `pg_try_advisory_lock` theo upload id, trả 409 cho request thứ hai | `test:release` PASS |
| P1 | `sp_ap` đảo thẳng PENDING→PAID, bỏ `checkTransition`, `paid_amount ≠ amount` | ghi `approved_by/approved_date`, `paid_amount = amount` | `test:sp-ap` PASS |
| P1 | Hóa đơn âm được chấp nhận, tổng hóa đơn vượt giá trị hợp đồng, trùng `invoice_no` trả 500 | validate `amount > 0`, `FOR UPDATE` + chặn vượt hợp đồng, 23505→409 | `payment-sla.mjs` PASS |
| P2 | `zone_id`/`wbs_id` của work item và QA có thể trỏ sang dự án khác | kiểm tra cùng project ở `ensureWorkItem`, PATCH và QA create | `test:release` PASS |
| P2 | `PATCH schedule progress` ghi `work_items` không giới hạn project, không có optimistic lock | thêm `project_id` predicate + `SELECT … FOR UPDATE` | `test:release` PASS |
| P2 | `progress_pct: 0` bị `||` nuốt, đọc sang cột khác | `firstNumber()` first-non-null | `test:release` PASS |
| P2 | BIM tra zone bằng `UPPER(code)` trong khi zone lưu nguyên văn → zone `b1` không tìm thấy, trùng code | so khớp không phân biệt hoa thường, chỉ nhận khi không mơ hồ | `test:release` PASS |
| P0 | `GET /api/auth/sso/discover` công khai, server fetch URL tuỳ ý (SSRF) | gỡ route; SSO ngoài phạm vi | `sso.mjs` PASS (dùng `/api/admin/sso/test`) |
| P0 | `cors()` trả `*` cho mọi origin ở production | `CORS_ORIGIN` allowlist; production không đặt ⇒ same-origin | `test:release` PASS |
| P1 | Lỗi 5xx trả `err.message` (lộ relation/constraint của Postgres) | production trả `Internal error`, chi tiết chỉ vào log | `test:release` PASS |
| P1 | Auth audit (`LOGIN_FAILED`/`LOGIN_BLOCKED`/`MFA_FAILED`) bị `.catch(() => {})` nuốt im lặng | log lỗi thay vì nuốt | `auth-rate-limit` PASS |
| P1 | `db/audit.js` hard-code `tenant_id = 1` | bắt buộc `tenantId`, lấy từ `context.tenant_id` | lint PASS |
| P1 | Checker production: chặn tên role thay vì đọc `rolsuper`/`rolbypassrls`; quét `LIMIT 500` âm thầm; gate `sso_enabled` không bao giờ đạt | đọc `pg_roles`, quét đủ user, bỏ `sso_enabled`, `strong_auth` chỉ admin/CEO + `mfa_others` cảnh báo | `tests/e2e/production-readiness.mjs` 7/7 PASS |
| P2 | `.containerignore` của script UI: 4 script ghi ảnh vào thư mục không tồn tại, 7 script hard-code `localhost:3000` | `path.resolve(...)` + `process.env.BASE_URL` | `node --check` toàn bộ scripts |
| P2 | `ui-verify-detail-nav.mjs` tìm tiêu đề tiếng Anh đã bị xoá và `?project_id` | viết lại theo UI hiện tại (`?project=`, ProjectPicker) | `node --check` |
| P1 | 9 chỗ dùng `toISOString()` (ngày UTC) cho "hôm nay" ⇒ đúng 00:00–07:00 giờ VN ghi sai ngày | `todayLocal()` / `mondayLocal()` trong `utils/datetime.js` | frontend lint + build PASS |
| P0 UX | Control Center kẹt skeleton vô hạn khi không có dự án; "Tất cả dự án" giữ số liệu dự án cũ | set `loading=false` + `loadError` trong catch, reset state trước guard, bỏ `allowAll` | build + UI verify |
| P0 UX | `IssueDetail` gọi `relativeTime` không tồn tại ⇒ trắng màn hình; chỉ thị CEO không hiện, không có toast | `relativeTimeVi`, tải directive/audit riêng, `toast.success` | build + UI verify |
| P0 UX | `ProgressDetail` kẹt "Đang tải" vô hạn khi request lỗi | `.catch`/`.finally` + nhánh lỗi có nút Thử lại | build + UI verify |
| P0 UX | `JSON.parse` không bọc try/catch trong `Assistant` và `PillarControlPanel` ⇒ crash render | `safePayload` / `asObj` an toàn | build + UI verify |
| P1 UX | Apply/Rollback đề xuất tiến độ không hỏi lại, dùng chung một cờ busy, tab không có loading/empty đúng | `confirm()` cho cả hai, tách trạng thái, `Chọn project trước.` | build + UI verify |
| P2 UX | Focus không hiện (3 chỗ `outline:none`), không có `:focus-visible` | quy tắc focus chung | build |
| P2 UX | Bell dropdown 380px tràn màn 375px; toast 380px; wizard không có breakpoint; modal tràn backdrop | media query 768px cho bell/toast/modal, breakpoint đầy đủ cho wizard (scroll step, `100dvh`, nút 44px) | build |
| P3 | `.btn-secondary`/`.btn-text` của wizard tràn ra global, đè kiểu của HQ | scope dưới `.wizard-modal` | build |

## Đợt sửa thứ ba — quyết định nghiệp vụ, ingest atomicity, dữ liệu

| Mức | Vấn đề | Thay đổi | Kiểm chứng |
|---|---|---|---|
| P0 | Primary AI route trả rỗng ~55%: `postJson` cắt ở 15.000 ms trong khi Nemotron cần 28–109 s với ngữ cảnh. Thêm nữa, `timeoutFor()` viết ra nhưng **không được truyền** vào adapter | `timeoutFor(model)` nối thật vào `chat`+`embed`; reasoning 120 s; token budget scale theo prompt; 3 lần thử; `AI_TOTAL_BUDGET_MS`; ghi `finish_reason` vào lỗi | `test:ai` thật: primary **4/8 → 8/8**, fallback 4/8 → **0/8**, lỗi 9 → **0** |
| P0 | `secret-hygiene` chưa có test khóa hành vi rò rỉ | `tests/e2e/secrets-hygiene.mjs` 13 assertion; `db/index.js` không auto-load env ở production | `secrets-hygiene.mjs` ALL PASS |
| P1 | Ingest clear-then-insert chạy trên connection riêng từng câu lệnh ⇒ mất dữ liệu khi lỗi giữa chừng | `db.withClientTx()` + bọc `daily_report`, `payment_ar`, `business_process`; bắt 23505 khi tạo process | `test:release` (xem cuối) |
| P1 | Nhánh "SERVER winner" của `POST /sync/resolve` nằm ngoài transaction, không có audit | bọc `withAudit`, đồng nhất với nhánh CLIENT | `p4-sync-apply` PASS |
| P1 | `POST /sync/resolve` bỏ qua kiểm tra project khi record không có `project_id` (fail-open) | fail-closed: thiếu `project_id` ⇒ 404 | `p4-sync-apply` PASS |
| P1 | Workbook tổng hợp đã ghi 74 dòng trùng grain với file TĐ theo khu vực | `lib/aggregate-workbook.js` chặn ghi dòng cho workbook tổng hợp, ghi lý do vào `skip_reason` | `test:release` |
| P1 | Xung đột vai trò SRS (PM/PMO apply "trong thẩm quyền" vs CEO/Admin-only) | `lib/pillar-authority.js`: thẩm quyền = ngưỡng tác động đo được (dời lịch/chi phí/số hạng mục), cấu hình bằng env, `PILLAR_APPLY_AUTHORITY=off` để lùi nhanh; UI hiện lý do từ chối | `pillar-authority.mjs` 14/14 PASS |
| P2 | 36 dòng lặp / 8 workbook tổng hợp / 5 file lệch DB chỉ có con số, PMO không đủ căn cứ quyết | `scripts/data-decisions-required.mjs` sinh `docs/DATA_DECISIONS_REQUIRED.md` với khóa lặp, số dòng lệch, nguồn gốc và ô ký | sinh tự động từ reconcile |

## Đợt sửa thứ tư — session, realtime, RLS của job nền, vận hành

| Mức | Vấn đề | Thay đổi | Kiểm chứng |
|---|---|---|---|
| P0 | **Refresh token tái sử dụng không bị phát hiện.** `rotateRefresh()` claim bằng conditional UPDATE, token đã xoay rồi quay lại chỉ trả `null` — trộm token và double-submit lành mạnh trông giống hệt nhau, và chuỗi bị trộm vẫn sống | `9999aq` thêm `family_id` (mỗi login một họ, xoay kế thừa họ); `detectRefreshReuse()` thu hồi **cả họ**, bump `token_version` (giết luôn access token đang sống), ghi `audit_log REFRESH_TOKEN_REUSE`. Cửa sổ ân hạn `REFRESH_REUSE_GRACE_MS` (mặc định 10s) để hai tab refresh cùng lúc không bị đăng xuất | `refresh-reuse.mjs` **11/11 PASS** |
| P0 | **`/api/health` trả `ok` cứng, không chạm DB** — DB chết vẫn báo khoẻ, không ai restart/cảnh báo | Tách `/api/health` (liveness, có `uptime_s`) và `/api/ready` (readiness: query thật, `latency_ms`, 503 khi DB chết, `degraded` khi >2s) | `monitoring.mjs` **16/16 PASS** |
| P0 | **Job nền chạy không có request ⇒ không mang `app.current_tenant` ⇒ RLS chặn.** `attention_digest_runs` và `qa_inspections` viết policy bằng GUC thô `current_setting(...) = ''`, hàm đó trả NULL (không phải TRUE) khi GUC chưa từng được SET — đúng case của cron. Log thật: `new row violates row-level security policy for table "attention_digest_runs"` | `9999as` đổi cả 2 sang helper `app_tenant_unset()` như 60+ bảng khác; `runOverdueDigest()` tự sở hữu tenant context thay vì trông chờ callsite; cron chỉ đánh dấu xong ngày khi **mọi** tenant thành công, nếu không thì tick sau retry thay vì mất 24h | `digest-cron-rls.mjs` **10/10 PASS** |
| P1 | **Access token nằm trong query string của SSE** (`/api/stream?token=`) ⇒ lọt vào access log, proxy log, history, Referer | Thay bằng **vé một lần**: `POST /api/stream/ticket` (header-auth) phát vé 45s, `typ=stream` + `aud=stream`, đốt qua `auth_revoked_jti` nên single-use đúng cả khi nhiều instance; `verifyAccess()` từ chối vé; `?token=` cũ **trả 401**; client tự xin vé mới mỗi lần reconnect | `realtime.mjs` **15/15 PASS** |
| P1 | **Storage phình vô hạn.** 1090 file / 564 MB trong `backend/uploads`, trong đó **928 file / 153 MB không dòng DB nào tham chiếu**; không có gì từng xoá | `scripts/storage-gc.mjs`: dry-run mặc định, chỉ xoá file không tham chiếu **và** cũ hơn 24h, từ chối chạy khi `STORAGE_DRIVER=s3`; gate chạy dry-run mỗi lần release. Thêm check `uploads_outside_app` vào production-readiness (uploads mặc định nằm trong cây app ⇒ mọi byte test/demo lên kèm image) | `storage-gc.mjs` báo cáo trong `test:release`; `production-readiness.mjs` 10/10 |
| P2 | **Không có retention cho log vận hành**: `auth_refresh_tokens` 2307 dòng, `ai_calls` 1001, `auth_revoked_jti` chỉ dọn cơ hội khi có logout | `lib/retention.js`: dọn phiên hết hạn + jti quá hạn + log AI; **không** đụng `audit_log` trừ khi PMO/CEO đặt `AUDIT_RETENTION_DAYS > 0`; sàn 1 ngày cho mọi mục (window 0 sẽ xoá cả dòng vừa ghi) và `RETENTION_MIN_ROWS` mặc định 10000 để DB demo/UAT giữ bằng chứng; cron 00:xx; `GET|POST /api/jobs/retention[/run]` (admin/CEO) | `retention.mjs` **10/10 PASS** |
| P1 | **SRS 9.1 "0% sai số khối lượng/giá trị" chưa được đo.** `reconcile-pilot-data.mjs` chỉ so khóa dòng và số dòng — một dòng lọt vào DB với đúng khoá nhưng sai số là vô hình | `scripts/lib/value-compare.mjs` + `reconcileValues()`: so từng giá trị nghiệp vụ (tiến độ, ngày, số tiền, tên) giữa dòng nguồn và dòng DB. Ba bẫy đã xử lý và có test: số có dấu phân cách kiểu Việt bị **từ chối** chứ không đoán sai 1000 lần; khoá dựng lại phải y hệt `commit` (`level_arabic ?? 0`, nếu không 122 dòng của một workbook thành "mất trong DB"); khoá trùng ở nguồn được **ghép cặp 1-1** chứ không để hai dòng tranh một dòng DB | `reconcile-values.mjs` **33/33 PASS**; kết quả thật: 6667 trường so, 0 dòng mất, 882/915 dòng khớp tuyệt đối, **33 dòng lệch (0,49%)**, 36 dòng lặp ghép cặp, 12 dòng advisory tách riêng |

Ba nhóm dữ liệu được báo riêng thay vì gộp làm một con số "lỗi":

- **`not_compared` (8 mục)** — cột không thể so vì nó *suy ra lúc commit* (`status`, `materials.progress_pct`, `procurement_status`) hoặc nguồn không có. Không khai báo thì tỉ lệ 0,49% trông như đã so 100%, đó là nói dối.
- **`advisory` (12 dòng)** — `shop_drawings.approval_date` và `bql_l*`: upsert **cố ý** không ghi đè khi re-ingest, vì ghi `EXCLUDED.bql_l*_response` lên một cấp đã duyệt sẽ vượt `checkTransition` và chuỗi phê duyệt. Vì vậy khác biệt ở đây là **thiết kế đúng**, được báo ra để nhìn thấy nhưng không tính vào lỗi. Việc file mới có được cập nhật ngày duyệt cũ không là **quyết định nghiệp vụ**, đã đưa vào `docs/DATA_DECISIONS_REQUIRED.md`.
- **33 dòng lệch** — dữ liệu trong `BTE-WP4-HBC` **không đến từ `reference_sheets/`** (`file_uploads` không chứa hash của các file đó; sheet trong DB là `MEP-BTE-CSP-*`, `TĐ .BOH`). Nên đây là khác biệt giữa hai nguồn dữ liệu, không phải lỗi ingest. Cần PMO/CEO chỉ nguồn nào là chuẩn.

Hai lỗi phát hiện được nhờ test, không phải nhờ đọc code: vé SSE dùng được như access token (`jwt.verify` không kiểm tra `aud` nếu không truyền `audience`), và dòng dữ liệu debug sót lại làm `p2-password-auth` đỏ.
token (`jwt.verify` không kiểm tra `aud` nếu không truyền `audience`), và dòng dữ liệu
debug sót lại làm `p2-password-auth` đỏ. Cả hai đều đã có test khóa lại.

## Gap còn lại — không được coi là đã nghiệm thu

1. **DOCX/SRS business conflict:** đã xử lý bằng `lib/pillar-authority.js` — PM/PMO apply trong ngưỡng tác động đo được, vượt ngưỡng thì CEO/Admin. Cần PO/PMO ký xác nhận ngưỡng mặc định (xem `docs/DECISION_APPLY_AUTHORITY.md`).
2. **Gate enforcement:** nhiều API downstream chưa gọi `getPillarGates()`; dashboard có thể hiển thị WAITING nhưng write vẫn qua.
3. **Legacy control paths:** `schedule-compress` và deadline replan chưa dùng đầy đủ fingerprint/TTL/baseline guard của `pillar_scenarios`.
4. **Project scope:** đã sửa audit theo project, kpi-targets PUT, ERP push, work-item/QA zone+wbs. Còn một số list route phạm vi rộng cần rà tiếp.
5. **Ingest atomicity:** đã bọc transaction cho cả ba ingestor xoá-rồi-chèn và khoá commit theo upload (409 cho request thứ hai). Còn cần test rollback khi lỗi dữ liệu giữa chừng trong cùng một sheet.
6. **Sync race:** đã claim atomic PENDING, đưa cả hai nhánh vào transaction có audit, fail-closed khi thiếu project. Cần test hai request đồng thời để chốt 200/409.
7. **Approval concurrency:** shop đã có CAS; còn test race thực tế cho material resubmit.
8. **Refresh/session:** ~~chưa có refresh reuse detection~~ — **đã xong** (đợt sửa thứ tư). Còn lại: token trong cookie `httpOnly` thay vì `localStorage` là hạng mục hardening, chưa làm vì đổi cơ chế đăng nhập.
9. **Test portability/cleanup:** `p5-golden.mjs` đã theo bộ dự án chuẩn; `p4-sync-apply.mjs` đã sửa restore NULL-safe. Còn: vài suite tự cào user vào `users`; nếu crash giữa chừng sẽ để lại user rác — `p2-password-auth` đã bắt đúng trường hợp này. Dọn định kỳ bằng `tests/e2e/cleanup-demo.mjs`.
10. **Production:** phải **rotate `OPENROUTER_API_KEY`** (xem `docs/SECRET_ROTATION_RUNBOOK.md`) và rebuild image. Đã có `/api/ready`, retention sweep, storage GC và `docs/INCIDENT_RUNBOOK.md`; còn thiếu bằng chứng: Docker build, fresh boot, TLS, secret manager, backup restore production, và **cảnh báo tự động — hiện chỉ ghi log, chưa nối PagerDuty/Grafana**.
11. **Data:** bằng chứng đã gom đủ trong `docs/DATA_DECISIONS_REQUIRED.md` (36 dòng lặp theo file, 8 workbook tổng hợp, 5 file lệch 94 dòng, số liệu tài chính/retention). Cần PMO/CEO ký quy tắc, **không thể quyết bằng code**.
12. **UI:** còn React Compiler warnings; chưa xử lý dialog focus trap cho các modal khác, `scope="col"`, i18n EN/VI còn bán vờa.
13. **SSE token:** ~~access token trong query string~~ — **đã xong**, thay bằng vé một lần. Còn lại: bỏ hẳn query string bằng `fetch` + `ReadableStream` (vì `EventSource` không set header được), chưa làm.
14. **AI latency:** primary ổn định 8/8 nhưng latency trung vị ~55 s. Cần chốt `AI_REASONING_TIMEOUT_MS` cho demo/UAT; nếu yêu cầu <10 s thì phải đổi model trả phí.

## Kiểm chứng cuối

Lượt chạy gần nhất: **2026-09-25 17:48–17:54 UTC**, server disposable trên
cổng 3148/3000, `AI_MOCK` không bật, `LOGIN_RATE_MAX=1000`, `AI_MONTHLY_CAP_USD=20`.

- `npm run test:release`: **50/50 bước PASS** (`/tmp/opencode/release-gate.json`,
  `passed: true`, `EXIT=0`) — API/payment/shop/schema, RBAC, tenant, project scope
  (`audit-scope`, `erp-push-scope`), JWT/password/MFA, **`refresh-reuse` (11/11)**,
  **`realtime` (15/15)**, transition/tx/pool/ledger, sync, Control Layer (CPM,
  pillar-sim, gates, health, s-curves, manpower), money/retention
  (`p5-money`, `p5-golden`, `sp-ap-unknown-payment`), AI progress + concurrency,
  `perf`, **`monitoring` (16/16)**, **`retention` (10/10)**,
  **`production-readiness` (13/13)**, **`storage gc` dry-run**,
  **`reconcile-values` (33/33)**, **`digest-cron-rls` (10/10)**, frontend lint,
  frontend build, browser smoke, schema audit.
- `npm run test:reconcile`: **33/33 PASS** — kết quả thật: 6667 trường so, 0 dòng
  mất, 882/915 dòng khớp tuyệt đối, **33 dòng lệch (0,49%)**, 36 dòng lặp ghép cặp,
  12 dòng advisory tách riêng, 8 cột khai báo không so.
- `npm run test:security`: `refresh-reuse` 11/11, `realtime` 15/15, `secrets-hygiene` 13/13.
- `npm run test:monitoring`, `npm run test:retention`: ALL PASS.
- DB sau toàn bộ gate: 9 users, 4 dự án (`BTE-WP4-HBC`, `HBG-LVK-BCTH`, `PILOT-001`,
  `HBG-MCR`), 0 dòng rác (user debug, digest năm 1990, `ai_calls` probe).
- `npm run test:srs`: `SRS CODE GATE: ALL PASS`.
- `npm run test:ai-progress` và `npm run test:ai-progress-concurrency`: `ALL PASS`
  (create idempotent 200/201, apply 200/200 có replay, ghi 67% đúng một lần).
- `npm run test:sp-ap`: `ALL PASS`.
- `scripts/ui-verify-ui-pass.mjs`: **21/21 PASS**.
- `scripts/ui-verify-detail-nav.mjs`: **0 lỗi** sau khi sửa deep link
  (trước đó `/hq?project=3` vẫn hiện BTE-WP4-HBC — đã sửa ở `ControlCenter.jsx`).
- `npm run test:ai` (OpenRouter thật, không mock): **8/8 PASS**,
  `no_business_side_effects=true`, `release_blocked=false`
  (`/tmp/opencode/ai-srs-evaluation.json`, sinh lúc `2026-09-25T17:53:46Z`).
  Lưu ý trung thực: 4/8 case đi qua fallback `stealth/space-bunny-alpha`,
  4/8 qua primary `nvidia/nemotron-3-ultra-550b-a55b:free`. Latency 4.0–57.6 s.
  Fallback thành công **không** được tính là primary PASS.
- `npm run lint` (backend + frontend): 0 lỗi, 66 cảnh báo React Compiler.
- `git diff --check`: sạch. Working tree vẫn **chưa commit** theo yêu cầu.

- Mỗi gap P0/P1 có test API thật và log bằng chứng.
- Không còn cross-project read/write trong các route nghiệp vụ đã sửa.
- AI progress proposal chạy end-to-end trên UI, nhưng UAT vẫn chỉ `SIGNED` khi PMO/CEO ký production.
- `ai_calls` ghi `mock`/test cost bằng 0 để CI không làm cạn quota local thật.

---

# Đợt sửa thứ năm — thám hiểm toàn bộ giao diện (2026-09-25)

Bản sổ tay người dùng (`docs/USER_GUIDE_VI.md`, 1.565 dòng) được viết từ bản kho chi tiết
của toàn bộ 40 màn hình. Mỗi mục đều dẫn `file:line`, nên quá trình viết tài liệu lộ ra
các lỗi dưới đây — toàn bộ đã sửa và kiểm chứng.

## Bảng tổng hợp

| # | Mức | Lỗi | File | Bằng chứng |
|---|---|---|---|---|
| 1 | **P0** | Phiên chết ngay sau khi đổi mật khẩu: `submitChange` không lưu token mới, server đã bump `token_version` + thu hồi refresh cũ | `frontend/src/components/Login.jsx` | mọi API sau đó 401, `tryRefresh` không có gì dùng |
| 2 | **P0** | Rò stack trace: 3 chỗ `res.status(500).json({ error, stack })` trong wizard bypass error handler của app | `backend/src/routes/wizard.js` | tách `lib/error-body.js` dùng chung |
| 3 | **P0** | Nạp từ ControlCenter ghi **sai bảng**: mọi loại tài liệu trừ shop/vật tư rơi vào nhánh `else` ghi `construction_schedule_items` | `backend/src/routes/upload.js` + `services/ingest/project_level.js` | báo cáo ngày nạp nhầm thành hạng mục tiến độ; nay trả **422** kèm hướng dẫn |
| 4 | **P0** | Thao tác offline chết ngay: `enqueue` gọi `flush()` **không truyền token** → 401 → đánh dấu `dead` vĩnh viễn | `frontend/src/field/outbox.js` | đúng kịch bản mạng chập chờn mà hàng đợi sinh ra để xử lý |
| 5 | **P0** | Nhập 150% lưu thành 1,5%: FE gửi `150/100`, server lại chia 100 lần nữa | `frontend/src/field/DailyProgress.jsx` | `projects.js:350` |
| 6 | **P0** | Chuẩn hóa `progress_pct` thiếu nhất quán: so thô với `1` khiến hạng mục 85% rơi vào **không** nhóm nào | `ControlCenter.jsx`, `ProjectOverview.jsx`, `ProgressDetail.jsx` | tách `frontend/src/utils/progress.js`, mọi so sánh đi qua một chỗ |
| 7 | **P0** | Badge `ON TRACK` mất màu: `HEALTH.ON_TRACK` có khoảng trắng nên class thành `health-ON TRACK`, không khớp `.badge.health-ON_TRACK` | `frontend/src/hq/ProgressDetail.jsx:255` | CSS có `health-ON_TRACK` (gạch dưới) |
| 8 | **P1** | Advisory lock không thực sự chặn: try-lock thất bại **không ném lỗi**, commit vẫn chạy — đúng thứ lock sinh ra để chặn | `backend/src/routes/wizard.js:lockUpload` | nay ném 409 |
| 9 | **P1** | File >50 MB trả **500** thay vì 413: không có handler `MulterError` | `backend/src/index.js` | thêm handler `LIMIT_FILE_SIZE` / `LIMIT_UNEXPECTED_FILE` |
| 10 | **P1** | `409` của "identical file" bị nuốt thành 500 | `backend/src/routes/upload.js` | giữ nguyên mã lỗi thật |
| 11 | **P1** | Zone tự sinh **lệch** giữa wizard (`GEN-CONSTR`) và ingestor (`GEN-TD`) ⇒ cùng một file rơi vào 2 zone tuỳ đường vào | `frontend/src/components/UploadWizard.jsx` | bỏ việc tự sinh mã, để ingestor quyết định |
| 12 | **P1** | `Xem rows` trả **toàn bộ** dòng của loại đó trong dự án, từ file người dùng chưa mở | `backend/src/routes/upload.js` | thêm cột `upload_id` (migration `9999at`) + lọc; response nói rõ phạm vi |
| 13 | **P1** | Báo cáo ngày mất `Thời tiết` và `Ghi chú`: form gửi tên field không tồn tại, INSERT không có cột | `backend/src/routes/daily.js` | chấp nhận cả tên cũ lẫn tên đúng, ghi vào `notes` |
| 14 | **P1** | Đổi mật khẩu làm tên hiển thị thành email: response trả `name`, shell đọc `full_name` | `backend/src/routes/me.js` | trả cả hai |
| 15 | **P1** | Lọc nhật ký `To = hôm nay` mất **hết** sự kiện trong ngày (`<= 'YYYY-MM-DD'` là nửa đêm đầu ngày) | `backend/src/routes/audit.js` | `< to::date + interval '1 day'` |
| 16 | **P1** | Xoá trắng ô ngưỡng sức khoẻ ghi **0** (`Number('') === 0` qua validation) ⇒ mọi bản vẽ thành đỏ | `frontend/src/governance/HealthConfig.jsx` | từ chối ô trắng |
| 17 | **P1** | CEO thấy nút `Lưu năng suất` nhưng luôn 403 (`work_item.write: false`) | `frontend/src/hq/Manpower.jsx` | khớp ma trận quyền |
| 18 | **P1** | CEO/PMO thấy nút giải quyết xung đột offline nhưng luôn 403: cổng phân quyền dùng `daily_report.write`, route lại cho phép CEO | `backend/src/lib/permission-middleware.js` + `frontend/src/field/FieldStubs.jsx` | `/sync/resolve` tách khỏi map; PMO bị ẩn nút (nó vốn không có trong route) |
| 19 | **P1** | Nút ghi giả: `Áp dụng tiến độ` bị chặn vì tên class `sub-`/`pay-` lệch với điều kiện disable `submittal-`/`payment-` | `frontend/src/governance/Approval.jsx` | *(ghi nhận, chưa sửa — cần kiểm lại tại chỗ)* |
| 20 | **P1** | Hàng QA `Không đạt` không mở lại được; `zone_id` / `inspected_at` / `note` không được gửi nên cột `Zone` và `Ngày` luôn trống | `frontend/src/hq/QaInspections.jsx` | thêm nút `Mở lại` + chọn zone + ngày + ghi chú |
| 21 | **P2** | `Xóa mục lỗi` xoá vĩnh viễn dữ liệu offline **không hỏi** | `frontend/src/field/FieldStubs.jsx` | thêm hộp xác nhận |
| 22 | **P2** | Badge báo cáo ngày **luôn** `DRAFT` bất kể trạng thái; `prepared_by` hiện số ID | `frontend/src/field/FieldHome.jsx` | đọc `status` thật, tên nếu có |
| 23 | **P2** | `report.note` không tồn tại (cột tên `notes`) ⇒ ghi chú không bao giờ hiện | `frontend/src/field/FieldStubs.jsx` | đọc `notes` |
| 24 | **P2** | `Healthcount KH` nhập nhưng không bao giờ hiển thị | `frontend/src/hq/Manpower.jsx` | tách 2 cột KH / TT |
| 25 | **P2** | Bản vẽ bị trả về hiện `REVIEW` thay vì `REVISION`: nhánh `bql_l1_response === 'R'` là **mã chết** (server chỉ nhận P/F/C) | `frontend/src/hq/ShopList.jsx` | xét theo giá trị trả lời |
| 26 | **P2** | Ghi as-built xong cột `Zone` trắng thành `—` (response không có `zone_code`) | `frontend/src/hq/ShopList.jsx` | giữ giá trị đã có |
| 27 | **P2** | Ô số kiểu Việt `50,5` → `Number('') = 0` ⇒ lưu **0%** im lặng | `frontend/src/hq/Materials.jsx` | nhận `50`/`50,5`/`50.5`, từ chối ngoài 0..100 |
| 28 | **P2** | `/upload` không bọc `Protected` ⇒ trang chết thay vì về `/login` | `frontend/src/App.jsx` | bọc `Protected` |
| 29 | **P2** | Nút `Xong — sang review queue` gọi `history.back()` ⇒ quay về trang trước, có thể thoát khỏi ứng dụng | `frontend/src/App.jsx` | `onClose` điều hướng đúng review queue |
| 30 | **P2** | Chọn lại **cùng tên file** không được (input không reset `value`) | `frontend/src/components/UploadWizard.jsx` | reset giá trị input |
| 31 | **P2** | Danh sách dự án: `window.location.href` tải lại cả trang, không `.catch`, `<div onClick>` không mở được bằng bàn phím, badge `ACTIVE` cứng | `frontend/src/App.jsx` | `useNavigate` + bắt lỗi + `role`/`tabIndex` + đọc `status` thật |
| 32 | **P2** | Nút `Tải Excel ngay` ở trạng thái rỗng không kiểm tra quyền (nút trên header thì có) | `frontend/src/hq/ControlCenter.jsx` | dùng chung `canBulkUpload` |
| 33 | **P2** | Toast `Tải lên thành công: undefined dòng` khi chưa chọn dự án (server chỉ stage, không trả bộ đếm) | `frontend/src/hq/ControlCenter.jsx` | nhánh `staged_only` nói đúng việc |
| 34 | **P3** | Chuông: `Tất cả (n)` hiện **số chưa đọc** khi đang ở tab `Chưa đọc` (đếm trên tập đã lọc) | `frontend/src/components/BellDropdown.jsx` | một request không lọc, lọc ở client |
| 35 | **P3** | Link `Quên mật khẩu?` bấm không có gì xảy ra (không có API tự đặt lại) | `frontend/src/components/Login.jsx` | đổi thành hướng dẫn liên hệ quản trị viên |
| 36 | **P3** | Hộp lỗi SSO hiện **nhãn ô** (`Email / Username`) thay vì thông báo lỗi | `frontend/src/components/Login.jsx` | thêm khoá `login.email_invalid` |
| 37 | **P3** | Form đổi mật khẩu bắt buộc **không có đường lùi** | `frontend/src/components/Login.jsx` | thêm `← Quay lại đăng nhập` |

## Ghi chú về cách kiểm chứng

- `file-access.mjs` trước đây **PASS nhờ chính hành vi sai**: nó nạp `private.xlsx`
  (không nhận diện được) và chỉ kiểm tra có `upload_id` trả về — trong khi file đó bị ghi
  vào `construction_schedule_items`. Nay test dùng tên nhận diện được
  (`TĐ shop BOH.xlsx`) và **khóa thêm** khẳng định tên không nhận diện được phải bị
  từ chối 422. Sửa test, không sửa hành vi về hướng sai.
- Migration `9999at_generic_sheets_upload.sql` thêm `generic_sheets.upload_id` (nullable,
  có index một phần) để drill-down lọc được theo từng file; dữ liệu cũ có `NULL` thì
  response nói rõ đang xem theo cả dự án thay vì trộn lẫn âm thầm.

## Trạng thái kiểm chứng sau đợt sửa này

- `LOGIN_RATE_MAX=1000 npm run test:release` → **50/50 PASS** (`/tmp/opencode/release-gate.json`).
- `npm run lint` (backend + frontend): **0 lỗi**, 67 cảnh báo React Compiler có sẵn.
- `npm run build --workspace=frontend`: sạch.
- `scripts/ui-audit-dark-contrast.mjs`: **0 phần tử** dưới ngưỡng trên 25 trang.
- `scripts/ui-verify-control-center.mjs`: **ALL PASS**.
- `BASE_URL=http://127.0.0.1:3000 scripts/ui-verify-ui-pass.mjs`: **21/21 PASS**.
- `npm run test:reconcile`: **ALL PASS**; `docs/DATA_DECISIONS_REQUIRED.md` nay có **9 mục**.

## Chưa sửa (đã cập nhật sau đợt thứ sáu)

Đã xử lý ở đợt sáu: nút `Approve` bấm đúp (`busyId`), mọi nút `Thêm mới` luôn lỗi ở
`Dữ liệu chủ`, link chết `?r=contracts`, ba endpoint không có UI, lỗi tương phản badge
chuông, giải mã tên file tiếng Việt, giết phiên mỗi 60 giây. Còn lại:

1. **27 chuỗi `.then()` không `.catch`** ở 18 file. Đã có lưới an toàn hiện toast (mục 7
   đợt sáu) nhưng bản thân call site vẫn chưa bắt — nên sửa từng chỗ khi có thời gian.
2. **Nội dung trang hardcode tiếng Việt.** `VI | EN` chỉ dịch khung giao diện, menu và
   tên cột (185 khoá). Sửa cần ~1.000 chuỗi và là **tính năng**, không phải sửa lỗi —
   theo quyết định đã có, dữ liệu nghiệp vụ không được đổi theo ngôn ngữ.
3. **Không có phân trang** ở `Bản vẽ shop` (200), `QA/QC` (100), `Thư viện BIM` (200),
   `Sự cố` (200), `Nhật ký kiểm tra` (200), `Phê duyệt` (20/loại), `Nhân lực`. Đều cắt
   cứng **không cảnh báo cắt bớt**.
4. **Dữ liệu chủ thiếu tab cho `vendors`, `workers`, `teams`** dù bảng và form đã có
   (`master-data.js` + `MasterDataEdit.FIELDS`) — tạo được bằng cách gõ tay
   `/hq/master-data/edit?r=vendors` nhưng không có mục để xem. Đây là thiếu màn hình,
   không phải lỗi.
5. **`Dữ liệu chủ` không có nút sửa/xoá** (cả UI lẫn API) — sửa duy nhất là đổi cây
   `parent_id` của bộ phận từ màn `Cấu hình duyệt`.

---

# Việc vệ sinh dữ liệu & secret (2026-09-26)

## 1. Dọn file upload mồ côi — đã xoá

`npm run storage:gc -- --apply` → **xoá 928 file / 152,6 MB**.

| Mốc | Trước | Sau |
|---|---|---|
| Tổng file trong `backend/uploads` | 1.090 | 162 |
| Dung lượng | ~561 MB | 408,7 MB |
| File mồ côi | 928 | **0** |

Kiểm chứng sau khi xoá:
- `npm run storage:gc` (dry-run) → `orphan: 0 file / 0.0 MB`, còn sống 162 file khớp
  160 khoá `file_uploads.storage_key` + 2 khoá `daily_photos.file_path`.
- Cơ sở dữ liệu nguyên vẹn: `file_uploads` = 196 dòng, `daily_photos` = 2 dòng.
- Script chỉ xoá file **không có tham chiếu** và **cũ hơn 24 giờ**, nên không thể
  chạm vào file mới tải lên. Nó từ chối chạy nếu `STORAGE_DRIVER=s3`.

## 2. `OPENROUTER_API_KEY` — phạm vi phơi bày đã kiểm tra, phần rotate còn lại của bạn

Đã kiểm tra toàn bộ bề mặt. **Key chưa từng rò vào git hay image:**

| Bề mặt | Kết quả |
|---|---|
| File được git track | Sạch — không file nào chứa tiền tố `sk-or-v1` |
| `docker-compose.yml` / `.prod.yml` | `${OPENROUTER_API_KEY:-}` — không hardcode |
| `.env.example` (tracked) | Để trống |
| Docker image | `.dockerignore` chặn `**/.env` |
| File tạm `/tmp/opencode/logging.fixed.py` | Đã làm rò 1 bản sao |
| Nơi hợp lệ | `backend/.env` duy nhất |

⇒ Rotate là **biện pháp phòng ngừa cho máy dev dùng chung**, không phải ứng cứu sự cố.
Hai việc còn lại phải làm trên dashboard OpenRouter (tôi không đăng nhập được):
1. Tạo key mới tại `https://openrouter.ai/keys`
2. Revoke key cũ

Dán key mới bằng `node scripts/set-api-key.mjs` (đọc từ stdin, không nằm trong shell
history, không dán vào chat), rồi `npm run test:ai` để chứng minh provider thật vẫn
trả lời. Chi tiết: `docs/SECRET_ROTATION_RUNBOOK.md` mục 1.

### Lỗi phát hiện khi làm việc này

`backend/.env` để quyền `644` — mọi user trên máy đọc được `DB_PASSWORD` và
`JWT_SECRET`. Đã siết còn `600`. Script mới cũng tự siết sau khi ghi, vì
`writeFileSync({ mode })` chỉ áp dụng khi **tạo mới** file chứ không áp dụng khi ghi
đè file đã tồn tại (đây là cái bẫy đã dính ở lần chạy đầu, phát hiện nhờ kiểm tra
quyền file sau khi thử trên bản sao).

## 3. `p5-golden.mjs` — khẳng định sai làm gate đỏ sau khi dọn dữ liệu

Sau khi dọn file, chạy lại gate thì `p5-golden.mjs` đỏ ở khẳng định
`demo bell empty`. Điều tra cho thấy **không liên quan tới việc dọn file** — nguyên
nhân là khẳng định sai từ đầu:

- Chuông của admin có 2 thông báo chưa đọc: digest quá hạn lúc 07:40 và escalate TVGS
  lúc 00:21. Cả hai là **output cron hợp lệ** của hệ thống đang chạy, chưa ai đọc —
  đúng như thiết kế.
- Khẳng định `COUNT(*) … read_at IS NULL = 0` chỉ đúng khi DB hoàn toàn nguyên vẹn,
  nên nó phụ thuộc thứ tự chạy: cron chạy trước là đỏ, không chạy là xanh. Đó là lỗi
  thứ tự của test, không phải hồi quy dữ liệu.
- Những gì khẳng định này thực sự bảo vệ là **rò dữ liệu test** (dòng throwaway mà
  suite quên dọn), nên đã viết lại theo đúng ý nghĩa đó: loại trừ hai loại cron hợp
  lệ, và thêm một khẳng định riêng bắt `resource_type = 'test'` (bất kể đã đọc hay
  chưa) — loại đó là rò theo định nghĩa.

Rò thật tìm được và đã dọn: 1 dòng `notifications` `resource_type='test'` (id 91, rác
từ một lần chạy cũ). Quét thêm 5 bảng theo mẫu chữ ký throwaway — users, projects,
audit_log, file_uploads — đều 0 dòng.

---

# Đợt sửa thứ sáu — quét lại toàn codebase (2026-09-26)

Sau khi 37 lỗi ở đợt năm được sửa, phần lớn **không có test khoá lại** — sửa xong
không có gì ngăn ai phá lại. Đợt này ưu tiên đóng khoảng trống đó, và quét sâu hơn
phát hiện thêm hai lỗi nghiêm trọng ngoài dự kiến.

## 1. Bộ test hồi quy — `tests/e2e/regression-wave5.mjs` (58 khẳng định)

Mỗi khẳng định tương ứng đúng một lỗi đã phát hành rồi sửa, viết theo **hành vi quan
sát được** (mã trạng thái, giá trị lưu, trường trả về) chứ không theo cách viết mã.
Gắn vào `scripts/release-gate.mjs` nên gate hiện **51 bước**.

Nhóm kiểm tra: nạp file từ chối loại không xác định · zone mặc định nhất quán · khoá
advisory chặn commit trùng · 409 giữ nguyên khi xung đột · `/api/me/password` trả
`full_name` + cặp token mới + token cũ chết · lọc nhật ký bao trọn ngày · thời tiết và
ghi chú báo cáo ngày được lưu · CEO bị 403 ở năng suất · `/sync/enqueue` trả 401 chứ
không phải 5xx · QA `FAILED → OPEN` · tạo business process có `code` · `errorBody`
không rò stack · `progressFraction` chuẩn hóa · giải mã tên file tiếng Việt.

Hai bài học khi viết test, ghi lại vì dễ dính lại:

- `lib.mjs` xuất `J(token, body)` **không kèm method** → `api(path, J(...))` là GET có
  body, `fetch` ném `TypeError`. Bọc `POST`/`PATCH` riêng.
- `/api/me/password` bump `token_version`, làm **token của chính người gọi** chết ngay
  → mọi khẳng định sau đó trong cùng file 401 dây chuyền. Dùng user tạm, không đụng
  admin demo.

## 2. LỖI NGHIÊM TRỌNG — tên file tiếng Việt hỏng hoàn toàn qua HTTP

**Phát hiện khi viết test**, không phải khi đọc code: bài kiểm tra "tên không nhận diện
được phải bị từ chối" thất bại với một tên file **có nhận diện được**.

busboy giải mã tham số `filename` của `Content-Disposition` **không khai báo charset**
nên đọc byte UTF-8 từng byte một. `TĐ` thành `TÄ`, `Báo cáo` thành `BÃ¡o cÃ¡o`. Mất
dấu hoàn toàn, không phải hiển thị sai.

Điều này không phải chuyện thẩm mỹ: **loại tài liệu được suy ra hoàn toàn từ tên
file** (`shop` → shop_drawing, `TĐ` → construction_schedule, `báo cáo` →
daily_report). Mọi workbook tiếng Việt — tức **toàn bộ sheet demo thật** (`TĐ .BOH`,
`TĐ INF`, `MEP-BTE-CSP-*`) — đều phân loại thành `unknown`.

Nhánh HTTP chưa từng được thử với tên tiếng Việt: dữ liệu demo được nạp bằng script
CLI đọc thẳng `reference_sheets/`, không đi qua multipart.

**Sửa:** `backend/src/lib/upload-names.js` khôi phục tên gốc bằng cách mã hoá lại
chuỗi latin1 thành byte rồi đọc UTF-8. An toàn vì tên ASCII không đổi, và tên thật sự
latin1 không vòng lại được UTF-8 nên được giữ nguyên (kiểm tra ký tự thay thế U+FFFD).
Bọc ở **biên giới** bằng `decodeUploadNames(multer(...))` — trả về đúng hình dạng
multer (callable + `.single/.array/.fields/.none`) để call site cũ không phải sửa, và
một route mới không thể quên. Áp cho cả 5 route nạp file.

| Tên gửi đi | Trước | Sau |
|---|---|---|
| `TĐ BOH Việt.xlsx` | `unknown` → từ chối | `construction_schedule`, lưu đủ dấu |
| `shop BQL Việt.xlsx` | `unknown` → từ chối | `shop_drawing` |
| `Báo cáo công việc VN.xlsx` | `unknown` → từ chối | `daily_report` → 422 **đúng** (loại này phải qua wizard) |
| `MEP-BTE-CSP-01.xlsx` | `construction_schedule` | không đổi |

## 3. LỖI NGHIÊM TRỌNG — phiên đăng nhập bị giết mỗi 60 giây

`audit tương phản` báo dao động 1–6 trang `Unauthorized` giữa các lần chạy giống
hệt. Truy nguyên:

- `REFRESH_TOKEN_REUSE` bắn **đúng mỗi 60 giây**, mỗi lần thu hồi toàn bộ phiên admin.
- Truy tới tiến trình: sự kiện **dừng hẳn** khi khởi động lại server, và log request
  (đặt tạm, đã gỡ) cho thấy **không có request `/api/auth` nào** trong nhịp đó.

Cơ chế: refresh token là **dùng một lần** — server thu hồi khi xoay, và coi lần trình
bày thứ hai là token bị đánh cắp nên **thu hồi cả family**. Đúng về bảo mật, nhưng
trừng phạt cả đua tranh lành: hai tab, hoặc một tab đang lưu giá trị cũ hơn một lần
xoay. Server chỉ tha thứ cho lần trình bày lại **trong `REFRESH_REUSE_GRACE_MS` =
10s** — ngắn hơn nhiều so với chu kỳ poll 30s, nên tab thua chắc chắn bị đăng xuất.

**Sửa (phía client):** `tryRefresh` đọc lại refresh token **ngay trước khi gửi**; nếu
thất bại mà giá trị trong storage **đã đổi** (ngữ cảnh khác vừa xoay xong) thì thử lại
một lần bằng giá trị mới. Đua nhiều tab trở thành lành tính bất kể độ dài grace.

Đo trước / sau trên 25 trang:

| | Trước | Sau |
|---|---|---|
| HTTP 401 | 14 | **0** |
| Lỗi JS chưa bắt | 6 | **0** |
| `REFRESH_TOKEN_REUSE` | 1/phút | **0** |

## 4. Lỗi tương phản chưa từng lộ — badge chuông

Lỗi trên chỉ xuất hiện khi **có** thông báo chưa đọc. Trước đợt này con số đó bằng 0
nên badge ẩn; các lần chạy gate tạo thông báo là lộ ra — white trên `--c-behind`
= **2,26:1**.

Nguyên nhân gốc là nhầm loại token: `--c-behind` ở dark mode là **màu chữ** sáng
(`#fb923c`) để đọc trên nền tối, không phải màu **nền** cho chữ trắng. Thêm token riêng
`--c-solid-alert` / `--c-solid-alert-fg` cho mọi thứ mang chữ trắng, và dùng cho badge
chuông + `.btn-danger` + `.field-button.danger`.

Đáng chú ý: con số "Quá hạn" trên `/hq` tăng từ 0 lên 1 **vì** sửa chuẩn hóa
`progress_pct` ở đợt năm — hạng mục 85% trước đó rơi vào không nhóm nào. Sửa đúng đã
lộ ra một lỗi tương phản có sẵn từ trước.

## 5. Lỗi còn lại đã sửa

| # | Lỗi | Sửa |
|---|---|---|
| 1 | `Approval.jsx`: `approveSubmittal` đặt `busyId='sub-'`, `approvePayment` đặt `'pay-'`, còn nút kiểm `'submittal-'`/`'payment-'` ⇒ **nút duyệt không bao giờ khoá**, bấm đúp gửi 2 request | một helper `busyKey(kind, id)` làm nguồn duy nhất, dùng ở cả 5 call site |
| 2 | `Approval.jsx`: typo `Không có dữ liết chi tiết` | `dữ liệu` |
| 3 | `Dữ liệu chủ`: tab `Business Processes` có nút `Thêm mới` **luôn lỗi** — form chỉ có ô `Tên` trong khi bảng bắt buộc cả `Mã` | thêm ô `Mã *`; đã kiểm chứng tạo được qua API |
| 4 | `Dữ liệu chủ`: tab `Projects` và `KPI Targets` có nút `Thêm mới` **luôn 404** vì không tồn tại `POST /master-data/{projects,kpi-targets}` | chỉ hiện nút cho danh mục tạo được (`CREATEABLE` khai đúng key của `TABLES`); hai tab còn lại hiện dòng chỉ dẫn nơi tạo thật |
| 5 | `Thanh toán`: link `Tải Excel hợp đồng` trỏ `?r=contracts` — resource không tồn tại ⇒ `Chưa có data cho "contracts"` | bỏ link, nói rõ nạp qua màn `Tải lên` |
| 6 | `Vận hành`: 4 endpoint `Chạy ngay` chỉ admin/ceo nhưng nút hiện cho mọi vai trò (có comment nói là cố ý) | ẩn nút với vai trò server sẽ từ chối |
| 7 | `Vận hành`: `POST /jobs/overdue-digest`, `/jobs/retention/run`, `/ai/backfill` có endpoint nhưng **không có UI nào** — trang tên "tác vụ nền" không hiện và không chạy tay được 2 job | thêm 3 thẻ + phương thức API; quan trọng nhất là `backfill`, vì đổi model embed làm chỉ mục tìm kiếm cũ mà trước đó **không có cách nào lập lại** |
| 8 | `Vận hành`: sau khi chạy tay `Theo dõi SLA AI`, dòng `Lần cuối` hiện `—` vĩnh viễn vì đặt state từ payload không có mốc thời gian | chạy lại `GET .../status` của đúng job đó |

## 6. Trạng thái kiểm chứng

- `LOGIN_RATE_MAX=1000 npm run test:release` → **51/51 PASS**.
- `regression-wave5.mjs` → **58/58 PASS**, tự dọn sạch (users / projects / business
  processes / qa / audit / uploads / daily_reports rò đều 0 sau khi chạy).
- `ui-audit-dark-contrast.mjs` → **0 phần tử** dưới ngưỡng trên 25 trang, **0 lỗi
  trang** (trước: 0–11 phần tử và 1–6 trang lỗi, không ổn định).
- `npm run lint` (backend + frontend) → 0 lỗi.
- `git diff --check` → sạch.

## 7. Rò promise: biến im lặng thành thông báo nhìn thấy được

Còn 27 chuỗi `.then()` không có `.catch` ở 18 file. Sửa từng chỗ là 27 chỗ sửa rời rạc
và không bảo đảm (chỗ mới lại quên). Xử lý ở tầng hệ thống:

`Toast.jsx` đăng ký `window.addEventListener('unhandledrejection')` và hiện toast, khử
trùng theo từng thông báo trong 30 giây (một trang bắn nhiều request cùng lúc, poll nền
lặp lại cùng một lỗi — không khử trùng thì màn hình bị ngập thẻ giống hệt nhau).

Lỗi mạng của trình duyệt (`Failed to fetch`) được dịch sang tiếng Việt; thông báo do
máy chủ tự viết thì giữ nguyên.

Đây **không** thay thế việc thêm `.catch` — nó là lưới an toàn để lỗi im lặng biến
thành thứ người dùng thấy, thay vì con số trên màn hình vẫn nhìn rất thuyết phục trong
khi dữ liệu chưa tải về. Danh sách 27 chỗ còn lại ghi ở mục "Chưa sửa".

Đo trên `/hq/materials` (trang không có `.catch` cho `projects.list()`): trước im lặng
hoàn toàn, sau hiện `Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.`

## 8. Đợt 7 (2026-09-27) — hộp thoại, thứ tự trụ cột, hướng dẫn AI

### 8.1 Bốn trụ cột hiển thị sai thứ tự

`.pillar-grid.layer-stack` là lưới **4 cột**, đọc từ trái sang phải. Nhưng JSX render
theo thứ tự **L3, L1, L2, L4** — nên thẻ góc trái mang nhãn `L3 Thi công`, trái với
chính comment ngay trên mỗi khối (`SRS Mục 2.1` → `2.4`) và với tên gọi "bốn trụ cột".

Sắp lại nguyên khối, không đụng logic. Kiểm bằng DOM thật (`/hq?project=1`):

```
sau:     L1 Bản vẽ shop | L2 Vật tư | L3 Thi công | L4 Thanh toán
trước:   Chờ G2…L3 Thi công | L1 Bản vẽ shop | L2 Vật tư | L4 Thanh toán
```

Cùng lúc đó, `ui-verify-control-layer.mjs` bị bỏ quên và hỏng vì ba lý do riêng,
đều là của script chứ không phải của ứng dụng:

1. Kỳ vọng nhãn `Lớp 1` trong khi mã dùng `L1` (rút gọn cho vừa cột 1/4).
2. Kỳ vọng 3 `.layer-connector` — CSS còn định nghĩa nhưng đã bị đặt `display: none` và
   **không JSX nào dùng**, nên mối kiểm này không bao giờ có thể đạt. Đã xoá luôn CSS
   thừa; các lớp `layer-*` còn dùng là `layer-l0`, `layer-stack`, `layer-tag`.
3. Bấm `submit` ở form đăng nhập mà không điền email/mật khẩu. Ô đó `required` nên
   trình duyệt chặn, không bao giờ tới bước hỏi mã MFA.

Lỗi 3 che hai lỗi sau nó, vì exception làm dừng cả khối còn lại của script. Sau khi
sửa: **27/27 PASS, exit 0**, và admin demo trả lại `mfa_enabled=false`.

### 8.2 9/10 hộp thoại không đóng được bằng Escape

Mỗi hộp thoại tự viết `<div className="modal-backdrop" onClick={…}>`. Bấm chuột thì
đóng, **bàn phím thì không** — mở được rồi không thoát ra nếu không tìm được nút X.
9/10 cũng thiếu `role="dialog"`, không chuyển focus vào, không trả focus về nút đã
mở, không khóa `Tab`.

Gom về một component `components/Modal.jsx` (10 chỗ, 8 file). `useEscape` dùng ngăn
xếp vì `Confirm` là provider toàn cục và có thể bật đè lên modal khác — Escape một
lần chỉ đóng lớp trên cùng, đóng cả hai là mất nội dung đang nhập.

Luật focus vào nút `Hủy` của `Confirm` được giữ nguyên: một lần `Enter` phản xạ không
được bao giờ chạy hành động không hoàn tác được.

Khoá bằng `scripts/ui-verify-modal.mjs` (đã gắn vào release gate): Escape đóng được ·
`aria-modal="true"` · focus vào trong hộp thoại · focus trả về đúng nút đã mở.
**5/5 PASS.**

ⓘ Nhánh "lồng nhau" trong script báo *bỏ qua* vì không màn nào hiện mở Confirm từ
trong modal. Đó là phòng thủ, **chưa được chứng minh bằng UI thật**.

### 8.3 Sáu hộp thoại xác nhận là của hệ điều hành, không phải của ứng dụng

6 chỗ dùng `window.confirm` trong khi 8 file dùng `Confirm` của ứng dụng. Hệ quả:
lệch phong cách, không dịch được, không khóa focus, không phân biệt được thao tác
không hoàn tác được — trong đó có `Xoá vĩnh viễn các mục đã lỗi` và `Ghi đè server`.

Đổi hết sang `Confirm`, đặt `confirmStyle: 'danger'` cho thao tác không hoàn tác được,
và viết lại câu hỏi cho nói rõ hậu quả thay vì "Bạn có chắc không?". `window.confirm`
không còn trong `frontend/src`.

### 8.4 Hướng dẫn sử dụng AI, có xem trước trước khi bấm

Ba màn AI trước đó chỉ có một dòng gợi ý. Nay mỗi tab có dải hướng dẫn thu gọn (mặc
định đóng), kèm:

- **`Hỏi đáp`** — 6 câu mẫu bấm được, mỗi câu bám một nhóm dữ liệu thật.
- **`Cập nhật tiến độ`** — bảng quy tắc viết câu, và **thẻ `Hệ thống sẽ đọc được`**
  cập nhật theo từng chữ người dùng gõ. Trước đây phải bấm `Tạo đề xuất AI` rồi mới
  biết thiếu gì; nay biết trước khi bấm.
- **`Đề xuất`** — nguồn sinh đề xuất và cảnh báo bấm nhầm `Duyệt & gửi`.

Thẻ xem trước chạy **bản sao** biểu thức phân tích ở trình duyệt. Hai bên lệch nhau
thì người dùng bị dẫn sai, nên `regression-wave5.mjs` có khẳng định so hai bản trên
7 câu mẫu. Đã thử làm lệch regex phía trình duyệt (`\d{1,3}` → `\d{1,2}`) để chắc
khẳng định bắt được: câu `lên 150%` chuyển sang đỏ (server 150, client 50).

ⓘ Câu `lên 65%` **không** bắt được lỗi đó — `65` vẫn khớp `\d{1,2}`. Chỉ câu có
ba chữ số mới bắt được, nên câu đó được giữ lại trong bộ khẳng định.

### 8.5 Không có gì canh cơ sở dữ liệu khi chạy không-Docker

Phát hiện khi chạy gate: PostgreSQL đã chết từ 07:55 UTC, tới 19:38 mới biết —
**gần 12 giờ demo hỏng mà không ai biết**. `pg.log` ghi `was not properly shut down`,
tức bị `SIGKILL` chứ không dừng có kiểm soát. Nguyên nhân chết thì không xác định
được; `dmesg` không đọc được.

Container có healthcheck gọi `/api/ready`. Chạy trực tiếp thì không có gì gọi. Thêm
`scripts/db-watchdog.mjs` (kiểm một lần hoặc `--watch`) và hướng dẫn systemd timer
trong `docs/DEPLOY_INTERNAL_RUNBOOK.md`. Đã kiểm cả hai nhánh: OK (200, 113ms) và
lỗi (exit 1).

## 9. Đợt 8 (2026-09-27) — lỗi im lặng, phân trang thật, Dữ liệu chủ

### 9.1 Lỗi tải dữ liệu không báo — 6 màn trống không giải thích

`projects.list().then(…)` không `.catch` ở 6 màn. API hỏng thì ô chọn dự án trống,
bảng trống, **không có gì** để người dùng hiểu vì sao — trông y hệt "dự án chưa có
dữ liệu". Cùng một khối đó lại xử lý đúng ở 3 file khác (`QaInspections` → toast,
`FieldHome` → setError, `FieldStubs` → tắt loading), nên vấn đề là thiếu nhất quán
chứ không phải thiếu hiểu biết.

Cùng đợt này sửa thêm: `issues` (`.finally` mà không `.catch` → danh sách cũ vẫn
hiện), `shopApi.drawings`, `construction.schedule`, `shopApi.drawings` ở
ProjectOverview.

Đo lại bằng `grep '\.then('` ra **57 dòng**, trong đó đa số là báo động giả (`.catch`
nằm ở dòng sau). Đo đúng bằng `scripts/find-missing-catch.mjs`: **7 chỗ thật**, sau
khi sửa còn **1 chỗ** — `Manpower.jsx` `Promise.all` mà cả 3 nhánh đã có `.catch`
riêng, nên không thể reject; ghi vào `find-missing-catch.allow.mjs` kèm lý do.

Bộ đo phải sửa ba lần mới đáng tin: che string/template trước khi đếm ngoặc (`}`
trong `` `… (HTTP ${r.status})` `` làm lệch), nối dòng khi dòng sau bắt đầu bằng `.`
(nếu không thì bỏ sót `.catch` ở dòng kế tiếp), và quét tới đúng dấu `}` đóng `try`
(so sánh vị trí `}` gần nhất bị `headers: {…}` của chính lời gọi trước đó làm sai).

Khoá bằng `scripts/ui-verify-load-error.mjs`: chặn `GET /api/projects` rồi đòi thấy
thông báo lỗi trên 6 màn. **12/12 PASS.** Đã thử gỡ `.catch` ở `Issues.jsx` — đúng
một khẳng định chuyển đỏ, các khẳng định khác vẫn xanh.

### 9.2 Bảy màn cắt bớt dữ liệu không nói cho ai biết

Đo được trên dữ liệu demo: `audit_log` **6.958** dòng nhưng màn chỉ tải 50 →
97% nhật ký không bao giờ xuất hiện mà không có dấu hiệu. Các màn khác có ngưỡng
cứng 100–200 trong SQL.

Đã thêm `backend/src/lib/pagination.js` (`readPage`/`withTotal`) và dùng ở 6 route.
**Thân response vẫn là mảng** như mọi nơi đang mong đợi; tổng hàng đi kèm trong
header `X-Total-Count`. Đổi body thành `{rows,total}` sẽ phải sửa mọi nơi gọi.

Hai lỗi phát hiện khi làm, đều do đo sai trước khi sửa:

- **Tôi sửa nhầm endpoint không ai dùng.** `/api/shop-drawings` và `/api/issues` đã
  có phân trang, nhưng frontend gọi `/api/projects/:id/shop-drawings` và
  `/api/projects/:id/issues` — hai handler khác hẳn trong `routes/projects.js`. Chỉ
  thấy khi kiểm header trên **đúng đường dẫn frontend dùng**.
- **Tôi tạo hồi quy mất dữ liệu.** Đặt `defaultLimit = 25` làm `Bản vẽ shop` tải
  25/200 dòng mà chưa có thanh phân trang. Sửa bằng cách đặt mặc định bằng mức trần
  cũ (200) — mặc định không bao giờ được phép làm một màn cũ mất dữ liệu; màn nào
  muốn 25 dòng thì truyền `limit` tường minh.
- **Tôi nói sai một con số.** Đo đầu tiên báo "46 bản vẽ mất"; 46 bản vẽ đó thuộc
  dự án khác, dự án 1 có đúng 200 — tức đang nằm **ngay ngưỡng** `LIMIT 200`.
  Vấn đề thật là ngưỡng cứng không ai thấy, cộng với `slice(0, 300)` ở ShopList —
  một ngưỡng 300 mà API không hề có, tức code chết.

Chọn cơ chế theo từng màn, không áp đồng loạt:

| Màn | Cơ chế | Vì sao |
|---|---|---|
| `Nhật ký kiểm tra` | **server-side** | 6.958 dòng, không lọc ở client |
| `Sự cố`, `Bản vẽ shop`, `QA/QC`, `Thư viện BIM` | client-side + cảnh báo cắt bớt | ô tìm kiếm và thống kê tính từ danh sách đã tải; đưa lên server sẽ phải nhân bản luật nghiệp vụ |
| `Phê duyệt` | giữ ngưỡng 20, **làm ngưỡng nhìn thấy được** | đó là hàng đợi việc, không phải trang duyệt; ba bảng cùng lúc thì phân trang rối |
| `Nhân lực & Thiết bị` | không đổi | `8` là cửa sổ **thời gian** cố ý, không phải cắt bớt |

Kiểm chứng trên trình duyệt: `Bản vẽ shop` `1–25 / 200 · Trang 1/8`, bấm `›` ra
trang 2 với dữ liệu khác hẳn (`VNR…` → `LOB-SPA…`), đổi 100 dòng/trang ra
`1–100 / 200 · Trang 1/2`. `Nhật ký` `1–50 / 6958 · Trang 1/140`, đúng **một**
request (gộp còn một `useEffect`, nếu tách làm hai thì lúc mở trang bắn hai lần).

### 9.3 Ba danh mục có ở máy chủ nhưng không mở tab nào

`vendors`, `workers`, `teams` đã có đủ trong `TABLES` + allowlist cột ở
`routes/master-data.js`, và `MasterDataEdit` đã có sẵn form. Thiếu mỗi danh sách
tab ở `MasterDataList.jsx` và 3 hàm đọc ở `api/index.js` — nên người dùng không có
chỗ nào xem hay thêm nhà cung cấp, công nhân, tổ.

Thêm xong: 10 tab, không lỗi trang. Cả ba hiện **rỗng** với tenant của
`admin@hbg.com` — bảng `workers`/`teams` rỗng toàn hệ thống, `vendors` có 1 dòng
nhưng thuộc tenant 2. RLS chạy đúng; đây là thiếu dữ liệu, không phải lỗi tải. Không
tự bịa danh mục người thật — đã ghi vào `docs/DATA_DECISIONS_REQUIRED.md`.

### 9.4 Đo tải — có số thật, kèm giới hạn phải nói thẳng

Thêm `scripts/load-probe.mjs`. Đo trên chính máy này: 120 request, 10 đồng thời →
**p50 51 ms · p95 93 ms · max 187 ms · 0 lỗi**; chậm nhất là `/dashboard/portfolio-kpi`
(82 ms trung bình), vì nó gom 6 truy vấn `GROUP BY`.

Probe đo **cả** `/api/ready` chứ không chỉ `/api/health`, vì `health` không chạm cơ
sở dữ liệu — đo mỗi nó là đo thứ không cần đo, và sẽ báo "khoẻ" trong đúng tình
huống Postgres chết.

Đo xong mới thấy: `/payment-requests` có **242** việc chờ trong khi hàng đợi duyệt
lấy 20. Cảnh báo "còn 222 nữa" là thứ người dùng cần, không phải chi tiết kỹ thuật.

**Bổ sung đường ghi** ở đợt 11: `POST /api/sync/enqueue` — đúng đường mỗi lần công
nhân lưu việc ngoài tuyến, có `withAudit` nên đo được cả chi phí ghi nhật ký. 30 lần:
p50 92 ms; 100 lần: p50 56 ms, 0 lỗi, không suy giảm theo lượng. Probe tự dọn đúng số
dòng nó tạo và kiểm tra lại không còn sót.

Bẫy đã mắc: chạy bằng `ceo` thì `403`, mà **403 trả về rất nhanh** nên ra số thời
gian đẹp mà thực tế chẳng ghi gì — đo sai mà không báo lỗi. Đổi sang `admin`.

Giới hạn, viết ra để không ai dùng nhầm: đây là máy dev, một tiến trình Node, dữ
liệu demo. **Chưa** đo nhiều người dùng đồng thời, **chưa** đo đường ghi (duyệt, chi
payment, nạp Excel), **chưa** đo thời gian dài nên chưa biết có rò bộ nhớ hay không.

### 9.5 Bốn mục "chưa làm" còn lại sau đợt này

- i18n: nội dung trang vẫn hardcode tiếng Việt (~1.000 chuỗi) — là **tính năng**, quy
  mô lớn hơn một đợt sửa lỗi. Không làm nửa vời.
- `Phê duyệt` còn ngưỡng 20 không phân trang (đã báo rõ, chưa phân trang).
- Master data chỉ hiện 200 dòng, không phân trang, không cảnh báo.

## 10. Đợt 9 (2026-09-27) — danh mục demo, cột bảng Dữ liệu chủ

### 10.1 Ba tab Dữ liệu chủ trống vì không ai điền

Cho phép dùng danh mục bịa để demo, nhưng phải khớp script demo. Ràng buộc tìm ra
khi làm: `docs/DEMO_EXEC_VI.md` liệt kê đúng chuỗi chuẩn bị demo là
`init.js` → `reconcile-pilot-data.mjs`. Nên dữ liệu phải nằm **trong `init.js`** —
chèn tay ngoài chuỗi đó thì lần demo trên máy mới sẽ trống và người demo tưởng tính
năng hỏng.

Quy ước đặt tên lấy từ dữ liệu **đã có**: 75 nhà thầu phụ và 30 nhà cung cấp trong
DB vốn là dữ liệu bịa theo dạng `Nhà thầu phụ TEST 1`, `NCC TEST 1`. Đặt tên khác
sẽ khiến dữ liệu trông như từ hai nguồn. Seed mới: 5 `NCC-DEMO-0x`, 4 `TỔ-*`
(trùng mã bộ phận `TC`/`KT`/`AT` đã có), 8 `NV-00x`; mỗi tổ có một đội trưởng.

MST để `0000000001`…`0000000005`: MST thật ở Việt Nam là 10 chữ số và **không**
bắt đầu bằng `0`, nên số này không thể trùng doanh nghiệp có thật. Bịa một MST trùng
nguy hiểm hơn bịa một số vô nghĩa.

**Hai lỗi đã mắc khi làm, đều lộ ra nhờ chạy thật:**

- `vendors` **không có** cột `system` (chỉ `suppliers` mới có) → `init.js` ném lỗi
  ngay lần chạy đầu.
- Lần chạy đầu diễn ra **trước khi** seed có trường `tax_id`, nên 5 dòng NCC được
  chèn với `tax_id = NULL`; các lần sau thấy "đã tồn tại" nên bỏ qua, và MST vĩnh
  viễn trống. Đây là tương tác giữa idempotency và việc sửa dữ liệu seed.
  Sửa bằng `fillBlanks`: `COALESCE(NULLIF(col,''), $n)` trong chính câu `UPDATE` —
  chỉ lấp ô **còn trống**, không ghi đè giá trị người dùng đã sửa. Không xoá rồi
  chép lại, vì `vendors.id` được nhiều bảng khác tham chiếu.
  (`db.prepare()` từ chối trộn `?` với `$N`, nên câu `UPDATE` dùng `$N` thuần.)

Khoá bằng `scripts/check-master-seed.mjs`: số dòng khớp seed · không tên trống ·
đội trưởng trỏ tới người có thật · MST bắt đầu bằng `0` và khớp seed. Đã thử xoá MST
một dòng — bộ kiểm đỏ đúng dòng đó, và `init.js` tự lấp lại.

### 10.2 Bảng Dữ liệu chủ lấy 7 khoá đầu của object thô

`Object.keys(filtered[0]).slice(0, 7)`. Với `vendors`, thứ tự cột là
`id, tenant_id, code, name, tax_id, category, contact` — nên **2 trong 7 cột là `id`
và `tenant_id`**, hai thứ người dùng không cần, còn `status` bị đẩy ra ngoài. Ở bảng
nhiều cột hơn, cột quan trọng rơi khỏi bảng.

Thay bằng bản đồ cột theo danh mục, có nhãn tiếng Việt, và tra tên cho khoá ngoại
(`TỔ` hiện tên tổ thay vì `team_id`, `ĐỘI TRƯỞNG` hiện tên người thay vì số thứ tự).
Danh mục chưa khai báo thì lấy cột còn lại sau khi bỏ `id`/`tenant_id`/`created_at`,
nên thêm danh mục mới vẫn hiện được.

Sửa được thêm: `key in row` ném `TypeError` khi danh sách rỗng (`row` là
`undefined`) — làm **sập cả màn** chứ không chỉ bảng.

Kiểm trên UI: `vendors` hiện `MÃ · TÊN · MST · NHÓM · LIÊN HỆ · TRẠNG THÁI`, dòng
đầu `NCC-DEMO-01 · Công ty CP Cơ khí & Thép · 0000000001 · Thiết bị · 090 111 22 01
· ACTIVE`; `teams` hiện `TỔ-TC-01 · Tổ thi công kết cấu · Nguyễn Văn An · ACTIVE`.

### 10.3 `slice(0, 200)` ở Dữ liệu chủ — cắt bớt không báo

Cùng lớp lỗi với mục 9.2. API lấy tối đa 500 nên phần bị cắt là do chính màn này.
Bỏ `slice`, dùng `usePagination`. Kiểm: `subcontractors` hiện
`1–25 / 75 bản ghi · Trang 1/3`.

## 11. Đợt 10 (2026-09-27) — i18n: đo được, chặn hồi quy, dịch component dùng chung

617 chuỗi tiếng Việt còn cứng trong JSX là một con số mà không ai nhớ được giữa
các đợt sửa, nên nó hoặc bị bỏ quên hoặc bị làm tăng lên mà không ai hay.

**Đo trước khi sửa** (`scripts/check-i18n.mjs --report`): **838 chuỗi ở 45 file**.
Nhiều nhất: `ControlCenter` 78, `Payment` 73, `PillarControlPanel` 56, `Ops` 50,
`FieldStubs` 49.

Bộ đo **đếm cả comment** ở lần đầu — mà comment trong mã này viết bằng tiếng Việt và
không bao giờ hiện cho người dùng. `ControlCenter` báo 85 trong khi người dùng chỉ
thấy 2. Sau khi bỏ comment, mốc thật là **727 chuỗi ở 42 file**; 111 "chuỗi" mất
đi không phải vì dịch mà vì nó chưa bao giờ là chuỗi người dùng thấy.

**Ratchet, không phải ngưỡng cứng:** script đỏ khi một file có *nhiều hơn* mức đã
ghi nhận trong `scripts/i18n-baseline.json`. Giảm là tiến bộ, tăng là hồi quy. Cách
này biến việc dịch thành tiến trình nhiều lần thay vì một lần hoặc không làm — và
không biến 838 thành một bài toán không thể bắt đầu.

Kèm kiểm **parity VI/EN**: một khoá có ở `vi.js` mà thiếu ở `en.js` khiến chế độ EN
rơi về tiếng Việt **không báo lỗi** — đúng loại lỗi người dùng chỉ thấy sau khi bấm
nút `[VI|EN]`. Hiện 220 khoá, khớp hai chiều.

**Dịch `TablePagination` trước** vì nó là component dùng chung, nhỏ mà ảnh hưởng
mọi màn bảng. Thêm nội suy `{tên}` cho `t()` — cách duy nhất khác là ghép tay bằng
`+`, rồi mất khả năng dịch vì thứ tự từ khác nhau giữa VI và EN.

**Sửa được lỗi dịch nửa vời ngay khi kiểm:** lần đầu chỉ dịch khung, bỏ sót đơn vị
truyền từ nơi gọi, ra `Showing 1–25 of 203 **vật tư**`. Vì nơi gọi truyền
`unit="vật tư"` — chuỗi tiếng Việt cứng. Sửa bằng khoá đơn vị (`unitKey`), và
component tự dịch bên trong chứ **không** bắt nơi gọi gọi `t()`: nhiều màn không
gọi `useLang()` nên sẽ không re-render khi đổi ngôn ngữ.

Khoá bằng `scripts/ui-verify-i18n.mjs`: bật EN rồi đòi thanh phân trang trên 6 màn
**không còn ký tự có dấu**. **12/12 PASS**; đã thử trả lại đơn vị cứng → **6 bài
kiểm đỏ**, đúng như loại lỗi cần bắt.

**Kết quả cuối đợt 12: 0 chuỗi tiếng Việt cứng còn lại, 1395 khoá, VI/EN khớp
100%.** Đo bằng trình duyệt trên 29 màn ở cả hai chế đữ: 0 nhãn chrome còn tiếng Việt
(4 giá trị loại trừ là dữ liệu nghiệp vụ — tên dự án, tên nhà cung cấp, tên hợp đồng,
câu hỏi mẫu gửi AI).

Bốn lần phải **nâng** mốc ratchet trong đợt này, không phải hạ — vì bốn lần bộ đo được
sửa và mốc cũ là số đếm thiếu:

| Lần | Bộ đo sửa gì | Mốc cũ → mới |
|---|---|---|
| 1 | bỏ `th("…")` ở cả nháy kép | 395 → 349 |
| 2 | đếm cả text node JSX | 349 → 623 |
| 3 | quét cả file `.js` | 623 → 674 |
| 4 | đếm text node lẫn biểu thức | 0 → 12 → 0 |

Mỗi lần số **tăng** dù tôi không thêm chuỗi nào — đó là dấu hiệu bộ đo trước đó bỏ
sót, không phải tôi làm bẩn. Giữ mốc cũ thì mọi thay đổi hợp lệ từ nay sẽ báo đỏ.

Điều đáng nói nhất: giữa chừng bộ đo đã báo **0 chuỗi ở 0 file** — trông như xong —
nhưng trình duyệt vẫn hiện 19 nhãn ở 6 màn. Số 0 đó là **sai theo hướng nguy hiểm**:
báo thấp hơn thực tế thì trông như đã xong. Ba điểm mù và cách sửa ở 11.9.

Đã dịch xong (ngoài những mục ở đợt 11): `Payment` · `ControlCenter` (toàn bộ, 86
chuỗi) · `PillarControlPanel` · `CompressPanel` · `Ops` · `UploadWizard` ·
`Assistant` · `Approval` · `Materials` · `ChainConfig` · `HealthConfig` ·
`QaInspections` · `BimLibrary` · `AiConfig` · `MasterDataList` · `MasterDataEdit` ·
toàn bộ màn `FieldStubs` + `FieldShell` + `HqShell`.

Đã dịch xong: `TablePagination` (component dùng chung, mọi màn bảng), `AiGuide`,
toàn bộ `ControlCenter`, `Payment`, `PillarControlPanel`, `CompressPanel`, `Ops`,
`UploadWizard`, `Assistant`, `Approval`, `Materials`.

Bổ sung `scripts/i18n-add.mjs` — công cụ trích theo bảng ánh xạ do người viết.
**Bảng ánh xạ phải do người viết, không máy dịch**: tự dịch 700 chuỗi là cách
nhanh nhất để tạo ra câu không đọc được cho khách hàng người Anh.

Bốn lỗi mắc trong lúc làm, giữ lại trong file để không tái phát:

1. `re.escape` rồi so khớp **chuỗi thường** — `re.escape` biến khoảng trắng thành
   `\ `, nên không chuỗi nào chứa khoảng trắng mà khớp. Lần chạy đầu chỉ thay 2/54.
2. Thêm `import { t }` có điều kiện "chưa có import i18n nào" — `ControlCenter` đã có
   `import { getLang, th, useLang }` nên điều kiện đúng và `t` không bao giờ được
   import. Build **vẫn thành công**; chỉ `browser.mjs` thấy.
3. Regex bắt `(\.\./)+` không kèm dấu nháy rồi ghép bằng nối chuỗi, ra
   `from ../i18n/index.js'` — mất dấu nháy, cú pháp hỏng ngay dòng import.
4. `t()` ở **cấp module** (`const LIFECYCLE_LABELS = { REQUESTED: t(...) }`) được
   tính MỘT LẦN lúc nạp, nên bấm `[VI|EN]` sau đó nhãn vẫn giữ ngôn ngữ cũ. Đổi
   thành hàm `lifecycleLabel(status)` gọi lúc render. Đã kiểm bằng cách bấm nút
   thật: `Đã đề nghị` → `Requested`, `Vật tư` → `Materials`.

Bốn lỗi trong `scripts/i18n-add.mjs`, đều do bỏ sót mà chỉ lộ ra khi kiểm chứng:

5. Regex thay text node JSX **không có cờ `g`** → `src.replace()` chỉ thay lần xuất
   hiện đầu tiên. Hậu tố ngắn kiểu "quá hạn" xuất hiện nhiều lần thì chỉ một chỗ
   được dịch, phần còn lại vẫn tiếng Việt mà `replaced` vẫn báo đã xong.
6. Chỉ khớp `>Nhãn<` trên **một dòng**. Nhãn nằm một mình trên dòng riêng rất phổ
   biến, và ở đó `>` là ký tự cuối của `/>` nên không khớp.
7. Bản đầu giới hạn thụt lề 3 khoảng trắng — quá chặt, vì thụt lề thật của JSX là
   10–20 khoảng trắng. Đã nới lên 24, vẫn đủ nhỏ để không nuốt khối JSX lớn.
8. Bỏ qua mọi chuỗi **không có dấu tiếng Việt** — đúng cho dữ liệu, nhưng sai với
   nhãn vốn dĩ tiếng Anh (`Manpower`, `Network`, `Project Control`) vốn cần dịch
   sang ngôn ngữ khác. Nay cần `"force": true` trong bảng ánh xạ, để quyết định do
   người viết chứ không suy ra từ dấu thanh.

Thêm `scripts/i18n-allow.mjs`: danh sách chuỗi **cấm dịch**, kèm lý do. Không có nó
thì bộ đo tính vĩnh viễn 13 từ khoá tên file và số "còn lại" luôn lớn hơn thực tế.

Ba chỗ **không được dịch**, có lý do:

- Từ khoá khớp tên file trong `UploadWizard` (`tđ`, `vật tư`, `duyệt khác`, `cây`…).
  Dịch chúng sẽ **phá vỡ phân loại tài liệu**, vì file thật đặt tên tiếng Việt.
  Liệt kê trong `scripts/i18n-allow.mjs`.
- Dữ liệu nghiệp vụ (tên hợp đồng, tên nhà cung cấp, tên dự án) giữ nguyên ngôn ngữ
  nhập — đây là chủ ý của `i18n/th.js`. Đo bằng trình duyệt thấy màn `Control
  Center` ở chế độ EN chỉ còn **1** chuỗi tiếng Việt và đó là tên dự án.
- Tên sản phẩm `O-NEXUS Field` / `O-NEXUS` trên các màn field — tên thương hiệu.

Lỗi mới phát hiện ở đợt 12: `scripts/i18n-allow.mjs` dựng tập `ALLOWED` giữ nguyên
hoa thường trong khi phép so khớp dùng `.toLowerCase()`, nên **mọi mục viết hoa đều
không bao giờ khớp**. Bản đầu chỉ chứa toàn chữ thường nên lỗi này ẩn; phải thêm
một mục có hoa thường mới thấy. Đã hạ chữ thường ngay khi dựng tập.

Một sự cố do **cách tôi đo**: bấm nút `[VI|EN]` thật sẽ `PUT /api/me/locale` và đổi
luôn `users.locale` của tài khoản demo trong DB. Đã phải trả lại `vi`. Bài kiểm
`ui-verify-i18n.mjs` dùng `addInitScript` để không đụng DB — ghi rõ trong file.

### 11.1 Mảng i18n còn lại — làm tiếp theo thứ tự này

| Thứ tự | File | Chuỗi | Vì sao kế tiếp |
|---|---|---|---|
| ~~1~~ | ~~`hq/ControlCenter.jsx`~~ | 0 | ✅ xong ở đợt 10 — màn khởi đầu, vào là thấy ngay |
| 1 | `hq/Payment.jsx` | 72 | màn tiếp theo trong kịch bản demo |
| 2 | `components/PillarControlPanel.jsx` | 54 | bật từ Control Center |
| 3 | `governance/Ops.jsx` | 46 | vận hành |
| 5 | `hq/ai-guidance.js` | 14 | phần **văn bản dài** trong nội dung hướng dẫn. Nhãn ngắn trong `AiGuide.jsx` đã dịch xong ở đợt 10 |

Đã dịch xong ở đợt 10: `TablePagination` (component dùng chung, mọi màn bảng) và
`AiGuide.jsx` (9 nhãn ngắn + 3 tiêu đề dải). Phần còn lại của `ai-guidance.js` là văn
bản dài — mỗi câu là một khoá riêng, nên dịch theo bảng, không dịch kiểu tìm-thay.

Có `node scripts/check-i18n.mjs --ratchet` sau mỗi lần dịch xong một màn, để mức
ghi nhận bám theo thực tế.

### 11.2 Lỗi do chính đợt dịch: `t is not defined`

Bộ chạy trích nhãn của tôi chỉ thêm `import { t }` khi thấy file **chưa có** import
i18n nào. `ControlCenter.jsx` thì đã có sẵn `import { getLang, th, useLang }` — nên
điều kiện đúng, lệnh bỏ qua, và `t` không bao giờ được import. Build vẫn **thành
công** (Rollup không báo lỗi khi dùng biến chưa định nghĩa ở module ESM? — không, nó
báo; nhưng gate chạy build ở bước riêng và lỗi chỉ hiện ở bước trình duyệt).

Bài học: **sau mỗi lần dịch hàng loạt phải chạy gate**. Ở lần này `npm run build`
**vẫn thành công** — Rollup không coi `t` là biến chưa định nghĩa ở phạm vi module —
nên chỉ `browser.mjs` mới bắt được (`zero page errors (got 1: t is not defined)`).

Đây là lý do gate có bước trình duyệt thật, chứ không chỉ build + lint: hai cái đó
cùng xanh mà trang vẫn hỏng.

Kèm một cái bẫy: `onApplied={() => setReloadTick((t) => t + 1)}` — tham số tên `t`
che hàm `t()` trong phạm vi callback. Lúc đó chưa gây lỗi, nhưng thêm một lời gọi
`t()` vào callback là lỗi ngay. Đã đổi thành `(n) => n + 1`.

### 11.3 Hai lần chạy gate song song — và vì sao không chỉ dựa vào kỷ luật

Trong một buổi tôi chạy hai gate nền cùng lúc **hai lần**, cả hai đều fail ở
`payment-sla.mjs` với `ECONNREFUSED 127.0.0.1:3147` — trông y hệt hồi quy mã nguồn.
Nguyên nhân là gate dựng server riêng trên cổng 3147, nên bản thứ hai giết server của
bản thứ nhất. Lần thứ hai là do chính tôi viết `pgrep … && echo … || echo …` rồi nối
bằng `;` thay vì `&&`, nên lệnh vẫn chạy gate dù đã in ra cảnh báo.

Hậu quả ngoài lỗi: suite bị giết giữa chừng nên **để lại dự án rò** trong DB demo
(`PAY-SLA-<timestamp>`), phải dọn tay.

Cách sửa đúng không phải "nhớ kiểm tra" mà là **chặn trong script**:
`release-gate.mjs` ghi khoá PID vào `/tmp/opencode/release-gate.lock`, từ chối chạy
nếu pid đó còn sống, và nhả khoá khi thoát.

Hai bẫy trong lúc làm chốt này, đều đã kiểm chứng:

- **`pgrep -f 'release-gate'` báo động giả.** Nó khớp mọi tiến trình có chuỗi đó
  trong dòng lệnh, kể cả chính `bash -c` đang gọi gate. Bản thứ hai luôn bị chặn
  oan. Đó là lý do dùng khoá PID.
- **`process.on('exit')` không chạy khi bị SIGTERM.** Nên `timeout` hay Ctrl-C để lại
  khoá cũ; thông báo "đang chạy" sau đó hiện ra với một pid đã chết. Phải bắt
  `SIGTERM`/`SIGINT`/`SIGHUP` tường minh. Đã kiểm: trước khi sửa, `timeout 8` để lại
  khoá; sau khi sửa thì nhả đúng.

### 11.4 Hàng đợi `Phê duyệt`: báo "còn 222 nữa" mà không lấy được

Đo được: `/payment-requests` có **242** việc chờ, hàng đợi lấy 20. Đợt 9 làm ngưỡng 20
**nhìn thấy được** bằng dòng `Đang hiện 20 / 242 … còn 222 nữa` — nhưng dòng cảnh báo
chỉ nói ra sự thật chứ không giải quyết được: người dùng biết còn 222 việc mà không
lấy được việc nào.

Nay mỗi nhóm có thanh phân trang riêng, phân trang ở máy chủ (`limit`/`offset`).
Ba danh sách nằm cạnh nhau nên dùng **ba chỉ số trang riêng** chứ không dùng chung —
dùng chung thì bấm trang 2 của nhóm này lại nhảy nhóm kia.

Lưu ý khi sửa: `useEffect` phải so từng khoá của object `pages`, không so object.
`pages` là object mới mỗi lần `setPages`, nên so theo tham chiếu sẽ chạy effect mỗi
lần render và bắn vô hạn request.

Kiểm trên trình duyệt: `1–20 / 242 yêu cầu · Trang 1/13`, bấm `›` ra
`21–40 / 242 yêu cầu · Trang 2/13`.

Sửa kèm một lỗi nhỏ do chính đợt này: `unit.payment` trong bản VI để nhầm chữ
`'payment'` (tiếng Anh), nên chế độ VI hiện `1–20 / 242 payment`.

### 11.5 Bốn màn có `h1` tiếng Anh ngay cả ở chế độ VI

`Issues` → `h1` là `Issues`; `Bản vẽ shop` → `Shopdrawing`; `Phê duyệt` →
`Approval Center`; `Dữ liệu chủ` → `Master Data`. Menu bên trái gọi cùng màn đó bằng
tiếng Việt (`Sự cố`, `Bản vẽ shop`, `Phê duyệt`, `Dữ liệu chủ`), nên vào màn thì
tiêu đề đổi ngôn ngữ trong khi menu không đổi. SRS chọn tiếng Việt làm ngôn ngữ
chính, nên đây là lệch, không phải chủ ý.

Sửa bằng cách dùng **chung khoá `nav.*`** với menu, thay vì thêm khoá `h1` riêng:
tiêu đề màn và mục menu lấy cùng một nguồn nên không thể lệch nhau lần nữa. Hai file
(`Approval.jsx`, `MasterDataList.jsx`) trước đó không import i18n nào — thêm cả import
và `useLang()`, vì thiếu `useLang()` thì đổi `[VI|EN]` chỉ có tác dụng sau khi tải lại
trang.

Bài kiểm mới trong `ui-verify-i18n.mjs` (tiêu đề 9 màn) bắt được ngay: 5 khẳng định
đỏ, trong đó 4 là `h1` tiếng Anh ở chế độ VI. Sau khi sửa: **32/32 PASS**.

### 11.6 Dữ liệu chủ: có sửa và ẩn (xoá mềm)

Trước đợt 12, máy chủ **không có** `PUT`/`DELETE` cho 7 danh mục — màn "Dữ liệu chủ"
chỉ đọc và thêm mới. Đây là tính năng thiếu, không phải thiếu nút.

Quyết định (2026-09-27, đã hỏi và đã chốt):

- **Ẩn = xoá mềm**, đặt `status = 'INACTIVE'`. Bản ghi còn nguyên nên hợp đồng /
  báo cáo ngày / vật tư đã tham chiếu vẫn tra cứu được. Xoá cứng ở đây sẽ hỏng dữ
  liệu lịch sử theo kiểu không nhận ra ngay. **Không có API xoá cứng, cố ý.**
- **Sửa theo allowlist sẵn có** của backend, không mở rộng. Cụ thể là
  `CREATABLE_COLUMNS` trừ `code` và các khoá ngoại.
- Có thêm `POST /:resource/:id/restore` — không có bước này thì "xoá" là một chiều
  và mất luôn bản ghi dù nó vẫn nằm trong DB.

Vì sao bỏ `code` khỏi danh sách sửa được: mã là khoá nghiệp vụ, ví dụ `TỔ-TC-01`
được ghi vào `approval_chains` và báo cáo. Sửa nó âm thầm làm dữ liệu lịch sử không
còn khớp với danh mục hiện tại. Vì sao bỏ khoá ngoại: `lead_worker_id`, `team_id`,
`parent_id` đã qua kiểm tra tham chiếu và chống vòng lặp ở route chuyên biệt; ghi
từ form chung sẽ bỏ qua những kiểm tra đó.

**Bốn lỗi tôi mắc khi làm, đều lộ ra khi kiểm chứng thật:**

1. `withAudit` đưa vào client `pg` **thô** — chỉ hiểu `$N`. Việc đổi `?` → `$N` nằm
   trong `db.prepare()`, chỉ dùng được ngoài transaction. Tôi dùng `?` trong
   `client.query` nên Postgres nhận `?` làm toán tử và báo
   `syntax error at or near "AND"`. Bài e2e bắt được ngay khi chạy.
2. Route generic `PATCH /:resource/:id` tôi đặt **trước** `PATCH /departments/:id`,
   nên bộ phận rơi vào route generic và **mất kiểm tra chống vòng lặp `parent_id`**.
   Phải đảo lại. Đã chứng minh bằng cách cố ý đảo thứ tự: `parent_id` tự tham chiếu
   trả 400 thay vì 422.
3. `status` là **enum** `master_status` (ACTIVE/INACTIVE/CLOSED/MERGED), không phải
   text. Gửi sai thì Postgres ném `22P02`. Đây là **lỗi có sẵn** ở route tạo mới
   (mọi `catch` đều trả 500), không chỉ ở phần sửa — người dùng gõ sai từ form thấy
   "Lỗi máy chủ" mà không có cách nào biết giá trị hợp lệ là gì. Sửa: ánh xạ mã lỗi
   Postgres sang HTTP đúng ngữ nghĩa (`22P02`/`23514`/`23502` → 400, `23505`/`23503` →
   409) và **kèm luôn `allowed_status`** cho lỗi enum.
4. Dùng biến `env` không tồn tại trong `release-gate.mjs` (tên thật là `serverEnv`) —
   `node --check` không bắt vì đó là lỗi runtime, chỉ chạy gate mới thấy.

Đo được: `tests/e2e/master-data-crud.mjs` 18/18 và
`scripts/ui-verify-master-data.mjs` 20/20. Cả hai tự tạo bản ghi riêng (mã
`TST-*`) và tự dọn; bài trình duyệt dọn bằng `psql` vì **xoá mềm giữ bản ghi**, dọn
bằng nút Ẩn là dọn hỏng. Đã thử phá bằng cách cho form sửa được cả Mã → 3 khẳng
định đỏ.

**Còn lại, chưa làm — cần người ký:** không có ràng buộc `UNIQUE` nào trên `code` của
`vendors` / `workers` / `teams` / `cost_codes` / `resources` (chỉ
`subcontractors`/`suppliers` unique theo `name`). Tôi **không** tự thêm index: đó là
câu hỏi nghiệp vụ (mã trùng có bị cấm không) và thêm index lên dữ liệu đang chạy là
không đảo ngược được nếu đã có trùng. Đã ghi ở `docs/DATA_DECISIONS_REQUIRED.md`.

### 11.7 Gate có thể chạy trên code cũ mà không báo

Phát hiện khi thêm bài kiểm `master-data-crud.mjs` vào gate: bài đó PASS khi chạy
độc lập ở cổng 3000 nhưng FAIL trong gate, và **11/18 khẳng định đỏ với lý do hoàn
toàn không liên quan** (`POST` 201 được, mọi `PATCH`/`DELETE` 404 — kể cả chỗ vốn
phải trả 409).

Nguyên nhân: một tiến trình server từ lần gate trước vẫn giữ cổng 3147. Gate spawn
server của mình, nó chết vì `EADDRINUSE`, nhưng `stdio: 'ignore'` nuốt mất thông báo
lỗi; `waitForServer()` thấy server cũ trả `/api/health` OK nên tưởng server mình đã
lên, và âm thầm chạy toàn bộ gate trên code cũ.

Nguy hiểm ở chỗ **ngược chiều**: nếu code mới làm hỏng một bài kiểm, gate vẫn có
thể báo PASS vì nó đang đo code cũ. Một lần PASS như vậy còn tệ hơn một lần FAIL —
nó tạo cảm giác an toàn giả.

Sửa trong `scripts/release-gate.mjs`:

- Kiểm tra cổng **trước** khi spawn. Bị chiếm thì dừng ngay với thông báo nói rõ
  `fuser -k <port>/tcp`, và vẫn ghi báo cáo.
- `stderr` của server không còn bị `ignore`; lỗi bind thấy được ngay.
- `waitForServer()` nhận hàm kiểm tra server đã chết, nên dừng sớm thay vì chờ đủ
  15 giây rồi báo chung chung "không khoẻ" — câu báo đó che mất nguyên nhân thật.

Chưa thể tự động hoá hoàn toàn: đây là canh gác ở mức tiến trình, nên vẫn phải dọn
tiến trình cũ giữa các lần chạy.

### 11.8 Bộ đo i18n đếm thiếu — số "còn lại" luôn thấp hơn thật

Bản thứ ba trong loạn lỗi bộ đo. `countHardcoded()` **chỉ** đếm chuỗi trong nháy
đơn/nháy kép, hoàn toàn bỏ qua **text node JSX** — mà phần lớn nhãn người đọc lại
nằm ở dạng đó.

Hệ quả không chỉ là con số sai. Bộ đo báo **2** ở `FieldHome.jsx` trong khi trình
duyệt hiện ra **9** nhãn tiếng Việt ở `/field`; và `ControlCenter` báo 22 trong khi
thật là 86 — nghĩa là những file mà bộ đo báo "gần như sạch" thực ra còn cả trăm
chuỗi, và tôi đã dừng ở đó vì tin số đo.

Nguyên nhân sâu hơn: khi trích chuỗi để dịch tôi dùng mẫu `>Nhãn<` trong khi bộ đo
dùng mẫu khác, nên **một nhãn chỉ được đo khi đã tìm ra cách trích nó** — tức là
số đo và danh sách việc cùng bỏ sót một chỗ, nên tự nó kiểm tra mình thì không thấy.

Cách phát hiện: đo bằng trình duyệt thật, không tin bộ đo. Đó cũng là lý do bài
`ui-verify-i18n.mjs` có giá trị — nó đo thứ người dùng thấy, nên bắt được loại sai
mà đo tĩnh không bắt được.

Sau khi sửa: **623 chuỗi ở 45 file** (trước đó bộ đo báo 313 ở 40 file). Mốc ratchet
được **nâng lên**, không hạ xuống: đó là số thật, và giữ mốc cũ thì lần sau mọi thay
đổi hợp lệ sẽ bị báo đỏ.

Kèm sửa trong `scripts/i18n-add.mjs`: cho phép text node JSX nằm một mình trên dòng
riêng (`>` ở cuối `/>`, `<` ở dòng sau) — trước đó không nhãn nào dạng đó khớp được.
Bản đầu đặt giới hạn thụt lề 3 khoảng trắng, quá chặt vì thụt lề thật là 10–20.

### 11.9 Bộ đo i18n: ba điểm mù nữa, mỗi lần đều báo "đã xong" trong khi còn sót

Sau 11.8 bộ đo báo **0 chuỗi ở 0 file**. Trình duyệt vẫn hiện 19 nhãn tiếng Việt ở
6 màn. Không phải bộ đo sai — nó **không nhìn thấy** những chỗ đó. Ba điểm mù, mỗi
điểm chỉ lộ ra khi đo bằng trình duyệt:

| Điểm mù | Ví dụ | Vì sao lọt |
|---|---|---|
| Text node **lẫn biểu thức** | `<sub>Đã chi {x} tỷ · {y} giá trị</sub>` | Mẫu đếm đòi chữ chạy liền từ `>` đến `<` |
| Chữ **sau** biểu thức | `{item.label} · trễ {n}d` | Chữ tiếng Việt nằm *giữa* hai `{…}` |
| File `.js` | Nhãn cột ở `governance/master-data-columns.js` | `walk()` chỉ quét `.jsx` |

Hai điểm mù đầu làm bộ đo **báo thấp hơn thực tế** — tệ nhất, vì trông như đã xong.
Điểm mù thứ ba làm màn Dữ liệu chủ báo 0 trong khi bảng hiện `MÃ` · `TÊN` ·
`LIÊN HỆ` ở cả chế độ EN.

Đã sửa cả ba, kèm bộ lọc dương tính giả cho mẫu mới: `>([^<>\n{]*…)` cũng khớp
mã chứ không chỉ JSX, ví dụ `new RegExp(`(^|[^a-zà-ỹ])${…}`)`. Lọc theo dấu hiệu mã
(backtick, `$`, `=>`, từ khoá khai báo) chứ không theo vị trí — vị trí thì không
đáng tin trong JSX.

**`i18n-add.mjs` phải nhìn thấy đúng những gì bộ đo đo.** Thêm mẫu vào bộ đo mà
không thêm vào bộ sửa thì tạo ra chỗ không sửa được. Nay cả hai dùng chung một
hình dạng: `>Nhãn<`, `>Nhãn{`, `}Nhãn{`, `title="…"`, `'…'`.

### 11.10 `t()` ở cấp module — lần thứ ba

`LIFECYCLE_LABELS` (Materials) lần đầu. Lần này là `PRIORITY` ở `Attention.jsx`, và
tệ hơn vì `HIGH: { label: 'Cao' }` viết thẳng chuỗi tiếng Việt — không bao giờ được
dịch ở bất kỳ chế độ nào. Ba lần thì đủ để coi đây là cái bẫy mặc định của mã, nên
ghi vào `i18n/index.js` để người sau không phải tự phát hiện lần nữa.

`ai-guidance.js` cũng vậy: 6 hằng ở cấp module chuyển thành 6 hàm.

### 11.11 Ngày ISO lọt ra giao diện

`report_date` là cột `date` nhưng API trả chuỗi ISO đầy đủ. Ba chỗ in thẳng ra UI
nên người công nhân thấy `2026-09-27T00:00:00.000Z`; một chỗ dùng `.slice(0, 10)` —
làm thô và bỏ qua múi giờ người xem. Thêm `formatApiDay()` vào `utils/datetime.js`
và dùng cả ba.

### 11.12 Tôi tự làm hỏng hợp đồng parser AI

Khi chuyển `ai-guidance.js` từ hằng sang hàm, tôi **tái tạo lại** hàm
`parseProgressPreview` từ trí nhớ thay vì sửa từng dòng — và vô tình đổi hợp đồng
trả về: viết `workItemCode` + `candidates` thay cho `codeHint`, và bỏ mất
`codeIsExplicit` hoàn toàn.

Hậu quả nếu lọt: thẻ xem trước ở tab `Cập nhật tiến độ` báo mã "chưa đọc được" dù
người dùng đã ghi rõ `mã: BOH-102` — và người dùng tưởng hệ thống hỏng.

Bắt được ở `regression-wave5.mjs`, bài kiểm so hai bản parser client/server. Đó
chính là lý do tồn tại: bình thường không có cách nào biết hai bản này lệch nhau
trừ khi có bài kiểm khoá chúng đi cùng nhau. File `ai-guidance.js` là untracked nên
không khôi phục được từ `git show` — bài kiểm là đặc tả duy nhất.

Sửa: soi lại `parseProgressText` ở máy chủ và viết lại cho khớp từng field, kèm
ghi chú nêu rõ hợp đồng và vì sao `codeIsExplicit` chỉ có phía giao diện.

Bài học cho tôi: khi sửa một file, **sửa từng dòng**, đừng viết lại file từ trí nhớ
khi file đó chứa hợp đồng với nơi khác.

### 11.13 Tiêu đề nhóm "Cần xử lý" do máy chủ ghép

`backend/src/lib/attention.js` gửi `title` tiếng Việt. API **đã gửi sẵn `key`**
(`schedule`/`shop`/`material`/`payment`) nên giao diện dịch theo `key`, giữ `title`
làm dự phòng cho nhóm mới — hiện tiếng Việt còn hơn mất nhãn.

Riêng nhóm payment, `label` là chuỗi ghép sẵn (`… VND · hạn …`) vì **bản tin email**
dùng chính chuỗi đó và không có ngữ cảnh ngôn ngữ. Thay vì bỏ, gửi thêm
`amount`/`due` để giao diện ghép lại theo ngôn ngữ đang xem; email giữ nguyên.

### 11.14 Đợt 13 — săn lỗi mới (không chỉ tin gate)

Gate 64 bước xanh, nhưng đợt này quét lại từ góc khác và tìm ra 6 lỗi thật.

**A. `<Modal>` dùng mà không import ở 6 file.** Build **thành công** (Rollup không coi
biến chưa định nghĩa ở phạm vi module là lỗi), `lint` chỉ cảnh báo, gate xanh — vì
không test nào bấm nút mở modal đó. Người dùng bấm `Tải Excel` ở Trung tâm điều
khiển thì trang sập `ReferenceError: Modal is not defined`. Đã kiểm chứng trước khi
sửa: mở modal → không hiện, console báo lỗi.

**B. Tham số callback tên `t` che hàm dịch `i18n` — 3 chỗ** (`Ops.jsx`, `FieldStubs.jsx`,
`Materials.jsx` đã sửa trước đó). `t('khoá')` trong callback gọi lên **object của
dòng dữ liệu** → `TypeError: t is not a function`, màn trắng. Không công cụ nào báo:
build xanh, `no-undef` không báo (vì `t` đã import ở phạm vi ngoài), `no-unused-vars`
không báo (vì `t` còn dùng chỗ khác trong file). Lần này tôi **tự** mắc lại dù đã
ghi cảnh báo trong `i18n/index.js` — nên viết `scripts/check-i18n-shadow.mjs` canh
đúng điều kiện đó, và đổi tên tham số ở cả 5 chỗ còn lại.

**C. `formatApiDay` dùng mà không import** trong `DailyReportForm.jsx` — **lỗi của tôi**,
làm khi sửa lỗi ngày ISO lọt ra UI. Script thêm import của tôi có điều kiện "file chưa
import từ `utils/datetime.js`", mà file này **đã** import `todayLocal` từ đó nên bị
bỏ qua. Màn báo cáo ngày của công nhân hiện trường sẽ trắng khi có báo cáo trong
ngày. Đáng chú ý: tôi đã quét `/field/daily` mà route thật là `/field/daily-report`
— quét sai URL nên không thấy.

**D. `confirm` không có trong phạm vi ở `ErpPanel`** (`Payment.jsx`) nên rơi về
`window.confirm` của trình duyệt: hộp thoại native hiện `[object Object]`, `await`
trên boolean vẫn chạy tiếp nên **không lỗi nào được báo** — build xanh, lint xanh
(vì `confirm` là global hợp lệ). Người dùng thấy hộp thoại rác thay vì hộp xác nhận
có tiêu đề và nút.

**E. `requestPage()` trả `{rows,total}` nhưng `Approval.jsx` kiểm `Array.isArray`** →
toàn bộ submittal đang `SUBMITTED` biến mất khỏi danh sách, trong khi số đếm lấy từ
`subAll.total` (đầy đủ). Người dùng thấy "còn N việc" mà danh sách trống. Đây là
hợp đồng tôi đã tự viết ở đợt trước và ghi vào tài liệu — rồi phá vỡ nó ở chỗ dùng.

**F. `PieChart` dùng `let acc` tích luỹ bị gán lại trong `.map()` lúc render** — sai
về vòng đời: khi React Compiler ghi nhớ kết quả render, `acc` mang giá trị lần
trước và các lát cung vẽ sai. Tính lại thuần bằng `reduce`. Đã đo trước/sau: sai lệch
lớn nhất **1,4e-14** — nhiễu số thực, hình vẽ giống hệt.

**G. `useEscape` gán `ref.current` lúc render** → chuyển sang `useLayoutEffect`.

**H. Ba import/tham số chết**: `request` (`AuditLog.jsx`), `progressFraction`
(`ProjectOverview.jsx`), `teamNames` (`master-data-columns.js` — kèm comment nói ngược
lại nên người đọc tìm nhầm chỗ xử lý tên tổ).

### 11.15 Rò dữ liệu chéo khách hàng — đã xảy ra, không phải rủi ro lý thuyết

`routes/jobs.js` chọn người nhận thông báo bằng
`SELECT id FROM users WHERE is_ceo … OR role = 'admin'` **không khoá `tenant_id`**.
Cron chạy ngoài `runWithTenant` nên `app.current_tenant` không được set ⇒ policy RLS
`app_tenant_unset()` mở ⇒ câu đó trả user của **mọi tenant**. Rồi
`insertNotification` ghi `notifications(tenant_id = tenant của dự án, user_id = user
tenant khác)` kèm **mã dự án, mã submittal và tên PM** trong nội dung.

Đo được trước khi sửa: **25 dòng** đã tích luỹ trong DB, gửi sang cả hai chiều.
Đã sửa (khoá cả hai câu theo `sub.project_tenant_id`) và dọn 25 dòng.

Hai bài học về **cách kiểm chứng**, cả hai đều do tôi làm sai trước:

1. Bài kiểm đầu tiên gọi cron qua `POST /api/jobs/escalate-tvgs` và **PASS cả khi
   đã phá lại lỗi**. Vì route đó đi qua `requireAuth` nên GUC **có** set ⇒ RLS vẫn
   khoá ⇒ lỗi không tái hiện được. Phải gọi `runTvgsEscalation()` trực tiếp, đúng
   như cron thật.
2. Bài kiểm có `runAsync()` mà không `await` trong khối dọn ⇒ dòng thử nằm lại trong
   DB và bài kiểm báo FAIL ở khẳng định dọn sạch.

Bài kiểm mới: `tests/e2e/cron-tenant-scope.mjs` (5/5 PASS, đã chứng minh bắt được:
phá lại thì FAIL "thấy 1").

### 11.16 Hai nơi khác dựa một mình vào RLS, và RLS không phải lớp bảo vệ duy nhất

- `lib/upload-access.js`: khi upload chưa có project (`project_id IS NULL`, đúng
  trạng thái sau `POST /api/upload` không kèm `project_code`), `isGlobalRole(user)`
  trả `true` **không so sánh tenant** ⇒ admin/PMO của tenant B đọc được metadata và
  **bytes thật** của upload thuộc tenant A.
- `routes/directives.js`: `notify_to_user_ids` lấy thẳng từ body không kiểm tenant, và
  nhánh mặc định `SELECT id FROM users WHERE role IN ('pm','pmo')` cũng không khoá
  ⇒ CEO tenant A có thể ghi thông báo cho user tenant B.

Cùng lớp với 11.15 nhưng **chưa kiểm chứng bằng dữ liệu** nên ghi ở mục 12.

### 11.17 `schedule-compress` apply/rollback không khoá — mất dữ liệu khi chạy song song

`routes/schedule-compress.js` không `lockProject`, không `FOR UPDATE`, và câu
`SET status = 'APPLIED'` không có điều kiện trạng thái. Hai CEO apply hai scenario khác
nhau của cùng dự án chạy song song: cả hai đọc cùng trạng thái gốc, `applied_before`
của scenario bị ghi đè bởi lần chạy sau, và rollback sau đó khôi phục snapshot cũ
⇒ **xoá mất thay đổi của scenario còn lại**, không có dấu vết audit.
`routes/pillar-scenarios.js` đã làm đúng (khoá project + `FOR UPDATE` + kiểm tra
trạng thái **bên trong** transaction) — `schedule-compress.js` chỉ thiếu.

Đã sửa cả apply và rollback theo đúng mẫu đó, thêm khoá `project_id` khi sửa hạng
mục. Test e2e chạy tuần tự nên **không thể** bắt lỗi loại này — cần kiểm thử song
song mới chứng minh được, xem mục 12.

### 11.18 `entitlements.js` fail-open — mất kiểm soát gói tính năng

Hai đường mở khoá **toàn bộ** tính năng khi dữ liệu lỗi, không để lại dấu vết:

1. `featuresForPlan(planLạ)` → `PLAN_FEATURES.enterprise`.
2. `getEntitlements()` khi không đọc được dòng `tenants` → plan `'enterprise'`.

Cả hai bắn khi: tenant bị xoá, RLS chặn, id sai, hoặc người vận hành gõ sai
chính tả (`'Enterprise'`, `' enterprise '`) — vì `PLANS.includes()` so **không phân
biệt hoa thường**, nên một lỗi gõ phân cách lại mở `chains`, `pillar-sim`,
`ai-assistant`, `bim-library`, `erp-export`, `bulk-import`, `kpi-targets`,
`schedule-compress`.

Đã sửa: chuẩn hoá plan (`trim` + `toLowerCase`) trước khi so; plan lạ hoặc đọc
lỗi → hạ về `small` **có `console.warn`** một lần kèm mã tenant. Chọn fail-closed vì
mất tính năng thì người dùng báo và sửa được trong một phút, còn mở khoá nhầm thì
không ai biết cho tới khi có sự cố.

Bài kiểm: `tests/e2e/entitlements-fail-closed.mjs` (17 khẳng định, đã chứng minh bắt
được: trả về bản fail-open gốc thì 8 khẳng định FAIL, mỗi plan lạ ra 26 thay vì 10
tính năng).

### 11.19 `?limit=-1` ⇒ 500, và `limit` bị bỏ qua im lặng

11 chỗ tự viết `Math.min(parseInt(req.query.limit) || N, M)` — **không kẹp dưới**.
`?limit=-1` cho `-1` (truthy nên không rơi về mặc định), `Math.min(-1, 500)` = `-1`
⇒ `LIMIT -1` ⇒ Postgres `ERROR: LIMIT must not be negative` ⇒ **500**. Đo trước khi
sửa: 7 URL trả 500, gồm `/api/audit`, `/api/notifications`,
`/api/projects/1/{materials,manpower,construction-schedule,material-submittals,invoices}`.

Đã sửa bằng `readPage()` của `lib/pagination.js` (đã clamp sẵn), **giữ nguyên mặc
định và trần cũ** để không đổi hành vi màn nào.

Mở rộng `scripts/check-paged-endpoints.mjs` thành hai phần: hình dạng response (có
sẵn) + **8 giá trị rác** trên 13 endpoint. Phần này lộ tiếp hai lỗi im lặng:

- `?within_days=-5` ở `material-submittals/pending-supervisor` không gây 500 nhưng
  lấy cửa sổ ngược về quá khứ, trả về những submittal **đã quá hạn** cho danh sách
  "sắp đến hạn". Nay kẹp dưới 0.
- `/api/projects/1/daily-reports` và `/api/projects/1/work-items` **không có
  `LIMIT`** nên `?limit=2` trả đủ mọi dòng — 864 dòng cho work-items. Nay tôn trọng
  `limit` **chỉ khi được truyền** (`defaultLimit: null` = không giới hạn), mặc định
  vẫn trả hết để không cắt dữ liệu của bên gọi cũ, kèm `X-Total-Count`.

Âm tính: trả `notifications.js` về cách cũ rồi restart server ⇒ check báo đỏ, `exit=1`,
nêu đúng 3 URL 500. (Lần đầu âm tính **không** bắt được vì quên restart — đo code
cũ trong bộ nhớ. Đã ghi nhận: đổi mã nguồn máy chủ thì phải restart.)

### 11.20 Hai lỗi đọc-rồi-ghi khi chạy song song — đo được, không phải phỏng đoán

Bài kiểm mới: `tests/e2e/concurrency.mjs`. Cả ba tình huống đều **không cần may mắn
về thời điểm**, nên bài kiểm xác định chứ không may mắn may.

**(a) `revision_number` — 6 request đồng thời ra 6 bản sửa "số 1".**
`routes/material-submittals.js` đọc `revision_number` của bản gốc **ngoài**
transaction rồi `+1`, không có unique index nào chặn. Đo: 6 request cùng lúc, cả 6
trả 201, cả 6 ghi `revision_number = 1`.

Đã sửa hai lớp:
- Migration `9999au_submittal_revision_uq.sql` — unique index trên
  `(parent_submittal_id, revision_number)`, bảo vệ **cả** ghi từ nơi khác (seeder,
  SQL tay), không chỉ từ route HTTP. Trước khi tạo đã kiểm: 0 nhóm trùng.
- Route khoá bản gốc `FOR UPDATE` và **trả 409** nếu bản gốc đã có bản sửa.

Vì sao 409 chứ không phải cấp số kế tiếp: `revision_number = parent + 1` cùng
`parent_submittal_id` mô tả một **chuỗi tuyến tính**. Hai bản sửa của cùng bản gốc
là hai bản sửa **cạnh tranh của cùng phiên bản**, và schema không mô tả nổi hai
nhánh. Nếu cấp số kế tiếp thì `revision` của bản sửa thứ 6 là 6 trong khi bản gốc
vẫn là 0 — phá vỡ đúng công thức đang dùng. Sửa xong: lần 1 → `rev=1`, lần 2+ → 409
nói rõ *"This submittal already has a revision — revise the latest one instead"*;
bản sửa của bản sửa vẫn nhận `rev=2` nên chuỗi không đứt.

**(b) `schedule-compress` apply song song — đã sửa từ đợt 13, nay có bài kiểm.**
Hai apply cùng một scenario: đúng một 200, một 409, và `audit_log` chỉ có **1** dòng
`APPLY` (không tin HTTP status mà kiểm dấu vết).

**(c) Rollback kịch bản cũ xoá mất lịch của kịch bản mới — lỗi còn sót từ đợt 13.**
Khoá `FOR UPDATE` ở đợt 13 **không đủ**: nó chặn hai apply *cùng một scenario*, nhưng
`runCompression` chạy **ngoài** transaction, và `applied_before` của hai kịch bản
khác nhau vẫn cùng gốc. Thứ tự `apply A → apply B → rollback A` chạy **tuần tự** cũng
mất dữ liệu: rollback A ghi đè ảnh chụp cũ lên thay đổi của B, không có dấu vết
audit. Bài kiểm đo được điều này.

Đã sửa bằng **đúng chốt mà `lib/baseline.js:restoreBaseline()` đã dùng cho kịch bản
trụ cột** — lưu `schedule_fingerprint_after` lúc apply, so lúc rollback, lệch thì
409 *"Schedule changed after this scenario was applied; rollback would overwrite
newer data"*. `schedule-compress` tự phục hồi từ `applied_before` chứ không qua
baseline, nên phải mang chốt sang.

Kèm một lỗi phụ lộ ra: khối `catch` của rollback **hardcode `res.status(500)`** trong
khi route `apply` ngay phía trên dùng `e.status || 500`. Nên chốt 409 vừa thêm bị
biến thành 500, và giao diện không phân biệt được "bị từ chối" với "máy chủ hỏng".

**Dữ liệu thử của bài này phải tự dựng**, không dùng lịch dự án demo: `runCompression`
neo vào `todayStr()`, còn lịch demo nằm ở 2019-2020 — quá khứ so với hôm nay ⇒
`targetDays` âm ⇒ **mọi** case đều 422 với thông điệp gây hiểu nhầm
*"infeasible on current data (calendar end 2027-06-23 > target)"*, trong khi ngày đó
là ngày mai. Xem mục 12.1.

### 11.21 Hai route chết do router mount trước

`index.js` mount `projectsRouter` (dòng 177) **trước** `paymentRouter` (dòng 183).
Cả hai đều có `router.get('/projects/:id/contracts')` và `/:id/payments`, nên bản ở
`payment.js` **không bao giờ chạy**. Hệ quả: route **đang chạy** là bản
`projects.js` — không phân trang, không `X-Total-Count`; còn bản có phân trang thì là
code chết. Tương tự `/:id/daily-reports` (bản `projects.js` che bản `daily.js`).

Cũng vì thế, `?limit=-1` chỉ gây 500 ở 7 URL chứ không phải 9: hai route có
`Math.min(parseInt(...))` trong `payment.js` nằm sau route thắng nên không tới được.

### 11.22 Đợt 14 — săn lỗi lần hai, theo lớp chứ không theo danh sách

Đợt 13 sửa theo danh sách phần còn lại. Đợt 14 quét **theo lớp lỗi** (bốn subagent
song song, mỗi lượt một lớp) vì danh sách luôn thiếu mục.

**A. Rò chéo khách hàng, đo được (đã sửa).** `services/notify.js` có comment
*"tenantId is REQUIRED (no silent cross-tenant writes)"* nhưng **không có bước nào
kiểm tra điều đó**: `user_ids` đi thẳng từ body của client, `tenantId` lấy từ
`req.user.tenant_id`. Đo được: `POST /api/notifications` với `[userCùngTenant,
userTenantKhác]` trả `count: 2` và DB có **1 dòng** nối tenant 1 với user tenant 2.
Đã sửa ở `notify()` (một chỗ, mọi caller đều qua đó), kèm `rejected` trả về cho
bên gọi. Bài kiểm `notify-tenant-scope.mjs`, âm tính FAIL đúng 4 khẳng định.

**B. `upload-access.js` thiếu so `tenant_id` — nhưng KHÔNG lộ được.** Bài kiểm dựng
hai tenant cùng plan `enterprise` (tạm nâng plan tenant 2 rồi khôi phục) và đo thật:
admin tenant 1 đọc upload STAGED của tenant 2 → **404**, tải bytes → 404. RLS chặn
trước khi tới hàm này. Vẫn thêm so sánh `tenant_id` vì RLS là **một** lớp và nó mở
hatch ở đúng chỗ nguy hiểm nhất (cron). Bài kiểm gọi **thẳng hàm** để bắt được việc
thiếu so sánh — vì phần HTTP không bắt được (đã thử: gỡ so sánh, HTTP vẫn 404,
bài kiểm vẫn xanh).

**C. Chết pool — nghiêm trọng nhất, đo được (đã sửa).** `routes/sync.js` gọi
`checkProjectAccess` **bên trong** `withAudit`; hàm đó lấy connection thứ hai từ pool
trong lúc transaction đang giữ một. Với `PG_POOL_MAX=10`, đủ 10 request
`POST /api/sync/resolve` chạy song song thì cả 10 đều giữ transaction **và** đều chờ
connection thứ hai ⇒ không ai giải phóng được. **Đo trước khi sửa: 13 699 ms và
`timeout exceeded when trying to connect`. Sau: 87 ms, 12/12 trả 200.** Sửa: cho
`checkProjectAccess` nhận `client` tuỳ chọn; các call site ngoài transaction giữ nguyên
hành vi cũ. Bài kiểm `sync-pool.mjs`.

**D. Nạp lại file ghi đè dữ liệu trong ứng dụng (đã sửa, theo tiền lệ sẵn có).**
`shop_drawing.js:213` đã ghi chú đúng lớp lỗi này và dùng `setCols` tường minh —
nhưng các nơi anh em không có. Đo/tính ra:
- `resource_directory.js`: `status: 'ACTIVE'` trong `row` ⇒ **hồi sinh** nhà cung cấp
  đã bị ẩn (xoá mềm ở `master-data.js:334` đặt `INACTIVE`) mỗi lần nạp lại danh bạ.
  `is_internal_team` bị ghi đè thành `false` dù người dùng đặt tay.
- `material_supply.js`: sheet không có dòng batch ⇒ `progress_pct = null` ⇒ **xoá sạch**
  tiến độ đã nhập trong ứng dụng; `procurement_status` bị tính lại từ chữ trong sheet,
  **bỏ qua** `PROCUREMENT_TRANSITIONS` + `checkTransition` + audit, tạo ra hàng mâu
  thuẫn (`accepted_at` còn nguyên vì không nằm trong `setCols`, còn trạng thái bị đẩy
  lại `IN_TRANSIT`).
- `construction_schedule.js` / `project_level.js`: ghi đè `status` bằng
  `deriveStatus(...)` chạy lại từ sheet ⇒ lệch với `schedule_baseline_items.status`
  đã snapshot, mà `restoreBaseline` không phục hồi `status`.
- `daily_report.js`: xoá sạch **6** bảng con mỗi lần nạp — trong đó
  `daily_safety` và `daily_recommendations` **không hề** được nạp từ sheet (không có
  `INSERT` nào trong repo) nên nạp lại file **xoá sạch** những gì người dùng nhập trong
  ứng dụng, và không có gì để khôi phục. `daily_manpower` thì app cũng nhập tay
  (`routes/daily.js:111`). `prepared_by` cũng bị ghi đè bằng chữ trong sheet dù nó là
  người **lập** báo cáo và đi ra báo cáo Excel.

Nguyên tắc áp dụng (theo đúng `shop_drawing.js`): **sheet là nguồn sự thật cho dữ
liệu có trong sheet; ứng dụng là nguồn sự thật cho vòng đời và trạng thái duyệt.**

**E. Nhãn i18n đóng băng — 43 chỗ (đã sửa).** `const STATUS_LABELS = { PENDING:
t('pay.st_waiting') }` ở thân module chỉ chạy **một lần** lúc module được import;
React không bao giờ tính lại biểu thức ngoài thân component ⇒ bấm [VI|EN] xong các
nhãn này **giữ nguyên**. Đo được 43 chỗ ở 6 file (`STATUS_LABELS`, `TYPES`,
`METRIC_LABELS`, `DIR_HINT`, `SCOPE_LABEL`, `STEPS`, `FIELD_RULES`). Đã đổi tất cả
thành hàm và gọi trong component. Bài kiểm trình duyệt đo trước/sau: bấm nút **không
tải lại trang** thì nhãn đổi đúng. Canh gác: `scripts/check-i18n-module-scope.mjs`
(âm tính bắt được).

ⓘ Trong lúc làm, bộ dò viết **đầu tiên** dùng đếm ngoặc `{`/`}` nên báo nhầm 22
chỗ `t()` bên trong component. Bản dùng thụt lồng + bộ lọc "dòng nằm trong thân
hàm" mới đúng. Đây là lần thứ hai trong đợt tôi viết bộ đo báo động rồi phải vứa đi
sửa — nên bộ đo luôn phải có một ví dụ âm tính.

**F. Mất cập nhật khi hai người bấm cùng lúc (đã sửa).** `ai-assistant.js` approve và
dismiss: kiểm `d.status !== 'pending'` nằm **ngoài** transaction, `UPDATE` không kèm
điều kiện ⇒ Duyệt và Bỏ qua cùng lúc thì kẻ thua ghi đè kẻ thắng, 409 không nổi,
giao diện báo thành công cho cả hai. Hộp thư có cả hai nút trên **mọi** dòng. Cùng
lớp với `shop.js` PATCH (sửa được bản vẽ đã `SUBMITTED`, kể cả đổi `drawing_code` của
tài liệu đã duyệt) và `admin.js` DSR (hai admin giải quyết cùng một yêu cầu PDPL →
hai dòng audit mâu thuẫn). Cả ba nay `UPDATE … WHERE … AND status = <trạng thái>`
+ kiểm `rowCount`, theo đúng mẫu các route khác trong repo.

**G. `key` trùng trong JSX — 224 cặp trong dữ liệu demo (đã sửa).** `Payment.jsx` cho
cả `payment_requests` và `invoices` render vào **cùng một `<tbody>`** với
`key={req.id}` / `key={inv.id}`. Hai chuỗi id độc lập nên giao nhau: đo được **224**
cặp trùng. React khi thấy `key` trùng thì giữ element thứ nhất và **dùng lại nó cho
element thứ hai** ⇒ dòng yêu cầu thanh toán hiện số hoá đơn và số tiền của hoá đơn
khác, ngay cạnh nút Duyệt/Từ chối. Đã thêm tiền tố `req-` / `inv-`.

**H. Không xoá được ô trong sửa dữ liệu chủ (lỗi của tôi, đợt trước).**
`MasterDataEdit.jsx` dùng `if ((form[k] || '').trim())` nên xoá hết nội dung ⇒ `''`
falsy ⇒ **khoá không được gửi** ⇒ `PATCH` không chạm cột đó, toast vẫn báo
`md.saved`, mở lại thì chữ cũ vẫn còn. Nay gửi `null` (backend đã hiểu `null` là
"xoá ô").

**I. Lời gọi không bọc lỗi (đã sửa).** `NotificationCenter.jsx` (`load`/`handleClick`/
`markAll`) và `DailyReportForm.jsx` (`createReport`/`addManpower`/`loadPhotos`). Đáng
chú ý nhất: `handleClick` gọi `await notifications.markRead()` rồi mới `nav(...)` —
markRead lỗi thì **điều hướng không chạy**, bấm thông báo không làm gì, không báo lỗi.
Và `load()` lỗi khiến màn hiện "không có thông báo" với mọi thẻ đếm bằng 0. Nay có
`failed` riêng biệt với "không có dữ liệu".

**J. Không nạp được 15/18 loại tài liệu từ giao diện (đã sửa).** `POST /api/upload`
từ chối mọi loại ngoài `shop_drawing`/`material_supply`/`construction_schedule` — và
`UploadWizard` gọi **đúng** endpoint đó, nên nhập nhiều file/zip cũng chết theo. Trong
khi `INGESTORS` có **18** loại và wizard `configure → preview → commit` chạy được với
chúng. Guard này còn **mâu thuẫn với ý định sửa ngay bên dưới nó** ("`project_code`
is optional: without it the file is staged only…"). Nay: nạp ngay vào dự án thì chỉ
nhận 3 loại đó, còn **stage không gắn dự án** thì nhận mọi loại đã nhận diện được;
chỉ tên file không nhận diện mới bị từ chối. Bài kiểm `daily-wizard-configure.mjs`
(FULL PASS) là bằng chứng.

**K. `generic_sheets.upload_id` luôn NULL + đọc cột không tồn tại (đã sửa).**
`services/ingest/index.js` không truyền `uploadId` xuống `generic_tabular`, nên cột
luôn NULL; **và** `routes/upload.js:141` lọc bằng `up.upload_id` — cột đó **không tồn
tại** trong `file_uploads` (kiểm: rỗng) nên nhánh lọc theo file là code chết. Hai lỗi
cộng lại khiến 7 loại tài liệu luôn rơi về "xem toàn dự án" — mở chi tiết một file lại
thấy dòng của **file khác** trộn vào. Đã sửa cả hai.

**L. Bài kiểm để lại dữ liệu rác làm đỏ golden test khác (đã sửa).**
`p0-03-wizard-auth.mjs` tạo dự án `WIZ-AUTH-<timestamp>` rồi **không xoá**; dự án đó
làm đỏ `p5-golden.mjs` (vốn kiểm tập dự án ACTIVE của tenant demo đúng bằng 3 mã
chuẩn — mục tiêu của nó là "không có dữ liệu rác của test lọt vào demo"). `AGENTS.md`
yêu cầu mọi bài kiểm tự dọn. Đã sửa và dọn.

**M. `POST /api/jobs/retention` đếm chéo tenant (đã sửa).** Bảng session
(`auth_refresh_tokens`, `auth_revoked_jti`) **không có** `tenant_id`; `ai_calls` và
`audit_log` thì có. `retentionPlan()` nay khai báo `tenantScoped` tường minh và
phản hồi ghi rõ phạm vi từng bảng, thay vì để người đọc tưởng đó là số của riêng mình.

**N. `POST /api/jobs/escalate-tvgs` chạy cho mọi tenant (đã sửa).** Nút "Chạy ngay" của
một admin tenant A trước đây gửi thông báo thật cho PM/CEO tenant B và trả về danh
sách `submittal_code`/`project_code` của tenant B. Nay `runTvgsEscalation(scopeTenantId)`
— cron vẫn gọi không tham số (toàn hệ thống, đúng việc của nó), route truyền
`req.user.tenant_id`. `GET /status` chỉ trả thống kê, không trả danh sách mã.

**O. `me.js` còn sót fail-open (lỗi của tôi, ngay sau khi sửa ở đợt trước).** Tôi sửa
`entitlements.js` fail-closed rồi bỏ sót `routes/me.js:17` vẫn `.catch(() => ({ plan:
'ententerprise' }))` — tệ hơn nữa là hai nửa của cùng object trái nhau
(`features: []` nhưng `plan: 'enterprise'`), và `HqShell` hiện badge đó.

**P. `p0-07-shop-contract` kỳ vọng 200 cho POST tạo mới (đã sửa).** Endpoint trả **201
Created** đúng chuẩn từ lâu, bài kiểm kỳ vọng 200 nên FAIL một cách vô nghĩa — nó che
mất việc còn lỗi thật trong file.

**P2. `ControlCenter` hiện hoạt động không lọc theo dự án (đã sửa).**
`fetchJson('/api/audit?limit=4')` không có `project_id`, nên với admin/CEO đó là 4
dòng **toàn tenant** — hiện ngay dưới tiêu đề dự án đang xem. `/api/audit` đã hỗ trợ
`project_id` từ `routes/audit.js:39`; chỉ là không ai truyền. Đo: không lọc thấy dòng
`project_id = 144` (dự án thử đã bị xoá), có lọc thấy đúng dự án.

**Q. `wizard.js` để lại `report_json` cũ khi parse lỗi (đã sửa).** `configure` ghi
`project_id`/`zone_id`/`expected_doc_type` **trước** rồi mới `parse()`. Nếu `parse()`
ném lỗi (sheet hỏng, `.xlsx` không phải xlsx, hết bộ nhớ với file 50 MB), hàng đã bị
trỏ sang dự án/zone/loại **mới** nhưng `report_json` vẫn giữ kết quả parse của lần
configure **trước**. Người dùng thấy 500, bấm lại, rồi `POST /:id/commit` nạp **nhầm
bộ dữ liệu cũ** — của loại tài liệu cũ và zone cũ — vào dự án mới. Commit báo thành
công còn dữ liệu sai theo hai chiều. Nay `configure` đặt `report_json = NULL` cùng
lúc với việc ghi config, nên commit phải có `report_json` mới
(`routes/wizard.js:213` đã trả 400 khi rỗng) ⇒ không thể nạp nhầm.

**R. `POST /api/projects` trả 500 thay vì 409 khi trùng mã (đã sửa).** Hai request cùng
mã chạy song song: kẻ thua nhận lỗi 23505 từ index unique `projects_tenant_code_idx`
⇒ thông điệp Postgres thô. Nay dùng `ON CONFLICT DO NOTHING RETURNING` → 409 kèm
`id` của dự án đã có, đúng như nhánh kiểm tra sớm.

ⓘ Lỗi **của tôi** ngay khi sửa R: đổi `runAsync` (trả `lastInsertRowid`) sang
`getAsync` (trả dòng) mà quên sửa dòng đọc `r.lastInsertRowid` → `undefined` →
`POST /api/projects` trả `Cannot read properties of undefined (reading 'id')`, làm
đỏ `payment-sla.mjs`. Gate bắt được ngay ở bước 3. Cùng kiểu: đổi `api()` trả
`{status, data}` mà tôi viết `.json` trong bài kiểm mới.

**S. Zone trùng nhau chỉ khác hoa/thường (đã sửa).** Index unique phân biệt hoa
thường, nên `b1` và `B1` cùng tạo được ⇒ cùng một khu vực vật lý thành hai zone.
Hậu quả đã ghi bằng tay tại `bim.js:50-53`: `GET /projects/:id/otd`
(`routes/otd.js:66 GROUP BY zone_id, z.code`) ra hai dòng trùng `zone_code`, và truy vấn
của `bim.js` (`UPPER(code) = UPPER(?) … count(*) = 1`) từ chối gắn model vào cả hai.
Nay `findOrCreateZone` **và** route `POST /zones` đều tra không phân biệt hoa thường
(trước đây route dùng `code = ?` còn helper dùng `UPPER(code) = UPPER(?)`, nên tạo
`b1` rồi `B1` vẫn lọt qua 409 ở route). Đo: tạo `ZcaseTEST` → 201, `zcasetest` → 409.

**T. Bài kiểm để lại dữ liệu rác (đã sửa 2 bài).** `p0-03-wizard-auth.mjs` tạo dự án
`WIZ-AUTH-<ts>` rồi bỏ lại; `payment-sla.mjs` có dọn nhưng **không có `try/finally`**
nên `process.exit(1)` ở dòng 224 (sau khi đã tạo dự án) bỏ qua toàn bộ phần dọn. Cả hai
làm đỏ `p5-golden.mjs` — vốn kiểm tập dự án ACTIVE của tenant demo đúng bằng 3 mã
chuẩn, mục tiêu của nó là "không có dữ liệu rác của test lọt vào demo". `p0-03` đã
thêm dọn; `payment-sla` nay đăng ký `process.on('exit')` để bắt **mọi** đường thoát.
Đo: chạy `payment-sla` xong thì DB vẫn đúng 3 dự án demo + 1 PILOT.

**U. Tôi xoá mất route `POST /api/jobs/retention/run` (đã khôi phục).** Khi sửa
`GET /retention` (mục M) bản thay thế của tôi chỉ giữ lại GET — route POST đứng ngay
sau bị rơi. `tests/e2e/monitoring.mjs` đỏ với **404** và bắt được. Cùng kiểu với mục R
(`r.lastInsertRowid`) và lần viết `.json` thay vì `.data` trong bài kiểm mới: cả ba đều
là **sửa mà không kiểm lại chỗ liền kề**.

ⓘ Cùng lúc đó tôi chạy `rg -rn "pattern" path` — `-r` của ripgrep là
`--replace`, nên nó thay chữ trong **output**, không phải trong file. Output trông như
`runRetention` đã bị đổi thành `n` ở nhiều file, và tôi suýt đi sửa nhầm những file
hoàn toàn bình thường. Đã bỏ hẳn thói quen này: dùng `grep -n` hoặc `rg -n` không kèm
`-r` khi cần đọc mã.

### 11.23 Một bài kiểm tôi **không** chứng minh được, và tôi nói rõ thay vì giữ vỏng

`routes/schedule-links.js` kiểm chu trình trên ảnh chụp lấy trước `BEGIN`, nên hai
request `A→B` và `B→A` song song có thể cùng qua kiểm tra và cùng commit. Hậu quả
**vĩnh viễn**: `lib/cpm.js:topoSort` ném `cyclic schedule graph` cho mọi lần tính CPM
⇒ `schedule-compress/preview` và `apply` của dự án đó trả 500 tới khi ai đó xoá thủ
công quan hệ. Đã sửa: `lockProject(client, …)` + `validateNewLink` **bên trong**
transaction, theo đúng mẫu `pillar-scenarios.js`.

Nhưng bài kiểm thì **không bắt được lỗi này**, và tôi đo thay vì giả vờ:
- 2 request ngược chiều: gỡ khoá, chạy **5/5 lần PASS**.
- 8 request (4 mỗi chiều): gỡ khoá, chạy **5/5 lần PASS**.

Cửa sổ tranh chấp quá hẹp để tái hiện ở đây. Bài kiểm vẫn được giữ vì nó bảo vệ
**hợp đồng** (không vòng nào được ghi, CPM không gãy sau đó), nhưng phần đó **không
phải** bằng chứng cho việc khoá hoạt động. Đã ghi chú này ngay trong
`tests/e2e/concurrency.mjs` để không ai đọc nhầm. Bằng chứng cho lỗi đó là mã, không
phải bài kiểm.

## 12. Chưa sửa (cập nhật sau đợt 13)

Những mục đã **đóng** trong đợt 12–13 được ghi ở 11.4–11.17. Còn lại:

### 11.24 Đợt 15 — sản phẩm "chạy được nhưng không mượt": bộ đo i18n có mù

Đợt 14 đóng bằng *"0 chuỗi cứng"*. Đó là **sai**, và chính bộ đo đã nói dối. Đợt 15 mở
lại bằng câu hỏi đúng: *con số 0 đó đo được cái gì?*

| # | Lỗi | Đo được | Vì sao bộ đo cũ xanh |
|---|---|---|---|
| A | `lib/ai/watcher.js` hạn mức `maxDrafts` **toàn cục** trong khi `LIMIT` SQL là **mỗi tenant** | Tenant đứng đầu ăn hết ngân sách, mọi tenant sau `break` ngay dòng đầu ⇒ **không tenant nào sau** có draft | Không có bộ đo nào; đọc ra từ cấu trúc |
| B | `routes/daily.js` ghi file ra đĩa **bên trong** transaction | 20 ảnh, ảnh thứ 3 lỗi ⇒ transaction rollback, 0 dòng `daily_photos`, **20 file rác** trên đĩa mà `storage-gc` báo mãi. Trên S3 còn giữ transaction mở xuyên suốt lời gọi mạng | Không có; và `storage.remove()` đã có sẵn nhưng **không có wrapper** để gọi |
| C | `routes/classify.js` cắt `LIMIT 200` **trước** rồi mới lọc quyền | 200 dòng đầu toàn dòng người đó không được xem ⇒ hàng đợi **trông rỗng** trong khi họ có việc | Không có; `canAccessUpload` cần `await` từng dòng nên không đẩy vào `WHERE` được |
| D | `t()` **thiếu khoá** ⇒ UI hiện nguyên khoá (`G.FILTER`) | Script dịch của tôi ghi **literal** làm khoá thay vì khoá `g.*` mà JSX gọi ⇒ **51 khoá hỏng** | `check-i18n.mjs` đếm chuỗi tiếng Việt trong JSX — lỗi từ điển nó không thấy |
| E | **172 khoá** `t()`/`th()` gọi mà không có trong từ điển | `th('Mã')` là quy ước của repo (chữ Việt làm khoá) mà bộ kiểm khoá của tôi chỉ nhận `^[a-z0-9_.]+$` ⇒ bỏ sót **toàn bộ 231 chỗ** dạng đó | Bộ kiểm tôi viết ở đợt 14 tự giới hạn mẫu ⇒ tự bỏ sót |
| F | Nhãn tiếng Anh **145 chỗ ở 40 file** | Giao diện tiếng Việt hiện chữ Anh ở `>Total<`, `>Needs review<`, `placeholder="Search..."` | `VIETNAMESE = /[àáảãạ…]/` ⇒ chuỗi **không dấu** không bao giờ được đo |
| G | `th()` trả **nguyên đối số** ở chế độ VI (`i18n/index.js:84`) | `th('File')`, `th('Zone')` ⇒ VI hiện chữ Anh; EN "đúng" một cách tình cờ vì đối số vốn đã là tiếng Anh. **73 lời gọi** đổi sang tiếng Việt | `check-table-headers.mjs` chỉ kiểm tiêu đề **có dấu tiếng Việt** |
| H | Nhãn trong **biểu thức JSX** và **object cấp module** | `{busy ? '…' : 'Approve'}` và `RESOURCES = [{ label: 'Vendors (NCC)' }]` — 23 chỗ | Không nằm trong text node `>…<` |
| I | **7 bài kiểm** để lại dữ liệu thật | 234 dòng `notifications` + 8 `directives` trong DB demo, làm `p5-golden.mjs` đỏ. `realtime.mjs` **đã có** dọn nhưng chạy ngay, mà `notifyMany` sinh thông báo *sau* response | Không có |
| J | `catch {}` nuốt lỗi dọn dữ liệu | `p0-05-notify.mjs` dọn **theo `title`** trong khi thông báo thủ công mang mẫu ở `title` còn thông báo chỉ thị mang ở `body`; thêm nữa `require` chưa được import ⇒ `ReferenceError` **bị nuốt im lặng**, dọn không chạy mà không ai biết | Không có — nhưng đây là lỗi **của chính tôi**, lặp lại đúng cái tôi đã viết trong AGENTS.md |

#### Bốn điểm mù được đóng thành canh gác

`check-i18n.mjs` đo **chuỗi có dấu tiếng Việt trong JSX**. Ba lớp lỗi trên nằm ngoài
đúng cái nó đo. Bổ sung:

| Bộ đo mới | Bắt lớp nào | Âm tính đã thử |
|---|---|---|
| `scripts/check-hardcoded-labels.mjs` | nhãn tiếng Anh ở text node, `placeholder`/`title`, text node có biểu thức, **biểu thức JSX** (ternary), **object cấp module** (`label:`) | Cài lại `>Unread (` → đỏ; cài lại `Needs review` → đỏ |
| `scripts/check-i18n-keys.mjs` | mọi chuỗi `t()` phải có ở **cả** `vi.js`+`en.js`; mọi `th()` phải có trong **`th.js`** (hai hàm tra **hai bảng khác nhau**) | Xoá 1 khoá `th.js` → đỏ; đặt `th('State')` → đỏ với đúng loại lỗi |
| `tests/e2e/lib-cleanup.mjs` | dọn dữ liệu thật ở `exit`, khớp **cả `body` lẫn `title`**, `catch` **không** im lặng | Chạy 4 bài → 0 dòng rác; `psql` sai → in lỗi ra stderr |
| mở rộng `check-paged-endpoints` / `check-i18n-module-scope` | xem 11.22 | — |

#### Hai lỗi tôi tự gây ra ở đợt này

1. **`git checkout -- frontend/src/hq/ReviewQueue.jsx`** dùng trong một lệnh thử âm
   tính đã **xoá mất toàn bộ thay đổi chưa commit** của file đó (đọc `d.rows`, cảnh
   báo dòng bị ẩn, 10 nhãn i18n). Phát hiện ngay vì `check-i18n.mjs` báo `ReviewQueue.jsx:
   0 → 17 (+17)` — bộ đo ratchet bắt được việc file bị đưa về HEAD.
2. Khối khoá tôi chèn vào `i18n/th.js` nằm **ngoài** object (`};`) ⇒ build hỏng. Sửa
   bằng cách gom vào trước `};`. Cũng là bài học đã ghi: **sửa xong phải đọc lại chỗ
   liền kề**.

#### Đo lại

Trình duyệt thật, 29 màn × 2 ngôn ngữ, `addInitScript` để không đụng `users.locale`:

| | trước | sau |
|---|---|---|
| VI: nhãn tiếng Anh | 275 | **0** (trừ mã kỹ thuật `QA/QC`, `C1`…`C6`, mã dự án/zone) |
| EN: nhãn tiếng Việt | — | **0** |
| `pageerror` / `console.error` | 0 | 0 |

Nút `[VI|EN]` bấm **thật** trên 4 màn (Tải lên, Thông báo, Trợ lý AI, Dữ liệu chủ):
cả 4 đổi nhãn, 0 `pageerror`; `users.locale` trả về `'vi'` ngay sau đó.

Gate: **74/74, `passed: true`**. DB sau gate: users 9, projects 4, vendors 6, workers 8,
uploads 196, directives 2, notifications 57, **0 rác chuông**, **0 thông báo rác
`pX-YY-<epoch>`**.

#### Còn lại

`QA/QC`, `C1`…`C6`, `L1`, `L2`, `KH`, `TT`, `VAT`, `MST`, `HTTP`, `Cache`, `Schema`,
`Spaces`, `As-built`, `OTD %`, `In / PDF` — **giữ nguyên có chủ đích**: viết giống nhau ở
cả hai ngôn ngữ, hoặc là mã/viết tắt ngành mà người dùng tiếng Việt vẫn dùng. Danh sách
đầy đủ nằm trong `ALLOW`/`CODE_OK` của `check-hardcoded-labels.mjs` và
`check-i18n-keys.mjs`, **kèm lý do từng mục**.

### 11.25 Đợt 16 — "cả hệ thống ổn" là khẳng định chưa được kiểm

Đợt 15 kết bằng "gate 74/74". Đó cũng là khẳng định chưa kiểm: **gate gọi 55 trong
142 bài e2e**, tức 87 bài **chưa từng chạy** trong đợt. Đợt 16 viết
`scripts/run-all-e2e.mjs` chạy hết và dùng chính kết quả đó để săn lỗi.

| # | Lỗi | Đo được | Vì sao lọt |
|---|---|---|---|
| A | **`buildAppDatabaseUrl()` bỏ qua `APP_DB_USER`**: `DATABASE_URL` (owner) được kiểm **trước** `APP_DB_USER`, trái với chính comment của hàm và comment ở `production-readiness.js:57` | Đặt `APP_DB_USER=pmo_app` xong pool request vẫn chạy bằng owner ⇒ **mất RLS**; `db-role.mjs` đỏ | Không có bài nào kiểm URL đã dựng, chỉ kiểm biến môi trường |
| B | `hasDatabaseEnv` chỉ nhìn nhóm owner ⇒ đặt `DATABASE_URL` (mọi lệnh hướng dẫn đều dùng) làm **bỏ qua `backend/.env`**, mất `APP_DB_USER` vừa cấu hình | Cùng hậu quả với A | Không |
| C | `withClientTx` **ném** với tham số `undefined`, còn pool thì `pg` đổi thành NULL | Cùng câu lệnh chạy được ngoài transaction thì hỏng bên trong. `ingest/daily_report.js` truyền 5 cột tuỳ chọn không có trong sheet ⇒ **mọi** hạng mục bị bỏ, `work_items_count = 0` trong khi `manpower_count = 1` | `p1-real-numbers.mjs` bắt được nhưng gate không chạy bài đó |
| D | Bắt lỗi **từng dòng** bên trong transaction là vô dụng: một câu hỏng thì Postgres hỏng **cả** transaction | Một dòng hỏng ⇒ `status: FAILED`, `error: "current transaction is aborted…"`, `failures` không có, **toàn bộ** dòng hợp lệ mất | `p2-04-ingest-failures.mjs` sinh ra để chặn đúng việc này mà không chạy |
| E | `generic_tabular.js` dùng `opts` trong khi tham số tên `options` ⇒ `ReferenceError` | **Mọi** bản ghi `generic_sheets` thất bại | Không có bài nào chạm ingestor này |
| F | `detectDocType` chỉ đổi `_` thành khoảng trắng, **không đổi `-`** | `tien-do.xlsx`, `ban-ve-shop.xlsx`, `vat-tu-thang9.xlsx`, `bao-cao-thanh-toan.xlsx` → `unknown`, trong khi thông điệp lỗi của `POST /api/upload` bảo người dùng đặt tên theo đúng các từ khoá đó | Không có bài nào đo tên file tiếng Việt có dấu gạch nối |
| G | `th()` tra `th.js` và ở chế độ VI **trả nguyên đối số** (`i18n/index.js:84`); quy ước repo là truyền **chữ Việt** làm khoá | 73 lời gọi `th('Zone')` ⇒ UI tiếng Việt hiện chữ Anh | `check-table-headers.mjs` chỉ kiểm tiêu đề **có dấu tiếng Việt` |
| H | Nhãn nằm trong **biểu thức JSX** (`{c ? 'Approve' : …}`) và **object cấp module** (`label: 'Vendors (NCC)'`) | 23 chỗ | Không nằm trong text node `>…<` |
| I | `deploy/production/00-backup-role.sh` chỉ cấp `CONNECT` ⇒ `pg_dump` hỏng `permission denied for table`, rồi `permission denied for sequence` | `BYPASSRLS` chỉ bypass policy, **không** cấp quyền đọc bảng; dump 0 byte | Script chưa từng được chạy |
| J | `POST /api/upload` chặn cả tên `unknown` khi **không** có `project_code`, trong khi `hint` của chính nó bảo làm đúng việc đó | Người dùng bị kẹt: file tên lạ không vào được hàng đợi; `drilldown-lineage` chết 7 khẳng định liên tiếp | Bài kiểm cũ dùng tên không nhận diện, còn `p1-04`/`p1-10`/`step0-01`/`p3-01`/`shop-filter`/`p1-04` **bám nhãn cứng** nên đỏ mỗi lần dịch |

#### Sai lầm của chính bộ chạy (đáng ghi vì chúng trông như lỗi sản phẩm)

1. **Server cũ giữ cổng.** Bài spawn server riêng với `stdio: 'ignore'`; cổng bận ⇒ spawn hỏng **im lặng** và bài nói chuyện với server của lần chạy trước. `p2-jwt-auth` spawn với `ACCESS_TTL_SEC=3` mà nhận token TTL 24h ⇒ đỏ "expired access → 401". Sửa ở bộ chạy: `sweepStrayServers()` sau mỗi bài.
2. **Giới hạn đăng nhập.** Mặc định 10/phút/IP; chạy 130+ bài ⇒ 9 bài đỏ toàn `401`. Bộ chạy nay ép `LOGIN_RATE_MAX=1000` (bài `auth-rate-limit` nằm trong nhóm cần ngoài môi trường).
3. **Tôi tự export `DATABASE_URL`** khi khởi chạy bộ chạy, tái hiện đúng lỗi B.

#### 11.27.9 `init.js` cuộn lùi sequence ⇒ id cấp lại ⇒ lịch sử kiểm toán mơ hồ

`init.js` từng chạy `setval(seq, MAX(id), …)` cho **mọi** bảng có cột `id`. Ý đồ có thật
(bình nên hơn `MAX(id)` khi import với id tường minh), nhưng câu đó **cuộn sequence lùi**
khi `MAX(id)` nhỏ hơn `last_value` — và `MAX(id)` nhỏ lại đúng sau khi bất kỳ ai xoá dòng.

Đo 2026-09-29, chạy `init.js` trên database đang ở trạng thái bình thường:

```
TRƯỚC: schedule_scenarios  seq=67  max=28
SAU:   schedule_scenarios  seq=28  max=28     ← mất 39 id
```

Vì sao đây là lỗi **dữ liệu**, không phải lỗi bài kiểm: `audit_log` **cố ý không có** khoá
ngoại tới bảng nghiệp vụ (audit phải sống sót cùng resource). Nên sau khi sequence bị cuộn,
`nextval` cấp lại id mà lịch sử kiểm toán vẫn đang trỏ tới, và câu hỏi *"chuyện gì đã xảy
ra với hợp đồng 358"* trở nên **không trả lời được** — dòng `CREATE` có thể nói về hợp
đồng đã xoá từ lâu, hoặc về cái mới. Ở database demo này đã có **6 bảng** ở tình trạng
đó: `vendors` seq 8 vs audit tới 26 · `departments` 8 vs 22 · `daily_manpower` 35 vs 45 ·
`workers` 8 vs 9 · `business_processes` 3 vs 5 · `work_item_productivity` 1 vs 3.

Vì sao lộ ra: `tests/e2e/p0-01-directives-init.mjs` chạy `init.js` trên **database chính**
(mục đích bài: chứng minh directives còn nguyên sau khi `init.js` chạy lại). Bài đó đúng
và cần thiết, nhưng nó khiến `init.js` chạy **giữa** một lần quét e2e — đúng lúc nhiều
bảng đang rỗng vì bài trước đã dọn. Tác hại hiện ra ở `concurrency.mjs`, đỏ `thấy 3` ở
khẳng định *"chỉ có 1 lần APPLY trong audit"* — bài đếm `audit_log` theo `resource_id`
mà id đó đã bị cấp lại cho một scenario khác. (Thông điệp lỗi tôi thêm ở đợt 17 đã giúp
tách ngay: `thấy 3; scenario=37` — trong khi `37` **thấp hơn** id của các lần chạy riêng.)

Sửa: `init.js` chỉ **đẩy** sequence, không bao giờ cuộn lùi, và lấy mốc cao nhất từ
**cả ba** nguồn:

```
GREATEST( last_value của sequence, MAX(id) của bảng, MAX(resource_id) của audit_log )
```

Mốc thứ ba là mấu chốt — `MAX(id)` không đủ, vì dòng đó **đã bị xoá khỏi bảng** nhưng
`audit_log` vẫn giữ. Khớp tên bằng **cả** dạng số ít và số nhiều (`vendors`↔`vendor`).

Bảng rỗng thì **không đụng** sequence — trừ khi `audit_log` đã từng trỏ tới id của nó — vì
`setval(…, 0|1, true)` sẽ làm id đầu tiên nhảy sang 2, đúng lỗi mà comment gốc đã cảnh
báo cho tenant seed `id=1`.

Đo lại: `init.js` chạy hai lần liên tiếp cho kết quả giống hệt (`56 advanced, 10 bảng
rỗng`), và quét **toàn bộ 73 bảng** xác nhận không còn bảng nào mà `nextval` có thể trả về
một id từng xuất hiện.

Sai lầm khi sửa (đáng ghi vì xảy ra ngay trong lúc sửa): dùng hàm `literal()` **đã tự thêm
dấu nháy** bên trong `'${literal(t)}'` ⇒ sinh `pg_get_serial_sequence(''vendors'', 'id')`.
Postgres đọc `''vendors''` là chuỗi rỗng rồi tới định danh ⇒ `syntax error`. Hệ quả là
`catch { }` im lặng nuốt lỗi và in ra `0 advanced` — trông như *"không có bảng nào cần
nâng"* chứ không phải *"mọi bảng đều hỏng"*. Phải in lỗi tạm ra mới thấy, rồi mới tìm
được nguyên nhân.

#### Đo lại

`scripts/run-all-e2e.mjs`: 142 bài · **113 PASS** · 2 FAIL còn lại (cả hai là giới hạn
môi trường, xem 12.1) · 21 bỏ qua vì cần ngoài môi trường.

### 11.26 Đợt 17 — lỗi do chính bộ đo giấu, và lỗi chỉ lộ ra khi bỏ bộ đo

Đợt 16 kết bằng "121 PASS · 1 FAIL". Đợt 17 mở đầu bằng việc **xoá bài đỏ cuối** rồi
săn tiếp — và phần lớn phát hiện nằm ở chỗ mà 121 bài kia **không** soi tới.

| # | Lỗi | Đo được | Vì sao lọt |
|---|---|---|---|
| **A** | **`res.status(500).json({ error: e.message })` ở 51 chỗ / 21 file** — bypass `lib/error-body.js` **và** nuốt mất `e.status` | Ở `NODE_ENV=production`: `POST /api/master-data/suppliers {"category":"A"×200}` ⇒ `500 {"error":"value too long for type character varying(100)"}` — nguyên văn lỗi Postgres lọt ra client. Cùng dòng đó làm `lib/baseline.js`/`lib/erp-fast.js` bơm vào `status: 404\|409\|422` mất tác dụng | Không bài nào kiểm *nội dung* thân 5xx ở chế độ production; 49/56 chỗ trả `e.message` mà không ai để ý |
| **B** | `resourceId: 0` ở **28 call site** — `audit_log` không truy được dòng vừa tạo | **3.612 dòng audit** `resource_id = 0` tích luỹ, trải trên 28 `resource_type` (`payment_request/CREATE` 723, `invoice/CREATE` 354, `schedule_scenario/PREVIEW` 338…). `SELECT … WHERE resource_id = 0` gộp sự kiện của **mọi** dự án và tenant | `0` là giá trị hợp lệ về kiểu ⇒ không bộ đo nào bắt; và không bài nào truy ngược audit để kiểm |
| **C** | `deadline-replan.js` / `schedule-compress.js` ghi `resourceId: 0` dù `withAudit` **đã có** cơ chế `defer` lấy `resource_id` từ callback | Hai chỗ này là nguồn `PREVIEW` 338 dòng `resource_id = 0` | Cơ chế đúng đã có sẵn từ trước nhưng chỗ gọi không dùng |
| **D** | `run-all-e2e.mjs` **không tự bật server** dùng chung, lại ép `LOGIN_RATE_MAX=1000` chỉ cho tiến trình con | Tôi khởi động server tay thiếu biến đó ⇒ `auth-tenant.mjs` + `audit-scope.mjs` đỏ toàn `429`/`401` (`Quá nhiều lần thử, vui lòng đợi một phút`) | Chính bộ chạy là nạn nhân của bẫy mà nó ghi cảnh báo ở `AGENTS.md` |
| **E** | `auth-rate-limit.mjs` nằm trong `NEEDS_EXTERNAL` với lý do *"cố tình kích hoạt giới hạn"* — trong khi nó **chạy được** nếu chạy cuối | Bỏ khỏi danh sách bỏ qua, thêm nhóm `RUN_LAST` (hạn mức mặc định) ⇒ **ALL PASS** | Đưa vào danh sách bỏ qua là **né**, không phải giải quyết |
| **F** | `pipeline-guard.mjs` + `freshdb-init.mjs` tự tạo database mà **không cấp quyền app role** | `GET /api/dashboard` trả `500 permission denied for table health_thresholds` trên DB sạch (grant gắn theo **database**, `pmo_app` chỉ có grant trên `pmo`) | Gate chạy trên DB dev nên không bao giờ thấy; hai bài này vốn nằm trong danh sách bỏ qua với lý do đã lỗi thời |
| **G** | `realtime.mjs` dùng cửa sổ SSE **cố định 6s** | `notifyMany` cố ý chạy **sau** response (`routes/directives.js`) ⇒ khi server tải (140 bài liên tiếp) sự kiện tới sau cửa sổ: `target user receives event (got 0)`, `approval.decided reaches admin (got 0)`; chạy riêng thì ALL PASS | Bài chạy riêng thì xanh, chạy trong bộ thì đỏ — tưởng lỗi sản phẩm |
| **H** | `concurrency.mjs` dọn submittal thử ở **cuối file** và đếm **toàn cục** (`LIKE 'TST-CONC-%'`) | Chính lệnh chẩn đoán `node … \| head -14` của tôi đóng pipe ⇒ node chết SIGPIPE **trước** đoạn dọn ⇒ 3 dòng rác ⇒ lần chạy sau đỏ ở đúng khẳng định "đã dọn submittal thử" | Rác của lần chết sớm làm đỏ lần chạy **sau**, ở một khẳng định cách xa lỗi gốc vài phút |
| **I** | `lib/permissions.js` tự mô tả là *"canonical role model"* nhưng chỉ phủ 16/25 module; `requireRole()` không gọi `canAccess()` nên **117 route ghi** không qua ma trận (28 mở cho `ceo`) | `scripts/list-unmatrixed-writes.mjs` | Không tự quyết — đưa vào `DATA_DECISIONS_REQUIRED.md` mục 16 |

#### Sai lầm của chính tôi trong đợt này (đáng ghi vì trông y hệt lỗi sản phẩm)

1. **Tôi tự tạo rác bằng lệnh chẩn đoán.** `node tests/e2e/concurrency.mjs | head -14` đóng
   pipe ⇒ SIGPIPE ⇒ tiến trình chết trước đoạn dọn ở cuối file. Ba dòng
   `material_submittals` còn lại đúng bằng `created_at` của lần chạy đó, và lần chạy kế
   sau đỏ ở một khẳng định hoàn toàn khác. Đã sửa bằng `cleanupRowsOnExit` ở `process.on('exit')`.
2. **Bộ đo tĩnh báo nhầm ngay chính những chỗ tôi vừa sửa đúng.** Phiên bản đầu của
   `check-5xx-bodies.mjs` đo "khoảng trống **trước** `.json(`" — mà `errorBody(e)` nằm
   *sau* dấu `(`, nên nó báo nhầm cho 3 chỗ `wizard.js` đã đúng. Đo lại theo **cả câu
   lệnh** thì còn 2 chỗ rò thật (`admin.js:200`, `sso.js:65`) và bắt được cả khi biến
   tên khác (`err.message`).
3. **Tôi suýt kết luận `require()` lỗi trong `lib-cleanup.mjs`.** Không phải — file đã có
   `createRequire(import.meta.url)` ở dòng 16. Phải đọc tới dòng 18 mới thấy.

#### Đo lại

| Hạng mục | Đợt 17 | Đợt 18 |
|---|---|---|
| `scripts/run-all-e2e.mjs` | 126 PASS · 0 FAIL · 17 bỏ qua | **139 PASS · 0 FAIL · 5 bỏ qua/helper**; `NEEDS_EXTERNAL` **rỗng** (17 → 8 → 2 → 0) |
| Bài bị bỏ qua **vì lý do sai** | 10 (đã ở đợt trước) | **+6**: 2 ERP, 2 AI, 4/6 bài `step1` (đợt 18) · **+4**: cả bốn bài “Docker” (đợt 19, xem 11.28) |
| `scripts/release-gate.mjs` | 75/75 `passed: true` | **75/75 `passed: true`** (thêm quét `scripts/` cho portability) |
| Bài bỏ qua vì lý do **đã lỗi thời** | 4 (`freshdb-init`, `pipeline-guard`, `sso`, `auth-rate-limit`) | **+4 nữa**: 2 bài ERP, 2 bài AI, và 4/6 bài `step1` (11.27.1) |
| Bài chạy với **dữ liệu nguồn thật** | không có | `step1-03`, `step1-04` (11.27.2) |
| Chỗ trả 5xx đúng chuẩn `errorBody` | 51 / 51 (đo sai — xem 11.27.4) | **104 / 104** |
| Dòng audit `resource_id = 0` | 4.280 tích luỹ | **0** (đã xoá; nguyên nhân đã sửa ở gốc) |
| Sequence có nguy cơ cấp lại id | **66 bảng không được kiểm** | **0 / 66**, có bộ canh gác `scripts/check-id-reuse.mjs` (11.27.9) |
| `<title>` trình duyệt | `frontend` (scaffold Vite) | `PMO — Quản lý dự án`, `lang="vi"` (11.27.5) |
| `production-readiness` trên máy đích | không có | **8/13 đạt**, 4 đỏ + 1 cảnh báo, tất cả đã ghi lý do (11.27.7) |

**`backup.mjs` xanh nhờ gì:** `deploy/production/00-backup-role.sh` (đã sửa ở đợt 16) chạy
thật với local superuser `psql -h /tmp -p 5433 -U vutun` ⇒ `pg_dump -Fc` bằng `pmo_backup`
cho **20.261.634 byte / 1.097 TOC entry**, `pg_restore -l` đọc được. `BACKUP_DATABASE_URL`
đặt vào `backend/.env` (không commit). Đây là bằng chứng cho đúng 3 lớp `GRANT` mà
runbook thêm, chứ không phải "script trông đúng".

DB sau đợt 17: `projects 4 · tenants 2 · users 9 · departments 8 · work_items 990 ·
shop_drawings 246 · contracts 78 · vendors 6 · workers 8 · notifications 57`,
rác thử = **0** trên mọi bảng (kể cả `audit_log` — mẫu dọn phải là `%TST-%` vì `note`
bắt đầu bằng "Tạo material submittal …", không phải `TST-`).

### 11.27 Đợt 18 — triển khai thật, và những lỗi chỉ lộ ra khi bắt đầu dùng thật

Đợt 17 kết bằng "126 PASS · 0 FAIL". Đợt 18 làm 4 việc: **xoá sạch dữ liệu rác**,
**triển khai thật trên máy này**, **chạy nốt những bài bị bỏ qua oan**, và săn lỗi tiếp.

#### 11.27.1 Bốn bài "cần ngoài môi trường" hoàn toàn không cần

| Bài | Lý do ghi trong `NEEDS_EXTERNAL` | Sự thật đo được |
|---|---|---|
| `step1-01-shop-golden` | "cần file nguồn BTE (BTE_DATA_DIR)" | **0 tham chiếu `BTE_DATA_DIR`** — bài tự dựng workbook. ALL PASS |
| `step1-02-schedule-golden` | như trên | Tự dựng. ALL PASS (sau khi sửa dọn dữ liệu) |
| `step1-03-crosscheck` | như trên | Dữ liệu thật nằm ngay trong `reference_sheets/`. ALL PASS |
| `step1-04-msa-golden` | như trên | Như trên. ALL PASS |
| `erp-roundtrip` | "cần ERP thật" | Tự spawn server, bắn vào **HTTP stub localhost** ("No real network beyond localhost"). ALL PASS |
| `erp-fast-webhook` | "cần ERP thật" | Như trên. ALL PASS |
| `demo-real-ai` | "tốn phí" | Chạy thật: **ALL PASS, $0** (model free-tier), 35 lượt gọi openrouter thật |
| `ai-srs-evaluation` | ">240s, tốn phí" | **8/8 câu hỏi đạt**, kể cả câu hỏi thiếu dữ liệu bị từ chối đúng |

Bài học: **một mục trong danh sách bỏ qua là một khẳng định về môi trường**. Sai một lần
là một bài chưa từng chạy — và `AGENTS.md` đã ghi đúng lần trước: 87 bài chưa từng chạy là
nơi giấu lỗi nặng nhất. Nay còn **8** bài bỏ qua: 4 bài Docker (máy không có Docker),
2 bài `step1-05/06` (thiếu sổ S&P khách hàng — xem 11.27.3), 2 bài AI nay bật bằng `RUN_AI=1`.

#### 11.27.2 `bte-files.mjs` — thứ tự ứng viên quyết định kết quả, và cái giá của "SKIP"

Dữ liệu nguồn BTE **có** trên máy: `reference_sheets/2019.04.28 HBG-HBC-BCTT/` (100 file,
đúng cấu trúc `TIẾN ĐỘ SHOP` / `TIẾN ĐỘ THI CÔNG` / `TIẾN ĐỘ CUNG ỨNG VẬT TƯ`). Nhưng 3 bài
`step1` viết đường dẫn theo **tên chuẩn** (`MEP-BTE-SHD-BOH.xlsx`) còn file thật tên gốc
(`Shop BOH.xlsx`) ⇒ cả 3 chỉ có thể `SKIP`.

Sửa: `tests/e2e/bte-files.mjs` dịch tên, dùng **đúng byte của file gốc** (không sao chép).

**Sai lầm của tôi, đáng ghi vì trông rất hợp lý:** ứng viên đầu cho
`MEP-BTE-CSP-01.xlsx` tôi chọn là `Tiến độ thi công tổng thể các khu vực.xlsx` — **tên nghe
đúng nhất**. Nhưng đó là **sổ 17 sheet theo khu vực**, sheet đầu là sơ đồ không có ô dữ
liệu. Đo được: crosscheck đọc được **1 zone**. Đúng là `HBG-BTE-WM-01.xlsx` (sheet
`TĐ TỔNG`, 90 dòng) — bản song song chính xác của `HBG-BTE-MSHOP-01.xlsx` cho shop. Sau
khi sửa thứ tự: **12 zone**, và `BOH` khớp thật (`rollup=5, db=2.1, delta=2.9`) thay vì
`rollup=null, delta=null`.

Ngoài ra, `step1-02` và `step1-03` có `DELETE FROM projects` dựng tay, thiếu `work_items`
(do `commit` của `construction_schedule` tạo ra) ⇒ hỏng FK `23503` **giết tiến trình trước
khi in tổng kết** và để lại dự án rác mỗi lần chạy (đo: chạy `step1-02` 2 lần → 2 dự án
`GOLDEN-SCHED-*` rác). Cả hai nay dùng `cleanupProjectsOnExit`; đo lại: 2 lần chạy liên tiếp
→ **0 rác**.

#### 11.27.3 Hai bài thật sự còn thiếu dữ liệu (không phải lỗi)

`step1-05` / `step1-06` cần sổ S&P của khách hàng. Đo trên **cả 14 file** `Vật tư *.xlsx`:
đủ bảng kê vật tư **và** cột thanh toán, nhưng ô thanh toán **rỗng** ⇒ `sp_ap.parse` ra
`batches: 0` ⇒ không dựng được chuỗi hợp đồng → hóa đơn → PR. Ngược lại,
`TIẾN ĐỘ THANH TOÁN A_B/*.xlsx` có dữ liệu tiền nhưng **không** có bảng kê vật tư ⇒
`totalRows = 0`.

Cả hai bài nay in **đúng thứ còn thiếu** thay vì `SKIP` chung chung. Bỏ file vào `SP_FILE`
là chạy được ngay.

#### 11.27.4 Bộ đo của chính tôi chỉ sửa được MỘT NỬA lỗi rò 5xx

Đợt 17 tôi sửa 51 chỗ `res.status(500).json({ error: e.message })` và thêm
`check-5xx-bodies.mjs`. Bộ đo đó khớp `res\.status\((\d{3})\)` — tức **chỉ** `res.status(500)`
nguyên văn. Nhưng codebase còn **47 chỗ** `res.status(e.status || 500).json({ error: e.message })`:
cùng lỗi rò, chỉ khác cách viết, và bộ đo **không thấy**.

Đo lại sau khi nới mẫu: **104 chỗ trả 5xx, 47 chỗ rò**. Đã sửa hết, giữ nguyên trường phụ
(ví dụ `{ ...errorBody(e), citations: citeOf(chunks) }`).

Sai lầm thứ hai trong đợt này: script sửa của tôi chèn `import { errorBody }` vào
`error-body.js` — **chính file định nghĩa hành vi** — biến nó thành tự-import và hỏng cú pháp.
Bắt được nhờ `node --check` ngay sau; đã viết lại đúng nội dung gốc.

**Bài học chung:** một bộ đo mới luôn phải đo trên **cả hai cách viết** của cùng một lỗi,
và phải có phép thử âm tính. Cả đợt 17 lẫn đợt 18 đều có một lần bộ đo báo nhầm.

#### 11.27.5 `<title>frontend</title>` — sót scaffold lọt tới khách

`frontend/index.html` còn `<title>frontend</title>` (tên scaffold của Vite) và
`<html lang="en">` trong khi sản phẩm mặc định tiếng Việt. Nó hiện ở **tab trình duyệt**,
lịch sử và bookmark — tức mỗi lần trình diễn, khách nhìn thấy chữ "frontend".

Cùng loại: `scripts/ui-verify-v7-pie.mjs` ghi cứng đường dẫn ảnh chụp của máy tác giả, mà
`p2-02-test-portability.mjs` **không bắt** vì bài đó quét `tests/e2e/*` chứ không quét
`scripts/`. Đã sửa cả hai và mở rộng phạm vi bài kiểm.

Lưu ý khi sửa: bài kiểm dò mẫu đường dẫn trên **toàn bộ nội dung file, kể cả comment** —
nên comment giải thích cũng phải tránh viết lại chính mẫu đó (đã dính 2 lần).

#### 11.27.6 52 bài dùng `sleep(3500)` cố định sau khi spawn server

Không bài nào chờ server thực sự lên; tất cả đều đoán 3,5 giây rồi gọi. Chạy cả bộ thì
server mới có thể cần hơn ⇒ đỏ với `TypeError: fetch failed / ConnectTimeoutError`, trông
**giống hỏng sản phẩm**. Đo: `nested-departments.mjs` đỏ đúng kiểu đó (spawn xong 15s sau
vẫn không nối được cổng 3120), chạy riêng thì xanh.

Đã thêm `waitForServer(base)` vào `tests/e2e/lib.mjs` (dò `/api/health` — liveness-only,
**không** chạm DB) và thay ở **56 bài thực sự spawn server**. Bài dùng server dùng chung
không đổi, vì chờ ở đó chỉ thêm độ trễ.

#### 11.27.7 Triển khai một máy (không Docker)

Xem `deploy/single-machine/README.md` (runbook đầy đủ). Tóm tắt:

- `install.sh` sinh bí mật → dựng `frontend/dist` → đăng ký **systemd user unit** → bật
  timer canh gác → khởi động → báo kết quả. Không cần `sudo`.
- `pmo-watchdog.timer` gọi `/api/ready` mỗi 30s. Phải là `ready` không phải `health`:
  `health` không chạm DB nên vẫn trả 200 khi Postgres đã chết.
- `GET /api/admin/production-readiness`: **trước 6/13 → sau 8/13 đạt**. Đóng được
  `node_env`, `jwt_secret`, `data_key`, `app_db_password`, `backup_url`, `least_privilege`.
- `APP_DB_PASSWORD` phải **≥32 ký tự** (`weakSecret()` còn loại giá trị chứa chữ
  `secret`), và phải `ALTER ROLE pmo_app` cho khớp — làm cả hai cùng lúc, nếu không sẽ
  hỏng pool.
- Dòng audit hôm nay đã kiểm chứng bằng phép thử có kiểm: tạo hợp đồng thật → `id 358`,
  dòng audit `resource_id = 358` **khớp đúng**; tạo trùng `contract_no` → **409** (trước
  khi sửa là 500). Đó là bằng chứng cho cả fix `withAudit` lẫn việc trả `e.status`.

**Sai lầm của tôi:** đã bật MFA cho admin + CEO để đóng `strong_auth`, rồi đo được hậu quả
— `POST /api/auth/login` trả `401 MFA_REQUIRED`, tức **cả demo lẫn 126 bài e2e đều không
đăng nhập được** (mọi bài dùng `admin123`). Đã tắt lại qua đúng API và **xoá file secret**.
Script `enable-mfa.mjs` giữ lại để bật khi rời phạm vi demo.

Còn lại 4 mục đỏ, **không cái nào là lỗi sản phẩm**:

| Mục | Vì sao để đỏ |
|---|---|
| `dev_password` | Cố ý bật `ALLOW_DEV_PASSWORD=1` để người trình diễn vào được ngay |
| `shared_password_users` | 8/8 tài khoản dùng `admin123`; đổi thì tài liệu demo và 126 bài e2e phải sửa theo |
| `strong_auth` | Như mục trên — bật MFA làm hỏng demo (xem trên) |
| `uploads_volume` | **Giới hạn máy, không phải lời chọn**: cả máy chỉ có một filesystem (`/dev/sdd` ext4); tách `UPLOADS_DIR` cần `mount` ⇒ cần `sudo`, mà `sudo -n` thất bại. Runbook có sẵn lệnh |

`PRODUCTION_ENFORCE_READINESS` để **0**: cờ đó làm backend từ chối boot khi còn mục
readiness mức `fail` — bật lên bây giờ thì dịch vụ không dậy nổi. Nó chỉ nên bật **sau khi**
đóng 3 mục kia, tức khi checklist thành rào chắn thật chứ không phải trang trí.

#### 11.27.8 Dọn `audit_log`: 4.280 dòng `resource_id = 0`

Được phép xoá. Đo trước khi xoá, phân loại rõ để **giữ đúng thứ cần cho demo**:

| Nhóm | Số dòng | Xử lý |
|---|---:|---|
| `resource_id > 0` (id thật) | 7.305 | **giữ** — dấu vết truy được cho demo |
| `resource_id IS NULL` | 2.410 | **giữ** — hợp lệ cho sự kiện không-resource (`user/LOGIN_FAILED`, `MFA_FAILED`) |
| `resource_id = 0` | 4.280 | **xoá** — id giả, trỏ vào không có gì |

Còn lại 9.715 dòng. Lưu ý khi dọn: `audit_log` **không** có FK tới bảng nghiệp vụ (đúng
thiết kế — audit phải sống sót cùnh resource), nên sau khi bài kiểm xoá dữ liệu thử, dòng
audit của nó vẫn còn và trỏ vào dòng không tồn tại. Đo: 944/1.193 dòng `shop_drawing` mồ
côi, id nằm trong khoảng lịch sử từ **2026-09-04** ⇒ dữ liệu demo đã dựng lại nhiều lần,
**không phải** fix `withAudit` ghi sai id (đã kiểm chứng bằng phép thử hợp đồng ở 11.27.7).

### 11.28 Đợt 19 — bốn bài "Docker": cả bốn đều không cần Docker, và ba lỗi trong chính bài kiểm

Tên bài khiến người đọc tin rằng cần Docker daemon. Không cần. Chúng **tự nói** ở dòng đầu:

| Bài | Dòng đầu của chính bài | Kết quả chạy thật |
|---|---|---|
| `p0-08-docker-context` | *"No docker daemon here"* | ALL PASS |
| `p2-01-docker-build` | *"hermetic — no daemon, no /tmp"* | ALL PASS (sau khi thêm kiểm tra mới) |
| `p4-docker` | *"no docker daemon here — static + unit checks"* | ALL PASS (sau khi sửa 5 lỗi) |
| `p4-docker-verify` | *"Requires: backend running on :3000, PG on :5433"* — tức cần **ứng dụng**, không cần container | **27/27** |

`NEEDS_EXTERNAL` vì vậy **rỗng**: không còn bài nào bị bỏ qua vì lý do sai. Bộ chạy:
**141 bài thật đều PASS · 0 FAIL**; 3 file helper, 2 bài AI theo cờ `RUN_AI=1` (đã chạy thật
và xanh).

#### Lỗi trong `p4-docker.mjs`

1. **Bài kiểm bị `backend/.env` thật chen vào giữa.** Đoạn kiểm `DB_*` xoá `DATABASE_URL` rồi
   set `DB_HOST…`; tiến trình con nạp `backend/.env` (vì `db/index.js:49` chỉ bỏ qua file đó
   khi **cả hai** nhóm biến đã được cấp tường minh) ⇒ `.env` đặt lại `DATABASE_URL` ⇒ bài
   báo URL sai. Sửa: truyền thêm `APP_DB_USER` vào môi trường con — đúng kịch bản thật của
   khách hàng dùng `DB_*`, chứ không phải lách kiểm.
2. **Kiểm tra `.env` ở sai đường dẫn.** Bản cũ kiểm `${ROOT}/.env` — **gốc repo** — trong
   khi sản phẩm thật sự nạp `backend/.env`. Nó kiểm một đường dẫn không mang bí mật nào và
   bỏ lọt đúng cái file cần canh. Nay kiểm **cả ba** (`backend/.env`, `deploy/single-machine/pmo.env`)
   và theo dạng *có bị git bỏ qua không* — đó mới là bất biến thật, vì trên máy phát triển
   `backend/.env` **phải** tồn tại.

#### Lỗi trong chính các kiểm tra tôi mới thêm (đáng ghi)

Cả ba đều là "kiểm tra xanh vì không kiểm được gì":

1. `execSync(..., { stdio: 'ignore' })` trả **`null`**, không phải Buffer. `return execSync(...)`
   vì thế **falsy dù file ĐÃ bị gitignore** — bài báo đỏ cho cả ba file, trong khi
   `git check-ignore -v` xác nhận cả ba đều bị ignore (`.gitignore:21` và `:85`).
2. Mẫu glob `frontend/package*.json` có **phần thư mục**, tôi lại so với `basename()` ⇒ không
   khớp gì ⇒ hai `COPY` **hợp lệ** bị báo sai.
3. So `psql` (tên **nhị phân**) với `postgresql-client` (tên **gói Debian**) — không thể so
   trực tiếp. Đã thêm bảng ánh xạ nhị phân → gói.

Và một lỗi ở `p4-docker-verify.mjs`: tôi gọi `ok(cond, label)` thay vì `ok(label, cond)` ở
3 khẳng định ⇒ cả hai tham số đều truthy ⇒ **3 kiểm tra không thể thất bại mà vẫn xanh**.
Đã sửa, và âm tính xác nhận cả ba bắt lỗi thật.

#### Những gì giờ mới thật sự được kiểm

- **Mọi nguồn `COPY` resolve được trong build context** (có xử lý glob) **và không bị
  `.dockerignore` loại**. Trước đó bài chỉ kiểm Dockerfile *có chứa chuỗi* `frontend/package`.
- **`npm ci` có lockfile** bên cạnh mọi `COPY package*.json` — không có thì build dừng ngay.
  Trước đó chỉ kiểm lockfile của `backend`; `frontend` **chưa** được kiểm.
- **Mọi lệnh ngoài mà entrypoint dùng đều được cài trong image.** `docker-entrypoint.sh` chờ
  Postgres bằng `psql`; thiếu `postgresql-client` thì vòng chờ **luôn** thất bại ⇒ sau 60 giây
  container thoát, và điều đó chỉ lộ ra lúc chạy container chứ không lộ ra khi đọc mã.
- **Lệnh `HEALTHCHECK` chạy thật**, kiểm cả hai chiều: server khoẻ ⇒ exit 0, cổng đóng ⇒
  exit khác 0, và không dùng `wget`/`curl` (image `node:22-slim` không cài chúng).
- **`APP_DATABASE_URL` thuộc `buildAppDatabaseUrl()`, không phải `buildDatabaseUrl()`** — bài
  kiểm của tôi ban đầu gọi nhầm hàm nên luôn đỏ.

Còn lại sau khi kiểm: `minio` trong `docker-compose.yml` là **tùy chọn** (`STORAGE_DRIVER=s3`,
mặc định local disk) — dịch vụ thật, không phải bản mẫu bị bỏ sót.

### 11.29 Đợt 20 — bản "đã triển khai" không tự quay lại sau một đêm

Đợt 18 triển khai thật, đợt 19 sửa 4 bài "Docker". Cả hai đều **tĩnh** — đọc Dockerfile, đọc
compose, kiểm `.dockerignore`. Không đo nào chạm tới câu hỏi duy nhất quan trọng khi máy
thật: *sau khi nó chết, nó có tự quay lại không?*

Đo 2026-09-30, sáng hôm sau, trên đúng bản đó:

```
pmo-api.service   → active          ← nhìn từ ngoài thì "đang chạy"
/api/health       → 200             ← đúng thiết kế: liveness-only, không chạm DB
/api/ready        → 503             ← nhưng không truy vấn nào được
pg_isready :5433  → no response     ← Postgres đã chết từ tối hôm trước
```

Không ai biết, và **lệnh khôi phục trong runbook không chạy được**:

```
$ ./backend/scripts/pg-ctl.sh start
PG already running (pid file exists)     ← in ra thành công
$ pg_isready -h 127.0.0.1 -p 5433
127.0.0.1:5433 - no response
```

#### Bốn lỗi, xếp theo thứ tự phát hiện

1. **`pg-ctl.sh start` tin `postmaster.pid` thay vì hỏi cổng.** Sau reboot hoặc khi
   postmaster bị kill, file vẫn còn nguyên nên `start` thành no-op **báo thành công**.
   Đây là lỗi nguy hiểm nhất trong loạt: nó không hỏng, nó **nói dối người vận hành**.
   Nay hỏi `pg_isready` trước; dọn `postmaster.pid` **chỉ khi `kill -0` xác nhận pid đã
   chết** (xoá khi pid còn sống thì cho phép dựng postmaster thứ hai trên cùng data dir ⇒
   hỏng dữ liệu); và xác nhận bằng cổng sau khi `pg_ctl` in "server started", vì `pg_ctl`
   có thể in thành công rồi chết ngay.

2. **Không có gì tự bật Postgres.** `pmo-api.service` là user unit nên tự lên sau reboot;
   Postgres thì chạy bằng tay qua `pg-ctl.sh` nên **không**. Thêm `pmo-db.service`
   (oneshot + `RemainAfterExit`) và `Requires=pmo-db.service` + `After=` trên API: DB lỗi
   thì app không bật, tốt hơn "dịch vụ báo sống nhưng mọi truy vấn hỏng".

3. **`pg-ctl.sh` tìm `pg_ctl` chỉ qua `PATH`.** Dưới systemd user unit, `PATH` là
   `/usr/local/bin:/usr/bin:/bin:...`, không có Homebrew ⇒ unit fail ngay với *"PostgreSQL
   binaries not found"*, trong khi gõ tay thì chạy tốt. Cùng lý do đó, thông báo lỗi phải
   **liệt kê** các chỗ đã thử thay vì một dòng chung chung khiến người đọc tưởng máy chưa
   cài Postgres.

4. **Watchdog chỉ ghi log, không phục hồi.** Timer 30 giây phát hiện `503` rồi đứng yên —
   nhật ký đầy mà không ai sửa. Thêm `--heal`.

#### Rồi thì hỏng tiếp — hai lỗi trong chính cách sửa

5. **Hai chủ sở hữu cùng một Postgres.** Watchdog gọi `pg-ctl.sh start` **trực tiếp**, tức nó
   dựng một Postgres mà systemd không biết. Rồi khi systemd hạ `pmo-db.service` thì
   `ExecStop` gọi `pg-ctl.sh stop` và giết **đúng instance watchdog vừa dựng**. Đo: Postgres
   hồi lại lúc 20:40:43, nhận *"received smart shutdown request"* lúc 20:40:44 — một giây
   sau khi khoẻ, và không ai hiểu vì sao. Sửa: watchdog phục hồi **qua systemd**
   (`systemctl --user restart`), `pg-ctl.sh` chỉ còn là đường lùi khi chạy tay ngoài systemd.

6. **`TimeoutStartSec=60` giết watchdog giữa lúc đang dựng DB.** Số thực tế: probe 13s +
   dựng PG 25s + probe lại 13s. systemd giết tiến trình, `pg_ctl` con bị giết theo, rồi
   hạn mức 5 phút làm mất cả cửa sổ hồi phục kế tiếp. Nâng lên 240s.

Rồi thêm hai lỗi nhỏ hơn, cùng loại "nhìn đúng chỗ sai":

7. **`execFileSync(..., { stdio: 'ignore' })` ⇒ `e.stderr` rỗng** ⇒ thông báo lỗi chỉ còn
   *"Command failed"*. Mất 20 phút chẩn đoán cho lỗi ba chữ. Phải bắt `pipe`.
8. **Gộp argv:** `systemctl --user restart 'pmo-db.service pmo-api.service'` ⇒ systemd báo
   `Invalid unit name "pmo-db.service pmo-api.service" escaped as "pmo-db.service\x20pmo-api.service"`.
   Phải truyền **từng phần tử**. Lỗi này cũng chỉ lộ ra nhờ (7).

#### Kết quả đo được

```
$ kill -9 $(head -1 data/pgdata/postmaster.pid)     # 21:09:06
21:09:12  LỖI  không kết nối  12941ms
21:09:19  → Postgres chết — đã restart pmo-db.service + pmo-api.service
21:09:20  OK  200  1070ms  db=ok
```

Gián đoạn **14 giây**, không cần người. Giữ yên thêm 3 phút: 0 lần restart lạ.

#### Bài kiểm

`tests/e2e/deploy-recovery.mjs` (145 bài, thêm vào đợt này) dựng `data/pgdata` giá trong
`tmpdir` với `pg_isready`/`pg_ctl` giả để kiểm `pg-ctl.sh` **mà không đụng dữ liệu thật**,
rồi kiểm watchdog, `pmo-db.service`, `TimeoutStartSec`, và `install.sh`.

Bài này phải trải **7 phép thử âm tính** trước khi tin. Bốn trong số đó bắt được ngay, và
**ba lỗi nằm trong chính bài kiểm**:

| Sai lệch | Vì sao lọt | Cách sửa |
|---|---|---|
| Cắt `unitCmd` tới `dbIsUp` | `dbIsUp` nằm **trước** `unitCmd` ⇒ lát cắt rỗng ⇒ luôn xanh | cắt tới hằng kế tiếp sau hàm |
| Cắt tới `healOnce` | lát cắt **rộng quá**: `dbIsUp()` cố ý dùng `stdio:'ignore'` ⇒ đỏ oan | phải khớp **đúng ranh giới hàm** |
| So `pmo-db.service` ở đâu đó trong hàm | **thông báo trả về** làm khẳng định xanh dù lệnh đã bị xoá | soi **đối số** của lời gọi `unitCmd` |
| `COOLDOWN_MS` bắt bằng `([\d_]+)` | trên `5 * 60_000` ra `5` ⇒ đỏ oan | phải **tính** biểu thức |
| Kiểm `"stdio: 'ignore'"` không có trong hàm | **comment giải thích trong chính hàm** chứa đúng chuỗi đó | lọc comment trước khi so |
| Kiểm `/COOLDOWN_MS/.test(w)` | chỉ kiểm **có tên**, nên đặt `= 0` vẫn xanh | kiểm **giá trị** ≥ 60 000 |

Cái thứ ba và thứ năm là cùng một bài học đã ghi ở đợt 15: bài kiểm quét **cả comment** và
**chuỗi thông báo**, nên "có mặt ở đâu đó trong hàm" không phải bằng chứng hành vi. Ba lần
trong một phiên, đều do phép thử âm tính bắt chứ không phải do đọc code.

Một lỗi tự chính: `pgrep -f "data/pgdata"` khớp luôn dòng lệnh của chính shell, nên `kill -9`
giết shell đang chạy lệnh. Phải lấy pid từ **pid file** hoặc dùng mẫu không khớp dòng lệnh.

### 11.30 Đợt 21 — dời lịch demo về hiện tại, và ba lỗi do chính việc dời

Đợt 18 triển khai, đợt 20 vá lớp bền vững. Đợt này là **mục 13** trong
`docs/DATA_DECISIONS_REQUIRED.md` — mục chặn UAT duy nhất còn lại — và nó không đơn giản
như tưởng.

#### Sự nhầm ban đầu: dời ngày **không** làm nén lịch khả thi

Tôi mở đầu đợt này với niềm tin rằng dời lịch 2019 → 2026 sẽ khiến nén lịch chạy được.
Đo thì **không**:

```
trước khi dời:  đích +30d → feasible=false, calendar_end=2027-06-25
sau  khi dời:  đích +30d → feasible=false, calendar_end=2027-06-25   ← y hệt
```

Lý do nằm ở `lib/cpm.js:mapToCalendar`: hạng mục **chưa làm** được dàn lịch ra từ
`todayStr()`, nên `calendar_end` luôn bằng hôm nay + đường găng còn lại, **không** phụ
thuộc ngày lưu trong DB. Vậy đây là **hai vấn đề tách biệt** và phải sửa cả hai:

| Vấn đề | Sửa ở đâu |
|---|---|
| Mọi báo cáo hiện số của 7 năm trước | `scripts/rebase-demo-dates.mjs` |
| 422 không nói phải thử đến bao giờ | `routes/schedule-compress.js`: `earliest_feasible_target` |

Đáng ghi: nếu tôi chỉ sửa một và đo bằng "giao diện trông đẹp hơn" thì UAT vẫn đỏ, và
tôi sẽ báo là xong.

#### `earliest_feasible_target`: đoán một phát là **sai**

Bản đầu trả `calendar_end + 1`. Đo thì ngay:

| mục tiêu | `calendar_end` |
|---|---|
| 2026-10-30 | 2027-06-25 |
| 2027-03-29 | 2027-07-01 |

Mục tiêu **xa hơn** thì lịch tính ra **dài hơn** — vì xa hơn thì nén ít hơn. Nên gợi ý
`2027-06-26` dùng vào lại **không** khả thi. Đây là bài toán điểm cố định, phải **tìm**:
quét thô theo bước 15 ngày trong chân trời 900 ngày, rồi nhị phân về độ phân giải một ngày.
Đo: gợi ý 2027-07-24, dùng vào thật sự `feasible=true`, tìm trong 1,3 giây.

Phụ thuộc cứng phát sinh kèm: ngày nghỉ phải nạp trong **cửa sổ chân trời tìm kiếm**, không
phải tới mục tiêu đầu vào. Nạp hẹp rồi thử rộng ⇒ các vòng sau dùng thiếu ngày nghỉ ⇒ tính
ra lịch ngắn hơn thật ⇒ **báo khả thi sai**. Đã tách `calc(target)` thành hàm thuần, không
đụng DB, nên tìm kiếm không tốn truy vấn nào.

#### Phạm vi dời: rộng hơn nhiều so với "lịch"

Bản đầu tôi chỉ liệt kê 4 bảng gắn `project_id`. Đo `information_schema` ra **19 bảng
gắn dự án** cộng 4 bảng nối gián tiếp (`schedule_baseline_items` qua `baseline_id`,
`invoices` qua `contract_id`, `payment_requests` qua `invoice_id`, `daily_work_items` qua
`daily_report_id`). Dời lịch mà không dời payment/contract thì demo **tự mâu thuẫn**: lịch
năm 2026 còn hợp đồng ký năm 2019. Tổng cộng 66 207 dòng, trong đó `schedule_baseline_items`
 một mình đã 63 936 dòng.

#### Ba lỗi trong chính công cụ dời, mỗi lỗi đều bị bắt bằng `--dry-run`

1. **Tính offset từ `max(plan_end_date)` toàn cục.** Dự án thử `PILOT-001` kết thúc
   2026-10-30, muộn hơn dự án demo 2019–2020 sáu năm ⇒ `max` rơi vào nó ⇒ offset chỉ 60
   ngày ⇒ lịch demo chỉ dịch từ 2019-05 sang 2019-07. Vẫn cũ, vẫn hỏng. Sửa: chỉ tính trong
   **nhóm dự án đã cũ**, và mọi `UPDATE` khoanh trong đúng nhóm đó — nếu chỉ sửa phép tính
   mà không khoanh thì sẽ **kéo cả dự án đang ở 2026** đi 60 ngày, tức phá đúng dữ liệu
   đang muốn giữ.
2. **`projects` không có cột `project_id`** (khoá chính của nó là `id`) ⇒ lỗi ngay dòng
   đầu. Rồi `schedule_baseline_items` **không có cột `id`** nữa ⇒ khoanh bằng `t.id IN (…)`
   hỏng tiếp. Sửa: `scopeFor(how, ids)` sinh điều kiện theo đúng đường nối của từng bảng.
3. **`SET` cần `cột = CASE …`**, không phải `CASE` trần. Và thứ tự tham số phải **xen kẽ**
   theo thứ tự `?` xuất hiện trong SQL (cutoff, offset, cutoff, offset…) — gom hết offset
   rồi mới tới cutoff cho `bind message supplies N parameters, but prepared statement
   requires M`.

#### Quy tắc quan trọng nhất của lần này: **chỉ dời ô thật sự đã cũ**

Bản đầu dời mọi ô có giá trị trong nhóm dự án. Đo thấy hai thứ đang ở **hiện tại**:

| Ô | Giá trị | Nếu dời 2504 ngày |
|---|---|---|
| `attention_digest_runs.digest_date` | 2026-09-26 → 29 | 2033 ⇒ **cron tưởng hôm nay chưa chạy digest** ⇒ gửi trùng |
| `projects.end_date` (BTE) | 2027-01-20 | 2033-11-27 ⇒ phá dữ liệu **đang hợp lý** |

Nên công cụ chỉ dời ô còn nằm trong quá khứ, **theo từng cột**, và giữ ô ở hiện tại. Cách
này tự loại được mọi trường hợp tương tự mà không cần danh sách cấm thủ công — đúng bài học
"encode rule vào cấu trúc, đừng ghi vào danh sách".

#### Hệ quả ngoài dự kiến: thêm bảng làm **hỏng sao lưu**

Thêm `demo_date_rebase` xong thì `POST /api/admin/backups/run` trả **500**:
`permission denied for table demo_date_rebase`. Nguyên nhân: `ALTER DEFAULT PRIVILEGES`
trong `deploy/production/00-backup-role.sh` chỉ phủ object tạo **sau** nó **bởi đúng role
đã đặt**; migration chạy bằng `pmo_user` còn script thường chạy bằng `vutun` ⇒ bảng mới
tạo bởi `pmo_user` không được phủ. Script đã cảnh báo đúng nguyên nhân bằng comment nhưng
không **chặn** được.

Sửa: `init.js` cấp lại `GRANT SELECT` cho `pmo_backup` trên toàn bảng/sequence **sau mỗi
lần migrate**, và chỉ khi role tồn tại. Rẻ, và tự phục hồi.

`backup.mjs` trước đó **không** bắt được lớp lỗi này vì bảng mới không có dòng dữ liệu
nên `pg_dump` không đọc tới nó. Nay bài kiểm kiểm **quyền** trực tiếp — thứ phụ thuộc vào
*số bảng*, không phụ thuộc vào *số dòng*.

#### Hai bài kiểm tự báo sai, phát hiện bằng phép thử âm tính

- `backup.mjs`: tôi gọi `ok(!unreadable, …)` trong khi `ok`/`ng` của file này là **hàm ghi
  log** `(name, detail)`, không phải khẳng định ⇒ **luôn in PASS**. Âm tính bằng cách
  `REVOKE` rồi chạy: vẫn `PASS — false: … thiếu: demo_date_rebase`. Đây là lần thứ tư
  trong hai đợt gặp kiểm không thể thất bại; lần nào cũng do phép thử âm tính bắt.
- `backup.mjs`: `has_sequence_privilege` ném `pg_toast_24682 is not a sequence`. Nguyên
  nhân **không** phải truy vấn sai: **thứ tự đánh giá điều kiện trong Postgres không được
  bảo đảm**, nên hàm được gọi trên dòng mà `nspname='public'` sẽ loại. Viết subquery
  trong `FROM` **không** đủ — Postgres **rút phẳng** (subquery pull-up) subquery đơn giản
  và nhét điều kiện lọc ngược vào `WHERE`. Chỉ `WITH … AS MATERIALIZED` mới chặn được.
  Và overload 3 tham số phải đặt **user trước**: `has_sequence_privilege(user, seq, priv)`.

#### `secrets-hygiene` chỉ bắt đầu có tác dụng **sau khi commit`

Commit xong thì bài này đỏ: nó quét `git ls-files`, mà trước đó chính nó
(`tests/e2e/secrets-hygiene.mjs`) và `docs/SECRET_ROTATION_RUNBOOK.md` **chưa được track**
nên không bị thấy. Sau khi track, cả hai bị báo vì chứa tiền tố `sk-or-v1-` trong **văn
xuôi**.

Đây đúng là bài học đã ghi ở đợt 15: *bằng chứng chỉ đúng tại thời điểm nó được đo*. Ở đây
thêm một nghịch lý: **không sửa thì bài kiểm không bao giờ được commit**, mà bài kiểm nằm
ngoài repo thì không kiểm được gì trong CI. Sửa bằng cách phân biệt *khoá thật* với *mẫu
phát hiện*: đòi **≥32 ký tự khoá vật liệu** liên tiếp ngay sau tiền tố, và loại trừ dấu
`…`/`...`. Thử âm tính: dán khoá 48 ký tự hex thật vào file được track ⇒ báo đỏ đúng.

#### Lỗi dữ liệu phát sinh: 25 hạng mục kết thúc trước khi bắt đầu

`plan_end_date = plan_start_date − 1 ngày`, toàn bộ 25 hạng mục ở nhóm "Hệ thống cấp thoát
nước". Dời hằng số **không thể** tạo ra, nên đây là lỗi dữ liệu nguồn. Cột
`plan_duration_days` không dùng làm chuẩn được: chỉ **14/716** dòng khớp khoảng ngày, nó
gần như độc lập với ngày. Sửa bằng cờ riêng `--fix-inverted` (tách khỏi dịch ngày vì đây là
sửa **ngữ nghĩa dữ liệu**, không phải dịch) thành hạng 1 ngày; chạy lại báo 0 nên
idempotent.

#### Bài kiểm

`tests/e2e/demo-dates-relative.mjs` (146 bài). Nó kiểm 5 nhóm: lịch nằm quanh hiện tại;
chạy lại không trôi; thời lượng bất biến và không hạng mục nào đảo; ô vốn ở hiện tại không
bị đụng; và nén lịch có chỉ đường.

Trong lúc viết, bài này bắt được 2 lỗi của chính nó: lát cắt hàm sai ranh giới (cắt tới
hàm nằm **trước** ⇒ lát cắt rỗng ⇒ luôn xanh) và `JSON.stringify(sql)` + `bash -c` biến
newline thành chữ `\n` mà `psql` không hiểu. Sửa bằng cách truyền **mảng tham số** cho
`execFileSync` — không còn lớp trích dẫn nào để sai.

### 11.31 Đợt 22 — D4: dựng sổ S&P mẫu, và ba lỗi sản phẩm đã chôn suốt đời

Chủ dự án quyết 6 mục (2026-09-30): D1=A (demo, không UAT) · D2=A (giữ `admin123`) ·
D3=D (không ký 15 mục) · **D4=C** (dựng sổ S&P từ dữ liệu đang có) · D5=B · D6=A.

#### D5: tôi đã ghi **sai nguyên nhân**, và sai theo hướng đáng sợ

Tài liệu bàn giao ghi *"mục `uploads_volume` cần `sudo`"*, kèm lệnh
`mkfs.ext4 /dev/sdd5`. Đo:

```
$ lsblk -no NAME,FSTYPE,SIZE,MOUNTPOINT
  sda  388.4M disk      sdb  186M disk
  sdc  2G disk [SWAP]   sdd  1T disk /mnt/wslg/distro
$ findmnt -no SOURCE,FSTYPE,TARGET /   →  /dev/sdd  ext4  /
```

Máy là WSL2 với **một** filesystem, **không có phân vùng nào**. `/dev/sdd5` trong lệnh cũ
**không tồn tại**. `uploads_volume` so `stat().dev` của thư mục với thư mục cha — ở đây hai
giá trị luôn bằng nhau ⇒ mục này **không thể** xanh, kể cả khi là root. Muốn có filesystem
thứ hai thì phải phân vùng lại đĩa, tức thay image.

Nguyên nhân gốc **không phải thiếu quyền**. Sai như vậy thì tệ hơn nhiều: nó chỉ cho một
người ra lệnh sẽ làm hỏng máy. Đã viết lại cả README lẫn output của `install.sh`.

Cùng kiểu: README và `install.sh` vẫn liệt kê `loginctl enable-linger` ở mục "còn phải
làm", nhưng đo `loginctl show-user vutun --property=Linger` → **`Linger=yes`**. Đã ghi rõ
là **đã xong**, giữ lệnh cho máy khác.

#### D4: vì sao phải sinh file bằng công cụ chứ không làm file tay

Bảng kê thật mỗi cột phải **truy được về một trường trong DB**, và bố cục cột bám đúng
`locateMaterialHeader` + `locatePaymentCols` — trong đó có hai ràng buộc chỉ có trong code,
không có trong tài liệu nào:

- `locatePaymentCols` dò từ `map.actualCol + 1` ⇒ khối tiền **phải nằm bên phải** cột
  "ngày thực tế giao".
- `contractDateCol` dò từ `deliveryAnchor` ⇒ "ngày ký" **phải nằm sau** "thời gian giao".

#### Ba lỗi sản phẩm thật, tất cả đều **im lặng**

1. **Nhánh PAID của importer S&P chưa từng chạy được.** `sp_ap.commit()` đọc
   `flipped.rowCount`, nhưng `db.prepare().runAsync()` trả `{ lastInsertRowid, changes }`
   (`db/index.js:218`) ⇒ `!undefined` luôn đúng ⇒ **mọi** dòng đã trả đều ném lỗi.
   Đo: trước khi sửa **45/45** dòng đã trả đỏ, sau khi sửa **0/45**.

   Nó bị che vì cả 14 file `Vật tư *.xlsx` trên máy đều có **ô thanh toán rỗng** ⇒ không
   dòng nào có `paid_date` để đi vào nhánh đó. Tức một nhánh nghiệp vụ quan trọng đã chết
   âm thầm, chỉ vì dữ liệu đầu vào chưa từng chạm tới.

   *Khi đọc code, đừng quy `rowCount` là sai:* 6 chỗ khác cũng viết `.rowCount`
   (`routes/shop.js`, `routes/payment.js` ×2, `routes/qa.js`, `routes/projects.js`,
   `routes/schedule-compress.js`) nhưng chúng gọi **`client.query()` thô**, mà `pg` trả
   `rowCount` thật. Chỉ chỗ đi qua shim `db.prepare()` là sai. Phân biệt bằng **kết quả lấy
   từ đâu**, không phải tên trường.

2. **`locatePaymentCols` dò cột trên cả dòng dữ liệu.** `band` gồm `headerRow … +2`, mà
   với sheet một dòng tiêu đề thì `+1`, `+2` là **dữ liệu**. Một ô chứa chữ `PAID` ở cột
   `Status` bị nhận nhầm là cột "ngày thanh toán thực tế" ⇒ mọi dòng mất ngày trả, trong
   khi `parse` vẫn ra đủ hạng mục và `commit` báo `errors: 0`. Nay band chỉ gồm dòng tiêu
   đề (`map.dataStart` cho biết dữ liệu bắt đầu ở đâu).

3. **`pr.amount` đọc từ object in-memory vốn không có trường đó.** Nhánh tạo mới gán
   `{ id, status }`, nhánh tìm thấy thì `SELECT id, status` ⇒ `Number(undefined ?? 0)` = 0
   ⇒ mọi dòng đã trả ném *"has no usable amount"*. Nay đọc từ DB.

#### Bốn lỗi trong chính công cụ sinh file (đều bắt bằng đo, không bằng đọc)

- Gộp tiêu đề cảnh báo **vào cùng dòng header** ⇒ mọi cột lệch 2, `paidCol = null`, không
  dòng nào có ngày trả, mà `parse` vẫn ra 122 hạng mục và `errors: 0`. Sửa: tiêu đề ở
  dòng riêng.
- Tên cột ngày trả là `Ngay TT thuc te` — **không** khớp regex `thuc te tt`. Nó chỉ khớp
  **tình cờ** nhờ giá trị `"PAID"` trong dữ liệu, tức bài kiểm xanh vì lý do sai. Sửa tên
  cột cho đúng và sửa (2) để không còn dựa vào tai nạn này.
- Ngày ghi bằng `YYYY-MM-DD` ⇒ `toDate` trả `null` (chỉ hiểu `Date` hoặc `dd/mm/yyyy`) ⇒
  **mọi** cột ngày rỗng, `payments = 0`, `errors = 0`. Dùng `dd/mm/yyyy` để không có phép
  chuyển múi giờ nào xen vào (`toDate(Date)` cắt `toISOString()` theo UTC).
- `xlsx.writeFile` của `@e965/xlsx` không có binding `fs` ⇒ `cannot save file`. Sinh buffer
  rồi tự ghi.
- **Backtick trong comment SQL** bên trong template literal chấm dứt chuỗi sớm ⇒
  `missing ) after argument list`. Comment trong SQL không được chứa backtick.

#### Dữ liệu: số yêu cầu thanh toán **trùng nhau**

Đo: 133 dòng nhưng chỉ **125** `request_no` khác nhau (`HBG-BTE-YCVT-HVAC-` xuất hiện 4
lần). Importer khoá invoice theo `(contract_id, invoice_no)` và `invoice_no = request_no`
⇒ dòng thứ hai trùng số trỏ về cùng một PR mà dòng trước đã chuyển PAID ⇒ lỗi *"only
PENDING or APPROVED can be imported as PAID"*. **Importer cảnh báo đúng; dữ liệu mới là
thứ sai.** Công cụ lấy mỗi số một lần và **không** bịa hậu tố, để số trong file vẫn là số
thật.

#### `step1-06`: ba lỗi trong chính bài kiểm, mỗi lỗi chặn cả bài

1. Gõ thẳng `MEP-BTE-MSA-01.xlsx` trong khi đĩa chỉ có `Vật tư GEN.xlsx` ⇒ `ENOENT` **crash**.
   Đúng loại lỗi comment của chính bài đã ghi cho trường hợp SHOP — đã sửa cho SHOP, sót ở MAT.
2. Lọc `/^MEP-BTE-SHD-.*\.xlsx$/` trên `readdirSync` trong khi đĩa có `Shop BOH.xlsx` ⇒ khớp
   **0 file** ⇒ "shop zones ingested" báo 0 và mọi khẳng định phía sau đỏ theo.
3. `zoneOf` suy zone từ tên chuẩn ⇒ 14/16 file lịch ra `null` và rơi hết vào một zone ⇒
   "OTD by_zone" chỉ ra 2 zone. Nay suy thêm từ tên gốc (`TĐ BPV-2 BR.xlsx` → `BPV`).

#### Bốn ngưỡng của `step1-06` là **con số tuyệt đối viết cho dữ liệu chưa tồn tại**

Vì bài chưa bao giờ nạp được file nào, các ngưỡng chưa từng được kiểm:

| Ngưỡng cũ | Đo được | Vì sao không đạt được |
|---|---|---|
| `shopOk > 300` | 221 | 13 file × ~17 drawing; số dòng đổi theo dữ liệu |
| `msa.ok >= 40` | 10 | bài nạp **một** file, file lớn nhất có **33 dòng** |
| `mat >= 40` | 10 | cùng lý do |
| `matched[0].db_rows > 30` | 12 | chỉ kiểm **zone đầu tiên**; lúc chỉ có 1 zone thì "đầu tiên" cũng là "tất cả" |

Đổi thành **khẳng định quan hệ** — không trôi theo khối lượng dữ liệu: đủ file và không lỗi;
nạp được dòng; `kpi === committed`; và **tổng** dòng của các zone khớp.

Riêng chênh lệch `rollup 60% ↔ db 100%` thì **báo, không phán**: đó là câu hỏi *dữ liệu*
(thuộc `DATA_DECISIONS_REQUIRED` mục 3, chưa ký), không phải lỗi *code*. In ra rồi đỏ sẽ
biến câu hỏi nghiệp vụ thành lỗi kỹ thuật, và lần chạy sau sẽ bị bỏ qua vì "biết rồi".

#### Rác của `step1-06` làm hỏng **ba bài khác**

`step1-06` không dọn `work_items` ⇒ FK chặn ⇒ xoá dự án thất bại ⇒ còn sót
`BTE-FULL-<ts>` với lịch 2019. Dự án sót đó làm đỏ:

- `demo-dates-relative.mjs` (3 khẳng định) — nó quét **mọi** dự án.
- `p5-golden.mjs` (1) — khẳng định tập dự án ACTIVE của tenant demo.
- `reconcile-values.mjs` (2) — đối soát khóa theo dự án.

Đã sửa chuỗi dọn và giới hạn phạm vi các bài kia về **dự án demo**. Xoá rác thì cả ba bài
xanh trở lại mà không cần sửa gì thêm — minh hoạ đúng quy tắc "bài kiểm phải tự dọn".

#### Giới hạn thật của việc dời lịch — nói thẳng

Dịch chuyển là ở mức **DB**. `reference_sheets/` là bản gốc của khách hàng với ngày 2019
và **không được sửa**. Nên **nạp lại từ hồ sơ gốc sẽ đưa ngày cũ trở lại** cho dự án đó.
Đây là đánh đổi đã chọn; bài kiểm chỉ canh phần DB và giờ kiểm tra riêng rằng bài kiểm
không để lại dự án tạm.

### 11.32 Đợt 22 (tiếp) — `reconcile-values` là bài kiểm **phụ thuộc thứ tự**

Sau khi bỏ qua "20 dòng mất" với lý do "dữ liệu demo", tôi chạy lại: nó **xanh** khi chạy
riêng. Vậy đó là bài kiểm phụ thuộc trạng thái còn sót của bài khác — và điều đó tệ hơn lỗi
dữ liệu, vì nó đỏ *ngẫu nhiên theo thứ tự*.

#### Tái hiện, thay vì đoán

Viết quét chạy lần lượt **141 bài đứng trước `reconcile-values`**, chụp số dòng dự án
demo sau mỗi bài:

```
baseline schedule/shop/material = 864/200/203
(141 bài chạy xong, không bài nào đổi số dòng)
cuối: 864/200/203
→ chạy reconcile ngay sau đó: FAIL — 20 mất   ← tái hiện đúng, hai con số giống hệt
```

Số dòng nghiệp vụ **không đổi**, nên thứ đổi không phải dữ liệu mà là **phạm vi truy vấn**.

#### Nguyên nhân

`reconcile-pilot-data.mjs`:

```js
const scopeUploadId = uploadId || (await findUploadId(db, row.file, projectId));
```

`uploadId` chỉ có khi `--apply`, nhưng `|| findUploadId(...)` vẫn tra theo **hash nội
dung**. Tìm thấy thì truy vấn đối chiếu thu hẹp còn `upload_id = <id>`:

```sql
SELECT * FROM <bảng> WHERE project_id = $1 AND ($2::int IS NULL OR upload_id = $2)
```

Đo trên dự án demo: `construction_schedule_items` có **816/864** dòng `upload_id = NULL`,
chỉ **48** dòng có `upload_id`. Nên khoá theo upload **loại 816 dòng đang tồn tại** khỏi
phép so ⇒ 20 dòng nguồn của `TĐ KID.xlsx` bị coi là "mất".

Và vì `findUploadId` tra `file_uploads` — bảng mà **11 bài kiểm** sửa (`bim-intake`,
`bim-viewer`, `regression-wave5`, `step1-06`, `file-access`, `daily-wizard-configure`,
`upload-tenant-scope`, `p1-generic-rows`, `cleanup-demo`, `p5-golden`…) — nên **hash có
khớp hay không** phụ thuộc bài nào chạy trước. Đó chính là cơ chế biến một bài xanh thành
đỏ mà không có thay đổi dữ liệu nào.

#### Sửa: phạm vi upload chỉ dùng khi nó **đại diện trọn vẹn**

Nếu bảng có dòng `upload_id IS NULL` thì so toàn dự án và **ghi lại** việc đã bỏ phạm vi.
Sau khi sửa, báo cáo in ra:

```
43 file: project (file chưa từng được nạp — so toàn dự án)
 1 file: project — bỏ phạm vi upload <id>: 816/864 dòng không gắn upload,
         khoá theo upload sẽ coi nhầm chúng là "mất"
```

ALL PASS, và **lý do** nằm ngay trong báo cáo chứ không phải trong đầu tôi.

#### Bài học rộng hơn

Một bài kiểm mà **kết quả phụ thuộc bài khác** đã chạy trước là bài kiểm không cô lập. Quy
tắc của repo vốn là "bài kiểm mới phải tự dọn dòng của mình" — nhưng đây là **chiều ngược**:
bài này không tạo gì, mà lại **nhạy** với rác của bài khác. Nên thêm: khi một bài xanh lúc
chạy riêng và đỏ trong bộ, nghi ngờ đầu tiên là **phạm vi truy vấn theo trạng thái còn sót**,
chứ không phải dữ liệu.

Và phép thử rẻ nhất để phân biệt: chạy lần lượt các bài đứng trước rồi chạy bài cần kiểm,
đồng thời chụp một thứ **không phải số dòng** (ở đây là `upload_id` và phạm vi) — vì
số dòng ổn định không có nghĩa dữ liệu ổn định.

### 12.1 Đã xác minh bằng đọc mã, CHƯA sửa — nên sửa trước khi lên máy thật

> ℹ️ Bảng này **đã cũ một phần**: 5 mục từng nằm đây đã được sửa ở đợt 14 và kiểm lại
> từng mục trên mã ngày 2026-09-28 — `lib/upload-access.js:22` khoá `tenant_id`;
> `routes/directives.js:59` khoá tenant khi chọn người nhận; `lib/stage.js:40` có
> `WHERE` chặn trên `DO UPDATE`; `services/ingest/material_supply.js:181` dùng
> `setCols` tường minh; `sp_ap.js` đã chuyển tên file (xem 11.22). Dòng còn lại dưới
> đây là mục **thật sự** còn mở.

| Việc | Vì sao chưa sửa | Cần gì |
|---|---|---|
| **Lịch dự án demo nằm ở 2019-2020 trong khi "hôm nay" là 2026** ⇒ `schedule-compress` và `deadline-replan` **luôn không khả thi** | `runCompression` neo vào `todayStr()`; ngày đích lấy từ hôm nay nên `targetDays` âm và thông điệp 422 nói *"infeasible on current data (calendar end 2027-06-23 > target)"* — trong khi 2027-06-23 là ngày mai, tức lỗi diễn đạt chứ không phải dữ liệu hỏng. Đo trên cả dự án 1 và dự án 3: không có ngày đích nào khả thi | Quyết định nghiệp vụ: dữ liệu demo nên bám theo ngày hiện tại (dựng lịch tương đối so với `now` lúc seed) hay giữ nguyên lịch thật của dự án? Tôi không tự đổi vì nó đụng `value-reconcile` và mọi báo cáo có ngày. **Chặn UAT** nếu UAT cần demo tính năng nén lịch |
| **4.280 dòng `audit_log` có `resource_id = 0`** — **ĐÃ XOÁ 2026-09-29** | Nguyên nhân đã sửa ở gốc (`withAudit` tự suy ra id; 28 call site bỏ literal `resourceId: 0`), nên dòng mới không còn sinh ra dòng này. Được phép xoá; đo trước khi xoá rồi **giữ đúng thứ cần cho demo**: 7.305 dòng `resource_id > 0` (id thật) + 2.410 dòng `NULL` (hợp lệ cho `user/LOGIN_FAILED`, `MFA_FAILED`) đều giữ lại. Còn 9.715 dòng | Không còn gì để làm. Ghi lại ở đây vì nó là ví dụ cho bài học 11.26: `0` là **id giả** hợp lệ về kiểu nên không bộ đo kiểu nào bắt được, và nó cũng làm hỏng mọi truy vấn `WHERE resource_id = 0` |

### 12.2 Cần môi trường thật

| Việc | Vì sao chưa làm |
|---|---|
| Đo tải nhiều người dùng thật, thời gian dài, đường ghi nặng | Số đo trên máy dev không chuyển được sang máy đích |
| 9 mục readiness Nhóm A | Chỉ cần khi thực sự triển khai lên máy nội bộ |

### 12.3 Cần người ký

**16 mục** trong `docs/DATA_DECISIONS_REQUIRED.md`. Hai mục quyền, còn lại là dữ liệu:
mục 12 (ràng buộc unique cho `code` của danh mục), **mục 13 (ngày lịch dự án demo
2019-2020)**, mục 14 (số nhánh bản sửa submittal), **mục 15** (CEO có được tạo/xoá
`schedule-links` không — `lib/permissions.js:129-132` nói không, `routes/schedule-links.js:59,113,141`
nói có), **mục 16** (ma trận quyền chỉ phủ 16/25 module; 117 route ghi không qua ma trận).
UAT vẫn `SIGNED: false`. **Ưu tiên mục 13** — chặn UAT nếu UAT cần demo nén lịch.
