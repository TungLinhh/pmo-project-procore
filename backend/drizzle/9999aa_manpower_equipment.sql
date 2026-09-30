-- Manpower equipment planning (SRS 2.3/CTL-05: thiết bị thi công theo trade).
-- Thêm kind labor|equipment vào manpower_plans (không tách bảng mới — chung
-- 1 tab "Kế hoạch & Loading"). Loading curve chỉ tính labor (actual từ
-- daily_manpower vốn là headcount). Idempotent. Rank 28.
ALTER TABLE manpower_plans ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'labor';
--> statement-breakpoint
ALTER TABLE manpower_plans DROP CONSTRAINT IF EXISTS manpower_plans_kind_check;
--> statement-breakpoint
ALTER TABLE manpower_plans ADD CONSTRAINT manpower_plans_kind_check
  CHECK (kind IN ('labor', 'equipment'));
--> statement-breakpoint
DROP INDEX IF EXISTS manpower_plans_project_role_week_uq;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS manpower_plans_project_kind_role_week_uq
  ON manpower_plans (project_id, kind, role_name_vi, week_start);
--> statement-breakpoint
