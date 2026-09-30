#!/usr/bin/env node
// Biến các cảnh báo lint thành lỗi, cho đúng những quy tắc báo về hỏng lúc chạy.
//
// Vì sao cần: `oxlint` mặc định **thoát 0 dù có cảnh báo**, nên `npm run lint`
// báo "78 warnings" mà vẫn xanh. Đã có hậu quả thật:
//
//   8 chỗ dùng `<Modal>` ở 6 file mà **không import**. Build **thành công**
//   (Rollup không coi biến chưa định nghĩa ở phạm vi module là lỗi), lint chỉ cảnh
//   báo, và gate cũng xanh — vì không test nào bấm nút mở modal đó. Người dùng bấm
//   `Tải Excel` ở Trung tâm điều khiển thì trang sập với
//   `ReferenceError: Modal is not defined`.
//
//   node scripts/check-frontend-lint.mjs
//
// Chỉ `deny` những quy tắc báo lỗi lúc chạy hoặc lỗi rõ ràng. `set-state-in-effect`
// và `exhaustive-deps` **không** deny: chúng là mối lo về hiệu năng và cảnh báo
// hợp lệ, ép sạch sẽ sinh code tệ hơn (giả vờ) thay vì sửa.
//
// Đọc output dạng JSON chứ không parse text: oxlint đổi cách in giữa các bản, còn
// JSON thì ổn định và cho đúng số dòng/dấu ngay.
import { spawnSync } from 'node:child_process';

// `react/jsx-no-undef` → oxlint báo mã `react(jsx-no-undef)`.
const DENY_CODES = new Set([
  'react(jsx-no-undef)',
  'eslint(no-undef)',
  'no-undef',
  'eslint(no-unused-vars)',
  'no-unused-vars',
  'react(refs)',
  'react(immutability)',
]);

const res = spawnSync('npx', ['oxlint', '--format=json', 'src'], {
  encoding: 'utf8', cwd: 'frontend', maxBuffer: 32 * 1024 * 1024,
});

let data;
try {
  data = JSON.parse(res.stdout || '{}');
} catch {
  console.error('  ✗ không đọc được output JSON của oxlint — bản oxlint có thể đã đổi.');
  process.exit(1);
}

const all = data.diagnostics || [];
const denied = all.filter((d) => DENY_CODES.has(d.code));
const warnings = all.length - denied.length;

if (!denied.length) {
  console.log(`  ✓ không có lỗi lint chạy được (còn ${warnings} cảnh báo không chặn)`);
  process.exit(0);
}

console.log(`  ✗ ${denied.length} lỗi lint chặn được (ngoài ra còn ${warnings} cảnh báo không chặn):`);
for (const d of denied) {
  const where = d.labels?.[0]?.span;
  const line = where ? `${d.filename}:${where.offset !== undefined ? '' : ''}` : d.filename;
  const pos = where?.offset;
  console.log(`     ${d.code}  ${d.filename}${pos !== undefined ? ` (offset ${pos})` : ''}`);
  console.log(`        ${d.message}`);
}
console.log('\n     Sửa: thêm import thiếu, bỏ tên không dùng, hoặc dùng useEffect/useEvent đúng chỗ.');
process.exit(1);
