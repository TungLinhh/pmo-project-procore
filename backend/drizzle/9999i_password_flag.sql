-- Password rotation support (Wave 2 A2, rank 10). must_change_password is set
-- by admin reset; login refuses with 403 PASSWORD_CHANGE_REQUIRED until the
-- user sets their own. Idempotent.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
--> statement-breakpoint
