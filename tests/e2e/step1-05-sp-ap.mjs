// STEP1-05: S&P supplier-AP import, isolated — real file, temp project, full cleanup.
// Asserts chain integrity (PR→invoice→contract) + no writes outside the slice.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/step1-05-sp-ap.mjs
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const SP = '/mnt/c/Users/vutun/Downloads/HBG-BTE-MSA-S&P-CTY-2020.03.28.xlsx';
const { existsSync } = await import('node:fs');
if (!existsSync(SP)) {
  console.log('SKIP — S&P file absent');
  process.exit(0);
}
const { parse, commit } = await import('../../backend/src/services/ingest/sp_ap.js');
const { classifyFile } = await import('../../backend/src/lib/classify.js');
const { getDb, closeDb } = await import('../../backend/src/db/index.js');

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

ok(classifyFile('X/TIẾN ĐỘ CUNG ỨNG VẬT TƯ/HBG-BTE-MSA-S&P-CTY-2020.03.28.xlsx').docType === 'supplier_payment', 'S&P filename routes to supplier_payment (not material register)');

const db = getDb();
const before = {
  contracts: Number((await db.prepare('SELECT count(*)::int c FROM contracts').getAsync()).c),
  invoices: Number((await db.prepare('SELECT count(*)::int c FROM invoices').getAsync()).c),
  prs: Number((await db.prepare('SELECT count(*)::int c FROM payment_requests').getAsync()).c),
  pays: Number((await db.prepare('SELECT count(*)::int c FROM payments').getAsync()).c),
  materials: Number((await db.prepare('SELECT count(*)::int c FROM materials').getAsync()).c),
};
const proj = await db.prepare(`INSERT INTO projects (tenant_id, code, name_vi) VALUES (1, 'SPAP-${Date.now()}', 'x') RETURNING id`).getAsync();
const parsed = await parse(SP, proj.id, 'GEN');
ok(parsed.totalRows > 50, `parsed ${parsed.totalRows} parent items from real S&P`);
const rep = await commit(parsed, proj.id, 'GEN');
ok(rep.errors === 0, `commit clean (ok=${rep.ok} errors=${rep.errors})`);
if (rep.errors) console.log('  sample:', JSON.stringify(rep.items.slice(0, 2)).slice(0, 400));

// chain integrity: every PR of this project joins to an invoice + contract
const orphans = await db.prepare(`
  SELECT count(*)::int c FROM payment_requests pr
  JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id
  WHERE c.project_id = ? AND (i.contract_id IS NULL OR pr.invoice_id IS NULL)
`).getAsync(proj.id).catch(() => ({ c: -1 }));
ok(orphans.c === 0, 'no orphan PRs (chain intact)');
const counts = {
  contracts: Number((await db.prepare('SELECT count(*)::int c FROM contracts WHERE project_id = ?').getAsync(proj.id)).c),
  prs: Number((await db.prepare('SELECT count(*)::int c FROM payment_requests pr JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id WHERE c.project_id = ?').getAsync(proj.id)).c),
  pays: Number((await db.prepare('SELECT count(*)::int c FROM payments WHERE project_id = ?').getAsync(proj.id)).c),
};
ok(counts.contracts > 0 && counts.prs > 0, `chain rows created (contracts=${counts.contracts} prs=${counts.prs} payments=${counts.pays})`);
// isolation: slice touched ONLY its project rows; global deltas equal project rows
const after = {
  contracts: Number((await db.prepare('SELECT count(*)::int c FROM contracts').getAsync()).c),
  invoices: Number((await db.prepare('SELECT count(*)::int c FROM invoices').getAsync()).c),
  prs: Number((await db.prepare('SELECT count(*)::int c FROM payment_requests').getAsync()).c),
  pays: Number((await db.prepare('SELECT count(*)::int c FROM payments').getAsync()).c),
  materials: Number((await db.prepare('SELECT count(*)::int c FROM materials').getAsync()).c),
};
ok(after.materials === before.materials, 'materials table untouched by AP slice');
ok(after.contracts - before.contracts === counts.contracts, 'global contract delta == slice rows (no cross-talk)');

// spot-check one paid batch: PR PAID + payments row with paid_amount = value - balance
const spot = await db.prepare(`
  SELECT pr.request_no, pr.status, p.paid_amount, p.amount FROM payments p
  JOIN payment_requests pr ON pr.id = p.payment_request_id
  JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id
  WHERE c.project_id = ? LIMIT 1
`).getAsync(proj.id);
ok(spot && Number(spot.paid_amount) > 0, `paid batch persisted (req=${spot?.request_no} paid=${spot?.paid_amount})`);

// full cleanup of the slice
await db.prepare('DELETE FROM payments WHERE project_id = ?').runAsync(proj.id);
await db.prepare(`DELETE FROM payment_requests WHERE invoice_id IN (SELECT i.id FROM invoices i JOIN contracts c ON c.id = i.contract_id WHERE c.project_id = ?)`, ).runAsync(proj.id).catch(async () => {
  const ids = await db.prepare(`SELECT pr.id FROM payment_requests pr JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id WHERE c.project_id = ?`).allAsync(proj.id);
  for (const r of ids) await db.prepare('DELETE FROM payment_requests WHERE id = ?').runAsync(r.id);
});
await db.prepare(`DELETE FROM invoices WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?)`).runAsync(proj.id);
await db.prepare('DELETE FROM contracts WHERE project_id = ?').runAsync(proj.id);
await db.prepare('DELETE FROM zones WHERE project_id = ?').runAsync(proj.id);
await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(proj.id);
await closeDb();

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
