// Tooltip test riêng
import { chromium } from 'playwright';
import { join } from 'node:path';

const BASE = 'http://localhost:3000';
const SHOTS = '/home/vutun/pmo_project/docs/bug_screenshots';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then(r => r.json());
  localStorage.setItem('pmo_token', r.token);
  localStorage.setItem('pmo_user', JSON.stringify(r.user));
});

await page.goto(`${BASE}/hq`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

console.log('=== Tooltip test ===');
const pies = await page.locator('.pillar-card .pie-wrap').all();
console.log(`  Found ${pies.length} pie charts`);

for (let i = 0; i < pies.length; i++) {
  const pie = pies[i];
  const box = await pie.boundingBox();
  if (!box) continue;
  // Get the path element inside the pie
  const path = await pie.locator('svg path').first();
  const pathBox = await path.boundingBox().catch(() => null);
  if (!pathBox) {
    console.log(`  Pie ${i+1}: no path found, skip`);
    continue;
  }
  // Hover at center of path
  const cx = pathBox.x + pathBox.width/2;
  const cy = pathBox.y + pathBox.height/2;
  await page.mouse.move(cx, cy, { steps: 5 });
  await page.waitForTimeout(1200);
  const tooltip = await page.locator('.cursor-tooltip').first();
  const tooltipVisible = await tooltip.isVisible().catch(() => false);
  const tooltipCount = await page.locator('.cursor-tooltip').count();
  console.log(`  Pie ${i+1}: visible=${tooltipVisible}, count=${tooltipCount}`);
  if (tooltipVisible) {
    const tbox = await tooltip.boundingBox();
    console.log(`    Tooltip box: x=${tbox.x}, y=${tbox.y}, w=${tbox.width}, h=${tbox.height}`);
    console.log(`    Path box: x=${pathBox.x}, y=${pathBox.y}, w=${pathBox.width}, h=${pathBox.height}`);
    const offsetX = tbox.x - pathBox.x;
    const offsetY = tbox.y - pathBox.y;
    const isOffset = offsetX > 8 || offsetY > 8;
    console.log(`    Offset: x=${offsetX}, y=${offsetY}, lệch=${isOffset}`);
  }
  await page.screenshot({ path: join(SHOTS, `v6-tooltip-pie${i+1}.png`) });
  // Move out to reset
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
}

await browser.close();
console.log('=== DONE ===');
