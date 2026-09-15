// P5-1: money arrives as numbers, not NUMERIC strings (driver parses oid 1700).
// 1. every amount field on contracts/invoices/PRs/AR lines is typeof number.
// 2. JS sum of PR amounts matches SQL SUM (exactness spot-check).
// 3. no NaN/Infinity in any amount field (the 'NaN tỷ' class stays dead).
// Run: BASE_URL=http://localhost:3000 node tests/e2e/p5-money.mjs
import { api, loginAs, auth, psql, ok, summary } from './lib.mjs';

const token = await loginAs('admin@hbg.com');
ok(!!token, 'login');
const get = (p) => fetch((process.env.BASE_URL || 'http://localhost:3000') + p, { headers: auth(token) }).then(r => r.json());

const contracts = await get('/api/projects/1/contracts');
const invoices = await get(`/api/contracts/${contracts[0]?.id}/invoices`);
const prs = await get('/api/projects/1/payment-requests?limit=500');
const ar = await get('/api/projects/1/ar-lines?limit=500');

const moneyFields = [];
for (const c of contracts) moneyFields.push(['contract.total_value', c.total_value]);
for (const i of invoices) moneyFields.push(['invoice.amount', i.amount], ['invoice.vat_amount', i.vat_amount]);
for (const p of prs) moneyFields.push(['pr.amount', p.amount], ['pr.retention_amount', p.retention_amount]);
for (const l of ar) moneyFields.push(['ar.amount', l.amount]);

ok(contracts.length > 0 && prs.length > 0 && ar.length > 0, `data present (contracts=${contracts.length}, prs=${prs.length}, ar=${ar.length})`);
ok(ar.length > 0 && ar[0].amount !== undefined, 'ar lines expose amount (guard against silent undefined)');
const nonNumeric = moneyFields.filter(([, v]) => v != null && typeof v !== 'number');
ok(nonNumeric.length === 0, `all ${moneyFields.length} amount fields are numbers${nonNumeric.length ? ' — e.g. ' + JSON.stringify(nonNumeric.slice(0, 3)) : ''}`);
const bad = moneyFields.filter(([, v]) => typeof v === 'number' && !Number.isFinite(v));
ok(bad.length === 0, 'no NaN/Infinity in any amount');

// JS sum vs SQL SUM (tolerance: float epsilon on billions)
const jsSum = prs.reduce((s, p) => s + (p.amount || 0), 0);
const sqlSum = Number(psql(`SELECT COALESCE(SUM(pr.amount),0) FROM payment_requests pr JOIN invoices i ON i.id = pr.invoice_id JOIN contracts c ON c.id = i.contract_id WHERE c.project_id = 1;`));
ok(Math.abs(jsSum - sqlSum) < 1, `JS sum matches SQL SUM (${jsSum.toLocaleString('vi-VN')} vs ${sqlSum.toLocaleString('vi-VN')})`);

summary();
