-- Patch: real password storage (Phase 2 auth). Backfill of existing demo users
-- to bcrypt('admin123') happens in src/db/init.js (idempotent, NULL-only).
-- Idempotent: safe to re-apply on every init.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
