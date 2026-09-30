// Re-run the UI contract checks after the first-pass UI fixes.
// Run with the dev or single-port server: BASE_URL=http://127.0.0.1:5173 node scripts/ui-verify-ui-pass.mjs
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const results = [];
let failures = 0;
const check = (condition, message) => {
  results.push({ condition: Boolean(condition), message });
  if (!condition) failures++;
};

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async (loginEmail) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: loginEmail, password: 'admin123' }),
    });
    const body = await response.json();
    localStorage.setItem('pmo_token', body.token);
    localStorage.setItem('pmo_user', JSON.stringify(body.user));
    localStorage.setItem('pmo_lang', 'vi');
  }, email);
}

async function visit(page, route, wait = 1300) {
  const apiErrors = [];
  const pageErrors = [];
  const onResponse = (response) => {
    if (response.url().includes('/api/') && response.status() >= 400) apiErrors.push({ url: response.url(), status: response.status() });
  };
  const onPageError = (error) => pageErrors.push(error.message);
  page.on('response', onResponse);
  page.on('pageerror', onPageError);
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(wait);
  const body = await page.locator('body').innerText();
  page.off('response', onResponse);
  page.off('pageerror', onPageError);
  return { body, apiErrors, pageErrors };
}

const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
const admin = await adminContext.newPage();
await login(admin, 'admin@hbg.com');

const upload = await visit(admin, '/upload');
check(upload.apiErrors.length === 0, `upload page has no API errors (${JSON.stringify(upload.apiErrors)})`);
check(upload.body.includes('Cấu hình'), 'upload wizard renders configuration step');
check(upload.body.includes('Tải file') || upload.body.includes('Upload'), 'upload wizard renders its first step');

const ops = await visit(admin, '/hq/ops');
check(!/(^|\s)null($|\s)/i.test(ops.body), 'Ops page does not expose raw null');
check(ops.pageErrors.length === 0, `Ops page has no page errors (${ops.pageErrors.join('; ')})`);

const materials = await visit(admin, '/hq/materials?project=1');
check((await admin.locator('.table-pagination').count()) === 1, 'Materials has pagination');
check((await admin.locator('.data-table-body tbody tr').count()) <= 25, 'Materials limits rows to one page');
check((await admin.locator('.filter-bar input[placeholder*="Tìm mã"]').count()) === 1, 'Materials search is labelled in Vietnamese');

const payment = await visit(admin, '/hq/payment?project=1');
check((await admin.locator('.table-pagination').count()) >= 2, 'Payment has request and ledger pagination');
check((await admin.locator('button').count()) < 150, 'Payment no longer renders hundreds of row actions');
check((await admin.locator('.filter-bar label').allTextContents()).some((label) => label.toLocaleLowerCase('vi-VN').includes('tìm request')), 'Payment filter is labelled in Vietnamese');

const progress = await visit(admin, '/hq/progress?project=1');
check((await admin.locator('.table-pagination').count()) === 1, 'Progress has pagination');
check(progress.body.includes('Chọn một hàng'), 'Progress table guidance is Vietnamese');

const assistant = await visit(admin, '/hq/assistant');
check(assistant.pageErrors.length === 0, `Assistant has no page errors (${assistant.pageErrors.join('; ')})`);
await admin.getByRole('button', { name: /Cập nhật tiến độ/ }).click();
const assistantPicker = admin.locator('.project-picker-input');
check((await assistantPicker.count()) === 1, 'Assistant progress tab has project picker');
await assistantPicker.click();
await assistantPicker.fill('BTE');
check((await admin.locator('.project-picker-item').filter({ hasText: 'BTE-WP4-HBC' }).count()) === 1, 'Assistant progress picker resolves demo project');

const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'vi-VN' });
const mobile = await mobileContext.newPage();
await login(mobile, 'admin@hbg.com');
await visit(mobile, '/hq/materials?project=1');
const mobileOverflow = await mobile.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
check(!mobileOverflow, 'Materials has no horizontal overflow at 390px');

const siteContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'vi-VN' });
const site = await siteContext.newPage();
await login(site, 'site@hbg.com');
const missing = await visit(site, '/field/review/999999');
check(missing.body.includes('Không tìm thấy báo cáo'), 'missing field report has a deliberate not-found state');
check(missing.body.includes('Mở báo cáo hôm nay'), 'missing field report offers a next action');
check(missing.pageErrors.length === 0, `missing field report has no page errors (${missing.pageErrors.join('; ')})`);
check(missing.apiErrors.every((error) => error.status === 404), 'missing field report only returns the expected 404');

await browser.close();
console.log(JSON.stringify({ failures, total: results.length, results }, null, 2));
process.exit(failures ? 1 : 0);
