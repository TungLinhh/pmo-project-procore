// One-off UI verify: task 9 Ops page + ControlCenter summary-first.
// Checks: /hq/ops renders (measure, portfolio, job cards), measure fills PASS
// badges, /hq loads 4 pillars via 1 gộp request, sidebar Vận hành group tidy.
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then((r) => r.json());
    localStorage.setItem('pmo_token', r.token);
    localStorage.setItem('pmo_user', JSON.stringify(r.user));
  });
  // Sidebar: Vận hành group gọn (3 items, không trùng Quản trị).
  await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const opsNav = await page.locator('a[href="/hq/ops"]').count();
  check(opsNav === 1, 'sidebar có 1 link /hq/ops');
  const backupsNav = await page.locator('a[href="/hq/backups"]').count();
  check(backupsNav === 1, 'Sao lưu chỉ còn 1 link (đã dọn khỏi Quản trị)');
  // ControlCenter: 4 pillars + load qua 1 request gộp.
  await page.waitForSelector('.pillar-card', { timeout: 15000 });
  await page.waitForTimeout(2500);
  check((await page.locator('.pillar-grid.layer-stack .pillar-card').count()) >= 4, 'ControlCenter has the four main pillars');
  const fresh = await page.locator('.filter-bar .shell-freshness').first().textContent().catch(() => '');
  check(/1 request gộp/.test(fresh), `ControlCenter dùng control-summary (${fresh.trim().slice(0, 60)})`);
  // Ops page.
  await page.goto(`${BASE}/hq/ops`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check((await page.locator('text=Vận hành & Hiệu năng').count()) >= 1, 'Ops page renders');
  check((await page.locator('text=Chuyển cấp TVGS').count()) >= 1, 'job card TVGS');
  check((await page.locator('text=Theo dõi SLA AI').count()) >= 1, 'job card AI SLA');
  check((await page.locator('text=Sao lưu hàng ngày').count()) >= 1, 'job card Backup');
  await page.click('text=Đo hiệu năng ngay');
  await page.waitForTimeout(6000);
  const rows = await page.locator('table tbody tr').count();
  check(rows >= 7, `measure fills 7 endpoint rows (got ${rows})`);
  const dat = await page.locator('text=ĐẠT').count();
  check(dat >= 7, `all endpoints ĐẠT <3s (got ${dat})`);
  check(errs.length === 0, `zero page errors (${errs.join('; ').slice(0, 200)})`);
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
