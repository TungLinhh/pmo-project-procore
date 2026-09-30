// Thanh phân trang phải dịch hết, kể cả đơn vị tính.
//
// Lý do có bài kiểm này: lần đầu chỉ dịch khung (`Hiển thị` → `Showing`) và bỏ sót
// đơn vị truyền từ nơi gọi, ra "Showing 1–25 of 203 **vật tư**". Đó chính là kiểu dịch
// nửa vời khiến người dùng bấm [VI|EN] rồi thấy vẫn tiếng Việt.
//
// Bài kiểm bắt đúng loại đó: bật EN rồi đòi thanh phân trang **không còn** ký tự
// có dấu tiếng Việt nào.
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ]/i;

const SCREENS = [
  ['/hq/materials?project=1', 'Vật tư'],
  ['/hq/manpower?project=1', 'Nhân lực'],
  ['/hq/issues?project=1', 'Sự cố'],
  ['/hq/shop?project=1', 'Bản vẽ shop'],
  ['/hq/audit', 'Nhật ký kiểm tra'],
  ['/hq/qa?project=1', 'QA/QC'],
  ['/hq/master-data?r=workers', 'Dữ liệu chủ'],
  // Dải hướng dẫn AI: nằm ở màn AI, không phải màn bảng, nên kiểm riêng.
  ['/hq/assistant?project=1', 'Trợ lý AI'],
];

// Vùng kiểm riêng: không phải thanh phân trang.
const REGIONS = [
  { path: '/hq/assistant?project=1', name: 'Trợ lý AI', selector: '.ai-guide' },
];

// Tiêu đề trang (`h1`) + dòng tóm tắt ngay dưới. Đây là phần **chrome** — người
// dùng bấm [VI|EN] thì kỳ vọng tiêu đề đổi theo. Bảng dữ liệu nghiệp vụ thì không:
// tên hợp đồng, tên nhà cung cấp giữ nguyên ngôn ngữ nhập, đó là chủ ý.
const HEADINGS = [
  ['/hq?project=1', 'Control Center'],
  ['/hq/payment?project=1', 'Thanh toán'],
  ['/hq/assistant?project=1', 'Trợ lý AI'],
  ['/hq/approval?project=1', 'Phê duyệt'],
  ['/hq/ops', 'Vận hành'],
  ['/hq/materials?project=1', 'Vật tư'],
  ['/hq/issues?project=1', 'Sự cố'],
  ['/hq/shop?project=1', 'Bản vẽ shop'],
  ['/hq/master-data?r=workers', 'Dữ liệu chủ'],
];

const results = [];
const check = (ok, message) => results.push({ condition: Boolean(ok), message });

const browser = await chromium.launch({ headless: true });
try {
  for (const lang of ['vi', 'en']) {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    // Đặt ngôn ngữ trước khi app nạp, **không bấm nút [VI|EN]**: bấm nút thật sẽ
    // `PUT /api/me/locale` và đổi luôn `users.locale` của tài khoản demo trong DB —
    // một phép đo lại giữ nguyên trạng thái. Đặt từ đầu chỉ đụng context của
    // trình duyệt tạm nên vô hại, và vẫn kiểm đúng thứ người dùng thấy khi mở
    // trang bằng ngôn ngữ đó.
    await ctx.addInitScript((l) => localStorage.setItem('pmo_lang', l), lang);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@hbg.com', password: 'admin123' }),
      }).then((x) => x.json());
      localStorage.setItem('pmo_token', r.token);
      localStorage.setItem('pmo_user', JSON.stringify(r.user));
    });

    for (const [path, name] of SCREENS) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1800);
      const bar = page.locator('.table-pagination').first();
      if (!(await bar.count())) continue; // màn không có bảng phân trang
      const text = (await bar.innerText()).replace(/\s+/g, ' ').trim();
      if (lang === 'en') {
        check(!VIETNAMESE.test(text), `${name}: chế độ EN không còn tiếng Việt — "${text}"`);
      } else {
        check(VIETNAMESE.test(text), `${name}: chế độ VI hiện tiếng Việt`);
      }
    }

    for (const [path, name] of HEADINGS) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1600);
      const h1 = ((await page.locator('h1').first().textContent().catch(() => '')) || '').trim();
      if (!h1) { check(false, `${name}: không tìm thấy tiêu đề trang`); continue; }
      if (lang === 'en') check(!VIETNAMESE.test(h1), `${name}: tiêu đề đã dịch — "${h1}"`);
      else check(VIETNAMESE.test(h1), `${name}: tiêu đề hiện tiếng Việt — "${h1}"`);
    }

    // Dải hướng dẫn AI: kiểm phần **tiêu đề**, không kiểm toàn bộ văn bản dài —
    // văn bản dài trong ai-guidance.js còn chưa dịch và nằm trong ratchet.
    for (const region of REGIONS) {
      await page.goto(`${BASE}${region.path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1800);
      const toggle = page.locator('.ai-guide-toggle').first();
      if (!(await toggle.count())) { check(false, `${region.name}: không thấy dải hướng dẫn`); continue; }
      const title = (await toggle.innerText()).replace(/\s+/g, ' ').trim();
      if (lang === 'en') check(!VIETNAMESE.test(title), `${region.name}: tiêu đề dải đã dịch — "${title}"`);
      else check(VIETNAMESE.test(title), `${region.name}: tiêu đề dải hiện tiếng Việt`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

const failures = results.filter((r) => !r.condition);
console.log(JSON.stringify({ total: results.length, failures: failures.length, results }, null, 2));
process.exit(failures.length ? 1 : 0);
