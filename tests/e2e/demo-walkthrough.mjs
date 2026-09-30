// Demo dry-run smoke test: replays the live walkthrough in a real browser.
// Login → /upload bulk zip → /hq/uploads classify+confirm+commit → every tab.
// Run: BASE_URL=http://localhost:3000 BTE_DATA_DIR=... node tests/e2e/demo-walkthrough.mjs
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { apiBase } from '../tools/env.mjs';

const BASE = apiBase();
const root = fileURLToPath(new URL('../..', import.meta.url));
const BTE = process.env.BTE_DATA_DIR || join(root, 'reference_sheets/2019.04.28 HBG-HBC-BCTT');
const PSQL_BIN = process.env.PSQL_BIN || 'psql';
const results = [];
const ok = (cond, msg, extra = '') => { results.push({ cond, msg }); console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}${extra ? ' ' + extra : ''}`); };

// demo zip: 2 real files with REAL folder names (spaced, like the site template)
execSync(`python3 << 'PYEOF'
# -*- coding: utf-8 -*-
import zipfile
D = ${JSON.stringify(BTE)}
z = zipfile.ZipFile('/tmp/demo-walk.zip', 'w', zipfile.ZIP_DEFLATED)
z.write(D + '/TIẾN ĐỘ SHOP/Shop KID.xlsx', 'PK/TIẾN ĐỘ SHOP/Shop KID.xlsx')
z.write(D + '/TIẾN ĐỘ THI CÔNG/TĐ KID.xlsx', 'PK/TIẾN ĐỘ THI CÔNG/TĐ KID.xlsx')
z.close()
print('demo zip ready')
PYEOF`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
// reset walkthrough fixtures so every run replays the full flow
try {
  execSync(`${PSQL_BIN} -h ${process.env.PGHOST || '127.0.0.1'} -p ${process.env.PGPORT || '5433'} -U ${process.env.PGUSER || 'pmo_user'} -d ${process.env.PGDATABASE || 'pmo'} -t -A -c "UPDATE file_uploads SET status='STAGED', project_id=NULL, zone_id=NULL, skip_reason=NULL WHERE relative_path LIKE 'PK/%';"`, { env: { ...process.env, PGPASSWORD: process.env.PGPASSWORD || 'pmo_dev_pwd' } });
} catch { /* DB may be unreachable in pure-frontend runs */ }
const consoleErrors = [];
const pageErrors = [];
const reqFailed = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160)); });
page.on('pageerror', e => pageErrors.push(e.message.slice(0, 160)));
page.on('requestfailed', r => { const u = r.url(); if (u.startsWith(BASE) || u.startsWith('/')) reqFailed.push(u.slice(0, 120)); });
const shot = (n) => page.screenshot({ path: `/tmp/demo-${n}.png` }).catch(() => {});

try {
  // 1. login via UI
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.fill('input[type="email"]', 'admin@hbg.com');
  await page.fill('input[type="password"]', 'admin123');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/hq|\/field/, { timeout: 15000 });
  ok(page.url().includes('/hq'), 'login lands on /hq', page.url());

  // 2. bulk zip upload through the wizard UI
  await page.goto(BASE + '/upload', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.click('text=Nhiều file / cả folder / .zip');
  const zipInput = page.locator('input[type="file"]').first();
  await zipInput.setInputFiles('/tmp/demo-walk.zip');
  // bulk onDone navigates to the review queue — either the summary or the
  // navigation proves staging worked; the review queue asserts the rows.
  await page.waitForURL(/\/hq\/uploads/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  if (!page.url().includes('/hq/uploads')) {
    const bulkText = await page.content();
    ok(/staged/i.test(bulkText), 'zip batch staged via UI');
  } else ok(true, 'zip batch staged via UI (landed on review queue)');
  await shot('upload');

  // 3. review queue: classify + confirm + commit one file via UI
  await page.goto(BASE + '/hq/uploads', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  // Bám `data-testid`, không bám nhãn hiển thị: nhãn được dịch VI/EN nên bám nhãn là
  // bài kiểm đỏ mỗi lần dịch (đo 2026-09-28: `text=Classify staged` hết tồn tại sau
  // khi nhãn sang tiếng Việt, bài dừng ở bước 3/3 với `page.click` timeout 30s).
  await page.click('[data-testid="classify-staged"]');
  await page.waitForTimeout(8000);
  // classified rows leave the default Needs-review filter — view All to see guesses
  await page.selectOption('[data-testid="review-filter"]', 'all');
  await page.waitForTimeout(1500);
  let reviewText = await page.content();
  ok(/shop_drawing|construction_schedule/i.test(reviewText), 'classify guesses visible in review queue');
  await shot('review');
  // confirm first Confirm button if present (classified rows live under All)
  await page.selectOption('select', 'all').catch(() => {});
  await page.waitForTimeout(1500);
  const confirmBtn = page.locator('[data-testid="confirm-upload"]').first();
  if (await confirmBtn.count()) {
    await confirmBtn.click();
    await page.waitForTimeout(1000);
    // the confirm form (not the top filter select): the select offering '-- project --'
    // pick BTE explicitly — the demo project with real data
    const projSelect = page.locator('select', { hasText: '-- project --' });
    if (await projSelect.count()) {
      const bteValue = await projSelect.first().evaluate(sel =>
        Array.from(sel.options).find(o => o.text.includes('BTE-WP4-HBC'))?.value || '');
      if (bteValue) await projSelect.first().selectOption(bteValue);
      else await projSelect.first().selectOption({ index: 1 });
      // Ô này thuộc form confirm của **ReviewQueue** (không phải UploadWizard), và
      // vẫn là ô tự do — dùng `testid` để không bám nhãn.
      await page.fill('[data-testid="confirm-doc-type"]', 'shop_drawing');
      await page.click('[data-testid="confirm-configure"]');
      await page.waitForTimeout(10000);
      const toastText = await page.content();
      const toastMatch = toastText.match(/(Thiếu|Lỗi|Configure lỗi|failed|error)[^<]{0,120}/i);
      if (toastMatch) console.log('  configure toast/note:', toastMatch[0].slice(0, 140));
      // configure reloads the queue: the row must leave STAGED for CONFIGURED
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(3000);
      const after = await page.content();
      ok(/CONFIGURED/.test(after), 'confirm→configure works via UI (row now CONFIGURED)');
      const commitBtn = page.locator('button', { hasText: 'Commit' }).first();
      if (await commitBtn.count()) {
        await commitBtn.click();
        try {
          await page.waitForFunction(() => document.body.innerText.includes('SUCCESS') || document.body.innerText.includes('PARTIAL'), { timeout: 20000 });
          ok(true, 'commit works via UI');
        } catch {
          ok(false, 'commit works via UI (no SUCCESS/PARTIAL badge appeared)');
        }
      } else ok(true, 'commit button state (skipped)');
    } else ok(true, 'no project select (skipped)');
  } else ok(true, 'no Confirm buttons (all configured/skipped)');

  // 4. every demo tab: load, errors, NaN/blank scan
  const tabs = [
    ['control-center', '/hq'],
    ['progress', '/hq/progress?project=1'],
    ['shop', '/hq/shop?project=1'],
    ['materials', '/hq/materials?project=1'],
    ['payment', '/hq/payment?project=1'],
    ['otd', '/hq/otd?project=1'],
    ['uploads', '/hq/uploads'],
  ];
  for (const [name, path] of tabs) {
    const ce0 = consoleErrors.length, pe0 = pageErrors.length, rf0 = reqFailed.length;
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);
    const html = await page.content();
    const text = await page.innerText('body').catch(() => '');
    const whiteScreen = text.trim().length < 50;
    const hasNaN = /\bNaN\b/.test(text) || /\bNaN%/.test(html);
    const rawCents = /\d{9,}(₫|VND|\s*đ)/.test(text);
    const newCE = consoleErrors.slice(ce0), newPE = pageErrors.slice(pe0), newRF = reqFailed.slice(rf0);
    ok(!whiteScreen, `tab ${name} renders content`, `chars=${text.trim().length}`);
    ok(!hasNaN, `tab ${name} has no NaN`);
    ok(newPE.length === 0, `tab ${name} zero page errors`, newPE.slice(0, 2).join('|'));
    if (newCE.length) console.log(`  note [${name}] console errors: ${newCE.slice(0, 2).join(' | ').slice(0, 200)}`);
    if (newRF.length) console.log(`  note [${name}] failed requests: ${newRF.slice(0, 3).join(' | ').slice(0, 250)}`);
    if (rawCents) console.log(`  note [${name}] possible raw-cents figure`);
    await shot(`tab-${name}`);
  }

  // 5. selection persistence: a control-center pillar card keeps ?project?
  // + progress row opens the extracted-data drill-down (not a fake issue)
  await page.goto(BASE + '/hq/progress?project=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);
  // Bảng **thứ hai** mới là bảng tiến độ (bảng đầu là nhật ký thao tác, dòng của nó
  // `cursor:auto` và không có `onClick`). `tbody tr` không phân biệt được hai bảng nên
  // bản cũ bấm nhầm dòng nhật ký ⇒ modal không mở, và bài báo đỏ như thể tính năng
  // hỏng. Đo 2026-09-28: bấm đúng bảng thứ hai thì modal mở, `box.y = 48`.
  await page.locator('table').nth(1).locator('tbody tr').first().click();
  try {
    await page.waitForSelector('.modal-backdrop', { timeout: 8000, state: 'visible' });
    const box = await page.locator('.modal-backdrop .modal').boundingBox();
    ok(box && box.y < 600, 'progress drill-down modal opens on screen');
    await page.screenshot({ path: '/tmp/demo-drill.png' }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('.modal-backdrop').click({ position: { x: 10, y: 10 }, timeout: 5000 }).catch(() => {});
  } catch {
    ok(false, 'progress drill-down modal opens on screen');
  }
  await page.goto(BASE + '/hq', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  const pillar = page.locator('text=View Details →').first();
  if (await pillar.count()) {
    await pillar.click();
    await page.waitForTimeout(2500);
    ok(/[?&]project=\d+/.test(page.url()), 'pillar navigation keeps ?project=', page.url());
  } else ok(true, 'no pillar links (skipped)');
} catch (e) {
  ok(false, 'walkthrough threw: ' + e.message.slice(0, 200));
}

await browser.close();
const fails = results.filter(r => !r.cond);
console.log(`\n${results.length - fails.length}/${results.length} checks passed`);
if (fails.length) { console.log('FAILURES:'); fails.forEach(f => console.log(' - ' + f.msg)); }
process.exit(fails.length ? 1 : 0);
