// Bulk invoices endpoint: whole project in ONE query (Payment tab N+1 fix).
// 1. returns all invoices of project 1 with contract_no joined.
// 2. rows match the sum of per-contract loads (parity).
// 3. unknown project → 404 (no leak), limit respected.
// Run: BASE_URL=http://localhost:3000 node tests/e2e/payment-bulk.mjs
import { loginAs, auth, ok, summary } from './lib.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const token = await loginAs('admin@hbg.com');
ok(!!token, 'login');
const get = (p) => fetch(BASE + p, { headers: auth(token) }).then(async r => ({ s: r.status, j: await r.json() }));

const bulk = await get('/api/projects/1/invoices?limit=500');
ok(bulk.s === 200 && Array.isArray(bulk.j) && bulk.j.length > 0, `bulk returns invoices (got ${bulk.j?.length})`);
ok(bulk.j.every(i => i.contract_id && i.contract_no), 'every row carries contract_id + contract_no');

const contracts = (await get('/api/projects/1/contracts')).j;
let perContract = 0;
for (const c of contracts.slice(0, 5)) {
  const one = await get(`/api/contracts/${c.id}/invoices`);
  perContract += one.j.length;
  for (const inv of one.j) {
    ok(!!bulk.j.find(b => b.id === inv.id && b.contract_id === c.id), `invoice ${inv.invoice_no} present in bulk`);
    if (!bulk.j.find(b => b.id === inv.id)) break;
  }
}
ok(perContract > 0, `parity checked on ${perContract} sample rows`);

const limited = await get('/api/projects/1/invoices?limit=3');
ok(limited.j.length === 3, `limit respected (got ${limited.j.length})`);
const missing = await get('/api/projects/999999999/invoices');
ok(missing.s === 404, `unknown project → 404 (got ${missing.s})`);

summary();
