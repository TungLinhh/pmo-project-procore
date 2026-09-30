#!/usr/bin/env node
// Dark-mode contrast audit.
//
// Reports every visible text element whose colour is too close to its effective
// background. WCAG 2.1 AA: 4.5:1 for body text, 3:1 for large text (>=24px, or
// >=18.66px bold). The effective background is resolved by walking ancestors
// until a non-transparent background-color is found, then compositing any
// semi-transparent layers on top of it.
//
// Usage:
//   BASE_URL=http://127.0.0.1:3000 node scripts/ui-audit-dark-contrast.mjs
//   BASE_URL=... node scripts/ui-audit-dark-contrast.mjs --pages=/hq,/hq/attention
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const argv = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--'))
  .map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || 'true']; }));
const MIN_NORMAL = Number(argv.min || 4.5);
const MIN_LARGE = Number(argv.minLarge || 3);

const DEFAULT_PAGES = [
  '/hq', '/hq/projects', '/hq/progress', '/hq/shop', '/hq/materials',
  '/hq/manpower', '/hq/qa', '/hq/payment', '/hq/issues', '/hq/attention',
  '/hq/assistant', '/hq/otd', '/hq/approval', '/hq/uploads', '/hq/notifications',
  '/hq/master-data', '/hq/audit', '/hq/bim', '/hq/security', '/hq/ops',
  '/field', '/field/daily', '/field/review', '/field/approvals', '/field/data',
];

const scanner = ({ minNormal, minLarge }) => {
  const parse = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const l1 = lum(a); const l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  // Walk from the element up, collecting background layers until one is opaque,
  // then composite from the bottom up. Compositing top-down and stopping at the
  // first layer treated its own result as opaque, which reported a 12%-alpha
  // badge background as if it were solid (false positive).
  const effectiveBg = (el) => {
    const layers = [];
    let node = el;
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
      node = node.parentElement;
    }
    const body = parse(getComputedStyle(document.body).backgroundColor);
    const rootBg = parse(getComputedStyle(document.documentElement).getPropertyValue('--c-bg'));
    let base = body && body.a > 0 ? body : (rootBg || { r: 11, g: 18, b: 32, a: 1 });
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base.a >= 1 ? base : { ...base, a: 1 };
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    // Only elements that directly render text.
    const text = [...el.childNodes].filter((n) => n.nodeType === 3)
      .map((n) => n.textContent.trim()).join(' ').trim();
    if (!text) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.15) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const fgRaw = parse(cs.color);
    if (!fgRaw) continue;
    const bg = effectiveBg(el);
    const fg = fgRaw.a < 1 ? over(fgRaw, bg) : fgRaw;
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? minLarge : minNormal;
    const cr = ratio(fg, bg);
    if (cr < need) {
      out.push({
        text: text.slice(0, 48),
        cls: (el.className && String(el.className).slice(0, 50)) || el.tagName,
        color: cs.color,
        bg: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        size: Math.round(size * 10) / 10,
        ratio: Math.round(cr * 100) / 100,
        need,
        tag: el.tagName.toLowerCase(),
      });
    }
  }
  return out;
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`${e.message}`));

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
await page.evaluate(async () => {
  const r = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }),
  }).then((x) => x.json());
  localStorage.setItem('pmo_token', r.token);
  localStorage.setItem('pmo_user', JSON.stringify(r.user));
  localStorage.removeItem('pmo_sidebar_rail');
  localStorage.setItem('pmo_lang', 'vi');
});

const pages = (argv.pages ? argv.pages.split(',') : DEFAULT_PAGES);
const report = {};
let total = 0;
for (const route of pages) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  // Force dark mode the same way the app does.
  await page.evaluate(() => {
    if (!document.body.classList.contains('theme-dark')) {
      document.body.classList.add('theme-dark');
      try { localStorage.setItem('pmo_theme', 'dark'); } catch {}
    }
  });
  await page.waitForTimeout(350);
  const found = await page.evaluate(scanner, { minNormal: MIN_NORMAL, minLarge: MIN_LARGE });
  report[route] = found;
  total += found.length;
  const flag = found.length ? 'FAIL' : 'ok  ';
  console.log(`${flag} ${route.padEnd(20)} ${found.length ? `${found.length} vấn đề` : 'sạch'}`);
  for (const f of found.slice(0, 6)) {
    console.log(`      ${f.ratio} (cần ≥${f.need}) .${f.cls} color=${f.color} bg=${f.bg} "${f.text}"`);
  }
}

console.log(`\nTổng: ${total} phần tử tương phản dưới ngưỡng trên ${pages.length} trang.`);
if (errors.length) console.log('Lỗi trang:', errors.join(' ; '));
if (argv.json) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(argv.json, JSON.stringify(report, null, 2));
  console.log('ghi', argv.json);
}
await browser.close();
process.exit(total === 0 ? 0 : 1);
