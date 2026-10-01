#!/usr/bin/env node
// Xuất dữ liệu dự án demo thành file SQL để **clone repo về là chạy được ngay**.
//
// ── Vì sao cần ────────────────────────────────────────────────────────────────────
// Đo 2026-10-01 trên một clone sạch của nhánh `main`: `node backend/src/db/init.js` chạy
// xong và tạo ra **1 dự án rỗng** — 0 hạng mục lịch, 0 work item, 0 shop drawing, 0 hợp
// đồng, 0 vật tư. Mọi dashboard, Gantt, S-curve, OTD, thanh toán đều trống, và người
// kiểm duyệt kết luận "sản phẩm hỏng".
//
// Nguyên nhân: `init.js` chỉ seed **danh mục** (tenant, user, zone, vai trò). Dữ liệu
// nghiệp vụ đến từ `reference_sheets/` — 100 file Excel của dự án BTE — qua
// `services/ingest/*`. Thư mục đó **cố ý gitignore** vì là hồ sơ gốc của khách hàng.
// Nên clone sạch không có gì để nạp.
//
// Cách xử lý: xuất **kết quả đã nạp** (số đoạn, số hợp đồng, số tiền) ra SQL để commit.
// Giữ nguyên hồ sơ gốc ngoài repo.
//
// ── Cảnh báo dữ liệu ──────────────────────────────────────────────────────────────
// File sinh ra chứa số liệu **dẫn xuất từ dự án BTE thật** (mã hợp đồng, tên nhà thầu,
// giá trị hợp đồng). Đây là dữ liệu demo của repo nội bộ, không phải dữ liệu khách hàng
// đang vận hành. Nếu repo này phải công khai, xoá `backend/src/db/seed/demo/` và chạy lại
// `init.js` — sản phẩm vẫn chạy, chỉ là không có sẵn dữ liệu mẫu.
//
// ── Ngày: giữ NGUYÊN GIÁ TRỊ GỐC, không dịch ─────────────────────────────────────
// File xuất ra mang ngày **tương đối tới một mốc neo** (xem `--anchor`), để
// `npm run setup` gọi `scripts/rebase-demo-dates.mjs` dời về ngày chạy. Nhờ vậy clone
// ở **bất kỳ ngày nào** cũng ra một demo trông như công trình đang chạy, thay vì mang
// ngày cứng đã cũ. Nếu xuất luôn ngày đã dịch thì demo sẽ già đi theo thời gian.
//
// Dùng:  node scripts/export-demo-seed.mjs [--project BTE-WP4-HBC] [--out backend/src/db/seed/demo]
import { mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getOwnerDb, closeDb } from '../backend/src/db/index.js';
import { psqlCopy } from './lib/psql.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PROJECT = arg('project', 'BTE-WP4-HBC');
const OUT = join(ROOT, arg('out', 'backend/src/db/seed/demo'));

// Bảng nào, và lọc bằng cách nào. `project` = có cột `project_id`.
// `viaContracts` / `viaBaselines` = nối gián tiếp — thiếu chúng thì chuỗi
// hợp đồng → hóa đơn → payment request bị đứt và màn thanh toán trống.
const TABLES = [
  // `zones` phải **có mặt** trong seed, không chỉ được `init.js` tạo.
  // Đo 2026-10-01: `init.js` tạo 19 zone cho dự án BTE (id 1..19), nhưng dữ liệu thật có
  // **32** zone và hạng mục lịch tham chiếu tới id tới 45 ⇒ nạp seed hỏng
  // `construction_schedule_items_zone_id_zones_id_fk … Key (zone_id)=(45)`.
  { table: 'zones', where: 'project_id = $1' },
  { table: 'construction_schedule_items', where: 'project_id = $1' },
  { table: 'work_items', where: 'project_id = $1' },
  { table: 'work_item_productivity', where: 'project_id = $1' },
  { table: 'shop_drawings', where: 'project_id = $1' },
  { table: 'materials', where: 'project_id = $1' },
  { table: 'kpi_targets', where: 'project_id = $1' },
  { table: 'manpower_plans', where: 'project_id = $1' },
  { table: 'schedule_baselines', where: 'project_id = $1' },
  { table: 'contracts', where: 'project_id = $1' },
  { table: 'payments', where: 'project_id = $1' },
  { table: 'invoices', where: 'contract_id IN (SELECT id FROM contracts WHERE project_id = $1)' },
  { table: 'payment_requests', where: 'invoice_id IN (SELECT i.id FROM invoices i JOIN contracts c ON c.id = i.contract_id WHERE c.project_id = $1)' },
  { table: 'schedule_baseline_items', where: 'baseline_id IN (SELECT id FROM schedule_baselines WHERE project_id = $1)' },
];

const db = await getOwnerDb();
const proj = await db.prepare('SELECT id, code, name_vi FROM projects WHERE code = $1').getAsync(PROJECT);
if (!proj) {
  console.error(`Không tìm thấy dự án ${PROJECT}. Chạy 'node backend/src/db/init.js' trước đã.`);
  await closeDb();
  process.exit(1);
}

// Khóa ngoại giữa các bảng trong seed **có vòng**, nên thứ tự COPY không bao giờ thoả được:
//   construction_schedule_items.work_item_id → work_items.id
//   work_items.source_schedule_item_id      → construction_schedule_items.id
// Đo 2026-10-01: bảng đứng trước bị báo `Key (work_item_id)=(1922) is not present`.
//
// Giải pháp: trong transaction của file seed, đánh dấu các ràng buộc này `DEFERRABLE
// INITIALLY DEFERRED` ⇒ Postgres kiểm tra lúc **COMMIT**, khi mọi dòng đã vào. Lệnh
// ALTER nằm trong transaction nên **tự rollback** — schema sau khi nạp y hệt trước đó.
// Cách này không cần bảng ánh xạ id tạm, nên không rủi ro id lệch.
const fks = await db.prepare(
  `SELECT t.relname AS tbl, c.conname AS name
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
    WHERE c.contype = 'f'
      AND t.relname = ANY($1::text[])`
).allAsync(TABLES.map((t) => t.table));

if (!fks.length) {
  console.error('Không tìm thấy ràng buộc ngoại nào — dừng thay vì sinh file chắc chắn hỏng.');
  await closeDb();
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.sql')) unlinkSync(join(OUT, f));

const header = (t) => `-- ${t} — dự án ${PROJECT}
-- Sinh bởi scripts/export-demo-seed.mjs. Nạp bằng: node scripts/load-demo-seed.mjs
-- Ngày giữ nguyên theo hồ sơ gốc; \`npm run setup\` gọi rebase-demo-dates.mjs để neo về ngày chạy.
`;

/**
 * Cột trỏ tới `file_uploads` — **xuất thành NULL, không xuất giá trị**.
 *
 * Lý do: `file_uploads` trỏ tới file trong `backend/uploads/`, mà thư mục đó gitignore.
 * Giữ `upload_id` trong seed tạo ra hai lỗi, và lỗi nào cũng khó chẩn đoán:
 *   (a) không xuất `file_uploads` ⇒ vi phạm FK, nạp rollback (đo 2026-10-01:
 *       `construction_schedule_items_upload_id_fkey … Key (upload_id)=(643)`);
 *   (b) xuất cả `file_uploads` ⇒ id hợp lệ nhưng bấm tải file trả 404, người review
 *       thấy một nút hỏng.
 * Cột NULL nói thẳng "không có file nguồn", vẫn hiện đủ số đo và tên hạng mục.
 *
 * Đo 2026-10-01 trên dự án demo: 48/864 hạng mục lịch có `upload_id`, và **cả 48** trỏ
 * tới upload thuộc dự án khác ⇒ ngay cả khi xuất `file_uploads` của dự án này cũng không
 * vá được. Không phải sự cố xảy ra hiếm, đó là đặc điểm của dữ liệu này.
 */
const UPLOAD_COLS = new Set(['upload_id', 'source_upload_id']);

let totalRows = 0;
const parts = [];
for (const { table, where } of TABLES) {
  // Cột nào tồn tại thật — bảng nào thiếu cột thì bỏ qua thay vì làm hỏng lần xuất.
  const cols = await db.prepare(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`
  ).allAsync(table);
  if (!cols.length) { console.log(`  · bỏ qua ${table} (bảng không tồn tại)`); continue; }
  // Cột trỏ tới `file_uploads` xuất thành NULL (xem UPLOAD_COLS).
  const colList = cols.map((c) => `"${c.column_name}"`).join(', ');
  const selectList = cols
    .map((c) => (UPLOAD_COLS.has(c.column_name)
      ? `NULL::bigint AS "${c.column_name}"`
      : `"${c.column_name}"`))
    .join(', ');
  const n = await db.prepare(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`).getAsync(proj.id);
  if (!n?.n) { console.log(`  · ${table}: 0 dòng`); continue; }
  // COPY dạng text: nạp nhanh hơn INSERT nhiều lần, và tự mang tên cột nên không
  // phụ thuộc thứ tự cột trong bảng đích.
  const text = await copyOut(table, where, selectList, proj.id);
  // Marker kết thúc COPY phải đúng một dòng `\.` — Postgres đáp
  // `end-of-copy marker corrupt` nếu dư hoặc thiếu. `text` từ `psqlCopy` đã kết thúc
  // bằng `\n`; `trimEnd` cho chắc chắn không dính dòng trống thừa.
  parts.push(`${header(table)}COPY ${table} (${colList}) FROM stdin;\n${text.trimEnd()}\n\\.\n`);
  totalRows += n.n;
  console.log(`  ✓ ${table.padEnd(30)} ${n.n} dòng`);
}

// Tên bảng lấy từ `pg_class` chứ không suy từ tên ràng buộc: Postgres đặt tên ràng buộc
// theo quy ước riêng, và quy ước đó **không** phải hợp đồng ổn định giữa các bản.
const deferrals = fks
  .map(({ tbl, name }) => `ALTER TABLE ${tbl} ALTER CONSTRAINT ${name} DEFERRABLE INITIALLY DEFERRED;`)
  .join('\n');
await closeDb();

/**
 * `COPY … TO STDOUT` trả về text sẵn dùng cho `COPY … FROM stdin`.
 *
 * Dùng `psql` chứ không dùng driver: `pg` không có `COPY TO STDOUT` qua `prepare()`,
 * và dựng SQL thủ công cho từng giá trị thì dễ sai escape ở cột có dấu nháy/xuống dòng.
 */
async function copyOut(table, where, colList, projectId) {
  // `psql -c` không nội suy `$1` (xem scripts/lib/psql.mjs) nên chèn giá trị thật.
  // An toàn vì `projectId` là số nguyên lấy từ truy vấn của chính script.
  const id = Number(projectId);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`project_id khong hop le: ${projectId}`);
  return psqlCopy(`COPY (SELECT ${colList} FROM ${table} WHERE ${where.replace(/\$1/g, String(id))})`);
}

const outFile = join(OUT, 'demo-project.sql');
writeFileSync(outFile, `-- Dữ liệu dự án demo (${PROJECT}) — sinh tự động, đừng sửa tay.
-- ${totalRows} dòng. Nạp: node scripts/load-demo-seed.mjs
-- Dữ liệu dẫn xuất từ hồ sơ dự án BTE; xem cảnh báo trong scripts/export-demo-seed.mjs.
BEGIN;

-- Kiểm tra khoá ngoại hoãn tới COMMIT: các bảng trong seed có vòng tham chiếu lẫn nhau
-- (construction_schedule_items ↔ work_items), nên không thứ tự COPY nào thoả được.
-- Lệnh này nằm trong BEGIN/COMMIT nên tự rollback — schema sau khi nạp y hệt trước đó.
${deferrals}

-- Zone do \`init.js\` tạo (19 zone, id 1..19) không phải bộ zone của dữ liệu demo (32 zone).
-- Xoá trước khi nạp để không thành 51 zone trùng lặp. Các bảng con đã nằm trong cùng
-- transaction nên xoá ở đây không vi phạm khoá ngoại (đã hoãn ở trên).
DELETE FROM zones WHERE project_id = (SELECT id FROM projects WHERE code = '${PROJECT}');

${parts.join('\n')}
COMMIT;
`, 'utf8');

const { statSync } = await import('node:fs');
console.log(`\nĐã ghi ${relative(ROOT, outFile)} — ${totalRows} dòng, ${Math.round(statSync(outFile).size / 1024)} KB`);
console.log('  Nạp bằng: node scripts/load-demo-seed.mjs');
