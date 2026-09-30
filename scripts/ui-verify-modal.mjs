// Khoá lại việc gom 10 hộp thoại về <Modal>.
//
// Trước đó mỗi hộp thoại tự viết `modal-backdrop`, hệ quả đo được trên UI:
// 9/10 không đóng được bằng Escape, 9/10 không có role="dialog", không ai
// chuyển focus vào hộp thoại và trả focus về nút đã mở. Script này kiểm tra
// đúng bốn điều đó, theo cách người dùng thật trải nghiệm: bấm chuột rồi gõ
// phím, không gọi hàm nội bộ.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const results = [];
const check = (condition, message) => results.push({ condition: Boolean(condition), message });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  const r = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }),
  }).then((x) => x.json());
  localStorage.setItem('pmo_token', r.token);
  localStorage.setItem('pmo_user', JSON.stringify(r.user));
});

// `/hq/issues` có nút mở hộp thoại "Tạo issue" — nằm ở trang tĩnh, không cần
// dữ liệu nào trước.
await page.goto(`${BASE}/hq/issues?project=1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const opener = page.locator('button', { hasText: /^Tạo issue$/ }).first();
const haveOpener = await opener.count() > 0;
check(haveOpener, 'trang /hq/issues có nút mở hộp thoại Tạo issue');

if (haveOpener) {
  await opener.click();
  const dialog = page.locator('[role="dialog"]');
  await dialog.waitFor({ state: 'visible', timeout: 5000 });

  // 1. Ngữ nghĩa hộp thoại: trình đọc màn hình cần biết đây là hộp thoại.
  check(await dialog.getAttribute('aria-modal') === 'true', 'hộp thoại khai báo aria-modal="true"');

  // 2. Focus phải vào trong hộp thoại, không nằm lại ở nút đã mở nó — nếu
  //    không, người dùng bàn phím gõ xuống trang phía sau lớp phủ.
  const focusInside = await page.evaluate(() => {
    const box = document.querySelector('[role="dialog"]');
    return Boolean(box && document.activeElement && box.contains(document.activeElement));
  });
  check(focusInside, 'mở hộp thoại thì focus nằm bên trong nó');

  // 3. Escape đóng được — đây là hành vi từng thiếu ở 9/10 hộp thoại.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(await page.locator('[role="dialog"]').count() === 0, 'Escape đóng được hộp thoại');

  // 4. Focus phải trả về nút đã mở, để người dùng tiếp tục được.
  const backOnOpener = await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Tạo issue');
  check(backOnOpener, 'đóng xong focus trả về đúng nút đã mở');

  // 5. Lớp phủ chồng nhau: Confirm bật đè lên hộp thoại đang mở. Escape một
  //    lần chỉ được đóng lớp trên cùng — đóng cả hai là mất nội dung đang
  //    nhập trong hộp thoại bên dưới.
  await opener.click();
  await page.locator('[role="dialog"]').first().waitFor({ state: 'visible', timeout: 5000 });
  const opened = await page.evaluate(() => {
    // Gọi confirm() như người dùng bấm một nút nguy hiểm bên trong hộp thoại.
    const btn = [...document.querySelectorAll('[role="dialog"] button')]
      .find((b) => /xoá|xóa|delete/i.test(b.textContent || ''));
    if (!btn) return false;
    btn.click();
    return true;
  });
  if (opened) {
    await page.waitForTimeout(500);
    const bothOpen = await page.locator('[role="dialog"]').count();
    if (bothOpen > 1) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      const remaining = await page.locator('[role="dialog"]').count();
      check(remaining === bothOpen - 1, `Escape chỉ đóng lớp trên cùng (còn ${remaining}/${bothOpen})`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    } else {
      check(true, 'hộp thoại này không mở Confirm chồng lên — bỏ qua kiểm tra lồng nhau');
    }
  } else {
    check(true, 'hộp thoại này không có nút xoá — bỏ qua kiểm tra lồng nhau');
  }
}

await browser.close();

const failures = results.filter((r) => !r.condition);
console.log(JSON.stringify({ total: results.length, failures: failures.length, results }, null, 2));
process.exit(failures.length ? 1 : 0);
