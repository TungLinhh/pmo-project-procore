# Kiểm chứng OpenRouter và UAT

Ngày kiểm chứng: 2026-09-25  
Môi trường thực hiện: local development, `http://127.0.0.1:3000`  
`AI_MOCK`: không bật  
Báo cáo máy: `/tmp/opencode/ai-srs-evaluation.json`

## Kết luận

**Chưa đủ điều kiện UAT để ký.** OpenRouter đã vượt qua hai lượt đánh giá liên tiếp với kết quả `8/8 PASS` trên môi trường local. Môi trường hiện tại vẫn chưa vượt qua production readiness, và AI chưa có biên bản UAT được người có thẩm quyền ký. Tài liệu này là bằng chứng kiểm chứng, không phải biên bản UAT đã ký.

## Kết quả AI

Lệnh đã chạy:

```bash
BASE_URL=http://127.0.0.1:3000 \
AI_EVAL_PROJECT_ID=1 \
AI_EVAL_OUTPUT=/tmp/opencode/ai-srs-evaluation.json \
node tests/e2e/ai-srs-evaluation.mjs
```

| Chỉ số | Kết quả |
|---|---:|
| Tổng câu hỏi | 8 |
| PASS | 8 |
| FAIL | 0 |
| BLOCKED | 0 |
| Side effect nghiệp vụ | Không |
| Lượt cuối | `8/8` lúc `2026-09-25T15:32:33Z` |

Các câu PASS đã trả lời qua OpenRouter với citation; khi model không phát citation, hệ thống ghi rõ `answer_source=deterministic_evidence_fallback` và chỉ dùng nguyên văn chunk đã truy xuất. Câu thiếu dữ liệu đã từ chối đúng và không tự bịa giá trị.

Các lượt đánh giá trước và lượt cuối sau khi bổ sung corpus đều đạt `8/8 PASS` khi cap local cho phép. Câu không đủ dữ liệu vẫn từ chối đúng. Rubric được chuẩn hóa để chấp nhận các từ khóa tiếng Việt và từ đồng nghĩa tiếng Anh, ví dụ `shop drawing` với `shopdrawing`, `payment request` với `thanh toán`.

Kết quả `8/8` chỉ chứng minh contract của provider, citation, refusal và route. Nó chưa chứng minh câu trả lời đủ hữu ích cho từng vai trò. Một số câu vẫn trả lời rằng thiếu dữ liệu portfolio, tài chính hoặc daily plan. PMO và CEO cần xác nhận rằng các refusal đó là chấp nhận được với dữ liệu UAT hiện tại.

## Provider

Cấu hình database:

| Purpose | Provider | Model | Ưu tiên |
|---|---|---|---:|
| Chat | OpenRouter | `nvidia/nemotron-3-ultra-550b-a55b:free` | 0 |
| Chat fallback | OpenRouter | `stealth/space-bunny-alpha` | 1 |
| Embed | OpenRouter | `nvidia/nemotron-3-embed-1b:free` | 1 |

Log `ai_calls` ghi nhận:

- OpenRouter chat có request thành công.
- Nemotron có các lần trả nội dung rỗng và được ghi lỗi.
- Space Bunny fallback có request thành công.
- Embedding provider trả kết quả thành công.
- Log `ai_calls` tích lũy trong tháng có cả Nemotron lỗi/thành công, Space Bunny fallback và embedding thành công; số đếm thay đổi theo số lần chạy nên không dùng một con số cũ làm tiêu chí UAT.
- Lượt cuối `8/8` dùng `AI_MONTHLY_CAP_USD=20` chỉ cho local; tenant production vẫn phải dùng quota đã duyệt.
- Corpus đã bổ sung `payment_request`, `payment` và trường MSB trong `material_submittal`.
- Backfill thật đã nạp `255` embedding mới, tổng corpus là `1831`.
- Một lượt chạy sau đó bị `429` vì tenant local đang đặt cap `$2` và đã tiêu thụ `$2.003573` trong tháng; đây là BLOCKED, không phải PASS. Lượt kiểm chứng local tiếp theo chạy với `AI_MONTHLY_CAP_USD=20` chỉ để đánh giá provider; không thay đổi quota production.

Vì vậy chưa được coi fallback là PASS của primary route. Cần đánh giá thêm tỷ lệ lỗi primary trong cửa sổ UAT.

## Production readiness

Lệnh kiểm tra:

```bash
node --env-file=backend/.env --input-type=module - <<'NODE'
import { getProductionReadiness } from './backend/src/lib/production-readiness.js';
console.log(JSON.stringify(await getProductionReadiness(1), null, 2));
NODE
```

Kết quả hiện tại (chạy lại sau khi bỏ gate SSO khỏi checker):

- `ready=false`
- `warnings>0` — `mfa_others` là cảnh báo, không chặn phát hành
- `failed` chỉ còn nhóm cấu hình môi trường thật, xem bên dưới

Các nhóm còn thiếu:

- `NODE_ENV=production`
- `JWT_SECRET` riêng
- `DATA_ENC_KEY` hợp lệ
- `APP_DB_USER`/`APP_DB_PASSWORD` riêng (nếu không, request pool chạy bằng owner)
- `BACKUP_DATABASE_URL` riêng
- Không còn user dùng `admin123`
- MFA cho user admin/CEO
- Request pool không phải superuser và không `BYPASSRLS`

**SSO không còn là gate.** Quyết định phạm vi (2026-09-25): UAT hiện tại không dùng
SSO, nên `sso_enabled` đã bị xoá khỏi `getProductionReadiness()` và route công khai
`GET /api/auth/sso/discover` (SSRF: server fetch URL do người gọi chọn) đã bị gỡ.
`ALLOW_SSO_INLINE_SECRET` vẫn phải bằng `0` vì nó bảo vệ `PUT /api/admin/sso`.

`least_privilege` nay đọc `pg_roles.rolsuper` / `rolbypassrls` thay vì chặn tên
role; `strong_auth` chỉ yêu cầu MFA cho admin/CEO, `mfa_others` là cảnh báo.

`node tests/e2e/production-readiness.mjs` vẫn PASS. Bài test này kiểm tra logic checker với môi trường tốt và môi trường lỗi, không chứng minh môi trường hiện tại đã production-ready.

## Điều kiện trước khi ký

- Chạy lại evaluation trên production endpoint thật.
- Đạt `8/8 PASS`, không có `FAIL` hoặc `BLOCKED`.
- Có bằng chứng citation, latency, provider, model và side-effect count.
- Có quyết định của PMO về 36 dòng nguồn lặp và 8 workbook tổng hợp.
- Có xác nhận dữ liệu tài chính và retention.
- `getProductionReadiness()` trả `ready=true`.
- Có biên bản và chữ ký của PMO và CEO hoặc người đại diện được ủy quyền.

## Lệnh chạy trên production

Chạy trong terminal đã được cấp quyền truy cập production. Không gửi giá trị secret vào chat hoặc commit vào repo.

```bash
export NODE_ENV=production
export BASE_URL=https://<production-host>
export OPENROUTER_API_KEY=<secret-from-secret-manager>
export JWT_SECRET=<existing-production-secret>
export DATA_ENC_KEY=<existing-production-key>
export APP_DB_USER=pmo_app
export APP_DB_PASSWORD=<existing-app-role-password>
export BACKUP_DATABASE_URL=<existing-backup-role-url>
export AI_MOCK=0
export AI_PROVIDER_TIMEOUT_MS=15000
export AI_RETRY_DELAY_MS=750
export AI_MONTHLY_CAP_USD=<approved-quota-cap>
export AI_EVAL_PROJECT_ID=<real-uat-project-id>
npm run test:ai
```

Production endpoint phải trả `ready=true` trước khi chạy UAT. Không dùng `backend/.env` của local cho lệnh này.

## Chữ ký

Trạng thái: **Chưa ký**

| Vai trò | Họ tên | Quyết định | Ngày | Chữ ký |
|---|---|---|---|---|
| PMO / chủ nghiệm UAT |  |  |  |  |
| CEO / người đại diện nghiệp vụ |  |  |  |  |

QA và IT có thể đồng ký hoặc xác nhận riêng nếu quy định nội bộ yêu cầu.

Các ô trên không được điền bằng AI hoặc tự động. Người ký phải xác nhận trực tiếp sau khi production readiness và AI evaluation đạt điều kiện.
