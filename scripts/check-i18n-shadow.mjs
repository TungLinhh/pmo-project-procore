#!/usr/bin/env node
// Tham số callback tên `t` (hoặc `th`) che mất hàm dịch của i18n.
//
// Vì sao nguy hiểm: trong callback, `t('khoá')` sẽ gọi lên **object của dòng dữ
// liệu** thay vì hàm dịch → `TypeError: t is not a function`, màn trắng. Build
// **thành công** (tên biến hợp lệ), `no-undef` **không báo** (vì `t` đã được import
// ở phạm vi ngoài), và `no-unused-vars` cũng không báo (vì `t` còn được dùng chỗ
// khác trong file). Không công cụ sẵn nào bắt được — đã mắc ở `Materials.jsx`,
// `Ops.jsx` và `FieldStubs.jsx`.
//
//   node scripts/check-i18n-shadow.mjs
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'frontend/src';
// `t` và `th` là hai hàm của `i18n/index.js`; tên tham số trùng sẽ che chúng.
const GUARDED = ['t', 'th'];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.(jsx|js)$/.test(p) ? [p] : [];
  });
}

const findings = [];
for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  if (!/from ['"][^'"]*i18n\/index\.js['"]/.test(src)) continue;
  const imports = new Set();
  for (const m of src.matchAll(/import \{([^}]*)\} from ['"][^'"]*i18n\/index\.js['"]/g)) {
    for (const n of m[1].split(',')) {
      const name = n.trim().split(/\s+as\s+/).pop().trim();
      if (GUARDED.includes(name)) imports.add(name);
    }
  }
  if (!imports.size) continue;

  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    // `(t) =>` · `t =>` · `function (t)` — nhưng BỎ QUA khi đã có `renamed` hoặc
    // đã ghi chú `ĐỪNG đặt tên`.
    for (const name of imports) {
      const re = new RegExp(`(?:\\(|\\s|^)${name}\\s*(?:,|\\)|\\s)=>|function\\s*\\(\\s*${name}\\s*[,)]|function\\s+${name}\\s*\\(`);
      if (!re.test(lines[i])) continue;
      // Callback một dòng không thể gọi `t()` bên trong nên vô hại.
      if (!/=>\s*\{/.test(lines[i]) && !lines[i].trimEnd().endsWith('{')) continue;
      // Quét tới khi đóng khối callback, tìm lời gọi `t(` / `th(` bên trong.
      const base = lines[i].length - lines[i].trimStart().length;
      for (let k = i; k < Math.min(i + 40, lines.length); k += 1) {
        const indent = lines[k].length - lines[k].trimStart().length;
        if (k > i && lines[k].trim() && indent < base) break;
        for (const g of imports) {
          if (new RegExp(`(^|[^\\w.])${g}\\s*\\('`).test(lines[k])) {
            findings.push({ file, line: k + 1, name: g, text: lines[k].trim().slice(0, 88) });
          }
        }
      }
    }
  }
}

// Bỏ trùng (cùng một dòng có thể khớp cả `t` và `th`).
const seen = new Set();
const unique = findings.filter((f) => {
  const k = `${f.file}:${f.line}:${f.name}`;
  if (seen.has(k)) return false;
  seen.add(k);
  return true;
});

if (unique.length) {
  console.log(`  ✗ ${unique.length} chỗ tham số callback tên "t"/"th" che hàm dịch — sẽ ném TypeError lúc render:`);
  for (const f of unique) console.log(`     ${f.file}:${f.line}  che \`${f.name}\`  ${f.text}`);
  console.log('\n     Sửa: đổi tên tham số (vd `sample`, `team`) và dùng tên mới trong cả thân callback.');
  process.exit(1);
}
console.log('  ✓ không có tham số callback nào che hàm dịch `t`/`th`');
