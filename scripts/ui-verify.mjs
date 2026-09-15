// Playwright UI verification helper
// Usage: node scripts/ui-verify.mjs <bug-id>
// Ví dụ: node scripts/ui-verify.mjs upload-excel
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS_DIR = path.resolve('docs/bug_screenshots');
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push('PAGEERROR: ' + err.message));

// 1. Login as admin
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
const loginResult = await page.evaluate(async () => {
  const r = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' })
  }).then(r => r.json());
  if (r.token) {
    localStorage.setItem('pmo_token', r.token);
    localStorage.setItem('pmo_user', JSON.stringify(r.user));
    return { ok: true, role: r.user.role };
  }
  return { ok: false, error: JSON.stringify(r) };
});
console.log('LOGIN:', loginResult);

if (!loginResult.ok) { await browser.close(); process.exit(1); }

const bugId = process.argv[2] || 'all';

async function shot(name) {
  const file = path.join(SHOTS_DIR, `${bugId}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  📸 ${file}`);
  return file;
}

async function runBug(name, fn) {
  console.log(`\n=== BUG: ${name} ===`);
  consoleErrors.length = 0;
  try {
    await fn();
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
    await shot('error');
  }
  if (consoleErrors.length) {
    console.log(`  ⚠ Console errors:`);
    consoleErrors.forEach(e => console.log(`    - ${e.slice(0, 200)}`));
  }
}

// ========== 4. BUG Upload Excel ==========
if (bugId === 'upload-excel' || bugId === 'all') {
  await runBug('upload-excel', async () => {
    await page.goto(`${BASE}/hq`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);  // wait for data load
    await shot('01-control-center');

    // Click "Upload Excel" button
    const uploadBtn = await page.locator('button:has-text("Upload Excel")');
    console.log(`  Found Upload Excel button: ${await uploadBtn.count()}`);
    await uploadBtn.first().click();
    await page.waitForTimeout(500);
    await shot('02-modal-open');

    // Check if modal appeared
    const modal = await page.locator('text=Upload Excel').count();
    console.log(`  Modal visible: ${modal > 0}`);

    // Try to close
    const closeBtn = await page.locator('button:has-text("Hủy")');
    if (await closeBtn.count() > 0) {
      await closeBtn.first().click();
      console.log('  Modal closed');
    }
  });
}

// ========== 5. BUG Approval Reject + View Details ==========
if (bugId === 'approval' || bugId === 'all') {
  await runBug('approval', async () => {
    await page.goto(`${BASE}/hq/approval`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot('01-approval-page');

    // Check sections
    const sectionCount = await page.locator('h3, h2, .section-title').count();
    console.log(`  Sections found: ${sectionCount}`);

    // Look for View Details buttons
    const viewBtns = await page.locator('button:has-text("Detail"), button:has-text("Chi tiết"), button:has-text("View")');
    console.log(`  View Details buttons: ${await viewBtns.count()}`);

    if (await viewBtns.count() > 0) {
      await viewBtns.first().click();
      await page.waitForTimeout(800);
      await shot('02-view-detail-modal');
    }

    // Look for Reject buttons
    const rejectBtns = await page.locator('button:has-text("Reject"), button:has-text("Từ chối")');
    console.log(`  Reject buttons: ${await rejectBtns.count()}`);

    if (await rejectBtns.count() > 0) {
      await rejectBtns.first().click();
      await page.waitForTimeout(800);
      await shot('03-reject-modal');
    }
  });
}

// ========== 6. Dark mode ==========
if (bugId === 'dark-mode' || bugId === 'all') {
  await runBug('dark-mode', async () => {
    await page.goto(`${BASE}/hq`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot('01-light');

    // Find theme toggle
    const toggle = await page.locator('button[title*="Dark"], button[title*="dark"], button[title*="Light"], button[title*="light"]');
    console.log(`  Theme toggle: ${await toggle.count()}`);
    if (await toggle.count() > 0) {
      await toggle.first().click();
      await page.waitForTimeout(500);
      await shot('02-dark');
    }
  });
}

// ========== 9. Manpower ==========
if (bugId === 'manpower' || bugId === 'all') {
  await runBug('manpower', async () => {
    await page.goto(`${BASE}/hq/manpower`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await shot('01-manpower');

    const empty = await page.locator('text=/empty|chưa có|loading/i').count();
    console.log(`  Empty/loading text: ${empty}`);
  });
}

await browser.close();
console.log('\n=== DONE ===');
