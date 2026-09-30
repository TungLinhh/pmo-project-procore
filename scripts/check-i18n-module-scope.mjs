#!/usr/bin/env node
// `t()` / `th()` ở **cấp module** ⇒ nhãn đóng băng, không bao giờ đổi theo ngôn ngữ.
//
// Vì sao: `frontend/src/i18n/index.js` giữ `let lang` và `t()` đọc nó **lúc gọi**.
// Nhưng `const STATUS_LABELS = { PENDING: t('pay.st_waiting') }` ở thân module chỉ
// chạy **một lần**, lúc module được import — trước khi người dùng kịt bấm nút
// [VI|EN]. React không bao giờ tính lại biểu thức nằm ngoài thân component, nên nhãn
// giữ nguyên ngôn ngữ lúc tải trang cho tới lần tải lại kế tiếp.
//
// Cùng lớp lỗi này đã mắc ở `Materials.jsx`, `Ops.jsx`, `FieldStubs.jsx` và
// `PRIORITY` ở `Attention.jsx` (xem `docs/CODEBASE_BUG_AUDIT.md` mục 11.14). Chính
// `i18n/index.js` đã viết quy tắc:
//   "Cách đúng: để ở dạng hàm và gọi lúc render, kèm `useLang()` trong component"
// — bài này kiểm đúng điều kiện đó thay vì tin rằng đã làm theo.
//
// Cách dò: bảng nhãn ở cấp module luôn được viết là `const X = {` / `const X = [`
// ở **cột 0**, phần tử bên trong thụt lồn 2. Nên chỉ cần biết: dòng này có nằm
// trong một khối `const` mở ở cột 0 không. Bản đầu dùng đếm ngoặc `{`/`}` và báo
// nhầm mọi lời gọi `t()` bên trong component, vì JSX và chuỗi cũng chứa ngoặc.
//
//   node scripts/check-i18n-module-scope.mjs
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'frontend/src';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(jsx|js)$/.test(p) ? [p] : [];
  });
}

const TOP_CONST_OPEN = /^(?:export\s+)?const\s+[A-Za-z_$][\w$]*\s*(?::[^=]*)?=\s*[[{]/;
const FIND_CALL = /(^|[^\w.$])(t|th)\(\s*['"][^'"]+['"]\s*[,)\]}]/;

// Một khối `const` cấp module có thể chứa **phương thức** (ví dụ
// `export const daily = { async add() { … toast.error(t('…')) … } }`). Dòng như vậy
// nằm trong thân hàm nên `t()` chạy đúng lúc gọi — không đóng băng. Bộ lọc này bỏ qua
// chúng; bản đầu không có nên báo nhầm mọi lời gọi `t()` trong `api/index.js`.
const INSIDE_FUNCTION = /=>|\bfunction\b|\basync\b|\btry\b|\bcatch\b|\bthrow\b|\breturn\b|\bif\s*\(|\bfor\b|\bwhile\b|\.then\(|\.catch\(|\bawait\b/;

const findings = [];
for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  if (!/from ['"][^'"]*i18n\/index\.js['"]/.test(src)) continue;
  const lines = src.split('\n');
  let declName = null;

  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    const indent = l.length - l.trimStart().length;
    // Hết khối `const` cấp module: gặp dòng ở cột 0 khác với dòng mở nó.
    if (declName && indent === 0 && !TOP_CONST_OPEN.test(l)) declName = null;
    if (TOP_CONST_OPEN.test(l)) {
      declName = l.match(/const\s+([A-Za-z_$][\w$]*)/)[1];
      // Dòng mở khối cũng có thể đã chứa `t(` ngay (ví dụ `const X = { a: t('k') }`).
      const m0 = l.match(FIND_CALL);
      if (m0 && !INSIDE_FUNCTION.test(l)) findings.push({ file, line: i + 1, decl: declName, text: l.trim().slice(0, 100) });
      continue;
    }
    if (!declName) continue;
    const m = l.match(FIND_CALL);
    if (m && !INSIDE_FUNCTION.test(l)) findings.push({ file, line: i + 1, decl: declName, text: l.trim().slice(0, 100) });
  }
}

const seen = new Set();
const unique = findings.filter((f) => {
  const k = `${f.file}:${f.line}:${f.decl}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

if (unique.length) {
  console.log(`  ✗ ${unique.length} chỗ gọi \`t()\`/\`th()\` trong biến CẤP MODULE — nhãn đóng băng, không đổi khi bấm [VI|EN]:`);
  for (const f of unique) console.log(`     ${f.file}:${f.line}  (${f.decl})  ${f.text}`);
  console.log('\n     Sửa: đổi `const X = {` thành `function x() {` rồi gọi `x()` trong component,');
  console.log('     và component phải gọi `useLang()` để ép render lại khi đổi ngôn ngữ.');
  process.exit(1);
}
console.log('  ✓ không có `t()`/`th()` nào trong biến cấp module');
