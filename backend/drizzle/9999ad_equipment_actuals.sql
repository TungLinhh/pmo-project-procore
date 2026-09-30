-- Equipment actuals share the daily report flow with labor, but stay separate
-- from worker headcount and manpower loading percentages.
ALTER TABLE daily_manpower ADD COLUMN IF NOT EXISTS kind varchar(10) NOT NULL DEFAULT 'labor';
--> statement-breakpoint
ALTER TABLE daily_manpower DROP CONSTRAINT IF EXISTS daily_manpower_kind_check;
--> statement-breakpoint
ALTER TABLE daily_manpower ADD CONSTRAINT daily_manpower_kind_check
  CHECK (kind IN ('labor', 'equipment'));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS daily_manpower_kind_report_idx
  ON daily_manpower (kind, daily_report_id);
