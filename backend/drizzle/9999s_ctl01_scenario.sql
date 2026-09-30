-- CTL-01 extension scenario (SRS 4.2.2: gia hạn → dàn lại nhu cầu).
-- Mở CHECK type của pillar_scenarios (không sửa file 9999q đã apply).
-- Idempotent. Rank 20 (chạy sau 9999r).
ALTER TABLE pillar_scenarios DROP CONSTRAINT IF EXISTS pillar_scenarios_type_check;
--> statement-breakpoint
ALTER TABLE pillar_scenarios ADD CONSTRAINT pillar_scenarios_type_check
  CHECK (type IN ('CTL-01', 'CTL-03', 'CTL-04', 'CTL-05', 'CTL-06'));
--> statement-breakpoint
