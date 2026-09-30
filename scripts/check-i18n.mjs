#!/usr/bin/env node
// Đo phủ i18n và chặn việc tăng thêm.
//
// Vì sao cần máy đo thay vì đếm bằng mắt: 617 chuỗi tiếng Việt còn nằm cứng
// trong JSX. Không ai nhớ được con số đó giữa các đợt sửa, nên nó hoặc bị bỏ quên
// hoặc bị làm tăng lên mà không ai hay.
//
// **Ratchet, không phải ngưỡng cứng:** script chỉ đỏ khi một file có NHIỀU chuỗi
// cứng hơn mức đã ghi nhận. Giảm là tiến bộ và được ghi nhận; tăng là hồi quy và
// bị chặn. Như vậy việc dịch từng màn là tiến trình nhiều lần thay vì một lần
// hoặc không làm.
//
//   node scripts/check-i18n.mjs            (kiểm, exit 1 nếu hồi quy)
//   node scripts/check-i18n.mjs --report   (in bảng, không exit 1)
//   node scripts/check-i18n.mjs --ratchet (ghi lại mức hiện tại — làm khi chủ động)
//
// Ngoài ra kiểm **parity** VI/EN: một khoá có ở `vi.js` mà thiếu ở `en.js` sẽ khiến
// chế độ EN rơi về tiếng Việt **không báo lỗi** — đúng loại lỗi người dùng chỉ thấy
// khi bấm nút [VI|EN].
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'frontend/src';
const BASE = 'scripts/i18n-baseline.json';
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ]/i;

const mode = process.argv[2];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    // Cả `.js`, không chỉ `.jsx`. Bản đầu chỉ quét `.jsx` nên **file dữ liệu dạng
    // `.js` hoàn toàn vô hình** — và nhãn cột bảng của màn Dữ liệu chủ nằm ở
    // `governance/master-data-columns.js`. Bộ đo báo file đó "0 chuỗi cứng" trong
    // khi bảng hiện `MÃ` · `TÊN` · `LIÊN HỆ` ở cả chế độ EN.
    return statSync(p).isDirectory() ? walk(p) : /\.(jsx|js)$/.test(p) ? [p] : [];
  });
}

// Đếm chuỗi có dấu tiếng Việt nằm trong nháy đơn/nháy kép mà **không** phải khoá
// tra cứu. Bỏ qua `i18n/` vì đó là nơi chứa bản dịch, không phải chỗ hardcode.
// Chuỗi cấm dịch — xem `i18n-allow.mjs` để biết vì sao từng chuỗi phải giữ
// nguyên. Không bỏ qua danh sách này thì số "còn lại" luôn lớn hơn thực tế.
//
// Hạ chữ thường **ngay khi dựng tập**: phép so khớp bên dưới dùng `.toLowerCase()`,
// nên nếu để nguyên thì mọi mục viết hoa sẽ không bao giờ khớp và im lặng không
// được miễn trừ. Bản đầu chỉ chứa toàn chữ thường nên lỗi này ẩn; phải thêm một
// mục có hoa thường mới thấy.
import ALLOW from './i18n-allow.mjs';
const ALLOWED = new Set(Object.values(ALLOW).flat().map((x) => x.toLowerCase()));

// Loại dương tính giả. Mẫu `>([^<>\n{]*…)` không biết mình đang ở trong JSX hay
// trong mã, nên nó cũng khớp những thứ như `new RegExp(`(^|[^a-zà-ỹ])${…}`)` hay
// `> 'pass')) toast.success(...)`. Dấu hiệu của mã: có backtick, `$`, `=>`, hay từ
// khoá khai báo. Dấu hiệu của **nhãn**: chỉ chữ, số, dấu câu và khoảng trắng.
const CODE_SMELL = /[`$]|=>|\b(?:const|let|var|return|if|for|while|function|new|import|export)\b|==|RegExp/;
const isLabelLike = (text) => text.length <= 140 && !CODE_SMELL.test(text);

function countHardcoded(file) {
  const src = readFileSync(file, 'utf8');
  // Bỏ lời gọi đã dịch…
  // `th()` phải bỏ ở **cả hai** kiểu nháy: `th('…')` và `th("…")` đều là
  // tiêu đề bảng đã được dịch qua `i18n/th.js`. Bản đầu chỉ bỏ nháy đơn nên
  // 26 tiêu đề `th("…")` ở Payment bị đếm nhầm là chuỗi cứng.
  let s = src
    .replace(/\bt\(\s*'[^']*'\s*\)/g, '')
    .replace(/\bt\(\s*"[^"]*"\s*\)/g, '')
    .replace(/\bth\(\s*'[^']*'\s*\)/g, '')
    .replace(/\bth\(\s*"[^"]*"\s*\)/g, '');
  // …và bỏ **comment**. Comment trong mã này viết bằng tiếng Việt và không bao
  // giờ hiện cho người dùng; đếm chúng làm số đo sai nghĩa. Lần đo đầu tiên
  // không bỏ, nên ControlCenter báo 85 trong khi người dùng chỉ thấy 2.
  s = s.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  let n = 0;
  for (const m of s.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"/g)) {
    const v = (m[1] ?? m[2] ?? '').trim();
    if (VIETNAMESE.test(v) && !ALLOWED.has(v.toLowerCase())) n += 1;
  }
  // Text node JSX: `>Nhãn<`. Bản đầu **không** đếm cái này, nên số "còn lại" báo ra
  // luôn thấp hơn thật — và tệ hơn: nó báo 0 ở những file mà nhãn còn lại chỉ nằm
  // trong text node, khiến tưởng đã dịch xong. Đo thật trên trình duyệt mới thấy
  // 9 nhãn tiếng Việt còn sót ở `/field` trong khi bộ đo báo 2.
  //
  // Cho phép tối đa một dấu xuống dòng mỗi bên và 24 khoảng trắng thụt lề, vì
  // nhãn trong JSX thật hay nằm một mình trên dòng riêng:
  //     <button …>
  //       Gửi lại ngay
  //     </button>
  // và ở đó `>` là ký tự cuối của `/>` nên mẫu `>Nhãn<` cứng không khớp.
  //
  // Không đếm trùng với nháy: thuộc tính luôn có `=` hoặc `{` ngay trước giá trị
  // nên không có `>` sát chữ, và thẻ con làm `>` … `<` không thành một đoạn liền.
  for (const m of s.matchAll(/>[ \t]*\n?[ \t]{0,24}([^<>\n][^<>{}]*?)[ \t]{0,24}\n?[ \t]*</g)) {
    const text = (m[1] || '').replace(/\s+/g, ' ').trim();
    if (text && VIETNAMESE.test(text) && !ALLOWED.has(text.toLowerCase())) n += 1;
  }
  // Text node **lẫn biểu thức**: `>Đã chi {x} tỷ · {y} giá trị<`. Mẫu ở trên đòi
  // chữ chạy liền từ `>` đến `<`, nên bất kỳ nhãn nào có `{…}` xen giữa đều lọt —
  // và lọt **im lặng**, vì bộ đo báo mọc thấp hơn thực tế chứ không báo sai.
  // Đo được 19 chuỗi như vậy ở 6 màn sau khi bộ đo đã báo 0.
  for (const m of s.matchAll(/>([^<>\n{]*[àáảãạăâêôơưđĐ][^<>\n{]*)(?=\{)/g)) {
    const text = (m[1] || '').replace(/\s+/g, ' ').trim();
    if (text && isLabelLike(text) && !ALLOWED.has(text.toLowerCase())) n += 1;
  }
  // Chữ **sau** biểu thức: `{item.label} · trễ {n}d`. Hai mẫu trên đều bỏ sót vì
  // chữ tiếng Việt nằm *giữa* hai `{…}`, không phải sát `>`.
  for (const m of s.matchAll(/(?<=\})([^<>\n{]*[àáảãạăâêôơưđĐ][^<>\n{]*)(?=\{)/g)) {
    const text = (m[1] || '').replace(/\s+/g, ' ').trim();
    if (text && isLabelLike(text) && !ALLOWED.has(text.toLowerCase())) n += 1;
  }
  return n;
}

const current = {};
let total = 0;
for (const f of walk(SRC)) {
  if (f.startsWith(join(SRC, 'i18n'))) continue;
  const n = countHardcoded(f);
  if (n > 0) { current[f] = n; total += n; }
}

// --- parity VI/EN ---
const keySet = (file) => new Set(Object.keys((readFileSync(join(SRC, 'i18n', file), 'utf8').match(/^\s*'([^']+)':/gm) || [])
  .map((m) => m.match(/'([^']+)':/)[1])));
const viKeys = keySet('vi.js');
const enKeys = keySet('en.js');
const missingEn = [...viKeys].filter((k) => !enKeys.has(k));
const missingVi = [...enKeys].filter((k) => !viKeys.has(k));

if (mode === '--why') {
  const file = process.argv[3];
  if (!file) { console.error('Dùng: node scripts/check-i18n.mjs --why <file>'); process.exit(2); }
  const src = readFileSync(file, 'utf8');
  const s2 = src
    .replace(/\bt\(\s*'[^']*'\s*\)/g, '').replace(/\bt\(\s*"[^"]*"\s*\)/g, '')
    .replace(/\bth\(\s*'[^']*'\s*\)/g, '').replace(/\bth\(\s*"[^"]*"\s*\)/g, '')
    .replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of s2.matchAll(/'([^'\\\n]*)'|"([^"\\\n]*)"/g)) {
    const v = m[1] ?? m[2] ?? '';
    if (VIETNAMESE.test(v) && !ALLOWED.has(v.trim().toLowerCase())) console.log(`  QUOTE: ${JSON.stringify(v).slice(0, 90)}`);
  }
  for (const m of s2.matchAll(/>[ \t]*\n?[ \t]{0,24}([^<>\n][^<>{}]*?)[ \t]{0,24}\n?[ \t]*</g)) {
    const t2 = (m[1] || '').replace(/\s+/g, ' ').trim();
    if (t2 && VIETNAMESE.test(t2) && !ALLOWED.has(t2.toLowerCase())) console.log(`  TEXT : ${JSON.stringify(t2).slice(0, 90)}`);
  }
  // Cùng loại như trên nhưng text node lẫn `{…}` — phải in ra đây, nếu không
  // `--why` báo "0 dòng" trong khi bộ đếm ra con số khác.
  for (const m of s2.matchAll(/>([^<>\n{]*[àáảãạăâêôơưđĐ][^<>\n{]*)(?=\{)/g)) {
    const t3 = (m[1] || '').replace(/\s+/g, ' ').trim();
    if (t3 && isLabelLike(t3) && !ALLOWED.has(t3.toLowerCase())) console.log(`  TEXT+ : ${JSON.stringify(t3).slice(0, 90)}`);
  }
  for (const m of s2.matchAll(/(?<=\})([^<>\n{]*[àáảãạăâêôơưđĐ][^<>\n{]*)(?=\{)/g)) {
    const t4 = (m[1] || '').replace(/\s+/g, ' ').trim();
    if (t4 && isLabelLike(t4) && !ALLOWED.has(t4.toLowerCase())) console.log(`  MID   : ${JSON.stringify(t4).slice(0, 90)}`);
  }
  process.exit(0);
}

if (mode === '--report') {
  const rows = Object.entries(current).sort((a, b) => b[1] - a[1]);
  for (const [f, n] of rows) console.log(`  ${String(n).padStart(4)}  ${f.replace(`${SRC}/`, '')}`);
  console.log(`\n  tổng ${total} chuỗi cứng ở ${rows.length} file`);
  console.log(`  parity: VI ${viKeys.size} khoá · EN ${enKeys.size} khoá`);
} else {
  let baseline = {};
  try { baseline = JSON.parse(readFileSync(BASE, 'utf8')); } catch { /* chưa có */ }

  if (mode === '--ratchet') {
    writeFileSync(BASE, `${JSON.stringify({ total, files: current }, null, 2)}\n`);
    console.log(`  đã ghi mức mới: ${total} chuỗi ở ${Object.keys(current).length} file → ${BASE}`);
    process.exit(0);
  }

  const problems = [];
  for (const [f, n] of Object.entries(current)) {
    const was = baseline.files?.[f] ?? 0;
    if (n > was) problems.push(`${f.replace(`${SRC}/`, '')}: ${was} → ${n} (+${n - was})`);
  }
  for (const k of missingEn) problems.push(`thiếu ở en.js: ${k}`);
  for (const k of missingVi) problems.push(`thiếu ở vi.js: ${k}`);

  const was = baseline.total ?? total;
  const trend = total === was ? 'không đổi' : total < was ? `↓ ${was - total}` : `↑ ${total - was}`;
  console.log(`  chuỗi cứng: ${total} (mức đã ghi nhận ${was}, ${trend}) · parity VI/EN: ${viKeys.size}/${enKeys.size}`);

  if (problems.length) {
    for (const p of problems) console.log(`  ✗ ${p}`);
    console.log(`\n  ${problems.length} vấn đề. Dịch thêm để giảm, hoặc chạy --ratchet khi chủ động chấp nhận mức mới.`);
  } else {
    console.log('  ✓ không tăng thêm, VI/EN đủ khoá');
  }
  process.exit(problems.length ? 1 : 0);
}
