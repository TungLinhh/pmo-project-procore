#!/usr/bin/env node
// Tiêu đề bảng dùng `th("…")` nhưng **không có** trong `i18n/th.js`.
//
// `th()` cố tình không ném lỗi khi thiếu bản dịch — nó trả về nguyên tiếng Việt
// để nhãn không biến mất. Đổi sang EN thì cột đó **giữ nguyên tiếng Việt**, và
// không có gì báo động. Bài kiểm này là chỗ báo động đó.
//
// Vì sao bộ đo `check-i18n.mjs` không thấy: nó cố ý bỏ `th("…")` khỏi số đếm,
// vì đó là cơ chế dịch riêng. Hệ quả là một tiêu đề `th()` thiếu bản dịch hoàn toàn
// vô hình với bộ đo — và vô hình cả với người đọc.
//
//   node scripts/check-table-headers.mjs
import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'frontend/src';
const th = readFileSync(join(SRC, 'i18n', 'th.js'), 'utf8');
const known = new Set((th.match(/^\s*'([^']+)':/gm) || []).map((m) => m.match(/'([^']+)':/)[1]));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.jsx') ? [p] : [];
  });
}

// `th("…")` và `th('…')` — cả hai kiểu nháy đều dùng trong codebase.
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ]/i;
const used = new Map();
for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/\bth\(\s*(['"])((?:[^'"\\]|\\.)*?)\1/g)) {
    const label = m[2];
    if (!label.trim()) continue;
    // CHỈ báo tiêu đề **có dấu tiếng Việt**. Tiêu đề vốn đã là tiếng Anh (`Model`,
    // `Status`, `L1`, `ID`) hiện giống nhau ở cả hai chế độ — đó là đúng, `th()` trả
    // nguyên văn khi không có bản dịch, nên không cần báo. Bản đầu báo cả 61
    // tiêu đề, trong đó chỉ 6 là thật sự hỏng; phần dư là nhiễu làm người đọc
    // bỏ qua cả thông báo.
    if (!VIETNAMESE.test(label)) continue;
    if (!used.has(label)) used.set(label, []);
    used.get(label).push(`${file}:${src.slice(0, m.index).split('\n').length}`);
  }
}

// Nhãn cột của màn Dữ liệu chủ nằm trong mảng dữ liệu `master-data-columns.js` và
// được `th()` áp lúc render, nên không xuất hiện dưới dạng `th("…")` trong mã.
// Bộ đo `check-i18n.mjs` miễn trừ chúng, nên **đây** là chỗ bảo đảm chúng thật sự
// có bản dịch — bỏ miễn trừ ở đó mà bỏ kiểm tra ở đây là để nhãn cột hỏng im lặng.
const columnsFile = join(SRC, 'governance', 'master-data-columns.js');
if (existsSync(columnsFile)) {
  for (const m of readFileSync(columnsFile, 'utf8').matchAll(/\['[a-z_]+',\s*'([^']+)'\]/g)) {
    if (!VIETNAMESE.test(m[1])) continue;
    if (!used.has(m[1])) used.set(m[1], []);
    used.get(m[1]).push(columnsFile.replace(`${SRC}/`, 'frontend/src/'));
  }
}

const missing = [...used.entries()].filter(([label]) => !known.has(label));
if (missing.length) {
  console.log(`  ✗ ${missing.length} tiêu đề bảng dùng th() nhưng thiếu bản dịch — ở chế độ EN cột đó vẫn hiện tiếng Việt:`);
  for (const [label, places] of missing) {
    console.log(`     "${label}"  (${places.length} chỗ: ${places[0]}${places.length > 1 ? ', …' : ''})`);
  }
  console.log('\n     Cách sửa: thêm vào HEADERS_EN trong frontend/src/i18n/th.js');
} else {
  console.log(`  ✓ mọi tiêu đề bảng có dấu tiếng Việt đều có bản dịch`);
}
process.exit(missing.length ? 1 : 0);
