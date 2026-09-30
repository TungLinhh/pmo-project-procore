#!/usr/bin/env node
// Tìm chuỗi promise `.then()` không có `.catch()`.
//
// Vì sao cần script chứ không phải đếm bằng mắt: chuỗi promise trong mã này trải
// nhiều dòng, nên `grep '\.then('` báo cả những chuỗi đã có `.catch()` ở dòng kế
// tiếp. Lần đo đầu tiên bằng grep ra 57 dòng, trong đó phần lớn là báo động giả.
//
// Ba loại báo động giả đã gặp và cách loại:
//   1. `.catch()` nằm ở dòng sau trong cùng chuỗi → quét tới hết biểu thức thay
//      vì chỉ nhìn một dòng.
//   2. `}` nằm trong template literal (`` `Tải model thất bại (HTTP ${r.status})` ``)
//      làm lệch bộ đếm ngoặc → che string/template/comment trước khi đếm.
//   3. `res.json().then(…)` là promise con của một `await` → không cần `.catch`
//      riêng, và bản thân nó thường nằm trong `try`.
//
// Chỗ bỏ trống có chủ ý nằm ở `find-missing-catch.allow.mjs`, kèm lý do.
//
//   node scripts/find-missing-catch.mjs           (in ra vị trí)
//   node scripts/find-missing-catch.mjs --count   (chỉ in số)
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALLOW } from './find-missing-catch.allow.mjs';

const ROOT = 'frontend/src';
const onlyCount = process.argv.includes('--count');

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.jsx') || p.endsWith('.js') ? [p] : [];
  });
}

// Thay nội dung string / template literal / comment bằng khoảng trắng, giữ nguyên
// độ dài để mọi chỉ số vẫn khớp với file gốc.
function maskLiterals(src) {
  const out = new Array(src.length).fill(' ');
  const keep = (i) => { out[i] = src[i]; };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '`') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '`') break;
        // Nội suy `${…}`: nội dung bên trong vẫn là mã thật, nên giữ lại.
        if (src[j] === '$' && src[j + 1] === '{') {
          let depth = 1;
          let k = j + 2;
          while (k < src.length && depth > 0) {
            if (src[k] === '{') depth += 1;
            else if (src[k] === '}') depth -= 1;
            if (depth > 0) out[k] = src[k];
            k += 1;
          }
          j = k;
          continue;
        }
        if (src[j] === '\n') out[j] = '\n';
        j += 1;
      }
      i = j + 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < src.length && src[j] !== quote) {
        if (src[j] === '\\') j += 1;
        if (src[j] === '\n') break;
        j += 1;
      }
      i = j + 1;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    keep(i);
    i += 1;
  }
  return out.join('');
}

// Vị trí kết thúc chuỗi promise bắt đầu tại `from` (ngay sau `.then(`).
function chainEnd(masked, from) {
  let depth = 0;
  for (let i = from; i < masked.length; i += 1) {
    const c = masked[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') {
      if (depth === 0) return i;
      depth -= 1;
    } else if (c === ';' && depth === 0) return i;
    else if (c === '\n' && depth === 0) {
      const rest = masked.slice(i + 1);
      // Dòng kế tiếp bắt đầu bằng `.` (`.catch`/`.finally`/`.then`) hoặc `<`
      // (JSX) nghĩa là biểu thức còn dài. Dừng ở đây là nguyên nhân bỏ sót
      // `.catch` nằm ở dòng kế tiếp — và báo nhiều báo động giả hơn số lỗi thật.
      if (/^\s*(\.|<)/.test(rest)) continue;
      return i;
    }
  }
  return masked.length;
}

// `index` có nằm trong khối `try` không.
//
// Không dùng "so sánh vị trí `}` gần nhất": giữa `try {` và chỗ cần kiểm tra có
// thể có object literal của chính lời gọi trước đó — `fetch(url, { headers: {…} })`
// — và `}` đó làm phép so sánh sai. Phải đếm ngoặc từ `try {` tới đúng dấu đóng.
function inTryBlock(masked, index) {
  const open = masked.lastIndexOf('try {', index);
  if (open < 0) return false;
  let depth = 0;
  for (let i = open + 4; i < masked.length; i += 1) {
    const c = masked[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return i > index;
    }
  }
  return true; // không đóng được → coi như còn trong try
}

const findings = [];
for (const file of walk(ROOT)) {
  const src = readFileSync(file, 'utf8');
  const masked = maskLiterals(src);
  for (const match of src.matchAll(/\.then\(/g)) {
    const at = match.index;
    // `x.json().then(…)`: promise con, thường đã `await` trong try.
    if (src.slice(0, at).trimEnd().endsWith('.json()')) continue;
    const end = chainEnd(masked, at + 1);
    if (/\.catch\s*\(/.test(masked.slice(at, end))) continue;
    if (inTryBlock(masked, at)) continue;
    const line = src.slice(0, at).split('\n').length;
    // Chỗ cố ý bỏ trống có lý do ghi ở file allow riêng — xem đó.
    const allowed = ALLOW.get(file);
    if (allowed && Math.abs(allowed.line - line) <= 2) continue;
    findings.push({ file, line, text: src.split('\n')[line - 1].trim().slice(0, 86) });
  }
}

if (onlyCount) {
  console.log(findings.length);
} else {
  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  for (const [file, items] of byFile) {
    console.log(`  ${file} (${items.length})`);
    for (const it of items) console.log(`    ${String(it.line).padStart(4)}  ${it.text}`);
  }
  console.log(`\n  tổng ${findings.length} chuỗi ở ${byFile.size} file`);
}
process.exit(findings.length ? 1 : 0);
