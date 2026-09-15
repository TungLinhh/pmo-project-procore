// P5-2: BTE demo-data golden numbers (integrity proof after every wave).
// Locks in: 77 AP contracts / 248 PRs / 6 AR contracts / 72 AR lines /
// MPM Oct dossier sum / 0 bogus-DONE schedule items / 3 projects / bell empty.
// Any migration/ingest regression that eats data fails here first.
// Run: BASE_URL=http://localhost:3000 node tests/e2e/p5-golden.mjs
import { loginAs, auth, psql, ok, summary } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const token = await loginAs('admin@hbg.com');
ok(!!token, 'login');
const get = (p) => fetch(BASE + p, { headers: auth(token) }).then(r => r.json());

// API-level counts (what the demo tabs actually render)
const contracts = await get('/api/projects/1/contracts');
const prs = await get('/api/projects/1/payment-requests?limit=500');
ok(contracts.length === 77, `77 AP contracts (got ${contracts.length})`);
ok(prs.length === 248, `248 payment requests (got ${prs.length})`);

// DB-level goldens
ok(psql(`SELECT COUNT(*) FROM ar_contracts WHERE project_id = 1;`) === '6', '6 AR contracts');
ok(psql(`SELECT COUNT(*) FROM ar_lines WHERE project_id = 1;`) === '72', '72 AR lines (57 + 15 dossiers)');
ok(psql(`SELECT COALESCE(SUM(amount),0)::bigint FROM ar_lines WHERE project_id = 1 AND kind = 'dossier' AND label ILIKE '%tháng 10%';`) === '5072449241', 'MPM Oct dossier sum = 5,072,449,241');
ok(psql(`SELECT COUNT(*) FROM construction_schedule_items WHERE project_id = 1 AND status = 'DONE' AND (progress_pct IS NULL OR progress_pct < 1) AND actual_end_date IS NULL;`) === '0', '0 bogus-DONE schedule items (DONE w/o progress and w/o actual_end)');
// Multi-tenant (2026-09-15): the DB now holds a second tenant (PILOT). Portfolio
// goldens scope to HBG — use cross-tenant-guard.mjs for isolation proof.
const HBG = `tenant_id = (SELECT id FROM tenants WHERE code = 'hbg')`;
ok(psql(`SELECT COUNT(*) FROM projects WHERE status = 'ACTIVE' AND ${HBG};`) === '2', '2 active HBG projects (BTE + LVK, no placeholder seeds)');
ok(psql(`SELECT string_agg(code, ',' ORDER BY id) FROM projects WHERE status = 'ACTIVE' AND ${HBG};`) === 'BTE-WP4-HBC,HBG-LVK-BCTH', 'exact HBG project set');
ok(psql(`SELECT COUNT(*) FROM notifications WHERE user_id = 1 AND read_at IS NULL;`) === '0', 'demo bell empty');
ok(psql(`SELECT COUNT(*) FROM departments WHERE ${HBG};`) === '4', '4 seeded HBG departments');
ok(Number(psql(`SELECT COUNT(*) FROM schema_migrations;`)) >= 13, 'migrations ledgered (0000..0003 + 9991..9999)');
ok(psql(`SELECT COUNT(*) FROM schema_migrations WHERE filename IN ('0001_departments_chains.sql','0002_sync_notes.sql','0003_file_uploads_zone.sql');`) === '3', 'wave migrations present');

summary();
