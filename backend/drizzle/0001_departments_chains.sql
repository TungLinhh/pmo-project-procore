-- Departments + per-department approval chains (Wave 2).
-- Chain scope: (department_id, resource_type) → department override,
-- department_id NULL → tenant default. No chain row = legacy single-step.
-- Levels: JSONB [{ "level": 1, "role": "PM", "label": "Trưởng BP" }], max 5
-- (shop_drawings stores responses in bql_l1..l5 columns).
CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  code VARCHAR(50) NOT NULL,
  name_vi TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (tenant_id, code)
);
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id);
--> statement-breakpoint
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS approval_chains (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id),
  department_id INTEGER REFERENCES departments(id),
  resource_type VARCHAR(50) NOT NULL,
  levels JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- UNIQUE can't cover the NULL-default row (NULLs never conflict), so two partial indexes:
CREATE UNIQUE INDEX IF NOT EXISTS approval_chains_default_uq
  ON approval_chains (tenant_id, resource_type) WHERE department_id IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS approval_chains_dept_uq
  ON approval_chains (tenant_id, department_id, resource_type) WHERE department_id IS NOT NULL;
