// Browser smoke test (wired into `npm test`): loads the app at BASE_URL,
// asserts shell render + login flow + zero page errors. Requires playwright
// browsers (`npx playwright install chromium`) and a running backend+frontend.
// Run: BASE_URL=http://localhost:3000 node tests/e2e/browser.mjs
import { chromium } from 'playwright';
import { apiBase } from '../tools/env.mjs';

const BASE = apiBase();
const SCREENSHOT = process.env.SCREENSHOT_PATH || '/tmp/pmo_screen.png';
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
const reqFailed = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('requestfailed', r => reqFailed.push(`${r.url()} (${r.failure()?.errorText})`));

try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  const html = await page.content();
  check(html.includes('id="root"'), 'app shell renders (#root)');
  check((await page.title()).length > 0, `page has title (${await page.title()})`);

  // login via the real form
  await page.fill('input[type="email"]', 'admin@hbg.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(4000);
  const url = page.url();
  check(url.includes('/hq') || url.includes('/field'), `login lands in app shell (got ${url})`);
  const after = await page.content();
  check(after.length > html.length, `post-login content loads (${html.length} → ${after.length} chars)`);

  await page.screenshot({ path: SCREENSHOT });
  console.log(`screenshot: ${SCREENSHOT}`);
} catch (e) {
  check(false, `browser flow threw: ${e.message}`);
}

check(pageErrors.length === 0, `zero page errors (got ${pageErrors.length}: ${pageErrors.slice(0, 3).join(' | ')})`);
const appReqFailed = reqFailed.filter(u => u.startsWith(BASE) || u.startsWith('/'));
check(appReqFailed.length === 0, `zero failed app requests (got ${appReqFailed.length}: ${appReqFailed.slice(0, 3).join(' | ')})`);

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
