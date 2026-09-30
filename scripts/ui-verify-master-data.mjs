#!/usr/bin/env node
// Kiểm trên trình duyệt thật: sửa / ẩn / kích hoạt lại danh mục chủ.
//
//   node scripts/ui-verify-master-data.mjs      (BASE_URL mặc định :3000)
//
// Vì sao cần bài kiểm trình duyệt chứ không chỉ e2e API: phần dễ vỡ nhất nằm ở
// chỗ **nút ẩn chỉ hiện khi còn bản ghi ẩn**, và ở chỗ form sửa phải điền sẵn dữ
// liệu cũ. Hai chỗ đó đều không thể kiểm bằng API.
//
// Bài này tự tạo bản ghi riêng (mã `TST-UI-*`) và tự xoá cứng ở cuối — xoá mềm
// giữ bản ghi nên "dọn bằng nút Ẩn" là dọn hỏng.
import { chromium } from 'playwright';
import { apiBase, psqlQuery } from '../tests/tools/env.mjs';

const BASE = apiBase();
let pass = 0;
let fail = 0;
const results = [];
const check = (cond, msg) => {
  results.push({ condition: Boolean(cond), message: msg });
  console.log(`${cond ? '  PASS' : '  FAIL'} — ${msg}`);
  cond ? pass++ : fail++;
};

const CODE = `TST-UI-${Date.now().toString(36).toUpperCase()}`;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1700, height: 1000 } });
// Đặt ngôn ngữ trước khi app nạp, **không** bấm nút [VI|EN]: bấm nút thật sẽ
// `PUT /api/me/locale` và đổi luôn `users.locale` của tài khoản demo trong DB.
await ctx.addInitScript(() => localStorage.setItem('pmo_lang', 'vi'));
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 120)));

try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  const login = await page.evaluate(async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }),
    });
    const r = await res.json();
    localStorage.setItem('pmo_token', r.token);
    localStorage.setItem('pmo_user', JSON.stringify(r.user));
    return { ok: res.ok, user: r.user?.email };
  });
  check(login?.ok && login.user, `đăng nhập được (${login?.user})`);
  if (!login?.ok) throw new Error('không đăng nhập được');

  // ---- tạo bản ghi thử qua API để kiểm giao diện, không đụng dữ liệu demo ----
  const created = await page.evaluate(async (code) => {
    const r = await fetch('/api/master-data/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('pmo_token')}` },
      body: JSON.stringify({ code, name: 'NCC thử kiểm UI', category: 'Thiết bị', status: 'ACTIVE' }),
    });
    return r.json();
  }, CODE);
  check(created?.id, `tạo bản ghi thử (mã ${CODE}) — id=${created?.id}`);

  // ---- danh sách: có cột thao tác, có nút Sửa và Ẩn ----
  await page.goto(`${BASE}/hq/master-data?r=vendors`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const row = page.locator('tbody tr').filter({ hasText: CODE });
  check(await page.locator('thead th', { hasText: 'Thao tác' }).count() > 0, 'danh sách có cột "Thao tác"');
  check(await row.locator('button[title="Sửa"]').count() > 0, 'dòng có nút Sửa');
  check(await row.locator('button[title="Ẩn"]').count() > 0, 'dòng có nút Ẩn');

  // ---- form sửa: điền sẵn, và Mã không cho sửa ----
  await row.locator('button[title="Sửa"]').click();
  await page.waitForTimeout(1200);
  check((await page.locator('h1').textContent()).includes(`#${created.id}`),
    `tiêu đề form sửa có số bản ghi — "${(await page.locator('h1').textContent()).trim()}"`);
  const labels = (await page.locator('.card label > div').allInnerTexts()).map((s) => s.trim());
  check(!labels.some((l) => l.startsWith('Mã')), 'form sửa KHÔNG có ô Mã — mã là khoá nghiệp vụ, không sửa được');
  check(await page.locator('.card input').first().inputValue() === 'NCC thử kiểm UI',
    'form sửa điền sẵn dữ liệu cũ (nếu rỗng thì bấm Lưu sẽ xoá sạch tên)');

  // ---- sửa rồi lưu: tên trong bảng phải đổi ----
  await page.locator('.card input').first().fill('NCC đã sửa qua UI');
  await page.locator('.page-header-right button.btn').last().click();
  await page.waitForTimeout(1800);
  await page.goto(`${BASE}/hq/master-data?r=vendors`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check(await page.locator('tbody tr').filter({ hasText: 'NCC đã sửa qua UI' }).count() > 0,
    'sửa tên rồi Lưu: bảng hiện tên mới');

  // ---- ẩn: phải hỏi trước, và nói rõ dữ liệu vẫn còn ----
  const target = page.locator('tbody tr').filter({ hasText: 'NCC đã sửa qua UI' });
  await target.locator('button[title="Ẩn"]').click();
  await page.waitForTimeout(600);
  const dialogText = ((await page.locator('[role=dialog], .modal').last().textContent().catch(() => '')) || '').replace(/\s+/g, ' ');
  check(/ẩn/i.test(dialogText) && /kích hoạt lại/i.test(dialogText),
    'hộp thoại ẩn nói rõ dữ liệu vẫn còn và kích hoạt lại được');
  await page.locator('[role=dialog] button, .modal button').filter({ hasText: 'Ẩn' }).last().click();
  await page.waitForTimeout(1800);
  check(await page.locator('tbody tr').filter({ hasText: 'NCC đã sửa qua UI' }).count() === 0,
    'sau khi ẩn, bản ghi biến mất khỏi danh sách');
  check(/NCC đã sửa qua UI/.test(psqlQuery(`SELECT name FROM vendors WHERE code = '${CODE}'`)),
    'bản ghi VẪN còn trong DB — đây là xoá mềm, không phải xoá cứng');

  // ---- công tắc hiện bản ghi ẩn, và số bị ẩn phải hiện ra ----
  const toggle = page.locator('label').filter({ hasText: 'bản ghi đã ẩn' }).first();
  check(await toggle.count() > 0, 'có công tắc báo đang ẩn bao nhiêu bản ghi');
  await toggle.locator('input').check();
  await page.waitForTimeout(900);
  check(await page.locator('tbody tr').filter({ hasText: 'NCC đã sửa qua UI' }).count() > 0,
    'bật công tắc thì bản ghi ẩn hiện lại');

  // ---- kích hoạt lại ----
  await page.locator('tbody tr').filter({ hasText: 'NCC đã sửa qua UI' })
    .locator('button[title="Kích hoạt lại"]').click();
  await page.waitForTimeout(600);
  await page.locator('[role=dialog] button, .modal button').filter({ hasText: 'Kích hoạt lại' }).last().click();
  await page.waitForTimeout(1800);
  check(/ACTIVE/.test(psqlQuery(`SELECT status FROM vendors WHERE code = '${CODE}'`)),
    'kích hoạt lại xong thì status trở về ACTIVE');
  check(await page.locator('label').filter({ hasText: 'bản ghi đã ẩn' }).count() === 0,
    'không còn bản ghi ẩn thì công tắc biến mất — không để lại công tắc vô dụng');

  // ---- danh mục không ẩn được: báo lỗi thay vì im lặng ----
  await page.goto(`${BASE}/hq/master-data?r=business-processes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const bpRow = page.locator('tbody tr').first();
  check(await bpRow.locator('button[title="Sửa"]').count() > 0, 'business-processes vẫn có nút Sửa');
  check(await bpRow.locator('button[title="Ẩn"]').count() === 0,
    'business-processes KHÔNG có nút Ẩn — bảng không có cột trạng thái, ẩn sẽ luôn 409');

  check(pageErrors.length === 0, `không có lỗi JavaScript trên trang${pageErrors.length ? ` — ${pageErrors.join('; ')}` : ''}`);
} finally {
  // Xoá cứng: xoá mềm giữ bản ghi, nên "dọn bằng nút Ẩn" là dọn hỏng.
  psqlQuery(`DELETE FROM vendors WHERE code = '${CODE}'`);
  psqlQuery(`DELETE FROM audit_log WHERE note LIKE '%vendors#%' AND note LIKE '%Sửa vendors%'`);
  const left = psqlQuery(`SELECT count(*) FROM vendors WHERE code = '${CODE}'`);
  check(left.split('\n')[0].trim() === '0', `đã dọn sạch bản ghi thử (còn ${left.split('\n')[0].trim()})`);
  await browser.close();
}

const out = { total: pass + fail, failures: fail, results };
process.stdout.write(`\n${JSON.stringify(out)}\n`);
console.log(pass && !fail ? '\nALL PASS' : `\n${fail} FAILURE(S)`);
process.exit(fail ? 1 : 0);
