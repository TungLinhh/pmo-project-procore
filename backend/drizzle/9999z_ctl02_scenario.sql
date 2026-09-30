-- CTL-02 acceleration scenario (SRS 4.2.2: nén tiến độ → nhân lực bổ sung + cảnh báo gate).
-- Mở CHECK type của pillar_scenarios (không sửa file 9999q/9999s đã apply).
-- Idempotent. Rank 27 (chạy sau 9999y).
ALTER TABLE pillar_scenarios DROP CONSTRAINT IF EXISTS pillar_scenarios_type_check;
--> statement-breakpoint
ALTER TABLE pillar_scenarios ADD CONSTRAINT pillar_scenarios_type_check
  CHECK (type IN ('CTL-01', 'CTL-02', 'CTL-03', 'CTL-04', 'CTL-05', 'CTL-06'));
--> statement-breakpoint
