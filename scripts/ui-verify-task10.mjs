// One-off UI verify: task 10 (i18n + SSO + PDPL + ma hoa).
// Static: dict parity VI/EN cho moi t('key') trong file da dich.
// Browser: login (SSO btn + toggle EN), /hq/security 4 sections,
// /hq/data-security 3 cards (admin), site khong thay nav, zero page errors.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { psqlQuery } from '../tests/tools/env.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

// ---- Static: dict parity ----
const vi = await import('../frontend/src/i18n/vi.js').then((m) => m.default);
const en = await import('../frontend/src/i18n/en.js').then((m) => m.default);
const TRANSLATED = [
  '../frontend/src/components/HqShell.jsx',
  '../frontend/src/components/Login.jsx',
  '../frontend/src/components/SsoCallback.jsx',
  '../frontend/src/governance/Security.jsx',
  '../frontend/src/governance/DataSecurity.jsx',
];
const used = new Set();
for (const f of TRANSLATED) {
  const src = readFileSync(new URL(f, import.meta.url), 'utf8');
  for (const m of src.matchAll(/\bt\(\s*['"]([^'"]+)['"]\s*\)/g)) used.add(m[1]);
}
const missingVi = [...used].filter((k) => !(k in vi));
const missingEn = [...used].filter((k) => !(k in en));
check(missingVi.length === 0, `dict VI du ${used.size} keys${missingVi.length ? ` (thieu: ${missingVi.slice(0, 5)})` : ''}`);
check(missingEn.length === 0, `dict EN du ${used.size} keys${missingEn.length ? ` (thieu: ${missingEn.slice(0, 5)})` : ''}`);
const emptyEn = Object.entries(en).filter(([, v]) => !v || !String(v).trim());
check(emptyEn.length === 0, `dict EN khong co value rong`);
check(!('nav.data_security' in vi) || vi['nav.data_security'] !== en['nav.data_security'], 'nav.data_security khac nhau VI/EN');

// ---- Browser ----
const browser = await chromium.launch({ headless: true });
const exec = (sql) => psqlQuery(sql).split('\n')[0];
let siteEmail = null;
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.stack || e.message));

  // Login: SSO btn + VI mac dinh.
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  check((await page.locator('text=Đăng nhập bằng SSO').count()) >= 1, 'login co nut SSO');
  check((await page.locator('text=Đăng nhập').count()) >= 1, 'login VI mac dinh');

  // Toggle EN tren login.
  await page.click('button.demo-chip:has-text("EN")');
  await page.waitForTimeout(400);
  check((await page.locator('text=Log in with SSO').count()) >= 1, 'login EN sau toggle');
  await page.click('button.demo-chip:has-text("VI")');
  await page.waitForTimeout(400);

  // Dang nhap admin (qua form that).
  await page.fill('input[type="email"]', 'admin@hbg.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button.login-submit:has-text("ĐĂNG NHẬP")');
  await page.waitForURL('**/hq', { timeout: 15000 });
  check(true, 'login admin vao /hq');

  // Header co toggle ngon ngu + nav data-security (admin thay).
  await page.waitForSelector('.shell-header-right', { timeout: 10000 });
  await page.waitForTimeout(500);
  check((await page.locator('.shell-header-right button:has-text("EN")').count()) >= 1, 'header co toggle EN');
  check((await page.locator('a[href="/hq/data-security"]').count()) === 1, 'admin thay nav SSO & Dữ liệu');

  // Security: 4 sections.
  await page.goto(`${BASE}/hq/security`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  for (const s of ['Xác thực 2 bước (TOTP)', 'Đổi mật khẩu (≥10 ký tự)', 'Đăng nhập SSO (tài khoản công ty)', 'Quyền riêng tư (PDPL)']) {
    check((await page.locator(`text=${s}`).count()) >= 1, `security section: ${s}`);
  }

  // DataSecurity: 3 cards.
  await page.goto(`${BASE}/hq/data-security`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  for (const s of ['SSO qua IdP ngoài (OIDC)', 'Mã hoá dữ liệu', 'Yêu cầu dữ liệu (DSR)']) {
    check((await page.locator(`text=${s}`).count()) >= 1, `data-security card: ${s}`);
  }

  // Toggle EN tren shell: nav doi tieng Anh.
  await page.click('.shell-header-right button:has-text("EN")');
  await page.waitForTimeout(500);
  check((await page.locator('a[href="/hq/data-security"]:has-text("SSO & Data")').count()) === 1, 'nav EN sau toggle');
  await page.click('.shell-header-right button:has-text("VI")');
  await page.waitForTimeout(500);

  // Site: khong thay nav data-security. (Ghi nhan: /field va /hq hien do loi
  // san voi site khong membership — ngoai pham vi task 10, khong assert o day.)
  // Zero-error chi assert cho flow admin o tren.
  const adminErrs = errs.length;
  check(adminErrs === 0, `zero page errors (admin flow) (${errs.join('; ').slice(0, 200)})`);
  siteEmail = `uiv-site-${Date.now()}@hbg.com`;
  exec(`INSERT INTO users (tenant_id, email, name, role, password_hash) SELECT tenant_id, '${siteEmail}', 'UIV', 'site', password_hash FROM users WHERE email = 'admin@hbg.com'`);
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', siteEmail);
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button.login-submit');
  await page.waitForURL('**/field', { timeout: 15000 });
  await page.goto(`${BASE}/hq/data-security`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  // Trang admin tu hien loi (403 tu API) hoac trong — dieu can la nav khong co link.
  await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check((await page.locator('a[href="/hq/data-security"]').count()) === 0, 'site khong thay nav data-security');
  if (errs.length > adminErrs) {
    console.log(`  INFO — site-flow page errors (pre-existing, ngoai pham vi): ${errs.slice(adminErrs).join('; ').slice(0, 300)}`);
  }
} finally {
  if (siteEmail) {
    try {
      const id = exec(`SELECT id FROM users WHERE email = '${siteEmail}'`);
      if (id) {
        exec(`DELETE FROM audit_log WHERE user_id = ${id}`);
        exec(`DELETE FROM users WHERE id = ${id}`);
      }
    } catch { /* best effort */ }
  }
  await browser.close();
}
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
