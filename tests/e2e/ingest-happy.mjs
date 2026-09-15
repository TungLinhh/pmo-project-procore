// Ingestor happy-paths: the 6 commit()s that only had failure/classify coverage.
// Direct commit() calls (p2-04 pattern) on dev DB with unique names + cleanup.
// If any of these 400/500 on a valid row, the wizard commit for that doc type
// is broken (the daily-wizard crash class). Run: node tests/e2e/ingest-happy.mjs
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const { commit: commitSub } = await import('../../backend/src/services/ingest/subcontractor_directory.js');
const { commit: commitRes } = await import('../../backend/src/services/ingest/resource_directory.js');
const { commit: commitBp } = await import('../../backend/src/services/ingest/business_process.js');
const { commit: commitRfa } = await import('../../backend/src/services/ingest/rfa_log.js');
const { commit: commitGen } = await import('../../backend/src/services/ingest/generic_tabular.js');
const { commit: commitPl } = await import('../../backend/src/services/ingest/project_level.js');
const { getDb, closeDb } = await import('../../backend/src/db/index.js');

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const ts = Date.now();
const db = getDb();
const proj = await db.prepare(`INSERT INTO projects (tenant_id, code, name_vi) VALUES (1, 'HAPPY-${ts}', 'x') RETURNING id`).getAsync();
const PID = proj.id;

try {
  // 1. subcontractor_directory
  const subName = `HAPPY-SUB-${ts}`;
  const r1 = await commitSub({ sheets: [{ sheet: 'S', rows: [{ name: subName, capability_summary: 'welding', status: 'ACTIVE', is_internal_team: false }] }] }, PID, 1);
  ok(r1.ok === 1 && r1.errors === 0, `subcontractor commit ok=1 (got ${r1.ok}/${r1.errors})`);
  ok(!!await db.prepare('SELECT id FROM subcontractors WHERE tenant_id = 1 AND name = ?').getAsync(subName), 'subcontractor row persisted');

  // 2. resource_directory (supplier + subcontractor branches)
  const supName = `HAPPY-SUP-${ts}`, rsName = `HAPPY-RSUB-${ts}`;
  const r2 = await commitRes({ sheets: [{ sheet: 'S', rows: [
    { type: 'supplier', name: supName, system: 'MEP' },
    { type: 'team', name: rsName, capability_summary: 'crew' },
  ] }] }, 1);
  ok(r2.ok === 2 && r2.errors === 0, `resource commit ok=2 (got ${r2.ok}/${r2.errors})`);
  ok(!!await db.prepare('SELECT id FROM suppliers WHERE tenant_id = 1 AND name = ?').getAsync(supName), 'supplier row persisted');

  // 3. business_process (unique process code)
  const procCode = `happy-proc-${ts}`;
  const r3 = await commitBp({ sheets: [{ sheet: 'S', rows: [{ ordinal: 1, name_vi: 'Bước 1', content_vi: 'làm', responsibility_vi: 'PM', verification_vi: 'check' }] }] }, 1, procCode);
  ok(r3.ok === 1 && r3.errors === 0, `business_process commit ok=1 (got ${r3.ok}/${r3.errors})`);
  ok(!!await db.prepare('SELECT id FROM business_process_steps WHERE process_id = ? AND ordinal = 1').getAsync(r3.process_id), 'process step persisted');

  // 4. rfa_log
  const rfaCode = `HAPPY-RFA-${ts}`;
  const r4 = await commitRfa({ sheets: [{ sheet: 'S', rows: [{ ordinal: 1, rfa_code: rfaCode, description_vi: 'yêu cầu duyệt' }] }] }, PID);
  ok(r4.ok === 1 && r4.errors === 0, `rfa_log commit ok=1 (got ${r4.ok}/${r4.errors})`);
  ok(!!await db.prepare('SELECT id FROM rfa_log WHERE project_id = ? AND rfa_code = ?').getAsync(PID, rfaCode), 'rfa row persisted');

  // 5. generic_tabular (unique docType per run)
  const gDoc = `happy-generic-${ts}`;
  const r5 = await commitGen({ sheets: [{ sheet: 'S', rows: [{ ordinal: 1, col_1: 'a', col_2: 'b' }] }] }, PID, { docType: gDoc });
  ok(r5.ok === 1 && r5.errors === 0, `generic commit ok=1 (got ${r5.ok}/${r5.errors})`);
  ok(!!await db.prepare('SELECT id FROM generic_sheets WHERE project_id = ? AND doc_type = ?').getAsync(PID, gDoc), 'generic row persisted');

  // 6. project_level happy (p2-04 only covered the failure shape)
  const zone = await db.prepare('INSERT INTO zones (project_id, code, name_en) VALUES (?, ?, ?) RETURNING id').getAsync(PID, 'HZ', 'hz');
  const r6 = await commitPl({ docType: 'construction_schedule', sheets: [{ sheet: 'S', zone_id: zone.id, zone_name: 'HZ', rows: [{ ordinal: 1, name_vi: 'happy task', progress_pct: 0.5 }] }] }, PID);
  ok(r6.ok === 1 && r6.errors === 0, `project_level commit ok=1 (got ${r6.ok}/${r6.errors})`);
  ok(!!await db.prepare('SELECT id FROM construction_schedule_items WHERE project_id = ? AND name_vi = ?').getAsync(PID, 'happy task'), 'schedule row persisted');
} finally {
  await db.prepare('DELETE FROM construction_schedule_items WHERE project_id = ?').runAsync(PID);
  await db.prepare('DELETE FROM rfa_log WHERE project_id = ?').runAsync(PID);
  await db.prepare('DELETE FROM generic_sheets WHERE project_id = ?').runAsync(PID);
  await db.prepare('DELETE FROM zones WHERE project_id = ?').runAsync(PID);
  await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(PID);
  await db.prepare('DELETE FROM subcontractors WHERE tenant_id = 1 AND (name LIKE \'HAPPY-%\')').runAsync();
  await db.prepare('DELETE FROM suppliers WHERE tenant_id = 1 AND (name LIKE \'HAPPY-%\')').runAsync();
  const bp = await db.prepare('SELECT id FROM business_processes WHERE tenant_id = 1 AND code LIKE \'happy-proc-%\'').allAsync();
  for (const p of bp) {
    await db.prepare('DELETE FROM business_process_steps WHERE process_id = ?').runAsync(p.id);
    await db.prepare('DELETE FROM business_processes WHERE id = ?').runAsync(p.id);
  }
  await closeDb();
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
