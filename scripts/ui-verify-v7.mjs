// Vòng 7 full verify: mobile 20 screens + dashboard data + detail nav + approval UX
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
const SHOTS = '/home/vutun/pmo_project/docs/bug_screenshots';
const browser = await chromium.launch({ headless: true });

// ====== 1. Mobile portrait 20 screens @ 375x812 ======
console.log('=== 1. Mobile portrait 375x812 ===');
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then(r => r.json());
    localStorage.setItem('pmo_token', r.token);
    localStorage.setItem('pmo_user', JSON.stringify(r.user));
  });
  // 20 MVP screens
  const mobilePages = [
    ['m01-login', '/login'],
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
    ['m14-field-home', '/field'],
    ['m15-field-material', '/field/material'],
    ['m16-field-issue', '/field/issue'],
    ['m17-field-review', '/field/review'],
    ['m18-field-sync', '/field/sync'],
    ['m19-field-manpower', '/field/manpower'],
    ['m20-field-daily-progress', '/field/daily-progress'],
  ];
  let mobileOk = 0;
  for (const [name, route] of mobilePages) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await page.waitForTimeout(800);
      // Check sidebar is off-screen (hidden on mobile)
      const sb = await page.locator('.shell-sidebar').boundingBox().catch(() => null);
      const hidden = !sb || sb.x < 0 || sb.x > 375;
      // Check content area
      const main = await page.locator('.shell-main').boundingBox().catch(() => null);
      const contentOk = main && main.x >= 0 && main.width >= 350;
      const ok = hidden && contentOk;
      console.log(`  ${ok ? '✓' : '✗'} ${name}: sidebar.x=${sb?.x} main.w=${main?.width}`);
      if (ok) mobileOk++;
      await page.screenshot({ path: `${SHOTS}/v7-${name}.png` });
    } catch (e) {
      console.log(`  ✗ ${name}: ${e.message.slice(0, 60)}`);
    }
  }
  console.log(`  Total mobile: ${mobileOk}/${mobilePages.length} OK`);
  await ctx.close();
}

// ====== 2. Dashboard data - check pie/aggregate/Detail ======
console.log('\n=== 2. Dashboard - check pie + aggregate ===');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then(r => r.json());
    localStorage.setItem('pmo_token', r.token);
    localStorage.setItem('pmo_user', JSON.stringify(r.user));
  });
  // Test project 3 specifically
  await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pillar-card', { timeout: 10000 });
  await page.waitForTimeout(2000);
  // Select project 3
  await page.evaluate(() => {
    const sel = document.querySelector('.filter-bar select');
    if (sel) { sel.value = '3'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(1500);
  // Get center text from 4 pie charts
  const centerTexts = await page.locator('.pillar-card .pie-wrap div[style*="text-align: center"]').allTextContents();
  console.log(`  Pie center texts: ${JSON.stringify(centerTexts)}`);
  // Check each pie has > 0 data
  const pies = await page.locator('.pillar-card .pie-wrap svg path').count();
  console.log(`  Total pie paths: ${pies}`);
  // Click "Construction Progress" pillar
  await page.locator('.pillar-card:has(h3:has-text("Construction Progress"))').first().click();
  await page.waitForTimeout(1500);
  const url1 = page.url();
  console.log(`  Construction → ${url1.replace(BASE, '')}`);
  // Check progress page shows data
  const progressRows = await page.locator('.data-table table tbody tr').count();
  console.log(`  Progress rows: ${progressRows}`);
  await page.screenshot({ path: `${SHOTS}/v7-dashboard-progress.png`, fullPage: false });
  // Back + Shop
  await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pillar-card', { timeout: 5000 });
  await page.locator('.pillar-card:has(h3:has-text("Shopdrawing"))').first().click();
  await page.waitForTimeout(1500);
  console.log(`  Shopdrawing → ${page.url().replace(BASE, '')}`);
  await page.screenshot({ path: `${SHOTS}/v7-dashboard-shop.png`, fullPage: false });
  await ctx.close();
}

// ====== 3. Approval UX - test confirm + inline expand ======
console.log('\n=== 3. Approval UX - confirm + inline expand ===');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGE: ' + e.message));
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then(r => r.json());
    localStorage.setItem('pmo_token', r.token);
    localStorage.setItem('pmo_user', JSON.stringify(r.user));
  });
  await page.goto(`${BASE}/hq/approval`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  
  // Click "View Details" - check inline expand
  const viewBtns = await page.locator('button:has-text("View Details")').count();
  console.log(`  View Details buttons: ${viewBtns}`);
  if (viewBtns > 0) {
    await page.locator('button:has-text("View Details")').first().click();
    await page.waitForTimeout(1500);
    // Check inline expand (không phải modal)
    const modalCount = await page.locator('.modal-backdrop').count();
    const preContent = await page.locator('pre').first().textContent().catch(() => null);
    console.log(`  Modal count (should be 0 for inline): ${modalCount}`);
    console.log(`  Inline detail content preview: ${preContent?.slice(0, 100)}...`);
    await page.screenshot({ path: `${SHOTS}/v7-approval-inline-detail.png` });
    
    // Click "Reject từ chi tiết"
    const rejectDetail = page.locator('button:has-text("Reject từ chi tiết")').first();
    if (await rejectDetail.isVisible().catch(() => false)) {
      await rejectDetail.click();
      await page.waitForTimeout(500);
      const reasonModal = await page.locator('.modal h3:has-text("Reject")').isVisible().catch(() => false);
      console.log(`  Reject modal from inline: ${reasonModal}`);
      await page.screenshot({ path: `${SHOTS}/v7-approval-reject-modal.png` });
    }
  }
  
  // Test Approve confirm
  await page.goto(`${BASE}/hq/approval`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const approveBtns = await page.locator('button:has-text("Approve")').count();
  console.log(`  Approve buttons: ${approveBtns}`);
  if (approveBtns > 0) {
    // Click "Hide" first if expanded
    const hideBtn = page.locator('button:has-text("Hide")');
    if (await hideBtn.isVisible().catch(() => false)) await hideBtn.first().click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Approve")').first().click();
    await page.waitForTimeout(800);
    const confirmModal = await page.locator('.modal h3:has-text("Xác nhận duyệt")').isVisible().catch(() => false);
    console.log(`  Approve confirm modal: ${confirmModal}`);
    await page.screenshot({ path: `${SHOTS}/v7-approval-approve-confirm.png` });
    // Cancel
    await page.locator('button:has-text("Hủy")').click();
    await page.waitForTimeout(500);
  }
  
  if (errors.length) errors.forEach(e => console.log('  ERR: ' + e.slice(0, 100)));
  else console.log('  No errors');
  await ctx.close();
}

await browser.close();
console.log('\n=== DONE ===');
