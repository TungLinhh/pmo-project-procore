# Quyết định phạm vi SSO — làm sau, ở production

**Ngày:** 2026-09-25
**Chủ đạo:** Đăng nhập thực tế chưa cần lúc này; SSO làm khi đẩy production.

## Trạng thái hiện tại

| Hạng mục | Trạng thái |
|---|---|
| `POST /api/auth/sso/start` | Còn nguyên, có `loginLimiter`, trả 404 chung chung |
| `POST /api/auth/sso/callback` | Còn nguyên, PKCE + state, chống chiếm đoạt subject |
| `POST /api/auth/sso/mfa/verify-sso` | Còn nguyên, bước 2 TOTP sau SSO |
| `GET/PUT /api/admin/sso` | Còn nguyên, admin/CEO, `client_secret` chỉ qua biến môi trường |
| `GET /api/auth/sso/discover` | **Đã gỡ** — SSRF (server fetch URL do người gọi chọn) |
| Gate `sso_enabled` trong production-readiness | **Đã bỏ** — không thể đạt, chặn vô điều kiện |
| `ALLOW_SSO_INLINE_SECRET` | Vẫn phải bằng `0` (bảo vệ `PUT /api/admin/sso`) |

## Vì sao gỡ `discover` mà vẫn "làm SSO sau" được

`discover` là route **công khai, không xác thực** nhận `?issuer=` rồi điều hướng server tới URL đó. Đây là SSRF thuần: vòng lặp, mạng nội bộ, metadata endpoint đều gọi được. Nó **không thuộc luồng SSO cần thiết** — luồng thật dùng `issuer` đã lưu trong `sso_configs`.

Khi bật SSO ở production, admin kiểm tra kết nối qua `POST /api/admin/sso/test` (đã xác thực, chỉ đọc cấu hình tenant). Không cần `discover`.

## Việc còn lại khi đến giờ làm SSO ở production

1. `CREATE EXTENSION`/cấu hình IdP, tạo `sso_configs` cho tenant (UI `/hq/security`).
2. Đặt `SSO_CLIENT_SECRET` (hoặc tên biến tương ứng) trong môi trường, **không** nhúng vào DB.
3. Bật `loginLimiter` ở mức production, kiểm tra `MFA` cho user admin/CEO.
4. Thêm `state`/`redirect_uri` allowlist nếu triển khai nhiều domain.
5. Chạy lại `node tests/e2e/sso.mjs` trên môi trường đích (cần `ALLOW_SSO_INLINE_SECRET=1` cho bước cấu hình test).
6. Nếu muốn bật `discover` trở lại, phải kèm allowlist host + chặn IP riêng tư, và nó **không được** là gate phát hành.

## Cảnh báo bảo mật còn lại (độc lập SSO)

- `routes/stream.js` vẫn nhận access token đầy đủ qua query string `?token=` → token nằm trong access log và history. Nên đổi sang header hoặc token ngắn hạn riêng cho SSE.
- `POST /api/me/mfa/disable` chỉ cần mật khẩu, chưa có đường break-glass cho admin.
