# Kế hoạch thực thi nghiệm thu SRS

Tài liệu này là runbook cho đợt hoàn thiện theo `Procore_PMO SRS.docx` Rev-01.

## Mục tiêu có thể kiểm chứng

Phiên làm việc chỉ được kết thúc với kết quả `VERIFIED` khi:

1. Mọi yêu cầu bắt buộc trong SRS có trạng thái `đạt`, `đạt có điều kiện` hoặc `cần quyết định nghiệp vụ` kèm bằng chứng.
2. Không còn truy cập chéo project đối với file, upload, ảnh và dữ liệu nhạy cảm.
3. Ma trận quyền khớp SRS và được kiểm thử bằng API thật.
4. Gate, KPI, S-curve, thanh toán và Control Layer lấy từ dữ liệu có nguồn rõ ràng.
5. Apply scenario tạo baseline có version, kiểm tra stale data và rollback an toàn.
6. Dashboard cấp dự án và cấp công dùng được trên desktop, tablet và mobile.
7. Hai project thí điểm được nạp từ dữ liệu thật và đối soát sai số 0% hoặc có danh sách sai lệch được xử lý.
8. Build, lint, schema, migration, browser, performance và security tests chạy trên checkout hiện tại.
9. AI được đánh giá bằng câu hỏi thật, có citation, refusal đúng phạm vi và không tự apply thay người dùng.
10. Không còn dữ liệu test trong database hoặc file upload sau khi chạy.

## Quy tắc bảo toàn

- Không reset, commit hoặc push thay người dùng.
- Không sửa migration đã áp dụng. Mọi thay đổi schema dùng file migration mới.
- Mỗi đơn vị phải có kiểm tra trước và sau.
- Không dùng số liệu demo để thay dữ liệu nghiệp vụ.
- Dữ liệu nguồn hiện nằm trong `reference_sheets/2019.04.28 HBG-HBC-BCTT/`. `docs/` hiện chứa SRS diagrams và screenshots, không chứa bộ Excel nguồn.
- Không coi test chạy được là bằng chứng nếu test còn trỏ vào checkout cũ.

## Trạng thái baseline

| Hạng mục | Baseline |
|---|---|
| Commit | `a77ea14` trên `main` |
| Working tree | Có thay đổi chưa commit từ trước và từ các pha hiện tại |
| Build/lint/diff check | Đã pass gần nhất |
| SRS flow tests | Đã pass phần lớn khi cấu hình môi trường đúng |
| File authorization | Đã pass E2E cùng tenant nhưng khác project |
| Backup mặc định | `503` khi thiếu `BACKUP_DATABASE_URL` |
| Test portability | Đã dùng root/env hiện tại; không còn path checkout cũ |
| UAT | Chưa có biên bản và chữ ký nghiệm thu |
| AI | Có bộ đánh giá theo vai trò; hai lượt OpenRouter thật liên tiếp đạt 8/8, nhưng UAT và production readiness vẫn chưa đạt |

## Các đơn vị thực hiện

### Phase 0. Nền tảng kiểm chứng

- [x] Sửa toàn bộ đường dẫn test cũ sang root hiện tại.
- [x] Tạo lệnh `test:srs` chạy các suite bắt buộc.
- [x] Tạo script inventory dữ liệu nguồn và script đối soát DB.
- [x] Đối soát **giá trị**, không chỉ khoá dòng (SRS 9.1): `npm run test:reconcile` — 6667 trường, 0 dòng mất, 882/915 khớp tuyệt đối, 33 lệch (0,49%). Cột không so và cột advisory được khai báo tường minh.
- [x] Chụp baseline build, schema, endpoint timing và browser screenshot.

**Bằng chứng:** script chạy từ checkout sạch, không còn path cũ; danh sách file nguồn có hash và số dòng.

### Phase 1. Authorization và input boundary

- [x] Chặn download/list/row upload ngoài project.
- [x] Chặn download ảnh daily ngoài project.
- [x] Lọc project list theo membership, trừ quyền được cấp rõ ràng.
- [x] Áp role/permission vào wizard configure, preview, commit, project và zone.
- [x] Thêm test cùng tenant nhưng khác project.

**Predicate:** user không thuộc project nhận `404` cho mọi resource route; user thuộc project nhận đúng dữ liệu.

### Phase 2. RBAC và production configuration

- [x] Tách `ADMIN` full-access khỏi `CEO` approval/control.
- [x] Chốt PM, PMO, SITE, Procurement, Technical, Accounting theo SRS.
- [x] Ẩn Control Layer khỏi vai trò không được phép, server vẫn là chuẩn.
- [x] Truyền đầy đủ secret trong Docker Compose.
- [x] Bắt buộc app pool dùng `pmo_app`, backup pool dùng role riêng.
- [x] Bắt buộc readiness khi `NODE_ENV=production`.

**Predicate:** test role matrix và production-readiness pass trong cấu hình giống production.

### Phase 3. Mô hình dữ liệu bốn trụ cột

- [x] Tạo liên kết work item/WBS cho shop, material, schedule, acceptance và payment.
- [x] Tạo vòng đời vật tư: MSB, PO, sản xuất, vận chuyển, nhập kho, nghiệm thu.
- [x] Tạo dữ liệu định mức năng suất và actual theo hạng mục.
- [x] Tính gate theo hạng mục, không chỉ tỷ lệ toàn project.
- [x] Tách `planned`, `actual`, `accepted`, `delivered` khỏi nhau.

**Predicate:** một work item thiếu shop được duyệt làm các pillar downstream của item đó vào `WAITING`, các item độc lập vẫn `READY`.

### Phase 4. Baseline và Control Layer

- [x] Tạo snapshot baseline có version.
- [x] Ghi baseline version/hash vào scenario.
- [x] Apply scenario trong transaction, cập nhật duration và dependency.
- [x] Từ chối apply khi dữ liệu thay đổi sau preview.
- [x] Rollback kiểm tra version trước khi khôi phục.
- [ ] Bổ sung input theo hạng mục, vật tư, chuyên môn và drawing cho CTL.
- [x] Tái sử dụng CPM cho CTL-02, không có hai engine tính lệch nhau.

**Predicate:** apply/rollback trả về đúng dữ liệu, duration và baseline; thay đổi đồng thời trả `409`, không ghi đè dữ liệu mới.

### Phase 5. Dashboard và trải nghiệm người dùng

- [x] Xóa mọi giá trị mặc định giả.
- [x] Đưa KPI derivation về server hoặc một module dùng chung.
- [x] Thêm health bốn trụ cột ở roll-up cấp công.
- [x] Nối SSE hoặc polling có kiểm soát cho Control Center.
- [x] Giảm kích thước biểu đồ, bảng, ô nhập và chữ theo mật độ dữ liệu.
- [ ] Chuẩn hoá màu trạng thái, khoảng cách, focus, loading, empty và mobile layout.

**Predicate:** screenshot desktop/mobile không có biểu đồ che nội dung; mọi số trên UI có nguồn API hoặc nhãn `Chưa có dữ liệu`.

### Phase 6. Vận hành và production

- [ ] Docker build và health check.
- [x] Kiểm tra restore backup trên DB scratch.
- [ ] Kiểm tra secret, encryption, TLS headers và readiness.
- [x] Bổ sung monitoring, log retention và runbook incident. `/api/ready` query thật (503 khi DB chết) + healthcheck trong `docker-compose.prod.yml`; `lib/retention.js` dọn phiên hết hạn + `ai_calls`, không đụng `audit_log`; `docs/INCIDENT_RUNBOOK.md`. Gate: `monitoring.mjs` 16/16, `retention.mjs` 10/10.
- [x] Tách S3/local storage khỏi dữ liệu test. `scripts/storage-gc.mjs` (dry-run mặc định) tìm file không dòng DB nào tham chiếu — lượt chạy đầu ra **928 file / 153 MB** trong 1090; check `uploads_volume` trong production-readiness fail nếu uploads không phải volume riêng. Gate chạy dry-run mỗi lần release.
- [ ] **Còn thiếu:** alerting tự động (hiện chỉ ghi log, chưa nối PagerDuty/Grafana) — cần quyết định hạ tầng.

**Predicate:** fresh container với cấu hình production khởi động được, backup chạy, restore đọc được, request pool không phải owner/superuser.

### Phase 7. Đối soát dữ liệu và UAT

- [x] Xác định hai project thí điểm trong `reference_sheets`.
- [x] Ingest từng nhóm file theo cùng pipeline thật.
- [x] Đối soát số dòng, khối lượng, ngày và giá trị với file nguồn. `npm run test:reconcile` 33/33: 6667 trường, **0 dòng mất**, 882/915 dòng khớp tuyệt đối, 33 lệch (0,49%), 36 dòng lặp ghép cặp, 12 dòng advisory, 8 cột khai báo không so.
- [ ] **Còn lại cần ký:** 33 dòng lệch không phải lỗi ingest — dữ liệu `BTE-WP4-HBC` **không đến từ `reference_sheets/`** (xem `docs/DATA_DECISIONS_REQUIRED.md` mục 6). PMO/CEO phải chỉ nguồn chuẩn.
- [x] Lưu báo cáo sai lệch có mã nguồn và sửa parser nếu có.
- [x] Chạy kịch bản vai trò theo SRS.
- [ ] Lưu biên bản UAT và quyết định thật của Ban điều hành.

**Predicate:** hai project có báo cáo `0% mismatch` cho các trường SRS yêu cầu, hoặc mọi sai lệch đã được sửa và chạy lại.

### Phase 8. Đánh giá AI

Tạo bộ câu hỏi cho từng vai trò:

- CEO: project nào cần quyết định, rủi ro dòng tiền nào cần họp.
- PM: gate nào đang chặn, item nào trễ, ảnh hưởng xuống hạng mục nào.
- PMO: roll-up, SLA, xu hướng và báo cáo cần gửi Ban điều hành.
- Procurement: MSB nào trễ, vật tư nào chặn thi công, đề xuất giao vật tư.
- Site: việc hôm nay, lực lượng, vật tư thiếu và rủi ro an toàn.
- Accounting: payment request nào được duyệt, retention và công nợ nào cần xử lý.
- Technical: drawing/BPTC nào bị trả, hạng mục nào cần sửa và mở IFC.

Mỗi câu hỏi phải kiểm tra:

1. Có câu trả lời dựa trên dữ liệu được phép hay không.
2. Có citation bấm được về đúng bản ghi hay không.
3. Có nói rõ khi thiếu dữ liệu hay không.
4. Không tự ghi baseline hoặc gửi thông báo ngoài.
5. Có đúng giọng/nhân vật nghiệp vụ và đủ thông tin để chuyển công việc về phòng ban.
6. Có ghi log, model, latency, token/cost và lỗi provider.

**Predicate:** báo cáo AI có ma trận câu hỏi, kết quả, citation, lỗi, latency và kết luận theo từng phòng ban.

### Phase 9. Final verification

- [x] Fresh DB migration.
- [x] Schema audit.
- [x] Backend lint và frontend build.
- [x] SRS security, authz, data, control và performance tests.
- [x] AI provider thật đạt 8/8 rubric trong hai lượt local liên tiếp; bằng chứng được lưu trong `docs/UAT_OPENROUTER_VERIFICATION.md`.
- [x] Browser smoke trên `:5173` và single-port production.
- [x] Kiểm tra diff, upload artifacts, database rows và test cleanup.
- [x] Cập nhật tài liệu SRS compliance và runbook.

## Checkpoint kiểm chứng gần nhất

Các bằng chứng dưới đây là bằng chứng code hoặc test local. Chúng không thay thế UAT, restore production hoặc biên bản ký.

- Work-item productivity ledger `work_item_productivity` đã có API ghi/đọc idempotent, validation, project scope và test trong `work-items-materials.mjs`; UI mở tại **Nhân lực & Thiết bị → Năng suất hạng mục**.
- File authorization, project isolation, RBAC CEO/PM/PMO/site/technical/procurement/accounting, dashboard scope, work-item link và material lifecycle có test E2E riêng. `npm run test:srs` pass trên checkout hiện tại.
- CTL-02 dùng `backend/src/lib/cpm.js` để kiểm tra dependency, critical path, floor duration và calendar updates; fingerprint dependency cũng chặn apply `409` nếu link đổi sau preview. `tests/e2e/pillar-sim.mjs` chứng minh PM chỉ mô phỏng, CEO mới apply/rollback.
- Hai project `BTE-WP4-HBC` và `HBG-MCR` đã nạp từ `reference_sheets/`. Báo cáo `docs/SRS_DATA_RECONCILIATION.md` ghi 915 khóa nguồn, 915 khóa DB, `mismatch_files: 0`, còn 36 dòng lặp và 8 workbook tổng hợp cần quyết định nghiệp vụ.
- AI đã gọi provider thật sau khi backfill. Hai lượt đánh giá liên tiếp đạt `8/8 PASS`, `no_business_side_effects: true`. Retrieval nay lọc theo module, chỉ giữ citation được dùng, có fallback evidence khi model không trích dẫn; OpenRouter vẫn ghi nhận lần Nemotron trả nội dung rỗng và fallback Space Bunny thành công. Bằng chứng và điều kiện ký nằm trong `docs/UAT_OPENROUTER_VERIFICATION.md`.
- `AI-EXT-01` progress proposal đã có API + UI demo: natural-language → `needs_input/proposed`, before/after, idempotency, fingerprint, stale `409`, CEO/Admin apply/rollback và audit. `node tests/e2e/ai-progress-proposals.mjs` PASS. Đây là phần mở rộng cần PMO/CEO đưa vào PO/change request.
- Browser single-port chạy thật với `tests/e2e/browser.mjs`: shell, login, zero page error và zero failed request đều pass; smoke trên dev Vite `:5173` cũng pass sau các thay đổi cuối.
- Backup local đã chạy thật với role tạm `BYPASSRLS`: `pg_dump -Fc` tạo archive, `verify-backup.js` đọc 1.083 entry, `pg_restore` vào DB scratch và đọc được 73 bảng/4 project. Đây là bằng chứng local; chưa phải restore production.
- `p4-docker.mjs` kiểm tra tĩnh production compose, nhưng chưa có bằng chứng image build hoặc fresh boot production.
- UAT vẫn chưa đạt vì production readiness hiện `ready=false`, chưa có biên bản, chữ ký, quyết định cho dòng lặp và xác nhận dữ liệu tài chính.

## Quyết định cần ghi lại trong quá trình làm

Mỗi thay đổi phải ghi:

- Vấn đề được giả định.
- Lý do chọn cách sửa.
- Kiểm tra trước.
- Kiểm tra sau.
- Kết quả thực tế.
- Phần còn chưa chứng minh.

Không được đánh dấu một mục hoàn tất nếu chỉ dựa vào đọc code hoặc build thành công.
