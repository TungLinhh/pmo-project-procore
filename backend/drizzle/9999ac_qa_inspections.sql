-- QA/QC inspections pillar (NFR mở rộng: thêm trụ cột không rewrite display).
-- Nghiệm thu công việc: OPEN → PASSED | FAILED, FAILED → OPEN/PASSED.
-- Idempotent. Rank 30.
CREATE TABLE IF NOT EXISTS qa_inspections (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  zone_id INTEGER REFERENCES zones(id),
  code varchar(50) NOT NULL,
  title_vi text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  inspected_at date,
  inspector text,
  note text,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT qa_inspections_status_check CHECK (status IN ('OPEN', 'PASSED', 'FAILED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS qa_inspections_project_code_uq
  ON qa_inspections (project_id, code);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS qa_inspections_project_idx ON qa_inspections (project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS qa_inspections_status_idx ON qa_inspections (status);
--> statement-breakpoint
ALTER TABLE qa_inspections ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE qa_inspections FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS qa_inspections_tenant_isolation ON qa_inspections;
--> statement-breakpoint
CREATE POLICY qa_inspections_tenant_isolation ON qa_inspections
  USING (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int)
  WITH CHECK (current_setting('app.current_tenant', true) = '' OR tenant_id = nullif(current_setting('app.current_tenant', true), '')::int);
--> statement-breakpoint
