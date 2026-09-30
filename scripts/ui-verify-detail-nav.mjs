// Test Detail navigation: A→A, B→B
// P5-3: this script used to drive the removed English headings and a
// `.filter-bar select` for the project. The app now renders Vietnamese pillar
// headings, a ProjectPicker <input> combobox, and `?project=` (not
// `?project_id=`) in the deep links. Kept honest against the current UI.
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
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

const PILLARS = ['Tiến độ thi công', 'Bản vẽ shop', 'Vật tư', 'Thanh toán'];

for (const proj of projects) {
  // Select project through the ProjectPicker combobox, not a <select>.
  await page.goto(`${BASE}/hq?project=${proj.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pillar-card', { timeout: 10000 });
  await page.waitForTimeout(1200);
  const shownCode = await page.locator('.layer-l0 strong').first().textContent().catch(() => null);
  if (shownCode && shownCode.trim() !== proj.code) {
    errors.push(`MISMATCH: picker shows ${shownCode.trim()} for project ${proj.id} (${proj.code})`);
  }

  console.log(`\nProject: ${proj.code} (id=${proj.id})`);

  for (const pname of PILLARS) {
    const card = page.locator(`.pillar-card:has(h3:has-text("${pname}"))`).first();
    const count = await card.count();
    if (count === 0) { errors.push(`MISSING pillar card: ${pname}`); continue; }
    await card.click();
    await page.waitForTimeout(1200);
    const url = page.url();
    const urlProjectId = new URL(url).searchParams.get('project');
    const ok = urlProjectId === String(proj.id);
    console.log(`  ${pname}: URL=${url.replace(BASE, '')}, project=${urlProjectId}, match=${ok}`);
    if (!ok) errors.push(`MISMATCH: ${pname} for project ${proj.id} got ${urlProjectId}`);
    await page.goto(`${BASE}/hq?project=${proj.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.pillar-card', { timeout: 5000 });
    await page.waitForTimeout(600);
  }
}

console.log('\n=== Errors ===');
if (errors.length === 0) console.log('  None');
else errors.forEach(e => console.log('  - ' + e));

await browser.close();
console.log('\n=== DONE ===');
process.exit(errors.length ? 1 : 0);
