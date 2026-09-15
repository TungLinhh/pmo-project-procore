-- Patch: project membership (Phase 2 access control).
-- HBG-only today: every user is a member of every HBG project (backfilled in
-- src/db/init.js). Cross-tenant and non-member rows are rejected by
-- requireProjectAccess(). Multi-tenant later = stop the backfill, manage rows.
-- Idempotent: safe to re-apply on every init.
CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
