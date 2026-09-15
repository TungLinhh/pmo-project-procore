-- Add issues table to PG (matches SQLite schema.sql)
-- Created on 2026-09-04 because route /api/projects/:id/issues crashed with "relation does not exist"
-- Schema mirrors src/db/schema.sql line 487
CREATE TABLE IF NOT EXISTS issues (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  project_id INTEGER NOT NULL REFERENCES projects(id),
  zone_id INTEGER REFERENCES zones(id),
  source_resource TEXT,
  source_id INTEGER,
  title TEXT NOT NULL,
  body TEXT,
  category TEXT,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  owner_user_id INTEGER REFERENCES users(id),
  due_date TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS issues_project_idx ON issues (project_id);
CREATE INDEX IF NOT EXISTS issues_status_idx ON issues (status);
CREATE INDEX IF NOT EXISTS issues_severity_idx ON issues (severity);

-- Directives is canonically defined in 9998 (runs first). This block is a
-- legacy-fallback no-op when 9998 already created the table; it only helps
-- databases where 9999 was applied without 9998. Do NOT add conflicting columns here.
CREATE TABLE IF NOT EXISTS directives (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  issue_id INTEGER NOT NULL REFERENCES issues(id),
  body TEXT NOT NULL,
  issued_by INTEGER REFERENCES users(id),
  due_date TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS directives_issue_idx ON directives (issue_id);

-- Daily infos (mentioned in PG list but might be missing)
-- Already in drizzle, but check anyway
DO $$ BEGIN
  PERFORM 1 FROM information_schema.tables WHERE table_name = 'daily_infos';
  IF NOT FOUND THEN
    CREATE TABLE daily_infos (
      id SERIAL PRIMARY KEY,
      daily_report_id INTEGER NOT NULL REFERENCES daily_reports(id),
      key TEXT,
      value TEXT
    );
  END IF;
END $$;
