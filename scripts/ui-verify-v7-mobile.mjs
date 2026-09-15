// V7 mobile screens - 13 HQ only
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
const SHOTS = '/home/vutun/pmo_project/docs/bug_screenshots';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then(r => r.json());
  localStorage.setItem('pmo_token', r.token);
  localStorage.setItem('pmo_user', JSON.stringify(r.user));
});
const routes = [
  ['m02-control-center', '/hq'],
  ['m03-projects', '/hq/projects'],
  ['m04-progress', '/hq/progress'],
  ['m05-shop', '/hq/shop'],
  ['m06-materials', '/hq/materials'],
  ['m07-manpower', '/hq/manpower'],
  ['m08-payment', '/hq/payment'],
  ['m09-issues', '/hq/issues'],
  ['m10-notifications', '/hq/notifications'],
  ['m11-master-data', '/hq/master-data'],
  ['m12-approval', '/hq/approval'],
  ['m13-audit', '/hq/audit'],
];
let ok = 0;
for (const [name, route] of routes) {
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 5000 });
    await page.waitForTimeout(500);
    const sb = await page.locator('.shell-sidebar').boundingBox().catch(() => null);
    const main = await page.locator('.shell-main').boundingBox().catch(() => null);
    const hidden = !sb || sb.x < 0 || sb.x > 375;
    const contentOk = main && main.x >= 0 && main.width >= 350;
    const pass = hidden && contentOk;
    if (pass) ok++;
    console.log(`  ${pass ? '✓' : '✗'} ${name}: sb.x=${sb?.x} main.w=${main?.width}`);
    await page.screenshot({ path: `${SHOTS}/v7-${name}.png` });
  } catch (e) {
    console.log(`  ✗ ${name}: ${e.message.slice(0, 60)}`);
  }
}
console.log(`Total mobile: ${ok}/${routes.length}`);
await browser.close();
