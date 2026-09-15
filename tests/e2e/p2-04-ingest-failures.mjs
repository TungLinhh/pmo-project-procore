// P2-04: ingest failures are structured {sheet,row,field,message,ref} — real bad rows, real PG.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p2-04-ingest-failures.mjs
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const { commit: commitProjectLevel } = await import('../../backend/src/services/ingest/project_level.js');
const { commit: commitDaily } = await import('../../backend/src/services/ingest/daily_report.js');
const { commit: commitShop } = await import('../../backend/src/services/ingest/shop_drawing.js');
const { fieldFromDbError } = await import('../../backend/src/services/ingest/failures.js');
const { getDb, closeDb } = await import('../../backend/src/db/index.js');

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

// unit: field inference from raw PG messages (schema-agnostic, no column changes)
ok(fieldFromDbError('null value in column "zone_id" of relation "x" violates not-null constraint') === 'zone_id', 'field inferred: not-null column');
ok(fieldFromDbError('duplicate key value violates unique constraint "u" Key (project_id, drawing_code)=(1, X) already exists') === 'project_id, drawing_code', 'field inferred: unique key');
ok(fieldFromDbError('boom') === null, 'field null when not inferable (message still kept)');

// live 1: project-level commit, two rows missing zone_id → structured entries, counts intact
const db = getDb();
const proj = await db.prepare(`INSERT INTO projects (tenant_id, code, name_vi) VALUES (1, 'P2-04-${Date.now()}', 'x') RETURNING id`).getAsync();
const r1 = await commitProjectLevel({ docType: 'construction_schedule', sheets: [{ sheet: 'TD bad', zone_id: null, zone_name: 'bad', rows: [{ ordinal: 1, name_vi: 'row one' }, { ordinal: 2, name_vi: 'row two' }] }] }, proj.id);
ok(r1.errors === 2 && r1.ok === 0, `counts intact (ok=${r1.ok} errors=${r1.errors})`);
ok(r1.items.length === 2 && r1.items[0].row === 1 && r1.items[1].row === 2, `row indexes itemized (got ${r1.items.map(i => i.row)})`);
ok(r1.items.every(i => i.sheet === 'TD bad' && typeof i.message === 'string' && i.message.length > 0 && 'error' in i), 'each entry has sheet/message + legacy error alias');
ok(r1.items[0].field === 'zone_id', `field extracted from PG error (got ${r1.items[0].field})`);

// live 2: one good + one bad row → PARTIAL shape callers rely on, bad row pinpointed
const zone = await db.prepare('INSERT INTO zones (project_id, code, name_en) VALUES (?, ?, ?) RETURNING id').getAsync(proj.id, 'G1', 'g1');
const r2 = await commitShop({ zone: { code: 'G1', name: 'g1' }, sheets: [{ sheet: 'SHOP A', rows: [
  { drawing_code: `OK-${Date.now()}`, name_vi: 'good row', progress_pct: 10 },
  { drawing_code: `BAD-${Date.now()}`, name_vi: 'bad row', progress_pct: 'not-a-number' },
] }] }, proj.id, 'G1');
ok(r2.ok === 1 && r2.errors === 1, `mixed commit partial (ok=${r2.ok} errors=${r2.errors})`);
const bad = r2.items.find(i => i.ref && String(i.ref).startsWith('BAD-'));
ok(!!bad && bad.row === 2 && bad.sheet === 'SHOP A', `bad row pinpointed by ref+row (got ${JSON.stringify(bad)?.slice(0, 120)})`);

// live 3: daily commit records inner failures per sheet instead of bare errors++
const r3 = await commitDaily({ sheets: [{ sheet: 'daily bad', report_date: '2026-09-07', prepared_by: null, work_items: [{ ordinal: 'NaN-ordinal', name_vi: 'w' }], materials: [], manpower: [], acceptance: [] }] }, proj.id);
const sh = r3.sheets[0];
ok(sh.errors === 1 && Array.isArray(sh.failures) && sh.failures.length === 1, `daily sheet carries failures array (got ${sh.failures?.length})`);
ok(sh.failures[0].row === 1 && typeof sh.failures[0].message === 'string', 'daily failure entry has row + message');
ok(r3.total.errors === 1, 'daily totals still counted');

// cleanup
await db.prepare('DELETE FROM shop_drawings WHERE project_id = ?').runAsync(proj.id);
await db.prepare('DELETE FROM daily_work_items WHERE daily_report_id IN (SELECT id FROM daily_reports WHERE project_id = ?)').runAsync(proj.id);
await db.prepare('DELETE FROM daily_reports WHERE project_id = ?').runAsync(proj.id);
await db.prepare('DELETE FROM zones WHERE project_id = ?').runAsync(proj.id);
await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(proj.id);
await closeDb();

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
