#!/usr/bin/env node
// Mọi chuỗi mà `t()` và `th()` nhận phải tồn tại trong **đúng** bảng mà nó tra.
//
// Vì sao cần:
//   * `t()` trả về **chính khoá** khi không tìm thấy (`i18n/index.js`:
//     `d[key] ?? vi[key] ?? key`) ⇒ UI hiện thẳng `G.FILTER`, không lỗi console.
//   * `th()` ở chế độ VI trả **nguyên đối số** (`if (lang === 'vi') return label;`)
//     ⇒ `th('File')` hiện `File` trên giao diện tiếng Việt, và ở chế độ EN
//     `HEADERS_EN['File']` không có nên "đúng một cách tình cờ".
//
// **Hai hàm tra hai bảng khác nhau**: `t()` → `i18n/vi.js` + `i18n/en.js`;
// `th()` → `i18n/th.js`. Bản đầu của bộ kiểm này gộp cả hai vào `vi.js`/`en.js` nên
// báo 68 lỗi giả cho `th()` sau khi 73 lời gọi `th()` được đổi sang tiếng Việt.
//
// `scripts/check-i18n.mjs` **không** bắt được lớp này: nó đếm chuỗi có dấu tiếng Việt
// trong JSX, còn lỗi khoá thiếu là chuyện của từ điện. Đã mắc thật ở đợt 14: script
// dịch ghi **literal** làm khoá thay vì khoá `g.*` ⇒ 51 khoá hỏng, chỉ khi chạy trình
// duyệt mới thấy `G.FILTER` trên màn hình; `check-i18n.mjs` vẫn xanh.
//
//   node scripts/check-i18n-keys.mjs
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'frontend/src';
const I18N = join(SRC, 'i18n');

// Quét **mọi** chuỗi nguyên văn, không giới hạn theo hình dạng khoá: quy ước của
// repo là truyền chữ Việt làm khoá cho `th()`, nên mẫu `^[a-z0-9_.]+$` bỏ sót 231 chỗ.
const CALL_T = /\bt\(\s*(['"])([^'"]+)\1/g;
const CALL_TH = /\bth\(\s*(['"])([^'"]+)\1/g;

// `th()` chỉ cần khoá ở phía EN. Ở phía VI nó trả nguyên đối số, nên đối số phải là
// chữ Việt — trừ khi là mã/ký hiệu, liệt kê ở đây kèm lý do.
const CODE_OK = new Set([
  '#', '…', 'ID', 'MST', 'VAT', 'HTTP', 'Cache', 'Sheet', 'Schema', 'Spaces',
  'As-built', 'OTD %', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'L1', 'L2',
  'KH', 'TT', 'VA', 'USD', 'QA/QC',
]);
// Lớp ký tự **đầy đủ** — dùng y hệt `check-i18n.mjs` và `check-table-headers.mjs`.
// Bản đầu của file này dùng lớp hẹp (`[àáảãạăâêôơưđĐ]`) nên bỏ sót 55/63 ký tự
// dính dấu, thiếu hẳn nhóm `ệ ộ ớ ự ầ ằ` — và báo nhầm "KHÔNG có dấu tiếng Việt" cho
// những khoá hoàn toàn là tiếng Việt như `Hệ thống`, `Mở`, `Thời gian`.
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụừứửữựỳýỷỹỵđĐ]/i;

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === 'i18n' ? [] : walk(p);
    return /\.(jsx|js)$/.test(p) ? [p] : [];
  });
}

// Đọc khoá ở cấp đỉnh của từ điển: `  'khoá': …`.
function dictKeys(file) {
  const keys = new Set();
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s{2}'([^']+)':/);
    if (m) keys.add(m[1]);
  }
  return keys;
}

const vi = dictKeys(join(I18N, 'vi.js'));
const en = dictKeys(join(I18N, 'en.js'));
const thEn = dictKeys(join(I18N, 'th.js'));

const problems = [];
const usedT = new Set();
const usedTh = new Set();

function note(kind, key, file, detail) {
  problems.push({ kind, key, file, detail });
}

for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(CALL_T)) {
    const key = m[2];
    usedT.add(key);
    if (!vi.has(key)) note('t', key, file, 'thiếu ở vi.js');
    if (!en.has(key)) note('t', key, file, 'thiếu ở en.js');
  }
  for (const m of src.matchAll(CALL_TH)) {
    const key = m[2];
    usedTh.add(key);
    // Mã/ký hiệu (`ID`, `#`, `L1`, `OTD %`, `KH`, `TT`) viết giống nhau ở cả hai
    // ngôn ngữ nên không cần khoá trong th.js. Mọi thứ khác thì phải có.
    if (!thEn.has(key) && !CODE_OK.has(key)) {
      note('th', key, file, VIETNAMESE.test(key) || CODE_OK.has(key)
        ? 'thiếu trong th.js — chế độ EN sẽ hiện nguyên tiếng Việt'
        : 'KHÔNG có dấu tiếng Việt — chế độ VI hiện chữ Anh; đổi đối số sang tiếng Việt');
    }
  }
}

if (problems.length) {
  console.log(`  ✗ ${problems.length} lời gọi dịch không có bản dịch:`);
  for (const p of problems.slice(0, 40)) {
    console.log(`     ${p.kind}('${p.key}') — ${p.detail}  (${p.file})`);
  }
  if (problems.length > 40) console.log(`     … và ${problems.length - 40} lời gọi nữa`);
  console.log('\n     Sửa `t()`: thêm khoá vào `i18n/vi.js` và `i18n/en.js`.');
  console.log('     Sửa `th()`: đổi đối số sang tiếng Việt và thêm vào `i18n/th.js`.');
  process.exit(1);
}

const orphans = [...vi].filter((k) => !usedT.has(k)).length;
console.log(`  ✓ ${usedT.size} khoá t() có ở cả vi.js+en.js, ${usedTh.size} tiêu đề th() có trong th.js`
  + (orphans ? ` (${orphans} khoá trong từ điển chưa thấy gọi tĩnh — có thể gọi động)` : ''));
