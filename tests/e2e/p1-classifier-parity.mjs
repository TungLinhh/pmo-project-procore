// P1-8: single-file detectDocType agrees with bulk classifyFile (no more divergent
// routes), + POST /api/notifications requires admin/ceo. Real PG + server.
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/p1-classifier-parity.mjs
import { spawn } from 'node:child_process';
const { detectDocType } = await import('../../backend/src/lib/excel.js');
const { classifyFile } = await import('../../backend/src/lib/classify.js');

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

// [bulk relative path, filename-only input] — docTypes must match
const pairs = [
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ SHOP/MEP-BTE-SHD-BOH.xlsx', 'MEP-BTE-SHD-BOH.xlsx'],
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ THI CÔNG/MEP-BTE-CSP-BOH.xlsx', 'MEP-BTE-CSP-BOH.xlsx'],
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ CUNG ỨNG VẬT TƯ/MEP-BTE-MSA-01.xlsx', 'MEP-BTE-MSA-01.xlsx'],
  ['2020.01.11 MEP-BTE-PCR/DUYỆT KHÁC/DUYỆT KHÁC.xlsx', 'DUYỆT KHÁC.xlsx'],
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ THANH TOÁN A_B/1. Bãi Tràm.xlsx', '1. Bãi Tràm.xlsx'],
  ['2020.01.11 MEP-BTE-PCR/TIẾN ĐỘ THANH TOÁN A_B/HBG-BTE-MPM-01.1.xlsx', 'HBG-BTE-MPM-01.1.xlsx'],
];
for (const [rel, fn] of pairs) {
  const bulk = classifyFile(rel).docType;
  const single = detectDocType(fn);
  ok(bulk === single, `${fn}: bulk=${bulk} single=${single}`);
}
// Genuinely ambiguous without folder context ('Tiến độ hạng mục.xlsx' alone looks
// like a schedule file): single-file guesses schedule, but parse yields 0 sheets —
// visible empty preview, never a silent mis-commit.
{
  const amb = detectDocType('Tiến độ hạng mục.xlsx');
  ok(amb === 'construction_schedule', `ambiguous name defaults to schedule guess (got ${amb})`);
  const { parse: parseSched } = await import('../../backend/src/services/ingest/construction_schedule.js');
  const BTE = process.env.BTE_DATA_DIR || '/mnt/c/Users/vutun/Downloads/2020.03.11 MEP-BTE-PCR/2020.01.11 MEP-BTE-PCR';
  const p = await parseSched(`${BTE}/SƠ ĐỒ CÂY/Tiến độ hạng mục.xlsx`, 1, null);
  ok(p.sheets.length === 0, `ambiguous file parses to 0 sheets (got ${p.sheets.length})`);
}

const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3107';
const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3107' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const loginAs = async (email) => fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'admin123' }) }).then(r => r.json()).then(j => j.token);
  const siteT = await loginAs('site@hbg.com');
  const adminT = await loginAs('admin@hbg.com');
  const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
  const spam = { user_ids: [3], title: 'spam', body: 'x' };
  const denied = await fetch(BASE + '/api/notifications', { method: 'POST', headers: H(siteT), body: JSON.stringify(spam) }).then(r => r.status);
  ok(denied === 403, `site denied manual notify (got ${denied})`);
  const allowed = await fetch(BASE + '/api/notifications', { method: 'POST', headers: H(adminT), body: JSON.stringify(spam) }).then(async r => ({ s: r.status, j: await r.json() }));
  ok(allowed.s === 200 && allowed.j.count === 1, `admin manual notify works (got ${allowed.s})`);
  const { getDb } = await import('../../backend/src/db/index.js');
  const db = getDb();
  await db.prepare(`DELETE FROM notifications WHERE user_id = 3 AND title = 'spam'`).runAsync();
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
