// Test Detail navigation: A→A, B→B
import { chromium } from 'playwright';
const BASE = 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
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
await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.pillar-card', { timeout: 10000 });
await page.waitForTimeout(1500);

console.log('=== Detail navigation test ===');

// Get project codes
const projects = await page.evaluate(async () => {
  const r = await fetch('/api/projects', { headers: { Authorization: 'Bearer ' + localStorage.getItem('pmo_token') } });
  return await r.json();
});
console.log(`Projects available: ${projects.length}`);

for (const proj of projects) {
  // Select project
  await page.evaluate((pid) => {
    const sel = document.querySelector('.filter-bar select');
    if (sel) { sel.value = String(pid); sel.dispatchEvent(new Event('change', { bubbles: true })); }
  }, proj.id);
  await page.waitForTimeout(1500);
  
  console.log(`\nProject: ${proj.code} (id=${proj.id})`);
  
  // Click each pillar card
  const pillars = ['Construction Progress', 'Shopdrawing', 'Material', 'Payment'];
  for (const pname of pillars) {
    const card = page.locator(`.pillar-card:has(h3:has-text("${pname}"))`).first();
    await card.click();
    await page.waitForTimeout(1500);
    const url = page.url();
    const urlProjectId = new URL(url).searchParams.get('project_id');
    const ok = urlProjectId === String(proj.id);
    console.log(`  ${pname}: URL=${url.replace(BASE, '')}, project_id=${urlProjectId}, match=${ok}`);
    if (!ok) errors.push(`MISMATCH: ${pname} for project ${proj.id} got ${urlProjectId}`);
    // Back to control center
    await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.pillar-card', { timeout: 5000 });
    await page.waitForTimeout(800);
    // Re-select project
    await page.evaluate((pid) => {
      const sel = document.querySelector('.filter-bar select');
      if (sel) { sel.value = String(pid); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }, proj.id);
    await page.waitForTimeout(500);
  }
}

console.log('\n=== Errors ===');
if (errors.length === 0) console.log('  None');
else errors.forEach(e => console.log('  - ' + e));

await browser.close();
console.log('\n=== DONE ===');
