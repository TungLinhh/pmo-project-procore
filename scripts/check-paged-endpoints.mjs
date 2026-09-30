#!/usr/bin/env node
// Gọi thật mọi endpoint vừa thêm phân trang, đủ các biến thể lọc.
//
// Vì sao cần: lỗi ở các route này là loại **im lặng** — body trả về thành object
// `{error}` thay vì mảng, và nơi gọi chỉ thấy "dữ liệu rỗng". Một truy vấn đếm
// thiếu JOIN đã làm hỏng `/payment-requests` trong khi các route khác vẫn 200.
//
// Bộ này gọi cả biến thể có bộ lọc, vì điều kiện `WHERE` dính bí danh bảng chỉ
// xuất hiện ở truy vấn có lọc.
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const email = process.env.PROBE_EMAIL || 'admin@hbg.com';
const password = process.env.PROBE_PASSWORD || 'admin123';

const token = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
}).then((r) => r.json()).then((b) => b.token);

if (!token) { console.error('  Không đăng nhập được'); process.exit(1); }

const CASES = [
  // [mô tả, path, có phải endpoint phân trang không]
  ['shop-drawings cơ bản', '/api/projects/1/shop-drawings?limit=25', true],
  ['shop-drawings + status', '/api/projects/1/shop-drawings?status=APPROVED&limit=25', true],
  ['shop-drawings + search', '/api/projects/1/shop-drawings?search=BOH&limit=25', true],
  ['shop-drawings trang sau', '/api/projects/1/shop-drawings?limit=25&offset=175', true],
  ['shop-drawings offset vượt', '/api/projects/1/shop-drawings?limit=25&offset=9999', true],
  ['issues', '/api/projects/1/issues?limit=25', true],
  ['issues + status', '/api/projects/1/issues?status=OPEN&limit=25', true],
  ['issues + severity', '/api/projects/1/issues?severity=HIGH&limit=25', true],
  ['issues + category', '/api/projects/1/issues?category=SAFETY&limit=25', true],
  ['qa-inspections', '/api/projects/1/qa-inspections?limit=25', true],
  ['bim-models', '/api/projects/1/bim-models?limit=25', true],
  ['audit', '/api/audit?limit=25', true],
  ['audit + lọc', '/api/audit?resource_type=issue&limit=25', true],
  ['material-submittals', '/api/material-submittals?project_id=1&status=SUBMITTED&limit=20', true],
  ['payment-requests', '/api/projects/1/payment-requests?status=PENDING&limit=20', true],
  ['payment-requests không lọc', '/api/projects/1/payment-requests?limit=25', true],
  // Route cũ, không phân trang: vẫn phải trả mảng.
  ['shop-drawings route cũ', '/api/shop-drawings?project_id=1', false],
  ['issues route cũ', '/api/issues?project_id=1', false],
];

let bad = 0;
for (const [name, path, paged] of CASES) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => null);
  const isArray = Array.isArray(body);
  const header = res.headers.get('X-Total-Count');
  const problems = [];
  if (res.status !== 200) problems.push(`HTTP ${res.status}`);
  if (!isArray) problems.push(`body không phải mảng: ${JSON.stringify(body).slice(0, 90)}`);
  if (paged && header === null) problems.push('thiếu X-Total-Count');
  if (paged && isArray && header !== null && Number(header) < body.length) {
    problems.push(`total(${header}) < số dòng trả về(${body.length})`);
  }
  if (problems.length) {
    bad += 1;
    console.log(`  ✗ ${name.padEnd(30)} ${problems.join('; ')}`);
  } else {
    console.log(`  ✓ ${name.padEnd(30)} ${body.length} dòng${header !== null ? `, total=${header}` : ''}`);
  }
}
console.log(bad ? `\n  ${bad}/${CASES.length} endpoint lỗi` : `\n  ${CASES.length}/${CASES.length} endpoint trả đúng hình dạng`);

// ---------------------------------------------------------------------------
// Giá trị `limit`/`offset` xấu phải bị kẹp, không được biến thành 500.
//
// `Math.min(parseInt(limit) || N, M)` — cách 11 route từng tự viết — **không** kẹp
// dưới. `?limit=-1` cho `-1` (truthy nên không rơi về mặc định), rồi
// `Math.min(-1, 500)` = `-1` ⇒ `LIMIT -1` ⇒ Postgres
// `ERROR: LIMIT must not be negative` ⇒ **500** thay vì 400. Đo trước khi sửa: 7
// URL trả 500.
//
// Nay tất cả đi qua `readPage()` của `lib/pagination.js` (kẹp trong [1, max]).
// Phần dưới gọi thật và kiểm tra **hành vi**, không đọc code: `?limit=2` phải ra
// ≤ 2 dòng, giá trị rác phải 200 và ra đúng số dòng của mặc định.
// ---------------------------------------------------------------------------
const HOSTILE = [
  // [nhãn, path không kèm query]
  ['projects/:id/materials', '/api/projects/1/materials'],
  ['projects/:id/manpower', '/api/projects/1/manpower'],
  ['projects/:id/construction-schedule', '/api/projects/1/construction-schedule'],
  ['projects/:id/material-submittals', '/api/projects/1/material-submittals'],
  ['projects/:id/invoices', '/api/projects/1/invoices'],
  ['shop-drawings', '/api/projects/1/shop-drawings'],
  ['issues', '/api/projects/1/issues'],
  ['qa-inspections', '/api/projects/1/qa-inspections'],
  ['payment-requests', '/api/projects/1/payment-requests'],
  ['audit', '/api/audit'],
  // Bỏ qua /api/audit/export: nó cố ý trả `{exported_at, count, rows}` chứ không
  // phải mảng thuần, nên phép kiểm 'body phải là mảng' không áp dụng.
  ['notifications', '/api/notifications'],
  ['daily-reports', '/api/projects/1/daily-reports'],
  ['work-items', '/api/projects/1/work-items'],
];

const junk = [
  ['limit=-1', 'limit=-1'], ['limit=-999999', 'limit=-999999'],
  ['limit=abc', 'limit=abc'], ['limit=0', 'limit=0'],
  ['limit=1e400', 'limit=1e400'], ['limit=1.9', 'limit=1.9'],
  ['offset=-5', 'offset=-5'],
  ['limit=-1&offset=-5', 'limit=-1&offset=-5'],
];

let hostileBad = 0;
for (const [name, path] of HOSTILE) {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const def = await res.json().catch(() => null);
  if (res.status !== 200 || !Array.isArray(def)) {
    console.log(`  ✗ ${name.padEnd(30)} mặc định: HTTP ${res.status}, không phải mảng`);
    hostileBad += 1;
    continue;
  }

  const problems = [];
  const two = await fetch(`${BASE}${path}?limit=2`, { headers: { Authorization: `Bearer ${token}` } });
  const twoBody = await two.json().catch(() => null);
  if (two.status !== 200) problems.push(`?limit=2 → HTTP ${two.status}`);
  else if (Array.isArray(twoBody) && twoBody.length > 2) problems.push(`?limit=2 trả ${twoBody.length} dòng`);

  for (const [label, qs] of junk) {
    const r = await fetch(`${BASE}${path}?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200) { problems.push(`?${label} → HTTP ${r.status}`); continue; }
    const b = await r.json().catch(() => null);
    if (!Array.isArray(b)) { problems.push(`?${label} không phải mảng`); continue; }
    // `limit=0` hợp lệ về kẹp [1,max] nên ra 1 dòng; các giá trị rác khác rơi về
    // mặc định. Chỉ khẳng định điều chắc chắn: không vượt quá mặc định.
    if (b.length > def.length) problems.push(`?${label} trả ${b.length} > mặc định ${def.length}`);
  }

  if (problems.length) {
    hostileBad += 1;
    console.log(`  ✗ ${name.padEnd(30)} ${problems.join('; ')}`);
  } else {
    console.log(`  ✓ ${name.padEnd(30)} ${def.length} dòng mặc định, chịu được ${junk.length} giá trị rác`);
  }
}

if (hostileBad) console.log(`\n  ${hostileBad}/${HOSTILE.length} endpoint không kẹp limit/offset`);
else console.log(`\n  ${HOSTILE.length}/${HOSTILE.length} endpoint kẹp đúng limit/offset`);

process.exit(bad + hostileBad ? 1 : 0);
