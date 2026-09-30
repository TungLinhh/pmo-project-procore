-- Payment idempotency (chống double-pay ở tầng DB, đỡ cho guard ở route).
-- 1 payment/PR: UNIQUE(payment_request_id). Replay an toàn: idempotency_key
-- tùy chọn do client gửi (Idempotency-Key header), UNIQUE khi NOT NULL.
-- Đã kiểm tra: không có PR nào đang có >1 payment. Idempotent. Rank 29.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key varchar(64);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payments_request_uq
  ON payments (payment_request_id) WHERE payment_request_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS payments_idem_uq
  ON payments (idempotency_key) WHERE idempotency_key IS NOT NULL;
--> statement-breakpoint
