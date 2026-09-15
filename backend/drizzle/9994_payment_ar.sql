-- Patch: AR (phải thu từ CĐT) tables. Isolated from the AP chain
-- (contracts/invoices/payment_requests) like supplier_payment is:
-- every AR row comes from a payment_ar ingest, never mixed.
-- Idempotent: safe to re-apply on every init.
CREATE TABLE IF NOT EXISTS ar_contracts (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  source_sheet TEXT NOT NULL,
  upload_id INTEGER,
  ordinal INTEGER,
  project_name TEXT,
  client_name TEXT,
  contract_value NUMERIC,
  settled_value NUMERIC,
  paid_value NUMERIC,
  remaining_value NUMERIC,
  invoiced_value NUMERIC,
  due_now_value NUMERIC,
  forecast_1 NUMERIC,
  forecast_2 NUMERIC,
  invoice_debt NUMERIC,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ar_contracts_uq
  ON ar_contracts(project_id, source_sheet, ordinal);
CREATE TABLE IF NOT EXISTS ar_lines (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  source_sheet TEXT NOT NULL,
  upload_id INTEGER,
  kind TEXT NOT NULL, -- contract | invoice | payment
  ordinal INTEGER,
  label TEXT,
  ref_no TEXT,
  ref_date TEXT,
  amount NUMERIC,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ar_lines_sheet_idx
  ON ar_lines(project_id, source_sheet);
