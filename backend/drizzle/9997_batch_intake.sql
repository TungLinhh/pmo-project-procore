-- Batch intake columns for file_uploads (additive, idempotent).
-- relative_path preserves folder structure from folder/zip uploads
-- (e.g. "2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ SHOP/MEP-BTE-SHD-BOH.xlsx")
-- so the classifier can use folder-then-filename signals.
-- skip_reason explains SKIPPED_* statuses in the review queue.
ALTER TABLE file_uploads ADD COLUMN IF NOT EXISTS relative_path TEXT;
ALTER TABLE file_uploads ADD COLUMN IF NOT EXISTS skip_reason TEXT;
CREATE INDEX IF NOT EXISTS file_uploads_status_idx ON file_uploads (status);
