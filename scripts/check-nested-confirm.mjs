#!/usr/bin/env node
// Cảnh báo khi một hộp thoại bắt đầu gọi `confirm()` từ bên trong nó.
//
// Vì sao: `useEscape` dùng **ngăn xếp** để Escape chỉ đóng lớp phủ trên cùng. Cái
// ngăn xếp đó chỉ có tác dụng khi có lớp phủ chồng lên nhau — tức khi `Confirm` (là
// provider toàn cục) được mở từ bên trong một `Modal` khác. Nếu khi đó Escape chạy
// cả hai listener, cả hai lớp phủ cùng đóng, và người dùng **mất sạch nội dung họ
// đang nhập** trong modal bên dưới.
//
// Lúc này **không màn nào** làm vậy (đã quét toàn bộ `frontend/src`), nên ngăn xếp là
// phòng thủ chưa được chứng minh. Thay vì bịa một màn để có bằng chứng, script này
// canh đúng điều kiện đó: hiện chưa có thì im lặng, có thì báo — vì đó mới là lúc
// ngăn xếp chuyển từ "phòng thủ" sang "quan trọng", và lúc đó cần người biết để
// bổ sung khẳng định trong `ui-verify-modal.mjs`.
//
// Ngoài ra: nếu ai đó xoá ngăn xếp khỏi `useEscape.js` thì script này vẫn im lặng,
// nhưng `ui-verify-modal.mjs` sẽ báo mất khẳng định Escape.
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'frontend/src';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.jsx') ? [p] : [];
  });
}

const findings = [];
for (const file of walk(ROOT)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  const spans = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*<Modal\b/.test(lines[i])) continue;
    const base = lines[i].length - lines[i].trimStart().length;
    for (let k = i + 1; k < lines.length; k += 1) {
      const ind = lines[k].length - lines[k].trimStart().length;
      if (lines[k].trim() === '</Modal>' && ind === base) { spans.push([i, k]); break; }
    }
  }
  for (const [a, b] of spans) {
    for (let i = a; i <= b; i += 1) {
      if (!/\bconfirm\(\s*\{/.test(lines[i])) continue;
      findings.push({ file, line: i + 1, text: lines[i].trim().slice(0, 80) });
    }
  }
}

if (findings.length) {
  console.log('  ✗ Có hộp thoại gọi confirm() từ bên trong nó — ngăn xếp Escape trở thành mã quan trọng:');
  for (const f of findings) console.log(`     ${f.file}:${f.line}  ${f.text}`);
  console.log('\n     Cần: khẳng định trong ui-verify-modal.mjs rằng Escape chỉ đóng lớp trên cùng');
  console.log('     (nhánh đó hiện báo "bỏ qua" vì chưa có màn thật).');
} else {
  console.log('  ✓ Chưa màn nào gọi confirm() từ trong modal — ngăn xếp Escape là phòng thủ, chưa cần kiểm.');
}
process.exit(findings.length ? 1 : 0);
