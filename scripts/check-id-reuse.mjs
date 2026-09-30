#!/usr/bin/env node
// Cảnh báo: sequence nào sắp cấp lại một `id` mà lịch sử kiểm toán đã từng ghi tới.
//
// Vì sao cần: `audit_log` **cố ý không có** khoá ngoại tới bảng nghiệp vụ (audit phải sống
// sót cùng resource). Nên khi một dòng bị xoá, dòng audit của nó vẫn còn và vẫn trỏ tới
// `id` đó. Nếu sequence bị cuộn về dưới mốc đó, `nextval` sẽ cấp lại đúng `id` ấy, và câu
// hỏi *"chuyện gì đã xảy ra với hợp đồng 358"* sẽ **không trả lời được**.
//
// `backend/src/db/init.js` đã sửa để không bao giờ cuộn lùi, và có tính cả mốc
// `audit_log`. Nhưng nó chỉ biết những gì tồn tại **tại lúc nó chạy**: sau đó bài kiểm tạo
// rồi xoá dữ liệu thử là mốc lại dịch lên. Đo 2026-09-29: sau một lần quét 133 bài e2e,
// 4/66 bảng lại ở tình trạng có nguy cơ — và điều đó **không phải** lỗi của `init.js`, mà
// là hệ quả đúng đắn của việc dữ liệu thử bị xoá.
//
// Vì vậy đây là **báo cáo định kỳ**, và cách đóng là chạy `node backend/src/db/init.js`
// (idempotent). Bài này không tự sửa: sửa sequence là việc cần owner, và bài kiểm nên
// chỉ **nói**.
//
//   node scripts/check-id-reuse.mjs
// **Owner pool**, không phải `getDb()`: đọc `last_value` của sequence cần quền sở hữu, mà app
// role (`pmo_app`, least-privilege) cố ý không có. Đo 2026-09-29: dùng `getDb()` thì
// script chỉ kiệm đưệc **1/66** bảng rồi và in "v" — tức báo đạt trong khi
// không kiệm đưủc gì.
import { getOwnerDb, closeDb } from '../backend/src/db/index.js';

const db = getOwnerDb();
const tables = await db.prepare(
  `SELECT t.tablename FROM pg_tables t
   JOIN information_schema.columns c ON c.table_name = t.tablename
     AND c.table_schema = 'public' AND c.column_name = 'id'
   WHERE t.schemaname = 'public' ORDER BY 1`
).allAsync();

const SINGULAR = [
  [/(.*)ies$/, '$1y'],
  [/(.*(?:ss|sh|ch|x))es$/, '$1'],
  [/(.*[^s])s$/, '$1'],
];
const singular = (n) => {
  for (const [re, rep] of SINGULAR) if (re.test(n)) return n.replace(re, rep);
  return n;
};
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const atRisk = [];
let checked = 0;
for (const { tablename } of tables) {
  const seq = await db.prepare(`SELECT last_value FROM "${tablename}_id_seq"`).getAsync().catch(() => null);
  if (!seq) continue; // bảng không có serial
  checked += 1;
  const names = [tablename, singular(tablename)].map(lit).join(', ');
  const row = await db.prepare(
    `SELECT GREATEST(
        (SELECT MAX(id) FROM "${tablename}"),
        (SELECT COALESCE(MAX(resource_id), 0) FROM audit_log WHERE resource_type IN (${names}))
      ) AS hi`
  ).getAsync();
  const last = Number(seq.last_value);
  const next = last + 1;
  if (next <= Number(row.hi)) atRisk.push({ tablename, last, next, hi: Number(row.hi) });
}
await closeDb();

if (atRisk.length) {
  console.log(`  ⚠ ${atRisk.length}/${checked} bảng có nguy cơ cấp lại id mà audit_log đã dùng:`);
  for (const r of atRisk) {
    console.log(`     ${r.tablename.padEnd(26)} nextval=${r.next}  mốc cao nhất=${r.hi}`);
  }
  console.log('\n     Đóng: node backend/src/db/init.js   (idempotent, chỉ đẩy sequence lên)');
  process.exit(1);
}
console.log(`  ✓ ${checked} bảng: không sequence nào sắp cấp lại id mà audit_log đã từng ghi`);
