-- Nested departments (Wave D2, rank 12): parent_id self-FK, cycle-guarded in
-- the write path (same doctrine as schedule_links). Backfill: all NULL
-- (flat-compatible day one — chain resolution falls back exactly as before).
-- Idempotent.
ALTER TABLE departments ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES departments(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS departments_parent_idx ON departments (parent_id);
--> statement-breakpoint
