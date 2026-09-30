-- SRS Mục 2.2 procurement lifecycle for material deliverables.
ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS procurement_status varchar(24) NOT NULL DEFAULT 'REQUESTED',
  ADD COLUMN IF NOT EXISTS po_number varchar(100),
  ADD COLUMN IF NOT EXISTS po_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS expected_delivery_at date,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by integer REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS acceptance_result varchar(12),
  ADD COLUMN IF NOT EXISTS lifecycle_note text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
--> statement-breakpoint
ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_procurement_status_check;
--> statement-breakpoint
ALTER TABLE materials ADD CONSTRAINT materials_procurement_status_check CHECK (procurement_status IN (
  'REQUESTED', 'MSB_PREPARING', 'MSB_APPROVED', 'PO_ISSUED', 'PRODUCTION',
  'IN_TRANSIT', 'DELIVERED', 'ACCEPTED', 'REJECTED'
));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS materials_procurement_status_idx ON materials (project_id, procurement_status, expected_delivery_at);
