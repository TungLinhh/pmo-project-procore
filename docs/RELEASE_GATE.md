# Release gate — chạy trước UAT

Lệnh này chạy một server backend disposable, sau đó chạy các suite quan trọng theo thứ tự. Không chạy SSO vì UAT hiện chưa yêu cầu SSO.

```bash
# Suite mặc định: API, RBAC, tenant, transaction, sync, Control Layer,
# money/retention, AI progress, performance, build, browser, schema audit.
npm run test:release

# Thêm evaluation OpenRouter thật (tốn quota và thời gian)
RELEASE_RUN_AI=1 \
AI_EVAL_PROJECT_ID=1 \
npm run test:release
```

Báo cáo JSON được ghi tại `/tmp/opencode/release-gate.json` (đổi bằng `RELEASE_GATE_REPORT`).

Gate không thay thế:

- production readiness trên production endpoint;
- UAT signing của PMO/CEO;
- quyết định nghiệp vụ về dữ liệu tài chính, retention, duplicate và role apply.

Khi sự cố xảy ra trên môi trường đang chạy, dùng `docs/INCIDENT_RUNBOOK.md` — nó viết
cho người trực, không cần đọc code.

## Quyết định về triển khai (chốt 2026-09-26)

**Đích: một máy nội bộ. Không dùng Docker. Phạm vi: demo nội bộ. Chưa triển khai, không vội.**

Đường chạy trực tiếp bằng Node + PostgreSQL: `docs/DEPLOY_INTERNAL_RUNBOOK.md`.

`getProductionReadiness()` hiện `ready=false`. Với phạm vi demo nội bộ, **9 mục được
chia thành hai nhóm khác nhau** — trộn lẫn chúng là lý do quyết định này bị hiểu nhầm:

**Nhóm A — cấu hình, phải làm trước khi lên máy (4 mục):**

| Mục | Vì sao |
|---|---|
| `dev_password` | `ALLOW_DEV_PASSWORD=1` cho phép mật khẩu demo `admin123` |
| `app_db_user` / `app_db_password` | để trống thì app dùng owner, owner `BYPASSRLS` ⇒ phân quyền tenant vô hiệu |
| `backup_url` | không có thì sao lưu hỏng vì RLS chặn owner |
| `uploads_volume` | `UPLOADS_DIR` phải là volume riêng, không chung filesystem với cây ứng dụng |

**Nhóm B — cố ý chấp nhận ở mức demo nội bộ (4 mục):**

| Mục | Khi nào phải làm |
|---|---|
| `shared_password_users` (8/8 dùng chung `admin123`) | trước khi có người ngoài |
| `strong_auth` (2 tài khoan còn `must_change_password`) | khi phát tài khoản thật |
| `mfa_others` (6 tài khoản chưa bật MFA) | trước khi có dữ liệu thật |
| `ready: false` nói chung | khi chuẩn bị ra ngoài |

Nhóm B là quyết định của con người đã được chốt, **không phải việc còn bỏ ngỏ**.

Lưu ý: danh sách này **không tự đóng**. Khi quyết định đảo ngược, sửa mục này thay vì
sửa mã readiness.


Các suite liên quan riêng vẫn có thể chạy độc lập:

```bash
npm run test:srs
npm run test:ai
npm run test:ai-progress
npm run test:ai-progress-concurrency
npm run test:sp-ap
# auth + realtime + secret hygiene
npm run test:security
# monitoring surface (health/ready) + retention sweeper
npm run test:monitoring
npm run test:retention
# storage hygiene: báo cáo, KHÔNG xoá (xem docs/INCIDENT_RUNBOOK.md mục 5)
npm run storage:gc
# rate-limit suite needs its own server with the default LOGIN_RATE_MAX=10
LOGIN_RATE_MAX=10 BASE_URL=http://127.0.0.1:3000 node tests/e2e/auth-rate-limit.mjs
BASE_URL=http://127.0.0.1:3000 node scripts/ui-verify-ui-pass.mjs
```

## Kiểm tra giao diện

```bash
BASE_URL=http://127.0.0.1:3000 node scripts/ui-verify-control-center.mjs
# Tương phản dark mode (WCAG AA) trên 25 trang HQ + Field:
BASE_URL=http://127.0.0.1:3000 node scripts/ui-audit-dark-contrast.mjs
# Chỉ một nhóm trang, và ghi báo cáo JSON:
BASE_URL=... node scripts/ui-audit-dark-contrast.mjs --pages=/hq/attention --json=/tmp/opencode/contrast.json
```

`ui-audit-dark-contrast.mjs` dò mọi phần tử chữ, tự tính nền hiệu dụng (đi qua
các lớp nửa trong suốt rồi composite từ dưới lên), và báo lỗi khi tương phản
dưới 4.5:1 — hoặc 3:1 với chữ lớn. Exit code khác 0 nếu còn lỗi, nên dùng được
như một gate.

## Không chạy hai gate cùng lúc

## Cổng bị chiếm thì gate dừng, không chạy tiếp

Gate dùng cổng riêng (mặc định `3147`, đổi bằng `RELEASE_GATE_PORT`). Nếu cổng đó
đang có server sống, gate **dừng** và báo:

```
RELEASE GATE FAILED: cổng 3147 đã bị chiếm.
Một server cũ còn sống sẽ khiến gate chạy trên code cũ và báo kết quả sai.
Dừng tiến trình đó trước:  fuser -k 3147/tcp
```

Không phải kiểu cẩn thận thừa. Đã xảy ra đúng như vậy: server của lần gate trước
còn sống, server mới chết vì `EADDRINUSE` mà thông báo lỗi bị bỏ qua, rồi gate âm
thầm chạy tiếp trên code cũ. Nếu code mới làm hỏng một bài kiểm, gate vẫn có thể báo
PASS — tệ hơn FAIL vì tạo cảm giác an toàn giả.

Nên nếu thấy thông báo này: dừng tiến trình cũ rồi chạy lại, đừng đổi cổng để "lỡ
cho qua".

`release-gate.mjs` dựng server riêng trên cổng **3147**. Chạy hai bản song song thì
bản sau đâm cổng của bản trước, `SIGTERM` tiến trình của bản kia, và suite đang chạy
báo `ECONNREFUSED 127.0.0.1:3147` — trông y hệt hồi quy mã nguồn nhưng không phải.

Đã xảy ra một lần trong đợt 10: hai lần chạy nền chồng nhau, cả hai đều fail ở
`payment-sla.mjs`, và suite bị giết giữa chừng nên để lại dự án rò
`PAY-SLA-<timestamp>`. Phải dọn tay.

`release-gate.mjs` giờ tự chặn: nó ghi khoá PID ở
`/tmp/opencode/release-gate.lock` và từ chối chạy nếu pid trong khoá còn sống, in ra
`DỪNG: release-gate khác đang chạy`. Nên không cần nhớ phải kiểm tra.

Vì sao dùng khoá PID chứ không `pgrep -f 'release-gate'`: `pgrep -f` khớp **mọi**
tiến trình có chuỗi đó trong dòng lệnh, kể cả chính `bash -c` đang gọi gate — bản
thứ hai luôn bị chặn oan. Đã thử và thấy đúng như vậy.

Sau khi một lần chạy bị giết giữa chừng, kiểm tra dữ liệu rò:

```sql
SELECT code, id FROM projects WHERE code LIKE 'PAY-SLA-%';
```

Xoá nếu có (kèm `project_members` và `zones` của project đó).

