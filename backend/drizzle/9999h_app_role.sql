-- Least-privilege app role (Wave 2 A1, rank 9). The pool connects as pmo_app
-- by default; pmo_user keeps ownership + migrations/seeds (init.js sets the
-- role password from APP_DB_PASSWORD each boot, dev default below).
--
-- One-time DBA/dev prerequisite: the migration runner needs CREATEROLE
-- (compose bootstrap superuser has it; local dev: as a socket superuser run
--   ALTER USER pmo_user CREATEROLE;
-- without it this file fails loud — by design, never half-granted).
-- Future tables: re-run the GRANT loops (or add a follow-up migration).
-- RLS policies are role-agnostic; FORCE now bites for real (pmo_app owns nothing).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pmo_app') THEN
    CREATE ROLE pmo_app WITH LOGIN;
  END IF;
END $$;
--> statement-breakpoint
-- DML on every app table (present and future runs of this loop).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO pmo_app', r.tablename);
  END LOOP;
END $$;
--> statement-breakpoint
-- Sequence USAGE (nextval on insert) + EXECUTE on helper functions.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public' LOOP
    EXECUTE format('GRANT USAGE ON SEQUENCE public.%I TO pmo_app', r.sequence_name);
  END LOOP;
END $$;
--> statement-breakpoint
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO pmo_app;
--> statement-breakpoint
-- Future-proofing: objects created later BY pmo_user auto-grant to pmo_app.
-- (Objects created by anyone else still need an explicit follow-up — the
-- grant-audit test fails closed on those.)
ALTER DEFAULT PRIVILEGES FOR ROLE pmo_user IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pmo_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE pmo_user IN SCHEMA public
  GRANT USAGE ON SEQUENCES TO pmo_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES FOR ROLE pmo_user IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO pmo_app;
--> statement-breakpoint
