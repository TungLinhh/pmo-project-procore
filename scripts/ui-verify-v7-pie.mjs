// Verify pie % bằng cách navigate trực tiếp + wait fetch
//
// Thư mục ảnh chụp dẫn theo **gốc repo**, không cứng đường dẫn máy cá nhân.
// Trước đây ghi cứng một đường tuyệt đối của máy tác giả ⇒ script chỉ chạy được trên
// đúng máy đó, và `tests/e2e/p2-02-test-portability.mjs` **không bắt** vì bài đó chỉ
// quét `tests/e2e/`, chưa quét `scripts/`. Cả hai đều đã sửa.
//
// Lưu ý khi viết comment ở đây: bài `p2-02` dò **toàn bộ nội dung file, kể cả comment**,
// nên comment không được viết lại chính mẫu đường dẫn mà bài đó săn — nói "mẫu đường
// dẫn tuyệt đối của máy tác giả" như trên là đủ.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SHOTS = process.env.SHOTS_DIR || join(ROOT, 'docs', 'bug_screenshots');
mkdirSync(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then(r => r.json());
  localStorage.setItem('pmo_token', r.token);
  localStorage.setItem('pmo_user', JSON.stringify(r.user));
});

// Goto /hq and select project 3 via selectOption
await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pillar-card', { timeout: 10000 });
await page.waitForTimeout(2000);

// Get project options
const opts = await page.locator('.filter-bar select option').allTextContents();
console.log(`Project options: ${opts.length}`);

// Use selectOption with the first available project (no hardcoded id).
const firstVal = await page.locator('.filter-bar select').first().evaluate((el) => {
  const opt = [...el.options].find((o) => o.value);
  return opt ? opt.value : null;
});
if (!firstVal) { console.log('No project options — empty DB?'); await browser.close(); process.exit(1); }
await page.locator('.filter-bar select').first().selectOption(firstVal);
await page.waitForTimeout(3000);

// Get project select value
const selVal = await page.locator('.filter-bar select').first().inputValue();
console.log(`Filter project select: ${selVal}`);

// Get center texts
const texts = await page.locator('.pillar-card .pie-wrap div[style*="text-align"]').allTextContents();
console.log(`Pie texts: ${JSON.stringify(texts)}`);

// Check if pie shows data
const paths = await page.locator('.pillar-card .pie-wrap svg path').count();
console.log(`Pie paths: ${paths}`);

// Get legend
const legends = await page.locator('.pillar-card .pie-wrap + div').allTextContents();
console.log(`Legends: ${JSON.stringify(legends.slice(0, 4))}`);

await page.screenshot({ path: `${SHOTS}/v7-dashboard-project3.png`, fullPage: false });
await browser.close();
