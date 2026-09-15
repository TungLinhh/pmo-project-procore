-- Patch: keep the raw source "Tình trạng" text for schedule items.
-- `status` is DERIVED from progress_pct/actual_end_date (see
-- services/ingest/construction_schedule.js); `source_status` is reference-only.
-- Idempotent: safe to re-apply on every init.
ALTER TABLE construction_schedule_items ADD COLUMN IF NOT EXISTS source_status TEXT;
