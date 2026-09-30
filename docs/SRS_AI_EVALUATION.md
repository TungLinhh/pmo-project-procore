# Đánh giá AI theo SRS

## Sự cố primary route và cách đã sửa (2026-09-25)

**Triệu chứng:** Nemotron trả về rỗng khoảng 55% số câu, mọi lỗi đều mất đúng 15.000 ms.

**Chẩn đoán bằng đo đạc, không phải phỏng đoán:**

| Bằng chứng | Kết luận |
|---|---|
| `ai_calls` lỗi: `min=15000ms`, `max=34805ms`, thông điệp "Model trả về rỗng" | Không phải lỗi provider, là hết thời gian chờ |
| Prompt ngắn (40 token): OK, 8–12 s | Model và khoá đều tốt |
| Prompt có ngữ cảnh (~4k ký tự): OK nhưng 28–54 s, `reasoning` 600–3000 ký tự | Mô hình cần lâu hơn nhiều so với 15 s |
| `postJson` mặc định 15.000 ms cho mọi model | **Nguyên nhân gốc** |

Có thêm lỗi trong chính lần sửa đầu: hàm `timeoutFor(model)` đã viết ra nhưng **chưa được truyền** vào `postJson` trong adapter, nên timeout vẫn là 15 s dù đã đổi mặc định. Chỉ phát hiện khi nối thật vào call site.

**Đã sửa (`backend/src/lib/ai/providers.js`):**

1. `timeoutFor(model)`: model reasoning dùng `AI_REASONING_TIMEOUT_MS` (mặc định **120000**), model thường giữ 15 s. Truyền vào cả `chat` và `embed`.
2. Ngân sách token **tăng theo độ dài prompt** (`max(1600, promptChars/2)`, trần 4096) vì reasoning chiếm phần lớn ngân sách khi có ngữ cảnh.
3. Số lần thử của primary: 2 → **3**, backoff nhân dần.
4. `AI_TOTAL_BUDGET_MS` (mặc định 300000) để một câu hỏi không treo vô hạn.
5. Ghi `finish_reason` và độ dài `reasoning` vào thông điệp lỗi để lần sau chẩn đoán được ngay.

**Kết quả đo lại trên OpenRouter thật (không mock), cùng 8 câu hỏi:**

| Chỉ số | Trước | Sau |
|---|---:|---:|
| Đúng hợp đồng trả lời/citation | 8/8 | 8/8 |
| **Đi qua primary Nemotron** | **4/8** | **8/8** |
| Đi qua fallback Space Bunny | 4/8 | **0/8** |
| Lỗi provider | 9 | **0** |
| Latency | 4,0–57,6 s | 17,7–109,7 s (trung vị 54,9 s) |

Báo cáo: `/tmp/opencode/ai-srs-eval-v4.json`, `no_business_side_effects=true`.

**Cái giá và khuyến nghị:** primary đã ổn định nhưng latency trung vị ~55 s là cao cho thao tác tương tác. Điểm vận hành đề xuất:

- Demo/UAT: `AI_REASONING_TIMEOUT_MS=45000` — đủ cho hầu hết câu, trần ~45 s rồi mới fallback.
- Nếu UAT yêu cầu phản hồi dưới 10 s, phải đổi primary sang model trả phí hoặc rút ngữ cảnh đầu vào; model miễn phí không đạt được.

## Lệnh

Chạy server từ `backend/` để nạp `backend/.env` ở Terminal 1:

```bash
cd backend
PORT=3151 LOGIN_RATE_MAX=1000 \
AI_REASONING_TIMEOUT_MS=120000 \
AI_RETRY_DELAY_MS=1500 \
AI_MONTHLY_CAP_USD=20 \
AI_CHAT_FALLBACK_MODEL=stealth/space-bunny-alpha \
node src/index.js
```

Ở Terminal 2, gọi endpoint thật:

```bash
cd /path/to/pmo_project_procore
BASE_URL=http://127.0.0.1:3151 \
AI_EVAL_PROJECT_ID=1 \
AI_EVAL_OUTPUT=/tmp/opencode/ai-srs-evaluation.json \
node tests/e2e/ai-srs-evaluation.mjs
```

Nếu database local mới chưa có tenant kiểm chứng cross-tenant, chạy một lần trước khi chạy harness:

```bash
node backend/scripts/provision-tenant.mjs --code PILOT --plan small --admin-email admin@pilot.test --project PILOT-001
```

Lệnh này chỉ tạo dữ liệu demo local; không dùng trong production. `AI_MONTHLY_CAP_USD=20` ở trên chỉ là override local để chạy lại đánh giá nhiều lần; production phải dùng quota đã được duyệt.

`ai-srs-evaluation.mjs` kiểm tra:

- đúng persona và phạm vi project;
- câu trả lời có citation có `resource_type` và `resource_id`;
- refusal khi thiếu dữ liệu;
- phân biệt `route_status` (`primary`/`fallback`), `answer_source` (`model`/`deterministic_evidence_fallback`) và `cited_by_model`;
- không có thay đổi ở `pillar_scenarios`, `schedule_baselines`, `ai_drafts` hoặc `notifications`.

## Kết quả gần nhất

File: `/tmp/opencode/ai-srs-evaluation.json` (lần chạy cuối: `2026-09-25T15:32:33Z`, local development, OpenRouter thật, không dùng `AI_MOCK`)

| Kết quả | Số câu |
|---|---:|
| PASS | 8 |
| FAIL | 0 |
| BLOCKED | 0 |
| `no_business_side_effects` | `true` |

Hai lượt đánh giá liên tiếp sau khi bổ sung corpus đều đạt `8/8`. Corpus hiện có `1831` chunk, gồm payment request, payment ledger và các trường MSB của material submittal. Rubric chấp nhận từ khóa tiếng Việt và từ đồng nghĩa tiếng Anh, như `shop drawing` với `shopdrawing` và `payment request` với `thanh toán`.

Kết quả này kiểm chứng contract của provider, citation và refusal. Một số câu vẫn thiếu dữ liệu portfolio, tài chính hoặc daily plan, nên PMO và CEO phải xác nhận các refusal đó trước khi ký UAT.

Route chat chính là `nvidia/nemotron-3-ultra-550b-a55b:free`. Route dự phòng là `stealth/space-bunny-alpha`, cùng provider và cùng key. Khi model trả lời nhưng không phát ra citation, hệ thống có thể dùng `deterministic_evidence_fallback` từ đúng các chunk đã truy xuất; đây là fallback có nguồn, không phải model đã trả lời đúng. Log provider vẫn ghi nhận Nemotron có lần trả nội dung rỗng; fallback Space Bunny có lần trả lời thành công. Fallback không được tính là PASS của primary route. Một lượt chạy cũng đã bị `429` khi tenant local chạm cap `$2`; phải xem là BLOCKED cho đến khi chạy lại với cap được duyệt.

Bằng chứng đầy đủ nằm trong `docs/UAT_OPENROUTER_VERIFICATION.md`. Trạng thái UAT vẫn là **chưa ký** vì production readiness chưa đạt và còn thiếu biên bản, quyết định nghiệp vụ, chữ ký hợp lệ.

## Kiểm tra deterministic harness

Mock không tự suy ra corpus: phải chạy `AI_MOCK=1` server và backfill mock trước khi chạy evaluation. Nếu chạy evaluation ngay trên corpus chỉ có embedding thật, kết quả có thể là `1 PASS, 7 BLOCKED` vì các câu có dữ liệu bị đánh dấu **không có corpus truy cập được**. Kết quả mock chỉ chứng minh rubric, route và kiểm tra side effect; không thay thế provider thật.

## Cách xử lý release

- Không coi `BLOCKED` là `PASS`.
- Không tự đổi model hoặc tăng quota. Fallback `stealth/space-bunny-alpha` chỉ được dùng sau khi route chính lỗi và vẫn phải ghi nhận là provider call thật.
- Cấu hình provider có quota/allowance phù hợp, chạy lại cùng lệnh trên và lưu báo cáo mới.
- Technical đã được cấp membership BTE trong seed demo. Nếu chạy trên tenant/project khác, PM phải cấp membership thật trước khi chạy lại; không bypass RBAC trong test.
