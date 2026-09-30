// Shop filter is client-side (like Materials): one fetch per project, instant
// in-memory filter, stats follow the filtered rows. Guards the old
// request-per-keystroke race (stale slow responses overwriting the list).
// 1. static: fetch effect deps exclude `search`; a useMemo filter exists.
// 2. live: fast typing fires ≤2 shop-drawings requests and lands on right rows.
// Run: BASE_URL=http://localhost:3000 node tests/e2e/shop-filter.mjs
import { readFileSync } from 'node:fs';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const src = readFileSync(new URL('../../frontend/src/hq/ShopList.jsx', import.meta.url), 'utf8');

// 1. static
const effectDeps = [...src.matchAll(/useEffect\(\(\) => \{[\s\S]*?shopApi\.drawings[\s\S]*?\}, \[([^\]]*)\]\)/g)].map(m => m[1]);
ok(effectDeps.length > 0 && effectDeps.every(d => !/\bsearch\b/.test(d)), `fetch effect ignores search keystrokes (deps: [${effectDeps.join(';')}])`);
ok(/useMemo\(\(\) => \{[\s\S]*?\.filter\(/.test(src), 'in-memory useMemo filter exists');
ok(/filtered\.(length|filter|slice)/.test(src), 'stats + table read from filtered rows');

// 2. live fast-typing
const { chromium } = await import('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const page = await browser.newPage();
let shopReqs = 0;
page.on('request', r => { if (r.url().includes('/shop-drawings')) shopReqs++; });
await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);
await page.fill('input[type="email"]', 'admin@hbg.com');
await page.fill('input[type="password"]', 'admin123');
await page.click('button[type="submit"]');
await page.waitForTimeout(4000);
// Bám `data-testid` chứ không bám `placeholder`: placeholder là **nhãn**
// đã dịch sang tiếng Việt, nên bám nó là bài đỏ mỗi lần dịch (đo 2026-09-28).
await page.goto(BASE + '/hq/shop?project=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3000);
shopReqs = 0;
await page.click('[data-testid="shop-search"]');
await page.keyboard.type('BOH-00', { delay: 50 });
await page.waitForTimeout(800);
const rows = await page.locator('.data-table tbody tr').allTextContents();
ok(shopReqs <= 2, `fast typing fires ≤2 requests (got ${shopReqs})`);
ok(rows.length >= 1 && rows.length < 45 && rows.every(r => r.toUpperCase().includes('BOH-00')),
  `list shows only matches (${rows.length} rows)`);
const total = await page.locator('.stat-strip .stat .value').first().textContent();
ok(Number(total) === rows.length, `Total stat follows filter (${total} === ${rows.length})`);

// 3. zone filter (options from data, AND with search)
const zoneOpts = await page.locator('.filter-bar select option').allTextContents();
// Option đầu là "tất cả": đổi từ `All` sang `Tất cả` theo ngôn ngữ, nên khẳng định
// theo **giá trị** `<option value="">` chứ không theo nhãn hiển thị.
ok(zoneOpts.length > 1 && (await page.locator('.filter-bar select option[value=""]').count()) === 1,
  `zone dropdown có option "tất cả" + các khu vực (${zoneOpts.length} options)`);
await page.locator('.filter-bar select').selectOption({ index: 1 });
await page.waitForTimeout(600);
const zRows = await page.locator('.data-table tbody tr').allTextContents();
const zVal = zoneOpts[1];
ok(zRows.length >= 1 && zRows.every(r => r.includes(zVal)), `zone filter narrows to ${zVal} (${zRows.length} rows)`);
await page.locator('.filter-bar select').selectOption({ index: 0 });

// 4. rows stay neutral — no full-row tint classes (status lives in badges)
const tinted = await page.locator('.data-table tbody tr.critical, .data-table tbody tr.exception').count();
ok(tinted === 0, `no tinted rows (got ${tinted})`);

// 5. project switch replaces rows + zone options (stale-response guard)
// Data-driven: lay project thu 2 tu API, dem shop rows that qua API, so voi UI.
const token = await page.evaluate(() => localStorage.getItem('pmo_token'));
const projList = await (await fetch(`${BASE}/api/projects`, { headers: { Authorization: `Bearer ${token}` } })).json();
const ids = (Array.isArray(projList) ? projList : (projList.rows || [])).map((p) => p.id).filter((id) => id !== 1);
const targetPid = ids[0];
await page.locator('[data-testid="shop-search"]').fill('');
await page.goto(`${BASE}/hq/shop?project=${targetPid}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);
const curPid = targetPid;
const apiRows = await (await fetch(`${BASE}/api/projects/${curPid}/shop-drawings?limit=5000`, { headers: { Authorization: `Bearer ${token}` } })).json();
const apiCount = Array.isArray(apiRows) ? apiRows.length : (apiRows.rows || []).length;
const zoneSel = page.locator('.filter-bar select');
if ((await zoneSel.locator('option').count()) > 1) {
  await zoneSel.selectOption({ index: 0 });
  await page.waitForTimeout(600);
}
const nRows = await page.locator('.data-table tbody tr').count();
const firstRow = nRows ? (await page.locator('.data-table tbody tr').first().textContent() || '') : '';
const isEmptyState = /chưa có data|trống|empty|không có|no data/i.test(firstRow);
if (apiCount > 0 && !isEmptyState) {
  // Bảng **có phân trang** (`usePagination`, mặc định 25/trang), nên số dòng trên màn
  // là `min(pageSize, tổng)` chứ không phải tổng. Bản cũ so trực tiếp nên đỏ mỗi khi
  // dự án có hơn một trang — đo 2026-09-28: UI 25 dòng, API 45 dòng cho dự án 3.
  const statTotal = Number((await page.locator('.stat-strip .stat .value').first().textContent()) || 0);
  ok(statTotal === apiCount, `2nd project ${curPid}: stat Total khớp API (${statTotal} === ${apiCount})`);
  ok(nRows === Math.min(25, apiCount) && nRows > 0,
    `2nd project ${curPid}: đúng số dòng của trang đầu (${nRows} dòng, tổng ${apiCount})`);
} else if (apiCount === 0 && isEmptyState) {
  ok(true, `2nd project ${curPid} shows empty state (API 0 rows)`);
} else {
  ok(false, `2nd project ${curPid} mismatch (UI rows=${nRows} empty=${isEmptyState}, API=${apiCount})`);
}
await browser.close();

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
