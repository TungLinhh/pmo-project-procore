-- Scope generic_sheets rows to the upload that produced them.
--
-- "Xem rows" in the review queue answered
--   SELECT ... FROM generic_sheets WHERE project_id = ? AND doc_type = ?
-- so a file's drill-down returned EVERY row of that doc type in the project,
-- from files the user had never opened. There was no column to scope by — the
-- table simply did not record which upload wrote each row, while every other
-- business table does (upload_id).
--
-- Nullable, so the 353 existing rows stay valid; they simply belong to no
-- single upload and the drill-down falls back to the project-wide view for
-- them (and says so in the response).
ALTER TABLE generic_sheets
  ADD COLUMN IF NOT EXISTS upload_id integer
    REFERENCES file_uploads(id) ON DELETE SET NULL;

-- Drill-down reads by upload, so index it. Partial: only rows written by the
-- wizard carry an upload id.
CREATE INDEX IF NOT EXISTS generic_sheets_upload_idx
  ON generic_sheets (upload_id)
  WHERE upload_id IS NOT NULL;
