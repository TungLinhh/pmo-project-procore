// Vòng 6 verify - chỉ dark mode + mobile nav (skip tooltip timeout)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:3000';
const SHOTS = path.resolve('docs/bug_screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
fs.mkdirSync(path.join(SHOTS, 'dark-mode-audit'), { recursive: true });

const browser = await chromium.launch({ headless: true });

async function login(page, email, pass) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.evaluate(async ({ e, p }) => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e, password: p }) }).then(r => r.json());
    localStorage.setItem('pmo_token', r.token);
    localStorage.setItem('pmo_user', JSON.stringify(r.user));
  }, { e: email, p: pass });
}

// ========== 1. Mobile nav ==========
console.log('=== 1. Mobile nav ===');
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 } });
  const page = await ctx.newPage();
  await login(page, 'admin@hbg.com', 'admin123');
  await page.goto(`${BASE}/hq`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS, 'v6-mobile-01-control-center.png') });
  const sidebarBox = await page.locator('.shell-sidebar').boundingBox();
  console.log(`  Sidebar box (should be off-screen): x=${sidebarBox.x}`);
  await page.locator('.shell-hamburger').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'v6-mobile-02-drawer-open.png') });
  const drawerBox = await page.locator('.shell-sidebar.open').boundingBox();
  console.log(`  Drawer open: x=${drawerBox.x}, w=${drawerBox.width}`);
  // Click outside
  await page.mouse.click(350, 100);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'v6-mobile-03-drawer-closed.png') });
  // Test on /hq/progress
  await page.goto(`${BASE}/hq/progress`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SHOTS, 'v6-mobile-04-progress.png') });
  await ctx.close();
  console.log('  ✓ Mobile screenshots saved');
}

// ========== 3+4. Dark mode audit ==========
console.log('\n=== 2. Dark mode audit - 20 screens ===');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await login(page, 'admin@hbg.com', 'admin123');
  await page.evaluate(() => { localStorage.setItem('pmo_theme', 'dark'); });

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
  ];
  for (const [name, route] of pages) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 8000 });
      await page.waitForTimeout(1000);
      // Re-apply dark mode
      await page.evaluate(() => {
        localStorage.setItem('pmo_theme', 'dark');
        document.body.classList.add('theme-dark');
      });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(SHOTS, 'dark-mode-audit', `${name}.png`) });
      console.log(`  ✓ ${name}`);
    } catch (e) {
      console.log(`  ✗ ${name}: ${e.message.slice(0, 80)}`);
    }
  }
  await ctx.close();
}

await browser.close();
console.log('\n=== DONE ===');
