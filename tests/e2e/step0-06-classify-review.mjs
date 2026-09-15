// STEP0-06: classify endpoint + review queue source (live, BTE-shaped paths).
// Run: DATABASE_URL=postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo node tests/e2e/step0-06-classify-review.mjs
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const DB = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const BASE = 'http://localhost:3215';

const require = createRequire('/home/vutun/pmo_project/backend/package.json');
const XLSX = require('xlsx');
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['STT', 'X', `run-${Date.now()}`], [1, 'a']]), 'S1');
const xlsxBuf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
// second distinct workbook so same-hash dedup never merges fixture rows
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet([['STT', 'X', `run2-${Date.now()}`], [1, 'b']]), 'S1');
const xlsxBuf2 = Buffer.from(XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' }));
const bodies = [xlsxBuf, xlsxBuf2, null];

const srv = spawn('node', ['backend/src/index.js'], { env: { ...process.env, DATABASE_URL: DB, PORT: '3215' }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 3500));
try {
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) });
  const { token } = await login.json();
  const AUTH = `Bearer ${token}`;
  const H = { Authorization: AUTH };

  const rels = [
    'P/TIẾN ĐỘ SHOP/MEP-BTE-SHD-BOH.xlsx',
    'P/TIẾN ĐỘ THI CÔNG/MEP-BTE-CSP-01.xlsx',
    'P/notes.txt',
  ];
  const ids = [];
  let n = 0;
  for (const rel of rels) {
    const isX = rel.endsWith('.xlsx');
    const body = isX ? bodies[n++] : Buffer.from(`t-${Date.now()}-${n++}`);
    const fd = new FormData();
    fd.append('file', new Blob([body], { type: isX ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/plain' }), rel.split('/').pop());
    fd.append('relative_path', rel);
    const r = await fetch(BASE + '/api/upload', { method: 'POST', headers: H, body: fd }).then(x => x.json());
    ids.push(r.upload_id);
  }

  const cl = await fetch(BASE + '/api/upload/classify', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ upload_ids: ids }) }).then(r => r.json());
  ok(cl.classified === 3, `classified 3 (got ${cl.classified})`);
  const byRel = Object.fromEntries(cl.files.map(f => [f.relative_path, f]));
  ok(byRel['P/TIẾN ĐỘ SHOP/MEP-BTE-SHD-BOH.xlsx']?.classification.family === 'shop', 'shop family guessed');
  ok(byRel['P/TIẾN ĐỘ SHOP/MEP-BTE-SHD-BOH.xlsx']?.classification.zone === 'BOH', 'zone BOH guessed');
  ok(byRel['P/TIẾN ĐỘ THI CÔNG/MEP-BTE-CSP-01.xlsx']?.classification.summary === true, 'rollup flagged summary');
  ok(byRel['P/notes.txt']?.classification.family === 'unknown', 'unknown stays unknown');
  ok(byRel['P/TIẾN ĐỘ SHOP/MEP-BTE-SHD-BOH.xlsx']?.classification.probe?.empty === false, 'probe reports non-empty workbook');

  const rev = await fetch(BASE + '/api/uploads/review', { headers: H }).then(r => r.json());
  ok(rev.some(r => ids.includes(r.id) && r.classification?.family === 'shop'), 'review queue exposes classification');
  ok(rev.find(r => r.relative_path === 'P/TIẾN ĐỘ SHOP/MEP-BTE-SHD-BOH.xlsx')?.expected_doc_type === 'shop_drawing', 'doc_type guess persisted for wizard prefill');
} finally {
  srv.kill('SIGTERM');
  await new Promise(r => setTimeout(r, 1000));
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
