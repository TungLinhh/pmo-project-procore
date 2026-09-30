#!/usr/bin/env node
// Route trả 5xx phải đi qua `errorBody()` — không trả `e.message` thô.
//
// Vì sao cần: `lib/error-body.js` tồn tại **chính để chặn** việc lộ lỗi Postgres
// ("5xx messages come from Postgres/internal code and can leak relation names,
// constraint text and row values"), nhưng route trả thẳng `res.status(500).json({ error:
// e.message })` thì bypass hoàn toàn. Đo 2026-09-28 ở `NODE_ENV=production`:
//
//   POST /api/master-data/suppliers {"category": "A"×200}   (cột varchar(100))
//   → 500 {"error":"value too long for type character varying(100)"}
//
// Nguyên văn lỗi Postgres lọt ra ngoài: tên kiểu, độ dài, cấu trúc bảng. Cùng dòng đó
// còn **mất mã lỗi** — `lib/baseline.js` / `lib/erp-fast.js` ném
// `Object.assign(new Error(…), { status: 404|409|422 })`, bọc trong 500 là mất đúng
// thông tin để client hành động. Sửa 51 chỗ ở 21 file.
//
//   node scripts/check-5xx-bodies.mjs
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BACKEND = 'backend/src';

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.js$/.test(p) ? [p] : [];
  });
}

const findings = [];
let total = 0;

// Nới mẫu khớp: bắt **mọi** biểu thức trạng thái có thể cho ra 5xx, không chỉ
// `res.status(500)` nguyên văn.
//
// Đo 2026-09-28: bản đầu dùng `res\.status\((\d{3})\)` nên **bỏ sót 47 chỗ** dùng
// `res.status(e.status || 500).json({ error: e.message })` — cùng lỗi rò, chỉ khác cách
// viết. Tức "đã sửa 51 chỗ" ở đợt 17 mới đúng **một nửa**. Không bài nào soi nội dung
// thân 5xx ở chế độ production nên cả hai nửa đều qua.
//
// `e.status || 500` là 5xx **có thể xảy ra** — vẫn phải kiểm, vì khi `e.status` rỗng thì
// `errorBody(e)` vẫn phải che thông điệp.
const RX_STATUS = /res\.status\(([^)]*?\b(?:5\d\d)\b[^)]*)\)/g;

for (const file of [...walk(join(BACKEND, 'routes')), ...walk(join(BACKEND, 'lib'))]) {
  if (file.endsWith('error-body.js')) continue; // chính nó định nghĩa hành vi
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(RX_STATUS)) {
    const code = m[1].trim();
    total += 1;
    // Cửa sổ = **câu lệnh** đang trả lỗi, tới `;` kết thúc. Không lấy "khoảng trống
    // trước `.json(`": `errorBody(e)` nằm *sau* dấu `(` nên cách đo cũ báo nhầm cho
    // chính những chỗ đã sửa đúng (đo 2026-09-28: `wizard.js` 3 chỗ tự nhiên "lỗi").
    const semi = src.indexOf(';', m.index);
    const stmt = src.slice(m.index, semi === -1 ? m.index + 240 : semi + 1);
    // Lộ lỗi nội bộ ⇔ thông điệp 5xx có nội suy `.message` (kể cả biến tên khác:
    // `err.message`, `upstreamError.message` đều bị bắt — mẫu là `.message`, không
    // phải tên biến `e`).
    if (!/\.message\b/.test(stmt)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    findings.push({ file, line, code, snippet: stmt.replace(/\s+/g, ' ').slice(0, 100) });
  }
}

if (findings.length) {
  console.log(`  ✗ ${findings.length}/${total} chỗ trả 5xx kèm \`.message\` — lộ lỗi Postgres/nội bộ ở production:`);
  for (const f of findings) console.log(`     ${f.file}:${f.line}  ${f.snippet}`);
  console.log('\n     Sửa: `res.status(e.status || 500).json(errorBody(e))` và import `errorBody`.');
  console.log('     Ngoại lệ hợp lệ: thông điệp do **ta** viết, không nội suy `.message`.');
  console.log('     Đo lại: NODE_ENV=production + đầu vào gây lỗi DB ⇒ phải trả `{"error":"Internal error"}`.');
  process.exit(1);
}
console.log(`  ✓ ${total} chỗ trả 5xx không nội suy \`.message\` (errorBody hoặc thông điệp tự viết)`);
