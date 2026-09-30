# AI và tiến độ — báo cáo audit

Ngày audit: 2026-09-25  
Phạm vi: backend AI, retrieval, draft, watcher, Control Layer, UI trợ lý AI và test liên quan.

## Kết luận

AI hiện có thể **đọc dữ liệu, trả lời có citation, tạo cảnh báo SLA, mô phỏng Control Layer và tạo progress proposal có kiểm soát**. AI vẫn không được tự ghi kế hoạch; việc biến proposal thành thay đổi thật là thao tác có role gate, fingerprint, transaction và audit.

Kiến trúc an toàn hiện có cần giữ:

```text
input → retrieval theo quyền → preview/proposal → role gate → transaction + audit → baseline/schedule write
```

Không cho phép LLM tự ghi baseline, tiến độ, payment, notification hoặc scenario.

## Lỗi đã xác nhận hoặc có bằng chứng trực tiếp

| Mức | Mã | Vấn đề | Bằng chứng | Kế hoạch sửa |
|---|---|---|---|---|
| Critical | F1 | Unique index embedding thiếu `tenant_id`; resource id có thể trùng giữa tenant và gây lỗi RLS hoặc lẫn dữ liệu | `9999g_ai_foundation.sql`, `retrieval.js` | Migration index 4 cột + upsert tenant-aware + test hai tenant cùng resource id |
| High | F2 | Retrieval chỉ lọc membership, không lọc module; SITE có thể hỏi payment nhưng REST trả 403 | `retrieval.js`, `permissions.js` | Dùng `canAccess` cho từng resource type |
| High | F3 | Draft inbox và approve/dismiss không project-scope; user có thể đọc/duyệt draft của project khác | `ai-assistant.js:95-171` | Lọc project access và trả 404 |
| High | F4 | Free text trong index có thể chèn chỉ dẫn vào model; nội dung draft có thể được gửi qua notification | `retrieval.js`, `ai-assistant.js` | Fence dữ liệu, chặn instruction injection, kiểm tra payload trước notify |
| High | F5 | UI gắn tất cả chunk đã truy xuất là citation, không phải citation model thực sự dùng | `ai-assistant.js:58-73` | Parse citation trong answer, chỉ trả nguồn được model dẫn |
| High | F6 | Không có ngưỡng relevance; câu hỏi không liên quan vẫn nhận top-k chunk | `retrieval.js:160-172` | Thêm `max_dist` và trả no-data khi không đạt |
| High | F8 | Dismiss SLA draft không chặn watcher tạo lại sau đó | `watcher.js` | Dedupe theo mọi status trong cửa sổ 24h |
| High | F10/F11 | Config có thể xóa toàn bộ route còn thiếu embed; `api_key_env` tùy ý có thể đọc/gửi secret khác | `ai.js`, `providers.js` | Validate payload, allowlist env key, encode model, production mock guard |
| High | F12/F13 | CTL-05 có thể tạo shift âm không qua CPM, risk luôn LOW; preview cũ có thể apply sai vào ngày khác | `pillar-sim.js`, `pillar-scenarios.js` | Tạm khóa CTL-05 apply cho tới khi có feasibility/TTL |
| High | F15 | Watcher chạy cho tenant không có entitlement AI | `watcher.js` | Kiểm tra `ai-assistant` trước mỗi tenant |
| High | F16 | Đổi project nhưng PillarControlPanel giữ scenario cũ, có thể apply nhầm project | `PillarControlPanel.jsx` | Reset state, hiển thị project trong confirm |
| High | F18 | `/ai/ask` không rate-limit; free model bị tính cost 0 nên cap không bảo vệ | `providers.js`, `ai-assistant.js` | Rate limit, cap theo quota/request, async backfill |

## Lỗi trải nghiệm và vận hành cần ghi nhận

- `Assistant.jsx` đã có thêm tab **Cập nhật tiến độ** với project picker, natural-language intake, preview, missing fields, apply và rollback.
- Retrieval vẫn thiếu `ar_contracts`, `schedule_links`, `site_holidays`, `qa_inspections`, `kpi_targets`, `pillar_gate_configs`, `health_thresholds`, `work_item_productivity`, `manpower_plans`; đây là backlog mở rộng corpus, không phủ định flow proposal hiện tại.
- Citation đã có link cho `payment`, `directive`, `work_item`; cần kiểm tra deep-link từng loại trên dữ liệu thật.
- `/api/ai/ask` vẫn chưa ghi audit question/chunk đầy đủ; `ai_calls` chỉ có token/latency. Đây là gap provenance cần đóng trước production.
- Lint frontend có 64 warning React Compiler, chủ yếu hook dependency và set-state trong effect; warning không được coi là bug nghiệp vụ nếu chưa tái hiện.
- Baseline và các suite chính đã pass trước và sau vòng sửa; xem phần kết quả bên dưới.

## AI đang được dùng để làm gì

1. **Q&A ngữ nghĩa:** tìm issue, directive, daily note, shop drawing, material, schedule, AR, payment và submittal; trả lời tiếng Việt với citation.
2. **Backfill embedding:** admin/CEO nạp corpus vào pgvector theo model đang cấu hình.
3. **SLA watcher:** tìm submittal quá hạn và tạo `sla_nudge` để người có quyền duyệt.
4. **Deadline replan:** AI/CTL tạo scenario mô phỏng timeline; PM/PMO được xem, CEO/Admin mới apply/rollback.
5. **Đã có trong vòng mở rộng:** parser cập nhật tiến độ tự nhiên, preview before/after, apply/rollback transaction, fingerprint, idempotency và audit vòng đời proposal. Việc mở rộng tiếp vẫn cần: mô phỏng lịch nén từ câu blocker, mapping vật tư/payment, và corpus đầy đủ theo SRS.

## Đã sửa trong vòng hiện tại

- F1: thêm migration unique index theo tenant và sửa upsert embedding.
- F2/F3: retrieval lọc source theo permission matrix; draft list/approve/dismiss kiểm tra project scope.
- F4: context được fence và loại dòng giống instruction trước khi gửi model.
- F5/F6: citation chỉ giữ nguồn model thực sự dẫn; có relevance floor và ưu tiên source theo câu hỏi.
- F7/F8/F14/F15: prune embedding orphan, watcher dedupe mọi status, tính ngày quá hạn trong SQL và kiểm tra entitlement.
- F10/F11/F18: config validate trước khi xóa route, allowlist env key, chặn mock ở production, thêm rate limit AI; mock/test call không cộng cost vào quota local.
- F12/F13: CTL-05 dùng CPM cho nén, chặn preview cũ hơn 24h và scenario không có thay đổi.
- F16/F17: reset scenario khi đổi project, hiện project trong confirm, clamp limit và không lưu baseline row arrays.
- Đã thêm progress proposal: parse deterministic, `needs_input`/`proposed`, idempotency, before/after, fingerprint, preview, CEO/Admin apply/rollback, audit transaction.

### Kế hoạch còn lại sau vòng sửa

1. Bổ sung corpus và audit provenance cho câu hỏi/chunk AI.
2. Đồng bộ deadline-replan và legacy schedule-compress với fingerprint/TTL của `pillar_scenarios`.
3. Chốt mâu thuẫn role apply trong SRS Bảng 9; demo hiện dùng CEO/Admin.
4. Gate enforcement, invoice-status rule, ingest atomicity và test portability.
5. Chạy lại SRS gate, production readiness và UAT; chỉ PMO/CEO ký trên production.

## Kết quả kiểm chứng vòng sửa

- `node tests/e2e/ai-progress-proposals.mjs`: PASS toàn bộ flow natural-language → `needs_input/proposed` → idempotency → stale `409` → CEO apply → rollback.
- `node tests/e2e/ai-assistant.mjs`: PASS; gồm config validation, tenant-scoped embedding, watcher dedupe và citation.
- `node tests/e2e/pillar-sim.mjs`: PASS; CTL-01→06 vẫn chạy sau thay đổi.
- `npm run test:all`: PASS (API, browser smoke, schema audit).
- `npm run test:srs`, `npm run test:ai-progress`, `npm run test:sp-ap`, UI verify: PASS; frontend còn warning React Compiler không chặn build.
- `npm run test:ai` cuối: `8/8 PASS`, `no_business_side_effects=true`; lượt trước bị `429` khi cap local `$2` bị vượt, được ghi BLOCKED trước khi chạy lại với cap local được duyệt.

## Definition of done của vòng sửa

- Không còn đường đọc/duyệt draft hoặc retrieval vượt module/project scope.
- Không có citation giả do UI tự gắn toàn bộ top-k.
- Một câu cập nhật thiếu dữ liệu vẫn tạo proposal `needs_input` có danh sách trường cần bổ sung.
- Một câu đủ dữ liệu tạo proposal có before/after, fingerprint, idempotency và preview.
- Retry không tạo draft trùng; stale apply trả `409`; PM không apply được nếu policy yêu cầu CEO/Admin.
- Apply/rollback ghi audit trong cùng transaction và cập nhật cả work item/schedule liên kết.
- Có test API thật và demo UI desktop/mobile.
