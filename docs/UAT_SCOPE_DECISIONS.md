# Quyết định phạm vi trước UAT

Ngày cập nhật: 2026-09-25

## Đã chốt

1. **Không yêu cầu SSO trong phạm vi UAT hiện tại.**
   - SSO không được dùng làm gate phải đạt.
   - Nếu sau này bật SSO, nó là phương án bổ sung, không thay thế MFA/password policy.
2. **UAT chưa ký.**
   - Không tự điền tên, ngày, chữ ký.
   - Chỉ PMO/CEO hoặc người được ủy quyền xác nhận sau khi production readiness đạt.
3. **AI chỉ đề xuất.**
   - Parser/guard deterministic quyết định target, before/after và fingerprint.
   - LLM không được tự ghi baseline, lịch, payment, notification hoặc scenario.
   - Apply là hành động có role gate, transaction và audit.
4. **Ưu tiên UX/UI và độ ổn định.**
   - Desktop và mobile phải có loading, empty, error, focus và keyboard state rõ ràng.
   - Không được coi UI pass nếu chỉ kiểm tra một viewport desktop.

## Gate bắt buộc trước UAT

- API/RBAC/tenant isolation và project scope.
- Idempotency, concurrency, stale detection, rollback và audit.
- Ingest atomicity và các invariant tài chính/retention đã được PMO/CEO xác nhận.
- Lint, build, schema audit, migration ledger, browser desktop/mobile.
- OpenRouter thật: citation, refusal, primary/fallback, latency, side-effect count.
- `getProductionReadiness().ready === true` trên production environment.

## Trạng thái kiểm chứng (2026-09-25)

Đã đạt, có bằng chứng chạy được:

- `npm run test:release` → 50/50 bước PASS (`passed: true`).
- `npm run test:srs` → ALL PASS.
- `scripts/ui-verify-ui-pass.mjs` → 21/21 PASS; `ui-verify-detail-nav.mjs` → 0 lỗi.
- `npm run test:ai` (OpenRouter thật) → 8/8 PASS, `no_business_side_effects=true`.
- `npm run lint` → 0 lỗi; `git diff --check` sạch.

Chưa đạt, chặn phát hành:

- `getProductionReadiness().ready` vẫn `false` vì thiếu cấu hình production thật
  (`NODE_ENV`, `JWT_SECRET`, `DATA_ENC_KEY`, `APP_DB_*`, `BACKUP_DATABASE_URL`).
- `admin123` còn tồn tại trên tài khoản demo; admin/CEO chưa bật MFA.
- **Phải rotate `OPENROUTER_API_KEY`** vì `backend/.env` từng bị bake vào image layer.
- Primary AI route (`nvidia/nemotron-3-ultra-550b-a55b:free`) còn không ổn định:
  4/8 case phải dùng fallback. Cần đánh giá tỷ lệ lỗi primary trong cửa sổ UAT.
- UAT vẫn **CHƯA KÝ**.

## Không tự động kết luận

- `8/8 PASS` AI chỉ là provider/contract evidence.
- Test local không thay thế UAT production.
- Không dùng kết quả test để bỏ qua quyết định nghiệp vụ về duplicate, tài chính hoặc quyền apply.
