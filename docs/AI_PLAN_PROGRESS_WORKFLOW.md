# Kế hoạch AI, cập nhật tiến độ và sửa kế hoạch

Mục tiêu: làm cho AI trả lời được dự án theo đúng phạm vi, nhận cập nhật tiến độ bằng cách nhập tự nhiên, và tạo phương án thay đổi có thể kiểm soát cho từng phòng ban.

## Nguyên tắc an toàn

- AI không tự ghi trực tiếp vào `construction_schedule_items`, baseline, payment hoặc scenario.
- Mỗi cập nhật tạo một `ai_draft` có trạng thái rõ ràng: `needs_input`, `proposed`, `approved`, `applied`, `rejected` hoặc `stale`.
- Phải có preview, before/after, fingerprint dữ liệu, audit log và quyền role.
- PM, PMO, SITE, Procurement, Technical và Accounting có thể gửi hoặc xem proposal trong phạm vi được giao.
- CEO, Admin hoặc người được giao quyền mới apply thay đổi kế hoạch.
- Nếu thiếu dữ liệu, AI vẫn tạo proposal ở trạng thái `needs_input`, nêu rõ trường còn thiếu, thay vì trả lời chung chung rồi kết thúc.

## Trạng thái baseline

- AI Q&A đã có citation, tenant/project scope và provider fallback.
- Corpus đã có issue, directive, shop drawing, material, schedule, AR, material submittal, payment request và payment.
- `ai_drafts` hiện được dùng cho inbox AI; progress proposal đã có đường apply/rollback riêng, còn draft SLA/replan cũ chỉ đổi trạng thái/notification theo chính sách riêng.
- `pillar_scenarios` đã có simulate/apply/rollback cho Control Layer. Không được mở rộng nó thành đường ghi tiến độ không kiểm soát.
- OpenRouter local đã đạt `8/8` rubric ở hai lượt liên tiếp, nhưng primary Nemotron còn lần trả nội dung rỗng.
- UAT production chưa ký. Production readiness hiện `ready=false`.

## Các giai đoạn

### Phase 0. Đối chiếu SRS và baseline — **đã làm, còn business signoff**

- Đọc `Procore_PMO SRS.docx` và đối chiếu từng yêu cầu AI, tiến độ, role, approval và UAT.
- Chạy baseline API, schema, AI evaluation, browser và kiểm tra side effect.
- Lập gap matrix có file, dòng, test và trạng thái bằng chứng.

**Điều kiện qua:** không còn claim nào chỉ dựa trên đọc code. Mỗi kết luận phải có test, log hoặc bước tái hiện.

### Phase 1. Hợp đồng dữ liệu cho progress proposal — **đã làm**

- Xác định input chuẩn của một cập nhật: project, work item, ngày, actual progress, blocker, owner, department, next action và confidence.
- Xác định output chuẩn của proposal: resource, before, after, reason, citation, stale fingerprint, approver policy.
- Tái sử dụng `ai_drafts.payload` nếu đủ; tạo bảng riêng chỉ khi SRS yêu cầu truy vấn/audit cần cấu trúc khác.

**Điều kiện qua:** input thiếu dữ liệu tạo `needs_input`; input đủ tạo `proposed`; không có request nào tự sửa kế hoạch.

### Phase 2. AI Q&A và retrieval theo phòng ban — **đã làm một phần**

- Bổ sung corpus còn thiếu cho project metadata, daily plan/log, work-item links và các trạng thái vật tư/thanh toán cần cho câu hỏi.
- Giữ permission-first filtering trước ranking.
- Hiển thị `model`, `provider`, `latency`, citation và lý do refusal trong UI.
- Tách trạng thái provider `ok`, `fallback`, `empty`, `quota` để không coi fallback là primary success.

**Điều kiện qua:** mỗi vai trò có câu hỏi mẫu, citation đúng resource, refusal đúng khi thiếu dữ liệu và không vượt project scope.

### Phase 3. Parse cập nhật tiến độ — **đã làm**

- Nhận câu nhập tự nhiên từ UI.
- Parse deterministic trước, sau đó dùng model cho tóm tắt và giải thích.
- Validate project/work item/department trước khi tạo proposal.
- Hiển thị preview tiếng Việt, citation và danh sách trường còn thiếu.

**Điều kiện qua:** cùng `Idempotency-Key` replay cùng proposal ID; một lần bấm mới tạo key mới, không tạo draft trùng khi retry.

### Phase 4. Review, apply, rollback — **đã làm cho progress proposal**

- Thêm action `Gửi duyệt`, `Từ chối`, `Áp dụng` theo role.
- Apply chạy trong transaction, ghi before/after và audit.
- Kiểm tra fingerprint ngay trước khi ghi. Dữ liệu đổi sau preview trả `409 stale`.
- Rollback bằng proposal version mới, không xóa lịch sử.

**Điều kiện qua:** PM không apply được; CEO/Admin apply được; stale, retry và rollback có test; không có notification ngoài ý muốn.

### Phase 5. UI demo — **đã làm ở Assistant; Field/Control Center còn mở rộng**

- Assistant: tab `Hỏi dự án` và `Cập nhật tiến độ`.
- Proposal drawer: before/after, citation, owner, deadline, confidence, trạng thái và quyền.
- Control Center: link từ gate/pillar tới proposal liên quan.
- Field: nút `Gửi cập nhật`, không có nút apply cho role không đủ quyền.

**Điều kiện qua:** demo được trên desktop/mobile, một câu nhập tạo proposal, một proposal được duyệt và kế hoạch hiển thị thay đổi có audit.

### Phase 6. UAT và production — **chưa đủ điều kiện ký**

- Chạy lại SRS gate, AI evaluation và role matrix trên môi trường được duyệt.
- Production readiness phải `ready=true`.
- OpenRouter phải có quota/allowance và log primary/fallback.
- PMO và CEO ký biên bản sau khi các quyết định dữ liệu tài chính và dòng lặp được xác nhận.

## Rủi ro cần kiểm soát

| Rủi ro | Kiểm soát |
|---|---|
| AI tự sửa nhầm kế hoạch | Chỉ draft, preview, fingerprint, role gate, transaction |
| Hai người cùng gửi cập nhật | Idempotency key và optimistic fingerprint |
| Retrieval trả citation sai resource | Resource type/id bắt buộc, test scope và citation shape |
| Nemotron rỗng hoặc quota | Retry, fallback, log provider, không coi fallback là primary pass |
| Refusal che giấu thiếu dữ liệu | Proposal `needs_input` nêu field cần bổ sung |
| Rollback làm mất dữ liệu mới | Proposal version và precondition check `409` |
| UAT local bị hiểu là production | Bằng chứng ghi rõ endpoint, readiness và người ký |

## Cập nhật sau vòng audit

- Đã thêm API `POST/GET /api/ai/progress-proposals` và `POST /api/ai/progress-proposals/:id/apply|rollback`.
- Parser chạy deterministic trước; thiếu dữ liệu vẫn tạo draft `needs_input`.
- Proposal dùng `ai_drafts.payload` để không tạo bảng nghiệp vụ mới; vòng đời nghiệp vụ nằm trong `payload.lifecycle`, còn DB status dùng `pending/approved/dismissed`.
- Apply chỉ CEO/Admin, có row lock, fingerprint, cập nhật work item + schedule liên kết và audit trong cùng transaction.
- UI đã thêm tab **Cập nhật tiến độ** với preview, missing fields, citation, apply và trạng thái fallback của Q&A.

## Definition of done

- SRS mapping có trạng thái và bằng chứng.
- Q&A và progress proposal chạy qua API thật.
- Không có đường AI tự apply ngoài approval.
- Có test cho scope, idempotency, stale `409`, RBAC, audit, rollback và refusal.
- Có demo end-to-end trên UI.
- Có báo cáo OpenRouter local/production riêng.
- UAT chỉ chuyển sang `SIGNED` khi PMO và CEO ký trên môi trường thật.
