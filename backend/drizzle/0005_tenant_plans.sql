-- Tenant plan tiers (Small / Mid / Enterprise) + feature-flag overrides.
-- Procore-style packaging: unlimited users/data, scope bundled by plan, not per-seat.
-- Backend resolves entitlements in lib/entitlements.js; HBG stays Enterprise (full).
-- Idempotent: safe to re-apply on every init.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'enterprise';
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS feature_flags JSONB NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenants_plan_check') THEN
    ALTER TABLE tenants ADD CONSTRAINT tenants_plan_check CHECK (plan IN ('small', 'mid', 'enterprise'));
  END IF;
END $$;
--> statement-breakpoint
UPDATE tenants SET plan = 'enterprise' WHERE plan NOT IN ('small', 'mid', 'enterprise');
