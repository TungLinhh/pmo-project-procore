// Liệt kê route ghi (POST/PATCH/PUT/DELETE) chỉ chốt bằng `requireRole` — tức bỏ qua
// `lib/permissions.js` hoàn toàn. Đây là cùng lớp lỗi đã tìm ra ở
// `/api/schedule-scenarios/*` (đợt 16 mục 7: ánh xạ nhầm module nên CEO luôn 403).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'backend/src/routes';
const rows = [];

for (const name of readdirSync(DIR).filter((f) => f.endsWith('.js'))) {
  const src = readFileSync(join(DIR, name), 'utf8');
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^router\.(post|patch|put|delete)\(\s*['"`]([^'"`]+)['"`]/);
    if (!m) continue;
    // Gom toàn bộ chuỗi trung gian của router chain cho tới `});` kết thúc.
    let block = lines[i];
    let j = i;
    while (!/\}\s*\)\s*;?\s*$/.test(block.trim()) && j + 1 < lines.length && j - i < 30) {
      j++;
      block += '\n' + lines[j];
    }
    const usesMatrix = /requirePermission|canAccess|checkProjectAccess/.test(block);
    const roles = (block.match(/requireRole\(([^)]*)\)/) || [])[1] || '';
    if (usesMatrix) continue;
    const line = src.slice(0, lines.slice(0, i).join('\n').length).split('\n').length;
    rows.push({ file: name, line, verb: m[1].toUpperCase(), path: m[2], roles: roles.trim() || '(không có)' });
  }
}

const byRole = new Map();
for (const r of rows) {
  for (const role of r.roles.match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) ?? ['—']) {
    byRole.set(role, (byRole.get(role) || 0) + 1);
  }
}
console.log(`  ${rows.length} route ghi không dùng ma trận quyền.`);
console.log('  Theo role được mở:', [...byRole].map(([k, v]) => `${k}=${v}`).join('  '));
console.log('\n  Danh sách (file:dòng  VERB path  →  roles):');
for (const r of rows) console.log(`    ${r.file}:${r.line}  ${r.verb.padEnd(6)} ${r.path.padEnd(46)} ${r.roles}`);
