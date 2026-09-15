-- Row-level source lineage: which upload a domain row was committed from.
-- Powers the progress drill-down "view original file" link. Nullable so all
-- existing rows keep working; backfill is impossible (old commits didn't
-- record it) — forward-fill only.
ALTER TABLE construction_schedule_items ADD COLUMN IF NOT EXISTS upload_id INTEGER REFERENCES file_uploads(id) ON DELETE SET NULL;
ALTER TABLE shop_drawings ADD COLUMN IF NOT EXISTS upload_id INTEGER REFERENCES file_uploads(id) ON DELETE SET NULL;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS upload_id INTEGER REFERENCES file_uploads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS csi_upload_idx ON construction_schedule_items (upload_id);
CREATE INDEX IF NOT EXISTS shop_upload_idx ON shop_drawings (upload_id);
CREATE INDEX IF NOT EXISTS materials_upload_idx ON materials (upload_id);
