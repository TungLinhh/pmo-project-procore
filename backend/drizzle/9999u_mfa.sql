-- TOTP MFA per user (SRS: đăng nhập cá nhân + MFA trước production).
-- mfa_secret lưu khi setup (chưa enable cũng lưu, xác nhận code mới bật).
-- Idempotent. Rank 22 (chạy sau 9999t).
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint
