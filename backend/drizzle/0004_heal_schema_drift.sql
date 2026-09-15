-- Heal schema drift between the long-lived dev DB and migration history.
-- Found by diffing information_schema of a fresh init against dev (2026-09-13).
-- Two directions:
--   1. projects close columns exist on dev (added ad-hoc, in no migration).
--      Fresh DBs crashed POST /api/projects/:id/close with
--      'column "closed_at" of relation "projects" does not exist'.
--   2. directives.issued_by/due_date/completed_at exist in migration 9999 but
--      are missing on dev (its directives table predates that shape).
-- All statements are IF NOT EXISTS: safe on both sides, converges them.
-- Regression test: tests/e2e/api.mjs close/revoke-close flow on a fresh DB
-- (CI backend-tests runs it before schema.mjs).
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closed_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closed_by INTEGER;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS close_reason TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closed_revoked_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS closed_revoked_by INTEGER;
-- directives is created later by 9999 (migration runner orders 9999 after all
-- rank-0 files), so guard: on a truly fresh DB this table doesn't exist yet
-- when 0004 runs; 9999 already creates it WITH these columns.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'directives') THEN
    ALTER TABLE directives ADD COLUMN IF NOT EXISTS issued_by INTEGER REFERENCES users(id);
    ALTER TABLE directives ADD COLUMN IF NOT EXISTS due_date TIMESTAMP;
    ALTER TABLE directives ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
  END IF;
END $$;
