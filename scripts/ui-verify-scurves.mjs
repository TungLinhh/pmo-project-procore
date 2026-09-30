// One-off: screenshot S-curves on seeded BTE data.
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1400 } })).newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then((r) => r.json());
  localStorage.setItem('pmo_token', r.token);
  localStorage.setItem('pmo_user', JSON.stringify(r.user));
});
await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pillar-card', { timeout: 15000 });
await page.waitForTimeout(3000);
const n = await page.locator('.pillar-card svg polyline').count();
console.log(`S-curve polylines on cards: ${n}`);
await page.locator('.pillar-grid.layer-stack').screenshot({ path: '/tmp/opencode/cc-scurves.png' });
await browser.close();
