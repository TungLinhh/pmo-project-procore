#!/usr/bin/env node
// Turn reconciliation output into a decision-ready document.
//
// The pilot has three unresolved data questions that block UAT sign-off:
//   1. 36 duplicate source rows (same business key repeated inside a workbook)
//   2. 8 aggregate workbooks with no defined row grain
//   3. DB rows that no longer match their source file (5 files, 94 extra rows)
//
// None of them can be decided by code — the rule is a business decision. What
// code CAN do is stop the loss of information: show exactly which rows collide,
// which fields differ, and which DB rows an aggregate workbook currently owns,
// so PMO signs a rule instead of re-deriving the evidence.
//
// Usage:
//   node scripts/reconcile-pilot-data.mjs --output=/tmp/opencode/recon.json
//   node scripts/data-decisions-required.mjs --from=/tmp/opencode/recon.json \
//        --out=docs/DATA_DECISIONS_REQUIRED.md
import { readFileSync, writeFileSync } from 'node:fs';
import { psqlQuery } from '../tests/tools/env.mjs';

const args = Object.fromEntries(process.argv.slice(2)
  .filter((a) => a.startsWith('--'))
  .map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || 'true']; }));

const from = args.from || '/tmp/opencode/recon.json';
const out = args.out || 'docs/DATA_DECISIONS_REQUIRED.md';
let recon;
try {
  recon = JSON.parse(readFileSync(from, 'utf8'));
} catch (e) {
  console.error(`Cannot read ${from}: ${e.message}`);
  console.error('Run: node scripts/reconcile-pilot-data.mjs --output=/tmp/opencode/recon.json');
  process.exit(1);
}

const q = (sql) => psqlQuery(sql).split('\n')[0];

// Which DB rows does an aggregate workbook currently own? These are the rows a
// "purge the aggregate" decision would remove, so the number must be explicit.
const aggregateNames = /tổng thể|sơ\s*đồ|các khu vực|wm-01|\.1\.xlsx/i;
const aggregates = recon.files.filter((f) => aggregateNames.test(f.file.split('/').pop() || ''));

const dupGroups = recon.files
  .filter((f) => (f.duplicate_source_rows || 0) > 0)
  .map((f) => ({
    file: f.file.split('/').pop(),
    project: f.project,
    type: f.type,
    rows: f.parsed_rows,
    unique: f.unique_source_rows,
    dup: f.duplicate_source_rows,
    keys: (f.duplicate_keys || []).slice(0, 5),
  }));

const drifted = recon.files
  .filter((f) => f.parsed_rows > 0 && f.db_rows > 0 && f.parsed_rows !== f.db_rows)
  .map((f) => ({
    file: f.file.split('/').pop(),
    project: f.project,
    type: f.type,
    parsed: f.parsed_rows,
    db: f.db_rows,
    delta: f.db_rows - f.parsed_rows,
    uploadId: f.upload_id,
  }));

const lines = [];
const w = (s = '') => lines.push(s);
w('# Quyết định dữ liệu cần PMO/CEO ký trước UAT');
w();
w(`Sinh tự động từ \`${from}\` (nguồn: \`${recon.generated_at}\`).`);
w('Chạy lại: `node scripts/reconcile-pilot-data.mjs --output=/tmp/opencode/recon.json && node scripts/data-decisions-required.mjs`');
w();
w('> Tài liệu này **không** tự quyết. Nó gom bằng chứng để quyết định mất vài phút');
w('> thay vì phải dựng lại từ báo cáo thô.');
w();

w('## 1. Dòng lặp trong nguồn');
w();
w(`Tổng ${recon.summary.duplicate_source_rows} dòng lặp trong ${recon.summary.duplicate_files} file. Parser hiện **ghi đè theo khóa**, nên dòng bị ghi đè là mất thông tin, không phải bình thường.`);
w();
w('| File | Project | Loại | Dòng nguồn | Khóa duy nhất | Lặp | Khóa bị lặp (mẫu) |');
w('|---|---|---|---:|---:|---:|---|');
for (const g of dupGroups) {
  const keys = g.keys.map((k) => `\`${String(k.key).slice(0, 40)}\`×${k.count}`).join(', ') || '—';
  w(`| ${g.file} | ${g.project} | ${g.type} | ${g.rows} | ${g.unique} | ${g.dup} | ${keys} |`);
}
w();
w('**Quyết định cần ký (chọn 1):**');
w();
w('- [ ] A. Giữ dòng có `updated_at`/revision mới nhất — cần bổ sung cột revision vào nguồn.');
w('- [ ] B. Giữ dòng đầu tiên theo thứ tự sheet — hiện là hành vi ngầm, cần ghi rõ.');
w('- [ ] C. Từ chối commit file có dòng lặp, yêu cầu PMO sửa nguồn — an toàn nhất, nhiều công việc nhất.');
w();
w('Khuyến nghị kỹ thuật: **C** cho các file có dòng lặp lớn (Shop INF 18 dòng), **B** kèm cảnh báo cho các file lặp 1 dòng.');
w();

w('## 2. Workbook tổng hợp chưa có grain dòng');
w();
w('| File | Project | Loại | Dòng nguồn | Dòng DB hiện có | Ghi chú |');
w('|---|---|---|---:|---:|---|');
for (const a of aggregates) {
  w(`| ${a.file.split('/').pop()} | ${a.project} | ${a.type} | ${a.parsed_rows} | ${a.db_rows} | ${a.skipped || 'chưa commit'} |`);
}
w();
w('**Vấn đề đã thấy trong dữ liệu:** một workbook tổng hợp đã **ghi 74 dòng** vào DB, trùng grain với các file TĐ theo khu vực. Đây là nguyên nhân trực tiếp của sai khác ở mục 3 và là rủi ro đếm trùng tiến độ.');
w();
w('**Quyết định cần ký:**');
w();
w('- [ ] A. Loại workbook tổng hợp khỏi phạm vi nạp (giữ file làm bằng chứng nguồn) — khuyến nghị.');
w('- [ ] B. Định nghĩa grain dòng cho từng workbook tổng hợp rồi nạp như nguồn chính.');
w();
w('Đã thêm chốt an toàn trong code: file tổng hợp **không được ghi dòng** khi commit (xem `lib/aggregate-workbook.js`).');
w();

w('## 3. Dòng DB không còn khớp file nguồn');
w();
w('| File | Project | Loại | Dòng parser đọc | Dòng trong DB | Lệch | upload_id |');
w('|---|---|---|---:|---:|---:|---|');
for (const d of drifted) {
  w(`| ${d.file} | ${d.project} | ${d.type} | ${d.parsed} | ${d.db} | ${d.delta > 0 ? `+${d.delta}` : d.delta} | ${d.uploadId ?? '—'} |`);
}
w();
w('Lệch dương = DB đang có dòng mà file nguồn hiện tại không tạo ra. Cần biết dòng đó đến từ đâu trước khi xoá:');
w();
for (const d of drifted.filter((x) => x.delta > 0)) {
  const owner = q(`SELECT COALESCE(string_agg(DISTINCT fu.original_filename, ' | '), '?') FROM file_uploads fu WHERE fu.id = ${d.uploadId || 0}`);
  w(`- \`${d.file}\`: +${d.delta} dòng, upload ${d.uploadId ?? '?'} (${owner})`);
}
w();
w('**Quyết định cần ký:** xoá các dòng thừa, hay giữ và ghi nhận nguồn gốc?');
w();
w('- [ ] A. Xoá dòng thừa sau khi PMO xác nhận nguồn gốc (khuyến nghị — khớp `mismatch_files: 0`).');
w('- [ ] B. Giữ nguyên và ghi chú là số liệu bổ sung ngoài workbook.');
w();

w('## 4. Tài chính và retention');
w();
const fin = q(`SELECT (SELECT count(*) FROM contracts) || ' hợp đồng, ' || (SELECT count(*) FROM invoices) || ' hóa đơn, ' || (SELECT count(*) FROM payment_requests) || ' yêu cầu chi, ' || (SELECT count(*) FROM payments) || ' khoản chi'`);
const ret = q(`SELECT count(*) FROM payment_requests WHERE retention_amount > 0 AND status NOT IN ('PAID','REJECTED')`);
w(`- Hiện tại: ${fin}.`);
w(`- Yêu cầu chi còn retention nhưng chưa chi: ${ret}.`);
w('- Số liệu tài chính trên dashboard lấy trực tiếp từ bảng giao dịch; **chưa có** trường nào đánh dấu "đã đối soát với hồ sơ gốc".');
w();
w('**Quyết định cần ký:** có bắt buộc đối soát từng hóa đơn với hồ sơ gốc trước UAT không? Nếu có, cần thêm trạng thái `reconciled` và bước nghiệp vụ tương ứng.');
w();

// ---- 5. Advisory columns -------------------------------------------------
w('## 5. Ngày duyệt và phản hồi BQL khi nạp lại file (ADVISORY)');
w();
w('`shop_drawings` cố ý **không** ghi đè các cột này khi re-ingest: `approval_date`,');
w('`bql_l1..5_date`, `bql_l1..5_response`. Lý do có trong code: ghi `EXCLUDED.bql_l*_response`');
w('lên một cấp đã duyệt sẽ vượt `checkTransition` và chuỗi phê duyệt ở `routes/shop.js`.');
w();
w(`Hệ quả: nạp lại file shop mới sẽ **giữ ngày duyệt cũ** dù file mới ghi ngày khác. Lượt đối soát gần nhất bắt được ${recon.summary?.value_advisory_rows ?? 0} dòng như vậy. Đây là hành vi đúng theo thiết kế hiện tại, nên **không tính vào tỉ lệ lỗi** — nhưng nó là một câu hỏi nghiệp vụ.`);
w();
w('**Quyết định cần ký (chọn 1):**');
w();
w('- [ ] A. Giữ nguyên như hiện tại — ngày duyệt là sự kiện của ứng dụng, file không được sửa. *(khuyến nghị)*');
w('- [ ] B. File mới được ghi đè ngày, nhưng chỉ khi cấp chưa từng được duyệt, và ghi lại `reingested_at` để truy vết.');
w();

// ---- 6. Value reconciliation (SRS 9.1) -----------------------------------
const vs = recon.summary || {};
w('## 6. Đối soát giá trị (SRS 9.1) và nguồn chuẩn');
w();
w(`Lượt đối soát giá trị so **${vs.value_fields_compared ?? 0} trường**: `
  + `${vs.value_rows_matched ?? 0}/${vs.unique_source_rows ?? 0} dòng khoá duy nhất khớp tuyệt đối, `
  + `**${vs.value_rows_mismatched ?? 0} dòng lệch (${vs.value_mismatch_pct ?? 0}%)**, `
  + `${vs.value_rows_missing_in_db ?? 0} dòng mất.`);
w();
w(`- Cột cố ý **không so** (${(vs.value_not_compared || []).length}): ${(vs.value_not_compared || []).join('; ')}.`);
w(`- Cột advisory, báo ra nhưng không tính lỗi: ${vs.value_advisory_rows ?? 0} dòng.`);
const ingestMatchesSource = (recon.files || []).some((f) => f.value_reconciliation?.scoped_to_upload);
w(`- Dữ liệu hiện tại của \`BTE-WP4-HBC\` **${ingestMatchesSource ? 'có' : 'KHÔNG'}** bắt nguồn từ \`reference_sheets/\` `
  + '(file_uploads không chứa hash của các file đó; sheet trong DB là `MEP-BTE-CSP-*`, `TĐ .BOH`, `TĐ INF`).');
w();
w('Nếu dữ liệu không đến từ `reference_sheets/` thì các dòng lệch là khác biệt giữa hai nguồn, không phải lỗi ingest.');
w();
w('**Quyết định cần ký (chọn 1):**');
w();
w('- [ ] A. `reference_sheets/` là nguồn chuẩn → nạp lại toàn bộ, chấp nhận các dòng đổi giá trị.');
w('- [ ] B. Dữ liệu hiện tại là chuẩn → `reference_sheets/` chỉ là tư liệu tham khảo, loại khỏi phạm vi đối soát.');
w('- [ ] C. Hai nguồn khác thời gian → cần quy tắc "nguồn mới hơn thắng" theo ngày, và một cột revision trong nguồn.');
w();
w('Chạy lại số liệu mục này: `npm run test:reconcile`.');
w();

w('## 7. Ai quyết định xung đột đồng bộ offline?');
w();
w('Route cho phép `chủ hàng đợi | admin | CEO`, nhưng cổng phân quyền dùng `daily_report.write` '
  + 'nên chặn CEO trước khi route kịp kiểm tra — CEO và PMO thấy nút nhưng luôn nhận 403. '
  + 'Đã sửa cho khớp (CEO vào được, PMO bị ẩn nút). Còn một câu hỏi nghiệp vu chưa tự quyết:');
w();
w('- [ ] A. Chỉ admin + CEO quyết (hiện tại) — giám đốc dự án chỉ xem hàng đợi.');
w('- [ ] B. Thêm giám đốc dự án — mỗi người tự quyết xung đột dữ liệu của mình.');
w('- [ ] C. Tự động theo mốc thời gian — bản mới hơn thắng, không cần người can thiệp.');
w();
w('## 8. Quyền ghi cho CEO');
w();
w('Giao diện từng hiện nút cho CEO ở năng suất hạng mục, báo cáo ngày và vật tư hiện trường, '
  + 'nhưng ma trận quyền đặt `write: false` cho cả ba nên bấm luôn nhận 403. '
  + 'Đã ẩn nút cho CEO cho khớp ma trận. Cần xác nhận đây là chủ ý:');
w();
w('- [ ] A. Giữ nguyên — CEO chỉ xem và ra chỉ thị, không ghi vận hành.');
w('- [ ] B. Cho CEO ghi năng suất hạng mục (sửa `work_item.write` cho CEO).');
w('- [ ] C. Cho CEO ghi báo cáo ngày và vật tư hiện trường.');
w();
w('## 9. Ba vai trò trong đặc tả chưa cài: DATA_ADMIN, EDITOR, VIEWER');
w();
w('Đặc tả mục 36 liệt kê 9 vai trò; ma trận quyền hiện chỉ cài 7 + ADMIN. '
  + 'Hệ thống an toàn vì tạo tài khoản qua SSO bị chặn bởi ràng buộc `default_role`, '
  + 'nhưng nếu thêm tài khoản trực tiếp với vai trò lạ thì người đó sẽ thấy menu mà không làm được gì.');
w();
w('- [ ] A. Không cài — bỏ 3 vai trò khỏi đặc tả để khớp thực tế.');
w('- [ ] B. Cài VIEWER (chỉ đọc toàn tenant) cho vai trò khách / kiểm toán.');
w('- [ ] C. Cài cả 3 đúng theo đặc tả.');
w();
w('## Chữ ký');
w();
w('| Vai trò | Người | mục 1 | mục 2 | mục 3 | mục 4 | mục 5 | mục 6 | mục 7 | mục 8 | mục 9 | Ngày |');
w('|---|---|---|---|---|---|---|---|---|---|---|');
w('| PMO | | | | | | | | | | |');
w('| CEO | | | | | | | | | | |');
w();
w('Không điền trước. UAT chỉ `SIGNED` khi hai dòng trên có chữ ký và `ready=true`.');

writeFileSync(out, `${lines.join('\n')}\n`);
console.log(`wrote ${out}`);
console.log(`duplicate files=${dupGroups.length} aggregate files=${aggregates.length} drifted files=${drifted.length}`);
