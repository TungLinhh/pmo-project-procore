// Deep UI test: verify modal content + actual API call
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:3000';
const SHOTS = path.resolve('docs/bug_screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });

// Login
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then(r => r.json());
  localStorage.setItem('pmo_token', r.token);
  localStorage.setItem('pmo_user', JSON.stringify(r.user));
});

const apiCalls = [];
page.on('request', req => {
  if (req.url().includes('/api/') && req.method() !== 'GET') apiCalls.push(`${req.method()} ${req.url()}`);
});

async function shot(name) {
  await page.screenshot({ path: path.join(SHOTS, `verify-${name}.png`), fullPage: false });
}

// ========== TEST: Upload Excel (upload actual file) ==========
console.log('\n=== TEST 4: Upload Excel end-to-end ===');
await page.goto(`${BASE}/hq`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Click Upload Excel
await page.locator('button:has-text("Upload Excel")').first().click();
await page.waitForTimeout(500);
await shot('upload-modal-open');

// Verify modal has file input
const fileInput = await page.locator('input[type="file"]').count();
console.log(`  File input in modal: ${fileInput > 0 ? 'OK' : 'MISSING'}`);

// Verify modal has Upload button
const uploadBtn = await page.locator('.modal button:has-text("Upload")').count();
console.log(`  Upload button in modal: ${uploadBtn > 0 ? 'OK' : 'MISSING'}`);

// Try uploading actual file
const fixturePath = path.resolve('data/test-fixtures/TEST-MASTER-01/Shop TST-A.xlsx');
if (fs.existsSync(fixturePath)) {
  await page.locator('input[type="file"]').first().setInputFiles(fixturePath);
  await page.waitForTimeout(500);
  await shot('upload-file-selected');
  // Click Upload
  await page.locator('.modal button:has-text("Upload"):not(:has-text("Excel"))').last().click();
  await page.waitForTimeout(3000);  // wait for API + ingest
  await shot('upload-after-submit');
  // Check if toast appeared
  const toast = await page.locator('.toast-container .toast').count();
  console.log(`  Toast appeared: ${toast > 0 ? 'OK' : 'NO TOAST'}`);
}

// ========== TEST: Approval View Details ==========
console.log('\n=== TEST 5a: Approval View Details ===');
await page.goto(`${BASE}/hq/approval`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await shot('approval-page');

// Click first View Details
const viewBtn = page.locator('button:has-text("Detail"), button:has-text("Chi tiết")').first();
const viewExists = await viewBtn.count() > 0;
console.log(`  View Detail button: ${viewExists}`);
if (viewExists) {
  await viewBtn.click();
  await page.waitForTimeout(800);
  await shot('approval-view-modal');
  // Check if modal has actual content (not blank)
  const modalText = await page.locator('.modal').textContent();
  const hasData = modalText && modalText.length > 50 && !modalText.includes('Loading...');
  console.log(`  Modal has data: ${hasData}`);
  console.log(`  Modal text first 200: ${modalText?.slice(0, 200)}`);
  // Close
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// ========== TEST: Approval Reject (full flow) ==========
console.log('\n=== TEST 5b: Approval Reject full flow ===');
const rejectBtn = page.locator('button:has-text("Reject"), button:has-text("Từ chối")').first();
const rejectExists = await rejectBtn.count() > 0;
console.log(`  Reject button: ${rejectExists}`);
if (rejectExists) {
  apiCalls.length = 0;  // reset
  await rejectBtn.click();
  await page.waitForTimeout(500);
  await shot('approval-reject-modal');

  // Check if reason input appears
  const reasonInput = await page.locator('.modal textarea, .modal input[type="text"]:not([readonly])').count();
  console.log(`  Reason input: ${reasonInput > 0 ? 'OK' : 'MISSING'}`);

  // Fill reason
  const ta = page.locator('.modal textarea').first();
  if (await ta.count() > 0) {
    await ta.fill('Test reject reason from Playwright');
    await page.waitForTimeout(300);
    await shot('approval-reject-filled');
    // Submit
    const submitBtn = page.locator('.modal button:has-text("Xác nhận"), .modal button:has-text("Reject"), .modal button:has-text("Từ chối"):not(:disabled)').last();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
      await shot('approval-reject-after');
      // Check API was called
      console.log(`  API calls made: ${apiCalls.length}`);
      apiCalls.forEach(c => console.log(`    - ${c}`));
      const toast = await page.locator('.toast-container .toast').count();
      console.log(`  Toast: ${toast > 0 ? 'OK' : 'NO TOAST'}`);
    }
  }
}

console.log('\n=== Console errors ===');
if (errors.length) errors.forEach(e => console.log('  - ' + e.slice(0, 200)));
else console.log('  (none)');

await browser.close();
console.log('\n=== DONE ===');
