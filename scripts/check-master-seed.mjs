#!/usr/bin/env node
// Danh mục demo phải tồn tại, đúng số lượng, và chạy lại không nhân bản.
//
// Vì sao cần bước kiểm này: `init.js` là bước chuẩn bị demo đầu tiên, nên nếu seed
// hỏng thì màn Dữ liệu chủ trống lúc trình diễn và ai cũng tưởng tính năng hỏng.
// Lần chạy đầu đã thật sự hỏng một lần: `vendors` không có cột `system`.
import { getDb, closeDb } from '../backend/src/db/index.js';
import { VENDOR_SEED, TEAM_SEED, WORKER_SEED } from '../backend/src/db/master-data-seed.js';

const db = getDb();
const problems = [];
const rows = async (sql, ...a) => db.prepare(sql).allAsync(...a);

try {
  const tenants = await rows(`SELECT id FROM tenants WHERE code = 'hbg'`);
  if (!tenants.length) { console.log('  ✗ không có tenant hbg — chạy init.js trước'); process.exit(1); }
  const tid = tenants[0].id;

  for (const [table, seed] of [['vendors', VENDOR_SEED], ['teams', TEAM_SEED], ['workers', WORKER_SEED]]) {
    const got = await rows(`SELECT count(*)::int AS n FROM ${table} WHERE tenant_id = $1`, tid);
    if (got[0].n !== seed.length) problems.push(`${table}: ${got[0].n} dòng, seed có ${seed.length}`);
    // Ô trọng yếu không được trống — `fillBlanks` là để chữa đúng trường hợp này.
    const blank = table === 'workers'
      ? await rows(`SELECT code FROM workers WHERE tenant_id = $1 AND (full_name IS NULL OR full_name = '')`, tid)
      : await rows(`SELECT code FROM ${table} WHERE tenant_id = $1 AND (name IS NULL OR name = '')`, tid);
    if (blank.length) problems.push(`${table}: ${blank.length} dòng thiếu tên (${blank.map((b) => b.code).join(', ')})`);
  }

  // Đội trưởng phải trỏ tới công nhân có thật, và mỗi tổ có 1 trưởng.
  const leads = await rows(
    `SELECT t.code, w.code AS lead FROM teams t LEFT JOIN workers w ON w.id = t.lead_worker_id WHERE t.tenant_id = $1`, tid);
  for (const l of leads) if (!l.lead) problems.push(`tổ ${l.code} chưa có đội trưởng`);

  // MST bịa phải không thể trùng doanh nghiệp thật. MST thật ở Việt Nam là 10 chữ
  // số và **không** bắt đầu bằng 0, nên `0000000001` là bất biến đủ để nhận ra là
  // dữ liệu giả. Kiểm cả việc khớp đúng seed, để lệch dữ liệu bị bắt.
  const vendors = await rows(`SELECT code, tax_id FROM vendors WHERE tenant_id = $1`, tid);
  const seedByCode = Object.fromEntries(VENDOR_SEED.map((v) => [v.code, v.tax_id]));
  for (const v of vendors) {
    if (v.tax_id === null || v.tax_id === '') { problems.push(`vendor ${v.code} thiếu MST`); continue; }
    if (!/^0\d+$/.test(v.tax_id)) problems.push(`MST "${v.tax_id}" của ${v.code} không bắt đầu bằng 0 — có thể trùng doanh nghiệp thật`);
    if (seedByCode[v.code] && seedByCode[v.code] !== v.tax_id) problems.push(`MST của ${v.code} lệch seed (${v.tax_id} ≠ ${seedByCode[v.code]})`);
  }

  if (problems.length) {
    for (const p of problems) console.log(`  ✗ ${p}`);
    console.log(`\n  ${problems.length} vấn đề`);
  } else {
    console.log(`  ✓ ${VENDOR_SEED.length} vendors · ${TEAM_SEED.length} teams · ${WORKER_SEED.length} workers — tên đầy đủ, đội trưởng hợp lệ, MST là số 0`);
  }
} finally {
  await closeDb();
}
process.exit(problems.length ? 1 : 0);
