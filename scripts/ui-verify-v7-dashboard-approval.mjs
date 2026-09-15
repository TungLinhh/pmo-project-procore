// V7 dashboard + approval
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
const SHOTS = '/home/vutun/pmo_project/docs/bug_screenshots';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then(r => r.json());
  localStorage.setItem('pmo_token', r.token);
  localStorage.setItem('pmo_user', JSON.stringify(r.user));
});

console.log('=== Dashboard ===');
await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pillar-card', { timeout: 8000 });
await page.waitForTimeout(2000);
const centerTexts = await page.locator('.pillar-card .pie-wrap div[style*="text-align"]').allTextContents();
console.log(`  Pie center texts: ${JSON.stringify(centerTexts)}`);
const piePaths = await page.locator('.pillar-card .pie-wrap svg path').count();
console.log(`  Pie paths: ${piePaths}`);

// Detail nav project 3
await page.evaluate(() => {
  const sel = document.querySelector('.filter-bar select');
  if (sel) { sel.value = '3'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
});
await page.waitForTimeout(1500);
for (const pname of ['Construction Progress', 'Shopdrawing', 'Material', 'Payment']) {
  const card = page.locator(`.pillar-card:has(h3:has-text("${pname}"))`).first();
  await card.click();
  await page.waitForTimeout(1500);
  const url = page.url();
  const pid = new URL(url).searchParams.get('project_id');
  console.log(`  ${pname}: ${url.replace(BASE, '')} project_id=${pid}`);
  await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pillar-card', { timeout: 5000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const sel = document.querySelector('.filter-bar select');
    if (sel) { sel.value = '3'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await page.waitForTimeout(500);
}

console.log('\n=== Approval ===');
await page.goto(`${BASE}/hq/approval`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const viewBtns = await page.locator('button:has-text("View Details")').count();
console.log(`  View Details buttons: ${viewBtns}`);
if (viewBtns > 0) {
  await page.locator('button:has-text("View Details")').first().click();
  await page.waitForTimeout(1500);
  const modalCount = await page.locator('.modal-backdrop').count();
  const preContent = await page.locator('pre').first().textContent().catch(() => '');
  console.log(`  Modal count (should be 0): ${modalCount}`);
  console.log(`  Inline content preview: ${preContent.slice(0, 80)}`);
  await page.screenshot({ path: `${SHOTS}/v7-approval-inline.png` });
  
  // Test Reject from inline
  const rejectFromDetail = page.locator('button:has-text("Reject từ chi tiết")');
  if (await rejectFromDetail.isVisible().catch(() => false)) {
    await rejectFromDetail.click();
    await page.waitForTimeout(500);
    const reasonModal = await page.locator('.modal h3:has-text("Reject")').isVisible().catch(() => false);
    console.log(`  Reject from inline: ${reasonModal}`);
    await page.screenshot({ path: `${SHOTS}/v7-approval-reject-inline.png` });
    // Cancel
    await page.locator('button:has-text("Hủy")').click();
    await page.waitForTimeout(300);
  }
}

// Test Approve confirm
const hideBtn = page.locator('button:has-text("Hide")');
if (await hideBtn.isVisible().catch(() => false)) await hideBtn.first().click();
await page.waitForTimeout(500);
const approveBtns = await page.locator('button:has-text("Approve")').count();
console.log(`  Approve buttons: ${approveBtns}`);
if (approveBtns > 0) {
  await page.locator('button:has-text("Approve")').first().click();
  await page.waitForTimeout(800);
  const confirmModal = await page.locator('.modal h3:has-text("Xác nhận duyệt")').isVisible().catch(() => false);
  console.log(`  Approve confirm modal: ${confirmModal}`);
  await page.screenshot({ path: `${SHOTS}/v7-approval-approve-confirm.png` });
}

await browser.close();
console.log('=== DONE ===');
