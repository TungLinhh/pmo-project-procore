// Value reconciliation between a source workbook and the database (SRS 9.1:
// "0% sai số khối lượng/giá trị").
//
// Row counts cannot catch a row that landed with the right key and the wrong
// number, so this compares the values themselves. The pure comparator is
// asserted directly (that is where the traps are: float money, driver date
// types, blank vs NULL, duplicate keys) and then the whole reconcile script is
// run against the real database to prove the wiring produces a real number.
import { readFileSync } from 'node:fs';
import { getDb, closeDb } from '../../backend/src/db/index.js';
import { ok, summary } from './lib.mjs';
import { compareRow, normDate, normNumber, normText, FIELDS } from '../../scripts/lib/value-compare.mjs';

const db = getDb();
try {
  // ---- 1. Normalisation: representation, not meaning ----------------------
  ok(normNumber('12.5') === 12.5 && normNumber(' 1.234,5 ') === null,
    'số có dấu phân cách nhóm kiểu Việt bị TỪ CHỐI, không đoán sai 1000 lần');
  ok(normNumber(1234567890.51) === 1234567890.51, 'normNumber giữ nguyên số tiền lớn');
  ok(normNumber('') === null && normNumber(null) === null && normNumber(undefined) === null,
    'chỗ trống, null, undefined đều quy về null');
  ok(normDate('2019-03-26') === '2019-03-26', 'ISO date giữ nguyên');
  ok(normDate(new Date('2019-03-26T00:00:00Z')) === '2019-03-26',
    'Date của driver (timestamptz) quy về YYYY-MM-DD');
  ok(normDate('26/03/2019') === '2019-03-26' && normDate('5-3-2019') === '2019-03-05',
    'dd/mm/yyyy và d-m-yyyy quy về ISO');
  ok(normDate('') === null && normDate('abc') === null, 'ngày rác quy về null chứ không đoán');
  ok(normText('  a   b ') === 'a b' && normText('  ') === null,
    'text gộp khoảng trắng, khoảng trắng thuần là null');

  // ---- 2. Comparison semantics -------------------------------------------
  ok(compareRow('construction', { name_vi: 'A' }, { name_vi: 'A' }).diffs.length === 0,
    'dòng khớp hoàn toàn → không lệch');
  ok(compareRow('construction', { name_vi: 'A' }, { name_vi: 'B' }).diffs.length === 1,
    'tên khác → báo đúng 1 trường lệch');
  ok(compareRow('construction', { progress_pct: 33.333333 }, { progress_pct: 33.33 }).diffs.length === 0,
    'số thực lệch trong sợi float KHÔNG bị báo sai');
  ok(compareRow('payment_line', { amount: 1234567890.51 }, { amount: 1234567890.52 }).diffs.length === 0,
    'tiền tệ lớn lệch 0.01 do float KHÔNG bị báo sai');
  ok(compareRow('payment_line', { amount: 100 }, { amount: 100.5 }).diffs.length === 1,
    'tiền lệch thật vẫn bị bắt');
  ok(compareRow('construction', { plan_end_date: null }, { plan_end_date: null }).diffs.length === 0,
    'null ở cả hai vế → khớp');
  ok(compareRow('construction', { plan_end_date: '2019-10-06' }, { plan_end_date: null }).diffs.length === 1,
    'nguồn có ngày, DB không có → báo lệch');
  ok(compareRow('material', { ref_code: 'X' }, { name_vi: 'X' }).compared === 0,
    'dòng không có mô tả lẫn lô nào → compared = 0, KHÔNG phải lệch');
  ok(compareRow('material', { description: 'Ống', batches: [{ request_date: '2019-03-26', actual: '2019-04-09' }] },
    { name_vi: 'Ống', request_date_1: '2019-03-26', delivery_date_1: '2019-04-09' }).diffs.length === 0,
    'ngày nằm trong batches[] của vật tư được ánh xạ đúng sang delivery_date_1');
  ok(compareRow('material', { description: 'Ống', batches: [] },
    { name_vi: 'Ống', request_date_1: '2019-03-26' }).diffs.length === 1,
    'nguồn không có lô nào, DB có ngày → báo lệch (không coi là "không so")');

  // ---- 3. Advisory columns are reported but never counted -----------------
  const shopRow = { name_vi: 'X', approval_date: '2019-04-06', bql_l1_response: 'A' };
  const shopDb = { name_vi: 'X', approval_date: null, bql_l1_response: null };
  const shopResult = compareRow('shop', shopRow, shopDb);
  ok(shopResult.diffs.length === 0 && shopResult.advisory.length === 2,
    `approval_date/bql_l* là advisory: báo ra nhưng KHÔNG tính vào lệch (${shopResult.advisory.length})`);
  ok(shopResult.compared === 1,
    `mẫu số chỉ tính trường assert được (${shopResult.compared})`);

  // ---- 4. Field specs must never name a column that does not exist --------
  const columns = {
    construction: 'construction_schedule_items', shop: 'shop_drawings',
    material: 'materials', payment_line: 'ar_lines', payment_contract: 'ar_contracts',
  };
  let specError = null;
  for (const [type, table] of Object.entries(columns)) {
    const cols = (await db.prepare(
      `SELECT string_agg(column_name, ',') AS c FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'`
    ).getAsync(table)).c.split(',');
    for (const field of FIELDS[type]) {
      if (!cols.includes(field.db)) specError = `${table}.${field.db} không tồn tại`;
    }
  }
  ok(!specError, `mọi cột trong bản đồ so sánh đều tồn tại thật${specError ? ` — ${specError}` : ''}`);

  // ---- 5. The wiring: run the real reconciliation -------------------------
  const out = '/tmp/opencode/reconcile-values-e2e.json';
  const { execFileSync } = await import('node:child_process');
  let summaryOut = '';
  try {
    summaryOut = execFileSync('node', ['scripts/reconcile-pilot-data.mjs', `--output=${out}`], {
      cwd: new URL('../..', import.meta.url).pathname, encoding: 'utf8', timeout: 900000, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) { summaryOut = String(e.stdout || '') + String(e.stderr || ''); }
  const report = JSON.parse(readFileSync(out, 'utf8'));
  const s = report.summary;
  ok(s.error_files === 0, `không file nào lỗi khi đối soát (${s.error_files})`);
  ok(s.value_fields_compared > 0, `có thực sự so giá trị (${s.value_fields_compared} trường)`);
  ok(s.value_rows_missing_in_db === 0,
    `mọi dòng nguồn đều tìm thấy trong DB (${s.value_rows_missing_in_db} mất)`);
  ok(s.value_rows_matched + s.value_rows_mismatched === s.unique_source_rows,
    `khớp + lệch = tổng dòng khoá duy nhất (${s.value_rows_matched}+${s.value_rows_mismatched}=${s.unique_source_rows})`);
  ok(s.value_duplicate_paired === s.duplicate_source_rows,
    `dòng lặp được ghép cặp tường minh (${s.value_duplicate_paired}/${s.duplicate_source_rows})`);
  ok(typeof s.value_mismatch_pct === 'number' && s.value_mismatch_pct >= 0,
    `báo tỉ lệ lệch (${s.value_mismatch_pct}%)`);
  ok(Array.isArray(s.value_not_compared) && s.value_not_compared.length > 0,
    `nêu rõ cột nào KHÔNG so và vì sao (${(s.value_not_compared || []).length})`);
  ok(s.value_advisory_rows > 0,
    `cột advisory được tách riêng (${s.value_advisory_rows} dòng), không gộp vào lỗi`);

  // Every reported mismatch must name a concrete file, table and column —
  // a "mismatch" nobody can act on is noise.
  const everyMismatchIsActionable = report.files.every((f) => (f.value_reconciliation?.mismatches || [])
    .every((m) => m.table && m.key && m.diffs?.length && m.diffs.every((d) => d.field)));
  ok(everyMismatchIsActionable, 'mọi dòng báo lệch đều chỉ rõ file/bảng/khoá/cột');
  ok(summaryOut.length > 0, 'script in ra tổng kết');
} catch (e) {
  ok(false, e.message);
} finally {
  await closeDb();
  summary();
}
