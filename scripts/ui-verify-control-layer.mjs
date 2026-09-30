// One-off UI verify: control layer overlay on /hq (desktop + mobile).
import { chromium } from 'playwright';
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then((r) => r.json());
    localStorage.setItem('pmo_token', r.token);
    localStorage.setItem('pmo_user', JSON.stringify(r.user));
  });
  await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pillar-card', { timeout: 15000 });
  await page.waitForTimeout(2500);
  const order = await page.locator('.pillar-grid.layer-stack .pillar-card').evaluateAll((els) =>
    els.map((el) => ({ t: el.querySelector('h3')?.textContent.trim(), o: Number(getComputedStyle(el).order) }))
      .sort((a, b) => a.o - b.o).map((x) => x.t));
  // Nhãn thật trên thẻ là `L1`…`L4` (rút gọn để lớp vừa cột 1/4), không phải
  // `Lớp 1`. Thứ tự thẻ theo SRS 2.1→2.4: shopdrawing, vật tư, thi công, thanh toán.
  const coreOrder = order.filter((label) => /^L[1-4]\b/.test(label));
  check(JSON.stringify(coreOrder) === JSON.stringify(['L1 Bản vẽ shop', 'L2 Vật tư', 'L3 Thi công', 'L4 Thanh toán']), `visual layer order L1→L4 (${coreOrder.join(' | ')})`);
  check((await page.locator('.layer-l0').count()) === 1, 'L0 header strip');
  // Open control layer + simulate (default CTL-01) + verify 5 scenario options.
  await page.click('text=Lớp điều khiển');
  await page.waitForTimeout(2000);
  check((await page.locator('text=Lớp điều khiển kịch bản').count()) >= 1, 'control overlay opens');
  const typeOpts = await page.locator('select').allTextContents();
  check(typeOpts.join(' ').includes('CTL-01') && typeOpts.join(' ').includes('CTL-06'), `5 CTL options present`);
  await page.click('text=Mô phỏng');
  await page.waitForTimeout(3000);
  const previewCells = await page.locator('text=Mốc hoàn thành').count();
  check(previewCells >= 1, 'simulate preview table renders before/after values');
  check(errs.length === 0, `zero page errors (${errs.join('; ').slice(0, 160)})`);
  // Health + gate config page: renders 4 metric rows + 5 gate rows.
  await page.goto(`${BASE}/hq/health-config`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const hRows = await page.locator('text=Cấu hình điều khiển').count();
  check(hRows >= 1, 'health+gate config page renders');
  const metricRows = await page.locator('tbody tr').count();
  check(metricRows === 9, `4 threshold + 5 gate rows (got ${metricRows})`);
  // Không neo đầu: nhãn `L3` nằm sau gate-banner ("Chờ G2 …"), nên `^L3` không
  // khớp. `\b` vẫn đủ để không nhầm với L1/L2/L4 hay G3.
  const cardBadge = () => page.locator('.pillar-card', { hasText: /\bL3\b/ }).locator('.badge').first().textContent();
  const l0Before = await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' }).then(() => page.waitForSelector('.layer-l0', { timeout: 15000 })).then(() => page.waitForTimeout(2500)).then(cardBadge);
  const token = await page.evaluate(() => localStorage.getItem('pmo_token'));
  const pid = '1';
  const { psqlQuery } = await import('../tests/tools/env.mjs');
  const preRows = psqlQuery(`SELECT metric, yellow_at, red_at FROM health_thresholds WHERE tenant_id = 1 AND project_id = 1`).trim();
  try {
    // Data-driven flip: chon metric dang RED tren du lieu that, noi red_at
    // qua UI de badge L0 doi mau ('chong' voi gia thiet project rong truoc day).
    const health = await (await fetch(`${BASE}/api/projects/${pid}/health`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const sigs = health.signals || {};
    // Assert tren card Lop 3 (manpower) → flip dung metric overdue_items.
    const redEntry = (sigs.manpower?.level === 'red' && ['manpower', sigs.manpower])
      || Object.entries(sigs).find(([, s]) => s?.level === 'red' && s?.direction === 'high_bad')
      || Object.entries(sigs).find(([, s]) => s?.level === 'red');
    const flipMetric = redEntry?.[1]?.metric || 'overdue_items';
    const flipValue = Number(redEntry?.[1]?.value || 0);
    const flipDir = redEntry?.[1]?.direction || 'high_bad';
    const newRed = flipDir === 'high_bad' ? Math.ceil(flipValue + 10) : Math.floor(flipValue - 1);
    await page.goto(`${BASE}/hq/health-config`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const row = page.locator('tbody tr', { hasText: flipMetric });
    const inputs = row.locator('input[type="number"]');
    if (flipDir === 'high_bad') {
      const y = await inputs.nth(0).inputValue();
      await inputs.nth(1).fill(String(newRed));
      if (Number(y) > newRed) await inputs.nth(0).fill(String(newRed));
    } else {
      await inputs.nth(1).fill(String(newRed));
      const y = await inputs.nth(0).inputValue();
      if (newRed > Number(y)) await inputs.nth(0).fill(String(newRed));
    }
    await page.click('text=Lưu ngưỡng');
    await page.waitForTimeout(2000);
    const eff = await (await fetch(`${BASE}/api/projects/${pid}/health-thresholds`, { headers: { Authorization: `Bearer ${token}` } })).json();
    check(Number(eff.find((t) => t.metric === flipMetric)?.red_at) === newRed, `UI save persists (${flipMetric} red_at=${newRed})`);
    await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.layer-l0', { timeout: 15000 });
    await page.waitForTimeout(2500);
    const l0After = await cardBadge();
    check(l0After !== l0Before, `Lop 3 badge reacts to threshold change (${l0Before} -> ${l0After})`);
  } finally {
    // Khôi phục nguyên trạng: xóa rows project test tạo, dựng lại rows đã có.
    const DIR = { overdue_items: 'high_bad', approval_pct: 'low_bad', payment_overdue: 'high_bad', material_delayed: 'high_bad' };
    psqlQuery(`DELETE FROM health_thresholds WHERE tenant_id = 1 AND project_id = 1`);
    for (const line of preRows.split('\n').filter(Boolean)) {
      const [m, y, r] = line.split('|');
      if (!DIR[m]) continue;
      psqlQuery(`INSERT INTO health_thresholds (tenant_id, project_id, metric, direction, yellow_at, red_at, updated_by) VALUES (1, 1, '${m}', '${DIR[m]}', ${y}, ${r}, 1)`);
    }
    console.log('thresholds restored');
  }
  // Gate UI save/restore: tắt G5 ở scope project qua UI thật, API phải DISABLED.
  const preGate = psqlQuery(`SELECT from_pillar || '|' || to_pillar || '|' || (CASE WHEN enabled THEN 1 ELSE 0 END) || '|' || threshold_pct || '|' || COALESCE(note, '') FROM pillar_gate_configs WHERE tenant_id = 1 AND project_id = 1 ORDER BY from_pillar, to_pillar`);
  try {
    await page.goto(`${BASE}/hq/health-config`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const gateTables = await page.locator('.section .data-table table').count();
    check(gateTables === 2, 'threshold + gate tables render');
    // Hàng G5 = tr thứ 5 của bảng gate (section thứ 2): bỏ check "Mở" rồi Lưu gate.
    const g5box = page.locator('.section').nth(1).locator('tbody tr:nth-child(5) input[type="checkbox"]');
    if (await g5box.isChecked()) await g5box.uncheck();
    await page.click('text=Lưu gate');
    await page.waitForTimeout(2000);
    const gates = await (await fetch(`${BASE}/api/projects/1/pillar-gates`, { headers: { Authorization: `Bearer ${token}` } })).json();
    const g5 = (gates.gates || []).find((g) => g.id === 'G5');
    check(g5?.state === 'DISABLED' && g5?.scope === 'project', `UI gate save persists (G5 ${g5?.state}/${g5?.scope})`);
  } finally {
    psqlQuery(`DELETE FROM pillar_gate_configs WHERE tenant_id = 1 AND project_id = 1`);
    for (const line of preGate.split('\n').filter(Boolean)) {
      const [fp, tp, en, th, ...np] = line.split('|');
      const note = np.join('|').replace(/'/g, "''");
      psqlQuery(`INSERT INTO pillar_gate_configs (tenant_id, project_id, from_pillar, to_pillar, enabled, threshold_pct, note, updated_by) VALUES (1, 1, '${fp}', '${tp}', ${en === '1'}, ${th}, ${note ? `'${note}'` : 'NULL'}, 1)`);
    }
    console.log('gates restored');
  }
  // Manpower FR-1.3: tab Kế hoạch render, lưu KH qua UI thật rồi dọn sạch.
  await page.goto(`${BASE}/hq/manpower?project=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check((await page.locator('text=Kế hoạch & Loading').count()) >= 1, 'plan tab button renders');
  await page.click('text=Kế hoạch & Loading');
  await page.waitForTimeout(1500);
  const planInputs = await page.locator('input[placeholder="Thợ điện"]').count();
  check(planInputs === 1, 'plan editor visible for admin');
  await page.locator('input[placeholder="Thợ điện"]').fill('Thợ kiểm thử UI');
  await page.locator('label:has-text("Số lượng") input').fill('9');
  await page.click('text=Lưu kế hoạch');
  await page.waitForTimeout(2000);
  const savedPlan = await (await fetch(`${BASE}/api/projects/1/manpower-plan`, { headers: { Authorization: `Bearer ${token}` } })).json();
  check((Array.isArray(savedPlan) ? savedPlan : []).some((r) => r.role_name_vi === 'Thợ kiểm thử UI'), 'UI plan save persists');
  const loading = await (await fetch(`${BASE}/api/projects/1/manpower-loading?weeks=4`, { headers: { Authorization: `Bearer ${token}` } })).json();
  check(Array.isArray(loading.weeks) && typeof loading.total?.pct === 'number', 'loading curve reads back');
  psqlQuery(`DELETE FROM manpower_plans WHERE project_id = 1 AND role_name_vi = 'Thợ kiểm thử UI'`);
  console.log('manpower plan cleaned');
  await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pillar-card', { timeout: 15000 });
  await page.waitForTimeout(2000);
  // Security MFA: setup → enable → login đòi mã → verify → disable, qua UI thật.
  // Preamble + finally cứng bằng psql: kẹt MFA admin = mọi login sau đều 401.
  psqlQuery(`UPDATE users SET mfa_secret = NULL, mfa_enabled = false WHERE email = 'admin@hbg.com'`);
  const { totp: uiTotp } = await import('../backend/src/lib/mfa.js');
  try {
  await page.goto(`${BASE}/hq/security`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check((await page.locator('text=Xác thực 2 bước').count()) >= 1, 'security page renders');
  await page.click('text=Bật MFA — tạo secret');
  await page.waitForTimeout(1500);
  const shownSecret = (await page.locator('code').first().textContent() || '').trim();
  check(/^[A-Z2-7]{32}$/.test(shownSecret), 'setup shows secret on UI');
  await page.locator('label:has-text("Mã 6 số") input').fill(uiTotp(shownSecret));
  await page.click('text=Xác nhận & bật');
  await page.waitForTimeout(2000);
  check((await page.locator('text=ĐANG BẬT').count()) >= 1, 'MFA enabled via UI');
  await page.evaluate(() => { localStorage.removeItem('pmo_token'); localStorage.removeItem('pmo_user'); localStorage.removeItem('pmo_refresh'); });
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  // Ô email/mật khẩu là `required` và khởi tạo rỗng, nên bấm submit khi chưa
  // điền sẽ bị chặn ngay ở trình duyệt — không bao giờ tới bước hỏi mã MFA.
  await page.locator('input[type="email"]').fill('admin@hbg.com');
  await page.locator('input[type="password"]').fill('admin123');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  check((await page.locator('text=Xác thực 2 bước').count()) >= 1, 'login asks MFA code');
  await page.locator('input[maxlength="6"]').fill(uiTotp(shownSecret));
  await page.click('text=XÁC NHẬN');
  await page.waitForTimeout(4000);
  check(page.url().includes('/hq') || page.url().includes('/field'), `MFA login lands in app (${page.url()})`);
  await page.goto(`${BASE}/hq/security`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.locator('.section >> nth=0 >> label:has-text("Mật khẩu hiện tại") >> input').fill('admin123');
  await page.click('text=Tắt MFA');
  await page.waitForTimeout(2000);
  check((await page.locator('text=ĐANG TẮT').count()) >= 1, 'MFA disabled via UI (restored)');
  } finally {
    psqlQuery(`UPDATE users SET mfa_secret = NULL, mfa_enabled = false WHERE email = 'admin@hbg.com'`);
  }
  // Backups NFR: nav + page render + chạy tay ra file thật (file giữ lại
  // như backup thật, retention 7 bản tự xoay vòng).
  await page.goto(`${BASE}/hq/backups`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check((await page.locator('text=Sao lưu dữ liệu').count()) >= 1, 'backups page renders');
  await page.click('text=Sao lưu ngay');
  await page.waitForSelector('.modal', { timeout: 10000 });
  await page.click('.modal button:has-text("Sao lưu")');
  await page.waitForTimeout(20000);
  const rowsNow = await page.locator('tbody tr').count();
  check(rowsNow >= 1, `manual backup row appears (${rowsNow})`);
  await page.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.pillar-card', { timeout: 15000 });
  await page.waitForTimeout(2000);
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.click('text=Xuất Excel'),
  ]);
  const dlPath = await dl.path();
  const fs = await import('node:fs');
  const stat = fs.statSync(dlPath);
  check(/\.xlsx$/.test(dl.suggestedFilename() || ''), `download filename xlsx (${dl.suggestedFilename()})`);
  check(stat.size > 4000, `download non-trivial (${stat.size} bytes)`);
  await page.screenshot({ path: '/tmp/opencode/cc-desktop.png' });
  // Mobile viewport
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mctx.newPage();
  await mp.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await mp.evaluate(async () => {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }) }).then((r) => r.json());
    localStorage.setItem('pmo_token', r.token);
    localStorage.setItem('pmo_user', JSON.stringify(r.user));
  });
  await mp.goto(`${BASE}/hq`, { waitUntil: 'domcontentloaded' });
  await mp.waitForSelector('.pillar-card', { timeout: 15000 });
  await mp.waitForTimeout(2000);
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, `no horizontal overflow on 390px (got ${overflow}px)`);
  await mp.screenshot({ path: '/tmp/opencode/cc-mobile.png' });
} catch (e) {
  check(false, `threw: ${e.message}`);
}
await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
