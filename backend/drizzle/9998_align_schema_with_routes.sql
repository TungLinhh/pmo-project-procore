-- Patch: align PG schema with route code expectations
-- This patch adds columns that route code uses but PG schema (drizzle migrations) doesn't have.
-- Run after initial migrations.
-- Safe to re-run (IF NOT EXISTS).

-- audit_log: add columns used by route code
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS field_name VARCHAR(100);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS old_value TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS new_value TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS note TEXT;

-- directives: canonical schema expected by routes/directives.js (additive only — never DROP).
-- 9998 runs before 9999, so this CREATE wins; 9999's CREATE IF NOT EXISTS becomes a no-op.
CREATE TABLE IF NOT EXISTS directives (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  issue_id INTEGER REFERENCES issues(id),
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  from_user_name TEXT,
  body TEXT NOT NULL,
  notify_to_user_ids TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
-- Heal legacy 9999-shaped table (issue_id NOT NULL, issued_by, no project_id/from_user_id):
-- make issue_id nullable (directives can exist without an issue) and add missing columns.
ALTER TABLE directives ALTER COLUMN issue_id DROP NOT NULL;
ALTER TABLE directives ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
ALTER TABLE directives ADD COLUMN IF NOT EXISTS project_id INTEGER;
ALTER TABLE directives ADD COLUMN IF NOT EXISTS from_user_id INTEGER;
ALTER TABLE directives ADD COLUMN IF NOT EXISTS from_user_name TEXT;
ALTER TABLE directives ADD COLUMN IF NOT EXISTS notify_to_user_ids TEXT;
CREATE INDEX IF NOT EXISTS directives_issue_idx ON directives (issue_id);
CREATE INDEX IF NOT EXISTS directives_project_idx ON directives (project_id);

-- suppliers: add columns used by route code
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS past_projects TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS price_rating VARCHAR(20);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS quality_rating VARCHAR(20);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS warranty_rating VARCHAR(20);

-- audit_log: add context + field_changes for JSON snapshot
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS context jsonb;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS field_changes jsonb;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_role varchar(50);
CREATE INDEX IF NOT EXISTS audit_project_idx ON audit_log ((context->>'project_id'), created_at DESC);
CREATE INDEX IF NOT EXISTS audit_action_idx ON audit_log (action, created_at DESC);

-- users: add notification channel preferences
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_email BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_zalo BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS zalo_user_id VARCHAR(64);

-- master_status enum: thêm CLOSED cho project archive
ALTER TYPE master_status ADD VALUE IF NOT EXISTS 'CLOSED' AFTER 'INACTIVE';

-- material_submittals: thêm SLA cho TVGS (tư vấn giám sát) duyệt
-- Decision 2026-09-04: mỗi điểm 3 ngày (TVGS duyệt)
ALTER TABLE material_submittals ADD COLUMN IF NOT EXISTS supervisor_approval_days INTEGER DEFAULT 3;
ALTER TABLE material_submittals ADD COLUMN IF NOT EXISTS supervisor_deadline DATE;
UPDATE material_submittals SET supervisor_approval_days = 3 WHERE supervisor_approval_days IS NULL;

-- workflow_status enum: thêm PAID cho payment_request + payment
ALTER TYPE workflow_status ADD VALUE IF NOT EXISTS 'PAID' AFTER 'CLOSED';

-- daily_photos: ảnh đính kèm cho daily report (Q5 sếp confirm 2026-09-05)
CREATE TABLE IF NOT EXISTS daily_photos (
  id SERIAL PRIMARY KEY,
  daily_report_id INTEGER NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT,
  mime_type VARCHAR(100),
  file_size INTEGER,
  caption TEXT,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TIMESTAMP DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_photos_report_idx ON daily_photos(daily_report_id);

-- TVGS auto-escalation (2026-09-05): track khi submittal đã escalate + PM assigned cho project
ALTER TABLE material_submittals ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pm_user_id INTEGER REFERENCES users(id);
CREATE INDEX IF NOT EXISTS ms_escalated_idx ON material_submittals(escalated_at) WHERE escalated_at IS NULL;

-- Materials zone_id nullable (2026-09-05): cho phép tạo material mà chưa gán zone
ALTER TABLE materials ALTER COLUMN zone_id DROP NOT NULL;
