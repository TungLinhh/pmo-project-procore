// Verify pie % bằng cách navigate trực tiếp + wait fetch
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

// Goto /hq and select project 3 via selectOption
await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pillar-card', { timeout: 10000 });
await page.waitForTimeout(2000);

// Get project options
const opts = await page.locator('.filter-bar select option').allTextContents();
console.log(`Project options: ${opts.length}`);

// Use selectOption with value=3
await page.locator('.filter-bar select').first().selectOption({ value: '3' });
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
