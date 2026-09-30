// Storage GC — find and remove upload files the database no longer references.
//
// Why this exists: uploads are content-addressed (sha256.ext) and every e2e
// suite, demo and re-import adds bytes. Nothing ever deleted them, so
// backend/uploads grew to ~1.1k files / 564 MB of which the large majority were
// unreferenced leftovers from test runs. On S3 the same growth is handled by a
// bucket lifecycle rule — this tool is the local-driver counterpart and refuses
// to run when STORAGE_DRIVER=s3 so it can never delete from a bucket by
// accident.
//
// Safety rules (all of them, always):
//   * dry-run unless you pass --apply
//   * only files that NO row references, checked against every table that
//     stores a storage key
//   * only files older than --min-age-hours (default 24), so an upload that is
//     mid-request is never yanked out from under the wizard
//
// Usage:
//   node scripts/storage-gc.mjs                     # report only
//   node scripts/storage-gc.mjs --apply             # delete orphans > 24h
//   node scripts/storage-gc.mjs --apply --min-age-hours=1
import { readdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, closeDb } from '../backend/src/db/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const MIN_AGE_H = Number((args.find(a => a.startsWith('--min-age-hours=')) || '').split('=')[1] || 24);
const DIR = process.env.UPLOADS_DIR || join(here, '..', 'backend', 'uploads');

if (process.env.STORAGE_DRIVER === 's3') {
  console.error('STORAGE_DRIVER=s3 — dừng. Dùng bucket lifecycle rule (xác thực bằng chính sách hạ tầng), không xoá object bằng script này.');
  process.exit(2);
}

const db = getDb();
// Every table that stores a storage key. Add a column here the day you add one
// there, or GC will delete live files.
const REFERENCES = [
  { table: 'file_uploads', column: 'storage_key' },
  { table: 'daily_photos', column: 'file_path' },
];

const live = new Set();
for (const { table, column } of REFERENCES) {
  const rows = await db.prepare(
    `SELECT DISTINCT ${column} AS k FROM ${table} WHERE ${column} IS NOT NULL`
  ).allAsync().catch((e) => {
    console.error(`không đọc được ${table}.${column}: ${e.message}`);
    process.exit(2);
  });
  for (const row of rows) if (row.k) live.add(String(row.k).split(/[\\/]/).pop());
  console.log(`  ${table}.${column}: ${rows.length} khóa còn sống`);
}

const cutoff = Date.now() - MIN_AGE_H * 3600_000;
let files = [];
try { files = readdirSync(DIR); }
catch (e) { console.error(`không đọc được ${DIR}: ${e.message}`); process.exit(2); }

const orphans = [];
let liveBytes = 0, orphanBytes = 0, tooYoung = 0;
for (const name of files) {
  const full = join(DIR, name);
  let st;
  try { st = statSync(full); } catch { continue; }
  if (!st.isFile()) continue;
  if (live.has(name)) { liveBytes += st.size; continue; }
  if (st.mtimeMs > cutoff) { tooYoung++; continue; }
  orphanBytes += st.size;
  orphans.push({ name, size: st.size, mtime: new Date(st.mtimeMs).toISOString().slice(0, 10) });
}
orphans.sort((a, b) => b.size - a.size);

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log(`\nthư mục : ${DIR}`);
console.log(`ngưỡng  : ${MIN_AGE_H}h (bỏ qua ${tooYoung} file mới tạo)`);
console.log(`còn sống: ${files.length - orphans.length - tooYoung} file / ${mb(liveBytes)}`);
console.log(`orphan  : ${orphans.length} file / ${mb(orphanBytes)}`);
if (orphans.length) {
  console.log('\n10 file lớn nhất:');
  for (const o of orphans.slice(0, 10)) console.log(`  ${mb(o.size).padStart(10)}  ${o.mtime}  ${o.name}`);
}

if (!APPLY) {
  console.log(`\nDRY RUN — chưa xoá gì. Thêm --apply để dọn ${orphans.length} file.`);
} else if (!orphans.length) {
  console.log('\nKhông có orphan nào để xoá.');
} else {
  let removed = 0, failed = 0;
  for (const o of orphans) {
    try { rmSync(join(DIR, o.name), { force: true }); removed++; }
    catch (e) { failed++; console.error(`  không xoá được ${o.name}: ${e.message}`); }
  }
  console.log(`\nĐã xoá ${removed} file (${mb(orphanBytes)})${failed ? `, ${failed} lỗi` : ''}.`);
}
await closeDb();
