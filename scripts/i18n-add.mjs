#!/usr/bin/env node
// Trích nhãn tiếng Việt ra từ điển i18n, theo bảng ánh xạ do người viết.
//
//   node scripts/i18n-add.mjs <file> <map.json>
//
// `map.json` là mảng `[{ "vi": "…", "en": "…", "key": "tuỳ chọn" }]`. Bảng ánh xạ
// phải do người viết — tự dịch 700 chuỗi bằng máy là cách nhanh nhất để tạo ra
// những câu không đọc được cho khách hàng người Anh.
//
// Script này thay **hai** dạng: chuỗi trong nháy đơn (`'…'` → `t('key')`) và text
// node JSX (`>…<` → `{t('key')}`). Cố ý **không** đụng `th("…")` — đó là cơ chế
// riêng cho tiêu đề bảng, xem `i18n/th.js`.
//
// Ba bẫy đã mắc trong lúc làm, giữ lại để người sau không mắc lại:
//  1. `re.escape` rồi so khớp **chuỗi thường** — `re.escape` biến khoảng trắng
//     thành `\ `, nên không chuỗi nào chứa khoảng trắng mà khớp. Lần chạy đầu chỉ
//     thay 2/54.
//  2. Thêm `import { t }` có điều kiện "chưa có import i18n nào" — file đã có
//     `import { th, useLang }` thì điều kiện đúng và `t` không bao giờ được import.
//     Giờ luôn **bổ sung** vào danh sách có sẵn.
//  3. Tham số tên `t` trong callback (`setX((t) => t + 1)`) che hàm `t()` trong
//     phạm vi callback — đổi thành `(n) => n + 1`.
//
// Build **không** bắt được trường hợp `t` chưa import; chỉ `browser.mjs` trong gate
// mới thấy. Nên sau khi chạy, phải chạy gate.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [file, mapPath] = process.argv.slice(2);
if (!file || !mapPath) {
  console.error('Dùng: node scripts/i18n-add.mjs <file> <map.json>');
  process.exit(2);
}
const MAP = JSON.parse(readFileSync(mapPath, 'utf8'));
if (!Array.isArray(MAP) || !MAP.length) {
  console.error('Map phải là mảng không rỗng');
  process.exit(2);
}

const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ]/i;

const dictPath = (name) => `frontend/src/i18n/${name}`;
let src = readFileSync(file, 'utf8');
const start = src;
let replaced = 0;

// Dài trước: không thay nhầm chuỗi ngắn nằm trong chuỗi dài.
const ordered = [...MAP].sort((a, b) => b.vi.length - a.vi.length);
for (const entry of ordered) {
  // Mặc định bỏ qua chuỗi không có dấu tiếng Việt: phần lớn chúng là **dữ liệu**
  // (tên công ty, mã, thông báo lỗi từ server) và dịch chúng là sai. Nhưng có
  // nhãn tiếng Anh vốn dĩ (ví dụ `Manpower`, `Network`) vẫn cần dịch sang các
  // ngôn ngữ khác — khi đó đặt `"force": true` trong bảng ánh xạ, để quyết định
  // phải do người viết chứ không phải suy ra từ dấu thanh.
  if (!entry.vi) continue;
  if (!entry.force && !VIETNAMESE.test(entry.vi)) continue;
  const key = entry.key || `i18n.${entry.vi.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)}`;
  const quote = `'${entry.vi}'`;
  if (src.includes(quote)) {
    src = src.split(quote).join(`t('${key}')`);
    replaced += 1;
  }
  // Text node JSX: `>…<`. Cho phép xuống dòng, vì trong file thật rất nhiều nhãn
  // nằm một mình trên dòng riêng:
  //
  //     <button …>
  //       Gửi lại ngay
  //     </button>
  //
  // mà ở đó `>` và `<` nằm ở hai dòng khác nhau nên `>Nhãn<` không khớp — và nhãn
  // đó **không** được dịch, tức là bộ đo báo "còn chuỗi cứng" mà mình tưởng đã xử lý
  // xong.
  //
  // Ràng buộc: tối đa **một** dấu xuống dòng mỗi bên và tối đa 24 khoảng trắng thụt
  // lề. Bản đầu đặt 3 — quá chặt, vì thụt lề thật của JSX là 10–20 khoảng trắng nên
  // không nhãn nào ở dạng nhiều dòng khớp được. Số 24 vẫn đủ nhỏ để không nuốt
  // nhầm một khối JSX lớn giữa hai thẻ.
  const esc = entry.vi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Cờ `g` là bắt buộc. Bản đầu khởi tạo regex **không** có `g`, nên
  // `src.replace()` chỉ thay lần xuất hiện đầu tiên — hậu tố ngắn kiểu "quá hạn"
  // xuất hiện nhiều lần thì chỉ một chỗ được dịch, phần còn lại vẫn tiếng Việt mà
  // `replaced` vẫn báo là đã xong. Đếm bằng `match()` để con số phản ánh đúng.
  const textRe = new RegExp(`>[ \\t]*\\n?[ \\t]{0,24}${esc}[ \\t]{0,24}\\n?[ \\t]*<`, 'g');
  const hits = src.match(textRe);
  if (hits) {
    src = src.replace(textRe, `>{t('${key}')}<`);
    replaced += hits.length;
  }
  // Text node **lẫn biểu thức**: `>Đã chi {x} tỷ<`. Mẫu `>Nhãn<` ở trên không khớp
  // vì chữ không chạy liền tới `<`. Đây cũng là loại mà `check-i18n.mjs` đo được
  // nhưng trước đây không đo — nên bộ đo và bộ sửa phải nhìn thấy cùng một thứ.
  const exprRe = new RegExp(`>\\s*${esc}\\s*(?=\\{)`, 'g');
  const exprHits = src.match(exprRe);
  if (exprHits) {
    src = src.replace(exprRe, `>{t('${key}')}`);
    replaced += exprHits.length;
  }

  // Thuộc tính JSX `title="…"` — cũng là chữ người dùng đọc (tooltip). Chỉ khớp
  // dạng `tên="giá trị"`, không đụng chuỗi kép nằm giữa biểu thức.
  const attr = new RegExp(`(\\w+)="${entry.vi.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`, 'g');
  if (attr.test(src)) {
    src = src.replace(attr, `$1={t('${key}')}`);
    replaced += 1;
  }
  entry.key = key;
}

if (replaced === 0) {
  console.error(`  Không khớp chuỗi nào trong ${file} — kiểm tra lại bảng ánh xạ (thường là khác dấu hoặc khác khoảng trắng).`);
  process.exit(1);
}

// Bổ sung `t` vào import i18n sẵn có; không tạo import thứ hai.
// Giữ **nguyên văn** phần đường dẫn kèm dấu nháy. Bản đầu bắt `(\.\./)+` không
// kèm nháy rồi ghép lại bằng nối chuỗi, ra `from ../i18n/index.js'` — mất dấu nháy
// mở, cú pháp hỏng ngay dòng import.
// Chấp nhận cả `./` lẫn `../`: `App.jsx` nằm ở gốc `src` nên dùng
// `./i18n/index.js`, và bản chỉ nhận `../` sẽ tưởng file đó chưa import i18n.
const imp = src.match(/import \{([^}]*)\} from ('(?:(?:\.\.\/)|(?:\.\/))+i18n\/index\.js');/);
if (!imp) {
  console.error(`  ${file} chưa import i18n — thêm import thủ công rồi chạy lại.`);
  process.exit(1);
}
const names = imp[1].split(',').map((n) => n.trim()).filter(Boolean);
if (!names.includes('t')) {
  names.unshift('t');
  src = src.replace(imp[0], `import { ${names.join(', ')} } from ${imp[2]};`);
}

// Đổi tham số callback tên `t` để không che hàm `t()`.
src = src.replace(/\((t)\)\s*=>\s*t\s*\+/g, '(n) => n + 1');

writeFileSync(file, src);
console.log(`  ${file}: thay ${replaced} chỗ / ${new Set(MAP.map((m) => m.key)).size} khoá`);

// Bổ sung từ điển.
for (const name of ['vi.js', 'en.js']) {
  const p = dictPath(name);
  let dict = readFileSync(p, 'utf8');
  const todo = MAP.filter((m) => !dict.includes(`'${m.key}':`));
  if (!todo.length) continue;
  const block = `  // Trích tự động từ ${file}\n`
    + todo.map((m) => `  '${m.key}': '${(name === 'en.js' ? m.en : m.vi).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',\n`).join('');
  const anchor = '  // Shell chrome';
  if (!dict.includes(anchor)) { console.error(`  ${p}: không thấy neo "Shell chrome"`); process.exit(1); }
  dict = dict.replace(anchor, block + anchor, 1);
  writeFileSync(p, dict);
  console.log(`  ${p}: +${todo.length} khoá`);
}
console.log(`  (${start.length} → ${src.length} byte)`);
