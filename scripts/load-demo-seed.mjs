#!/usr/bin/env node
// Nạp dữ liệu dự án demo vào database — để clone repo về là **thấy dữ liệu thật**.
//
// ── Vấn đề nó giải ────────────────────────────────────────────────────────────────
// `node backend/src/db/init.js` chỉ seed **danh mục**: tenant, user, vai trò, zone. Dữ liệu
// nghiệp vụ (hạng mục lịch, shop drawing, hợp đồng, thanh toán) đến từ `reference_sheets/`
// — 100 file Excel của dự án BTE — mà thư mục đó **gitignore** vì là hồ sơ gốc khách
// hàng. Đo 2026-10-01 trên clone sạch của `main`: sau `init.js` có **1 dự án rỗng** —
// 0 hạng mục lịch, 0 shop drawing, 0 hợp đồng. Người kiểm duyệt thấy vỏ trống và kết
// luận sản phẩm hỏng.
//
// Nên `backend/src/db/seed/demo/demo-project.sql` mang **kết quả đã nạp** (sinh bằng
// `scripts/export-demo-seed.mjs`), giữ nguyên hồ sơ gốc ngoài repo.
//
// ── Idempotent ─────────────────────────────────────────────────────────────────────
// Chạy lại **không** nạp thêm. Cách kiểm: `construction_schedule_items` đã có dòng thì
// coi như đã nạp. Lý do dùng cảm biến "đã có dữ liệu" chứ không dùng cờ trong DB: cờ
// có thể lệch với thực tế (bị xoá tay, DB khác), còn số dòng thì không nói dối.
//
// ── Ngày ──────────────────────────────────────────────────────────────────────────
// File seed mang ngày theo hồ sơ gốc. `npm run setup` gọi `scripts/rebase-demo-dates.mjs`
// sau khi nạp để neo lịch về ngày chạy — nhờ vậy clone ở bất kỳ ngày nào cũng ra một demo
// trông như công trình đang chạy. Nạp xong mà **không** chạy rebase thì lịch vẫn ở năm
// gốc; script sẽ nhắc.
//
// Dùng:  node scripts/load-demo-seed.mjs [--force]
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, closeDb } from '../backend/src/db/index.js';
import { psqlFile } from './lib/psql.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SEED = join(ROOT, 'backend/src/db/seed/demo/demo-project.sql');
const FORCE = process.argv.includes('--force');

if (!existsSync(SEED)) {
  console.log(`Không có file seed tại ${SEED}`);
  console.log('  Bản clone này không kèm dữ liệu demo. Sản phẩm vẫn chạy, chỉ là trống.');
  console.log('  Tạo dữ liệu từ hồ sơ dự án thật: node scripts/export-demo-seed.mjs');
  await closeDb();
  process.exit(0);
}

const db = getDb();

const proj = await db.prepare('SELECT id, code FROM projects ORDER BY id LIMIT 1').getAsync();
if (!proj) {
  console.log('Chưa có dự án nào — chạy `node backend/src/db/init.js` trước đã.');
  await closeDb();
  process.exit(1);
}

const has = await db.prepare(
  'SELECT count(*)::int AS n FROM construction_schedule_items WHERE project_id = $1'
).getAsync(proj.id);

if (has.n > 0 && !FORCE) {
  console.log(`Dự án ${proj.code} đã có ${has.n} hạng mục lịch — bỏ qua nạp (dùng --force để nạp lại).`);
  await closeDb();
  process.exit(0);
}

console.log(`Nạp dữ liệu demo cho dự án ${proj.code} (id=${proj.id}) — ${Math.round(statSync(SEED).size / 1024)} KB`);

// Nạp bằng `psql -f` trong **transaction duy nhất** (file có BEGIN/COMMIT). Nếu một bảng
// lệch schema thì rollback hết, không để lại nửa bộ dữ liệu.
try {
  psqlFile(SEED);
} catch (e) {
  const detail = (e.stderr || e.message || '').toString().trim().split('\n').slice(0, 4).join(' | ');
  console.error(`Nạp thất bại (đã rollback toàn bộ): ${detail}`);
  console.error('  Thường do schema lệch. Chạy `node backend/src/db/init.js` để migrate rồi nạp lại.');
  await closeDb();
  process.exit(1);
}

const after = await db.prepare(
  `SELECT (SELECT count(*)::int FROM construction_schedule_items WHERE project_id = $1) AS items,
          (SELECT count(*)::int FROM shop_drawings WHERE project_id = $1) AS drawings,
          (SELECT count(*)::int FROM contracts WHERE project_id = $1) AS contracts`
).getAsync(proj.id);

await closeDb();

console.log(`  ✓ ${after.items} hạng mục lịch · ${after.drawings} shop drawing · ${after.contracts} hợp đồng`);
if (after.items === 0) {
  console.log('  ⚠ Vẫn 0 hạng mục — kiểm tra file seed có đúng dự án không.');
  process.exit(1);
}
console.log('  → tiếp theo: node scripts/rebase-demo-dates.mjs   (neo lịch về ngày chạy)');
