-- Lifecycle tails required after the main approval/payment workflows.
ALTER TABLE shop_drawings ADD COLUMN IF NOT EXISTS as_built_status varchar(12) NOT NULL DEFAULT 'PENDING';
--> statement-breakpoint
ALTER TABLE shop_drawings ADD COLUMN IF NOT EXISTS as_built_at TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE shop_drawings ADD COLUMN IF NOT EXISTS as_built_by INTEGER REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE shop_drawings ADD COLUMN IF NOT EXISTS as_built_notes TEXT;
--> statement-breakpoint
ALTER TABLE shop_drawings DROP CONSTRAINT IF EXISTS shop_drawings_as_built_status_check;
--> statement-breakpoint
ALTER TABLE shop_drawings ADD CONSTRAINT shop_drawings_as_built_status_check
  CHECK (as_built_status IN ('PENDING', 'RECORDED'));

ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS retention_status varchar(16) NOT NULL DEFAULT 'NOT_APPLICABLE';
--> statement-breakpoint
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS retention_due_date DATE;
--> statement-breakpoint
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS retention_released_amount NUMERIC(18,2) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS retention_released_at TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS retention_released_by INTEGER REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE payment_requests DROP CONSTRAINT IF EXISTS payment_requests_retention_status_check;
--> statement-breakpoint
ALTER TABLE payment_requests ADD CONSTRAINT payment_requests_retention_status_check
  CHECK (retention_status IN ('NOT_APPLICABLE', 'PENDING', 'RELEASED'));
--> statement-breakpoint
UPDATE payment_requests SET retention_status = 'PENDING'
  WHERE COALESCE(retention_amount, 0) > 0 AND status = 'PAID';

ALTER TABLE payments ADD COLUMN IF NOT EXISTS retention_released_amount NUMERIC(18,2) NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE payments ADD COLUMN IF NOT EXISTS retention_released_at TIMESTAMPTZ;

ALTER TABLE material_submittals ADD COLUMN IF NOT EXISTS physical_sample_status varchar(12) NOT NULL DEFAULT 'PENDING';
--> statement-breakpoint
ALTER TABLE material_submittals ADD COLUMN IF NOT EXISTS physical_sample_received_at TIMESTAMPTZ;
--> statement-breakpoint
ALTER TABLE material_submittals ADD COLUMN IF NOT EXISTS physical_sample_updated_by INTEGER REFERENCES users(id);
--> statement-breakpoint
ALTER TABLE material_submittals ADD COLUMN IF NOT EXISTS physical_sample_note TEXT;
--> statement-breakpoint
ALTER TABLE material_submittals DROP CONSTRAINT IF EXISTS material_submittals_physical_sample_status_check;
--> statement-breakpoint
ALTER TABLE material_submittals ADD CONSTRAINT material_submittals_physical_sample_status_check
  CHECK (physical_sample_status IN ('PENDING', 'ACCEPTED', 'REJECTED'));

CREATE INDEX IF NOT EXISTS shop_drawings_as_built_idx ON shop_drawings (project_id, as_built_status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS payment_requests_retention_idx ON payment_requests (retention_status, retention_due_date);
