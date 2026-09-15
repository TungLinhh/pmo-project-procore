// Vòng 6 verify: mobile nav + tooltip + dark mode audit
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:3000';
const SHOTS = path.resolve('docs/bug_screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(path.join(SHOTS, 'dark-mode-audit'), { recursive: true });

const browser = await chromium.launch({ headless: true });
const errors = [];

async function login(page, email, pass) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.evaluate(async ({ e, p }) => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) }).then(r => r.json());
    localStorage.setItem('pmo_token', r.token);
    localStorage.setItem('pmo_user', JSON.stringify(r.user));
  }, { e: email, p: pass });
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, `v6-${name}.png`), fullPage: false });
}

// ========== 1. Mobile nav ==========
console.log('\n=== 1. Mobile nav (<768px) ===');
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await login(page, 'admin@hbg.com', 'admin123');
  await page.goto(`${BASE}/hq`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await shot(page, 'mobile-01-control-center');

  // Check hamburger visible
  const hamburger = await page.locator('.shell-hamburger').isVisible();
  console.log(`  Hamburger visible: ${hamburger}`);

  // Check sidebar ẩn
  const sidebarVisible = await page.locator('.shell-sidebar').isVisible();
  const sidebarBox = await page.locator('.shell-sidebar').boundingBox();
  console.log(`  Sidebar visible: ${sidebarVisible}, box: ${JSON.stringify(sidebarBox)}`);

  // Click hamburger
  if (hamburger) {
    await page.locator('.shell-hamburger').click();
    await page.waitForTimeout(500);
    await shot(page, 'mobile-02-drawer-open');

    // Check drawer open
    const drawerBox = await page.locator('.shell-sidebar.open').boundingBox().catch(() => null);
    console.log(`  Drawer open box: ${JSON.stringify(drawerBox)}`);

    // Click outside to close - click vào góc phải (ngoài drawer)
    await page.mouse.click(350, 100);
    await page.waitForTimeout(300);
    await shot(page, 'mobile-03-drawer-closed');
  }

  // Test on /hq/progress too
  await page.goto(`${BASE}/hq/progress`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, 'mobile-04-progress');

  await ctx.close();
}

// ========== 2. Tooltip 4 pillars ==========
console.log('\n=== 2. Tooltip 4 pillars ===');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await login(page, 'admin@hbg.com', 'admin123');
  await page.goto(`${BASE}/hq`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await shot(page, 'tooltip-01-overview');

  // Hover qua 4 pie chart positions
  const pies = await page.locator('.pillar-card .pie-wrap').all();
  console.log(`  Found ${pies.length} pie charts`);
  for (let i = 0; i < pies.length; i++) {
    const pie = pies[i];
    const box = await pie.boundingBox();
    if (!box) continue;
    // Hover vào giữa pie
    await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
    await page.waitForTimeout(500);
    // Check tooltip có visible không
    const tooltipCount = await page.locator('.cursor-tooltip').count();
    console.log(`  Pie ${i+1}: tooltip count=${tooltipCount}`);
    await shot(page, `tooltip-0${i+2}-pie${i+1}`);
    // Move đến 4 vị trí khác nhau trong pie
    for (let j = 0; j < 4; j++) {
      const angle = (j / 4) * 2 * Math.PI;
      const x = box.x + box.width/2 + Math.cos(angle) * box.width * 0.3;
      const y = box.y + box.height/2 + Math.sin(angle) * box.height * 0.3;
      await page.mouse.move(x, y);
      await page.waitForTimeout(300);
      const tooltipBox = await page.locator('.cursor-tooltip').first().boundingBox().catch(() => null);
      if (tooltipBox) {
        // Check tooltip không đè lên pie
        const offsetX = tooltipBox.x - box.x;
        const offsetY = tooltipBox.y - box.y;
        const isOffset = offsetX > 8 || offsetY > 8;  // lệch tối thiểu 8px
        if (!isOffset) console.log(`    Pie ${i+1} pos ${j}: tooltip ON TOP! offsetX=${offsetX} offsetY=${offsetY}`);
      }
    }
  }
  await ctx.close();
}

// ========== 3+4. Dark mode audit - screenshot 20 pages ==========
console.log('\n=== 3+4. Dark mode audit ===');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await login(page, 'admin@hbg.com', 'admin123');

  // Enable dark mode
  await page.evaluate(() => {
    localStorage.setItem('pmo_theme', 'dark');
    document.body.classList.add('theme-dark');
  });

  // 20 pages
  const pages = [
    ['login', '/login'],
    ['control-center', '/hq'],
    ['projects', '/hq/projects'],
    ['progress', '/hq/progress'],
    ['shop', '/hq/shop'],
    ['materials', '/hq/materials'],
    ['manpower', '/hq/manpower'],
    ['payment', '/hq/payment'],
    ['issues', '/hq/issues'],
    ['notifications', '/hq/notifications'],
    ['master-data', '/hq/master-data'],
    ['approval', '/hq/approval'],
    ['audit', '/hq/audit'],
    ['field-login', '/field/login'],
    ['field-dashboard', '/field'],
    ['field-material', '/field/material'],
    ['field-shop', '/field/shop'],
    ['field-issue', '/field/issue'],
    ['field-photo', '/field/photo'],
    ['field-sync', '/field/sync'],
  ];
  for (const [name, route] of pages) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(1500);
      // Re-apply dark mode (page may have reset it)
      await page.evaluate(() => {
        localStorage.setItem('pmo_theme', 'dark');
        document.body.classList.add('theme-dark');
      });
      await page.waitForTimeout(300);
      await page.screenshot({ path: path.join(SHOTS, 'dark-mode-audit', `${name}.png`), fullPage: false });
      console.log(`  ✓ ${name}`);
    } catch (e) {
      console.log(`  ✗ ${name}: ${e.message}`);
    }
  }

  await ctx.close();
}

await browser.close();
console.log('\n=== Errors ===');
if (errors.length) errors.forEach(e => console.log('  - ' + e.slice(0, 200)));
else console.log('  (none)');
console.log('\n=== DONE ===');
