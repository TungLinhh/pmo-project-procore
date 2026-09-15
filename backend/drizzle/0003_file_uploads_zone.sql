-- file_uploads.zone_id existed only on the dev database (added by hand, never
-- captured in a migration) — fresh DBs (CI, docker, scratch) failed every
-- zoned upload with 'column zone_id does not exist'. Caught by pipeline-guard.
-- Nullable, no FK (mirrors dev); zone rows can be deleted independently.
ALTER TABLE file_uploads ADD COLUMN IF NOT EXISTS zone_id INTEGER;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS file_uploads_zone_idx ON file_uploads (zone_id);
