-- Rank 26: mo rong key idempotent cua construction_schedule_items.
-- Bug: key cu (project, zone, sheet, ordinal) trung nhau giua cac de-muc
-- (STT 1..N lap lai duoi moi phase I, II, ...) -> upsert giu dong cuoi,
-- mat ~70% rows file BTE that. Key moi them 3 cot level (parser giu phase
-- context tu v0.11.1). Backfill NULL cu ve default ''/0/0 cho nhat quan.
UPDATE construction_schedule_items SET level_roman = '' WHERE level_roman IS NULL;
--> statement-breakpoint
UPDATE construction_schedule_items SET level_arabic = 0 WHERE level_arabic IS NULL;
--> statement-breakpoint
UPDATE construction_schedule_items SET sublevel = 0 WHERE sublevel IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS construction_schedule_items_uq;
--> statement-breakpoint
CREATE UNIQUE INDEX construction_schedule_items_uq ON construction_schedule_items
  (project_id, zone_id, source_sheet, level_roman, level_arabic, sublevel, ordinal);
--> statement-breakpoint
