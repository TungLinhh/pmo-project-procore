// Control Center compactness check: 4 pillars must sit side by side, the
// metric rows must not stretch across the card, and nothing may overflow the
// viewport. Fails if the layout regresses to a full-width vertical stack.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch();
const results = [];
const check = (cond, msg) => { results.push({ ok: Boolean(cond), msg }); if (!cond) failures++; };
let failures = 0;

for (const [label, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['tablet', { width: 834, height: 1112 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }),
    }).then((x) => x.json());
    localStorage.setItem('pmo_token', r.token);
    localStorage.setItem('pmo_user', JSON.stringify(r.user));
  });
  await page.goto(`${BASE}/hq?project=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pillar-card', { timeout: 20000 });
  await page.waitForTimeout(2500);

  const cards = await page.locator('.pillar-grid.layer-stack .pillar-card').all();
  const boxes = [];
  for (const c of cards) boxes.push(await c.boundingBox());

  // Pillars must share rows (compact), not stack one per screen height.
  const distinctTops = new Set(boxes.map((b) => Math.round(b.y))).size;
  const maxHeight = Math.max(...boxes.map((b) => Math.round(b.height)));
  const maxWidth = Math.max(...boxes.map((b) => Math.round(b.width)));
  const viewWidth = viewport.width;

  const expectedRows = viewport.width <= 520 ? boxes.length : viewport.width <= 768 ? Math.ceil(boxes.length / 2) : Math.ceil(boxes.length / 4);
  check(distinctTops === expectedRows, `${label}: ${boxes.length} pillars in ${distinctTops} row(s) (expected ${expectedRows})`);
  // Measured ceiling: 311px at 4-col desktop/mobile, 436px at 2-col tablet
  // (the L3 card carries an S-curve plus a per-zone sparkline). The old
  // full-width stack was ~700px per pillar, so 460 still catches a regression.
  check(maxHeight < 460, `${label}: tallest pillar ${maxHeight}px (< 460, was ~700+ when stacked)`);
  check(maxWidth < viewWidth - 20, `${label}: pillar width ${maxWidth}px fits in ${viewWidth}px viewport`);
  // Metric tiles: label and value stacked in one cell, so a value must never
  // sit thousands of pixels from its label.
  const tiles = await page.locator('.pillar-card .metric-grid > div').count();
  check(tiles > 0, `${label}: ${tiles} metric tiles rendered`);
  const spread = await page.evaluate(() => {
    const tile = document.querySelector('.pillar-card .metric-grid > div');
    if (!tile) return 9999;
    const k = tile.querySelector('.k')?.getBoundingClientRect();
    const v = tile.querySelector('.v')?.getBoundingClientRect();
    return k && v ? Math.round(v.left - k.left) : 9999;
  });
  check(spread <= 2, `${label}: metric label and value aligned (offset ${spread}px)`);

  // Gate strip: compact, single band, no full-width connector wires.
  const strip = await page.locator('.gate-strip .gate-pill').count();
  check(strip > 0, `${label}: ${strip} gate pills in the compact strip`);
  const wires = await page.locator('.layer-connector').count();
  check(wires === 0, `${label}: no full-width connector rows`);

  // No horizontal overflow anywhere.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 1, `${label}: no horizontal overflow (${overflow}px)`);
  check(errors.length === 0, `${label}: no page errors (${errors.join('; ')})`);

  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
console.log(results.every((r) => r.ok) ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
