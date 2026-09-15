-- Site holidays (v0.6.1): VN public holidays + tenant custom days off.
-- tenant_id NULL = global (applies to every tenant). Compression auto-merges
-- overlapping holidays into suspension gaps. Runs last (rank 7). Idempotent.
CREATE TABLE IF NOT EXISTS site_holidays (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, holiday_date)
);
--> statement-breakpoint
-- NULL tenant never conflicts (NULLs never equal), so a second partial index
-- guards exactly one global row per date:
CREATE UNIQUE INDEX IF NOT EXISTS site_holidays_global_uq ON site_holidays (holiday_date) WHERE tenant_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS site_holidays_tenant_idx ON site_holidays (tenant_id);
--> statement-breakpoint
ALTER TABLE site_holidays ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE site_holidays FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS site_holidays_tenant_isolation ON site_holidays;
--> statement-breakpoint
CREATE POLICY site_holidays_tenant_isolation ON site_holidays
  USING (app_tenant_unset() OR tenant_id IS NULL OR tenant_id = app_current_tenant())
  -- Writes never create global rows via the app (routes force own tenant_id);
  -- NULL here would let any tenant pollute the global calendar.
  WITH CHECK (app_tenant_unset() OR tenant_id = app_current_tenant());
--> statement-breakpoint
-- VN public holidays 2026–2027 (global). Observed dates, solar calendar.
INSERT INTO site_holidays (tenant_id, holiday_date, name) VALUES
  (NULL, '2026-01-01', 'Tết Dương lịch'),
  (NULL, '2026-02-16', 'Tết Nguyên đán (28 Tết)'),
  (NULL, '2026-02-17', 'Tết Nguyên đán (29 Tết)'),
  (NULL, '2026-02-18', 'Tết Nguyên đán (Mùng 1)'),
  (NULL, '2026-02-19', 'Tết Nguyên đán (Mùng 2)'),
  (NULL, '2026-02-20', 'Tết Nguyên đán (Mùng 3)'),
  (NULL, '2026-04-25', 'Giỗ Tổ Hùng Vương (10/3 ÂL, nghỉ bù)'),
  (NULL, '2026-04-30', 'Giải phóng miền Nam'),
  (NULL, '2026-05-01', 'Quốc tế Lao động'),
  (NULL, '2026-09-02', 'Quốc khánh'),
  (NULL, '2027-01-01', 'Tết Dương lịch'),
  (NULL, '2027-02-05', 'Tết Nguyên đán (28 Tết)'),
  (NULL, '2027-02-06', 'Tết Nguyên đán (29 Tết)'),
  (NULL, '2027-02-08', 'Tết Nguyên đán (Mùng 1)'),
  (NULL, '2027-02-09', 'Tết Nguyên đán (Mùng 2)'),
  (NULL, '2027-02-10', 'Tết Nguyên đán (Mùng 3)'),
  (NULL, '2027-04-16', 'Giỗ Tổ Hùng Vương'),
  (NULL, '2027-04-30', 'Giải phóng miền Nam'),
  (NULL, '2027-05-01', 'Quốc tế Lao động'),
  (NULL, '2027-09-02', 'Quốc khánh')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
