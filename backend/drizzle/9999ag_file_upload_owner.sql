-- File upload ownership for project-level authorization.
ALTER TABLE file_uploads ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS file_uploads_created_by_idx ON file_uploads (tenant_id, created_by, created_at);
