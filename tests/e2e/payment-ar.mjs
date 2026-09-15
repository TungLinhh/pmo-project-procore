// Payment AR: parse + commit '1. Bãi Tràm.xlsx' (real file) → ar_contracts/ar_lines,
// isolated from AP tables. Idempotent re-commit. Encrypted AR file must throw cleanly.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/payment-ar.mjs
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const { parse, commit } = await import('../../backend/src/services/ingest/payment_ar.js');
const { getDb, closeDb } = await import('../../backend/src/db/index.js');

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const AR_DIR = process.env.BTE_AR_DIR || '/mnt/c/Users/vutun/Downloads/2020.03.11 MEP-BTE-PCR/2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ THANH TOÁN A_B';

const parsed = await parse(`${AR_DIR}/1. Bãi Tràm.xlsx`, 1);
const kinds = parsed.sheets.map(s => `${s.sheet}:${s.kind}`);
ok(parsed.sheets.some(s => s.kind === 'summary'), `summary sheet parsed (${kinds.join(' | ')})`);
ok(parsed.sheets.some(s => s.kind === 'detail'), 'detail sheets parsed');
ok(!parsed.sheets.some(s => /^foxz$/i.test(s.sheet)), 'foxz placeholder skipped');
const sumSheet = parsed.sheets.find(s => s.kind === 'summary');
const baiTram = sumSheet.rows.find(r => (r.project_name || '').includes('Bãi Tràm'));
ok(!!baiTram, 'Bai Tram summary row found');
ok(Number(baiTram.contract_value) === 42715968210, `contract value (got ${baiTram?.contract_value})`);
ok(Number(baiTram.paid_value) === 10131808530, `paid value (got ${baiTram?.paid_value})`);
ok(Number(baiTram.invoiced_value) === 10943115456, `invoiced value (got ${baiTram?.invoiced_value})`);
ok(Number(baiTram.due_now_value) === 4142810848.3, `due-now value (got ${baiTram?.due_now_value})`);

const db = getDb();
const proj = await db.prepare(`INSERT INTO projects (tenant_id, code, name_vi) VALUES (1, 'PAYAR-${Date.now()}', 'x') RETURNING id`).getAsync();
const r1 = await commit(parsed, proj.id, null, null);
ok(r1.errors === 0, `commit clean (ok=${r1.ok} errors=${r1.errors} ${JSON.stringify(r1.items).slice(0, 160)})`);
const nContracts = await db.prepare('SELECT COUNT(*) as c FROM ar_contracts WHERE project_id = ?').getAsync(proj.id);
ok(Number(nContracts.c) === sumSheet.rows.length, `ar_contracts rows (${nContracts.c})`);
const nLines = await db.prepare('SELECT COUNT(*) as c FROM ar_lines WHERE project_id = ?').getAsync(proj.id);
ok(Number(nLines.c) > 0, `ar_lines rows (${nLines.c})`);
const btContract = await db.prepare(`SELECT ref_no, amount FROM ar_lines WHERE project_id = ? AND kind = 'contract' AND ref_no = '06/HBG/BAITRAM.ES/2019'`).getAsync(proj.id);
ok(btContract && Number(btContract.amount) === 42715968210, `Bai Tram contract line kept (got ${btContract?.ref_no}/${btContract?.amount})`);
// AP tables untouched
const apCount = await db.prepare(`SELECT (SELECT COUNT(*) FROM contracts WHERE project_id = ?) + (SELECT COUNT(*) FROM invoices WHERE contract_id IN (SELECT id FROM contracts WHERE project_id = ?)) as c`).getAsync(proj.id, proj.id);
ok(Number(apCount.c) === 0, 'AP chain untouched by AR commit');

// idempotent re-commit
const r2 = await commit(parsed, proj.id, null, null);
const nC2 = await db.prepare('SELECT COUNT(*) as c FROM ar_contracts WHERE project_id = ?').getAsync(proj.id);
const nL2 = await db.prepare('SELECT COUNT(*) as c FROM ar_lines WHERE project_id = ?').getAsync(proj.id);
ok(Number(nC2.c) === Number(nContracts.c) && Number(nL2.c) === Number(nLines.c), `re-commit stable (${nC2.c}/${nL2.c})`);

// encrypted AR file cannot be parsed — must throw, never silent-zero
let threw = false;
try { await parse(`${AR_DIR}/Tiến độ thanh toán các khu vực.xlsx`, 1); } catch { threw = true; }
ok(threw, 'encrypted AR file throws (needs password, excluded by design)');

// MPM monthly-HSTT sheet → dossier lines (not forced into invoice grain)
const mpm = await parse(`${AR_DIR}/HBG-BTE-MPM-01.1.xlsx`, 1);
const mSheet = mpm.sheets.find(s => s.kind === 'monthly');
ok(!!mSheet && mSheet.rows.length >= 12, `monthly sheet parsed (${mSheet?.rows.length} dossier rows)`);
const mRep = await commit(mpm, proj.id, null, null);
ok(mRep.errors === 0, `monthly commit clean (ok=${mRep.ok})`);
const nDos = await db.prepare(`SELECT COUNT(*) as c FROM ar_lines WHERE project_id = ? AND kind = 'dossier'`).getAsync(proj.id);
ok(Number(nDos.c) === mSheet.rows.length, `dossier lines persisted (${nDos.c})`);
const oct = await db.prepare(`SELECT amount FROM ar_lines WHERE project_id = ? AND kind = 'dossier' AND label LIKE '%Tháng 10%'`).getAsync(proj.id);
ok(oct && Number(oct.amount) === 5072449241, `Tháng 10 paid value (got ${oct?.amount})`);

// cleanup
await db.prepare('DELETE FROM ar_lines WHERE project_id = ?').runAsync(proj.id);
await db.prepare('DELETE FROM ar_contracts WHERE project_id = ?').runAsync(proj.id);
await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(proj.id);
await closeDb();

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
