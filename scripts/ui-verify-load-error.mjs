// Chứng minh lỗi tải dữ liệu không còn im lặng.
//
// Trước đợt 7, `projects.list().then(…)` ở 6 màn không có `.catch`. Khi API hỏng,
// ô chọn dự án trống, bảng trống, và **không có gì** để người dùng hiểu vì sao —
// trông y hệt trường hợp "dự án chưa có dữ liệu".
//
// Cách kiểm: chặn `GET /api/projects` ở cấp trình duyệt rồi mở màn, đòi thấy thông
// báo lỗi. Chặn ở tầng trình duyệt là đủ vì đây là đường người dùng thật gặp
// (mạng yếu, API restart, phiên hết hạn).
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const results = [];
const check = (condition, message) => results.push({ condition: Boolean(condition), message });

// Mỗi màn: đường dẫn + nhãn thông báo lỗi mà người dùng phải thấy.
const SCREENS = [
  ['/hq/issues?project=1', 'Sự cố', 'Không tải được danh sách dự án'],
  ['/hq/materials?project=1', 'Vật tư', 'Không tải được danh sách dự án'],
  ['/hq/shop?project=1', 'Bản vẽ shop', 'Không tải được danh sách dự án'],
  ['/hq/payment?project=1', 'Thanh toán', 'Không tải được danh sách dự án'],
  ['/hq/otd', 'OTD', 'Không tải được danh sách dự án'],
  ['/hq/manpower?project=1', 'Nhân lực', 'Không tải được danh sách dự án'],
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Đăng nhập trước khi chặn, nếu không sẽ không vào được app.
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.evaluate(async () => {
  const r = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }),
  }).then((x) => x.json());
  localStorage.setItem('pmo_token', r.token);
  localStorage.setItem('pmo_user', JSON.stringify(r.user));
});

for (const [path, name, expect] of SCREENS) {
  // Chặn riêng từng màn: bỏ chặn trước khi thử màn kế tiếp.
  await page.unroute('**/api/projects*').catch(() => {});
  await page.route('**/api/projects*', (route) => route.abort('failed'));
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const text = await page.locator('body').innerText().catch(() => '');
  check(text.includes(expect), `${name}: API hỏng vẫn báo lỗi cho người dùng`);
  check(!text.includes('undefined'), `${name}: không lộ chữ "undefined" khi lỗi`);
}

await browser.close();
const failures = results.filter((r) => !r.condition);
console.log(JSON.stringify({ total: results.length, failures: failures.length, results }, null, 2));
process.exit(failures.length ? 1 : 0);
