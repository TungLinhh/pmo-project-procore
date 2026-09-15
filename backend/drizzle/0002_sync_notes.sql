-- Offline sync CLIENT apply needs writable note fields (Wave P4-3).
-- Additive only: nullable TEXT, no backfill, no behavior change.
ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS notes TEXT;
--> statement-breakpoint
ALTER TABLE shop_drawings ADD COLUMN IF NOT EXISTS notes TEXT;
