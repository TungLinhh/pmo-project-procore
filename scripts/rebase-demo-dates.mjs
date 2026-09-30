#!/usr/bin/env node
// Dời toàn bộ ngày của dữ liệu demo về tương đối so với hôm nay, theo **một hằng số**.
//
// ── Vấn đề ──────────────────────────────────────────────────────────────────────
// Dữ liệu demo lấy từ hồ sơ BTE thật nên lịch nằm ở 2019-03 → 2020-02. Hôm nay là
// 2026, nên mọi báo cáo, Gantt, S-curve, tuổi SLA đều hiện số của 7 năm trước.
// `schedule-compress` còn **luôn 422** vì `runCompression` neo vào `todayStr()`.
//
// ── Vì sao dời bằng hằng số, không dựng lại lịch ────────────────────────────────
// Dựng lại lịch sẽ phá đúng thứ đang có giá trị: 864 hạng mục với quan hệ phụ thuộc
// thật, lịch trình nghỉ, hợp đồng trả góp. Cộng một hằng số giữ **nguyên mọi khoảng
// cách** — một khoản phải trả sau 30 ngày vẫn là 30 ngày — nên không quan hệ nào sai.
// Chỉ có **vị trí tuyệt đối** thay đổi, và đó mới là thứ cần sửa cho demo.
//
// ── Vì sao ghim offset ───────────────────────────────────────────────────────────
// `init.js` chạy mỗi lần khởi động. Nếu tính offset mỗi lần thì ngày trôi mãi và mọi
// báo cáo đã chép ra sẽ sai. Nên offset tính **một lần** rồi ghim vào
// `demo_date_rebase`; từ đó dữ liệu đứng yên. Đây cũng là lý do không được chạy lại
// `init.js` trên database đang dùy như một thao tác thường quy.
//
// ── Phạm vi ─────────────────────────────────────────────────────────────────────
// **Mọi** cột ngày gắn dự án, không chỉ lịch. Dời lịch mà không dời payment/contract/
// submittal thì demo tự mâu thuẫn: lịch ở 2026 còn hợp đồng ký 2019.
//
// Dùng:  node scripts/rebase-demo-dates.mjs --dry-run     (chỉ báo, không ghi)
//        node scripts/rebase-demo-dates.mjs                (áp dụng, một lần)
//        node scripts/rebase-demo-dates.mjs --reset        (hoàn tác)
//        TAIL_DAYS=120 node scripts/rebase-demo-dates.mjs  (muốn dự án kéo dài hơn)
import { getDb, getOwnerDb, closeDb } from '../backend/src/db/index.js';

const TAIL_DAYS = Number(process.env.TAIL_DAYS || 90);
// Dự án kết thúc sớm hơn hôm nay quá ngần này ngày thì coi là "cũ" và được dời.
const MIN_STALE_DAYS = Number(process.env.MIN_STALE_DAYS || 30);
const DRY = process.argv.includes('--dry-run');
const RESET = process.argv.includes('--reset');
// Chuẩn hoá khoảng thời gian bị đảo (kết thúc trước khi bắt đầu). Tách cờ riêng vì đây
// là sửa **ngữ nghĩa dữ liệu**, không phải dịch ngày — và nó cần được gọi tường minh.
const FIX_INVERTED = process.argv.includes('--fix-inverted');

// Đây là thao tác seed/migrate nên dùng **owner pool**, không phải app role: app role cố
// ý không có quyền đủ cho `ALTER`/ghi hàng loạt trên mọi bảng. `init.js` cũng vậy.
const db = await getOwnerDb();

// Cột `date` trả về `Date` ở **giờ địa phương** nửa đêm. `toISOString()` ép sang UTC nên
// lệch một ngày ở múi giờ dương — sai ngày trong công cụ dịch ngày là loại lỗi không
// ai nhìn thấy cho tới khi dữ liệu lệch đúng một ngày. Vì vậy format từ thành phần
// local, không đi qua UTC.
const iso = (d) => {
  if (d == null) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const addDays = (d, n) => {
  const t = new Date(`${iso(d)}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Bảng nào dời được, và dời theo cách nào.
 *
 * `project_id`   — dời trực tiếp, cột ngày thuộc dự án.
 * `via_baseline` — `schedule_baseline_items` nối qua `baseline_id`.
 * `via_contract` — `invoices` nối qua `contract_id` (hợp đồng có `project_id`).
 * `via_request`  — `payment_requests` nối qua `invoice_id`.
 * `via_report`   — `daily_work_items` nối qua `daily_report_id`.
 *
 * Cột thời gian hệ thống (`created_at`, `updated_at`, `sent_at`, `read_at`, `delivered_at`)
 * cố ý **không** dời: chúng là dấu vết thao tác, không phải ngày nghiệp vụ, và dời chúng
 * sẽ làm nhật ký kiểm toán sai. Cột của riêng dự án (`projects.start_date/end_date`) thì có.
 */
const TARGETS = [
  { table: 'projects', cols: ['start_date', 'end_date'], how: 'self' },
  { table: 'construction_schedule_items', cols: ['plan_start_date', 'plan_end_date', 'actual_start_date', 'actual_end_date'], how: 'project_id' },
  { table: 'work_items', cols: ['planned_start_date', 'planned_end_date'], how: 'project_id' },
  { table: 'work_item_productivity', cols: ['period_start', 'period_end'], how: 'project_id' },
  { table: 'manpower_plans', cols: ['week_start'], how: 'project_id' },
  { table: 'schedule_baselines', cols: ['effective_date'], how: 'project_id' },
  { table: 'schedule_scenarios', cols: ['target_end_date', 'applied_at'], how: 'project_id' },
  { table: 'kpi_targets', cols: ['period_start', 'period_end', 'effective_from', 'effective_to', 'approved_at'], how: 'project_id' },
  { table: 'contracts', cols: ['signed_date'], how: 'project_id' },
  { table: 'payments', cols: ['due_date', 'paid_at'], how: 'project_id' },
  { table: 'materials', cols: ['request_date_1', 'request_date_2', 'request_date_3', 'request_date_4', 'delivery_date_1', 'delivery_date_2', 'delivery_date_3', 'delivery_date_4', 'expected_delivery_at'], how: 'project_id' },
  { table: 'material_submittals', cols: ['submitted_date', 'supervisor_deadline', 'sla_deadline', 'approved_date', 'rejected_at', 'escalated_at'], how: 'project_id' },
  { table: 'shop_drawings', cols: ['planned_submit_date', 'rs1_planned_date', 'rs2_planned_date', 'rs1_actual_date', 'rs2_actual_date', 'actual_submit_date', 'bql_l1_date', 'bql_l2_date', 'bql_l3_date', 'bql_l4_date', 'bql_l5_date', 'approval_date', 'rejected_at', 'reverted_to_draft_at'], how: 'project_id' },
  { table: 'qa_inspections', cols: ['inspected_at'], how: 'project_id' },
  { table: 'issues', cols: ['resolved_at'], how: 'project_id' },
  { table: 'directives', cols: ['due_date', 'completed_at'], how: 'project_id' },
  { table: 'daily_reports', cols: ['report_date', 'submitted_at'], how: 'project_id' },
  { table: 'rfa_log', cols: ['date_ma', 'date_pm', 'date_sh', 'date_sp', 'date_tp', 'approval_date'], how: 'project_id' },
  { table: 'ai_drafts', cols: ['decided_at'], how: 'project_id' },
  { table: 'attention_digest_runs', cols: ['digest_date'], how: 'project_id' },
  { table: 'schedule_baseline_items', cols: ['plan_start_date', 'plan_end_date'], how: 'via_baseline' },
  { table: 'invoices', cols: ['invoice_date'], how: 'via_contract' },
  { table: 'payment_requests', cols: ['request_date', 'due_date', 'approved_date', 'retention_due_date'], how: 'via_request' },
  { table: 'daily_work_items', cols: ['plan_start_date', 'plan_end_date', 'actual_start_date', 'actual_end_date'], how: 'via_report' },
];

/**
 * Điều kiện khoanh **đúng nhóm dự án đã cũ**, theo đường nối riêng của từng bảng.
 *
 * Bản đầu dùng chung `t.id IN (…)` cho mọi bảng. Đo 2026-09-30: `schedule_baseline_items`
 * **không có cột `id`** ⇒ `column t.id does not exist`. Nên phạm vi phải đi đúng đường nối
 * của bảng đó, không phải cột khoá chính.
 */
const scopeFor = (how, ids) => {
  const inList = `(${ids.join(',')})`;
  switch (how) {
    case 'self': return `t.id IN ${inList}`;
    case 'project_id': return `t.project_id IN ${inList}`;
    case 'via_baseline': return `t.baseline_id IN (SELECT id FROM schedule_baselines WHERE project_id IN ${inList})`;
    case 'via_contract': return `t.contract_id IN (SELECT id FROM contracts WHERE project_id IN ${inList})`;
    case 'via_request': return `t.invoice_id IN (SELECT id FROM invoices WHERE contract_id IN (SELECT id FROM contracts WHERE project_id IN ${inList}))`;
    case 'via_report': return `t.daily_report_id IN (SELECT id FROM daily_reports WHERE project_id IN ${inList})`;
    default: throw new Error(`Đường nối lạ: ${how}`);
  }
};

async function existing() {
  try {
    return (await db.prepare('SELECT * FROM demo_date_rebase WHERE id = 1').getAsync()) || null;
  } catch (e) {
    // Bảng chưa có ⇒ migration chưa chạy. Không phải lỗi; chỉ báo rồi coi như chưa dời.
    if (/does not exist/.test(e.message)) return null;
    throw e;
  }
}

/** Cột có thực sự tồn tại không — bảng nào thiếu cột thì bỏ qua thay vì làm hỏng cả lần chạy. */
async function liveCols(table) {
  const rows = await db.prepare(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ? AND data_type IN ('date','timestamp without time zone','timestamp with time zone')`
  ).allAsync(table);
  return new Map(rows.map((r) => [r.column_name, r.data_type]));
}

/**
 * Điều kiện "giá trị này **thật sự đã cũ**" — áp **theo từng cột**, không theo cả dòng.
 *
 * Vì sao cần: một cột có thể đang ở **hiện tại** trong khi các cột khác của cùng bảng
 * thì cũ. Đo 2026-09-30, hai ví dụ thật:
 *   - `attention_digest_runs.digest_date` = 2026-09-26 → 29. Đây là lịch sử **cron**,
 *     và nó đang ở hiện tại. Dời 2504 ngày ⇒ thành 2033 ⇒ cron tưởng hôm nay chưa
 *     chạy digest ⇒ gửi trùng.
 *   - `projects.end_date` của BTE = 2027-01-20, còn lịch thì 2020-02-20 — **đã lệch nhau
 *     sẵn**. Dời cái này thành 2033-11-27 thì phá đúng dữ liệu đang hợp lý.
 *
 * Nên quy tắc là: chỉ dời ô nào còn nằm trong quá khứ. Ô nào đã ở hiện tại hoặc tương
 * lai thì **giữ nguyên** — nó không thuộc dữ liệu 2019 cần sửa. Cách này tự loại được
 * mọi trường hợp tương tự mà không cần danh sách cấm thủ công.
 */
const isStaleExpr = (col, dataType, cutoff) => (
  dataType === 'date'
    ? `${col} < ?::date`
    : `${col} < (?::date + interval '1 day')::${dataType}`
);

/**
 * Khoảng thời gian bị đảo: `plan_end_date < plan_start_date`.
 *
 * Đo 2026-09-30: 25 hạng mục, tất cả lệch đúng **một ngày** (`end = start − 1`), đều thuộc
 * nhóm "Hệ thống cấp thoát nước". Cột `plan_duration_days` không dùng làm chuẩn được:
 * chỉ **14/716** dòng khớp khoảng ngày, nên nó gần như độc lập với ngày.
 *
 * Một khoảng thời gian không thể kết thúc trước khi bắt đầu — đây là lỗi dữ liệu, không
 * phải lựa chọn nghiệp vụ, nên sửa thành hạng 1 ngày (`end = start`) là ít can thiệp
 * nhất. **Không** dùng offset để hoàn tác bước này: sửa có điều kiện, lùi offset thì
 * không. Cần biết còn bao nhiêu dòng lệch thì chạy lại, và nó báo 0 khi đã sạch.
 */
async function fixInverted(_offset) {
  const bad = await db.prepare(
    `SELECT count(*) AS n FROM construction_schedule_items
      WHERE plan_end_date IS NOT NULL AND plan_start_date IS NOT NULL
        AND plan_end_date < plan_start_date`
  ).getAsync();
  const n = Number(bad?.n || 0);
  if (!n) { console.log('Khoảng thời gian: không có dòng nào kết thúc trước khi bắt đầu.'); return 0; }
  if (!DRY) {
    await db.prepare(
      `UPDATE construction_schedule_items SET plan_end_date = plan_start_date
        WHERE plan_end_date IS NOT NULL AND plan_start_date IS NOT NULL
          AND plan_end_date < plan_start_date`
    ).runAsync();
  }
  console.log(`Khoảng thời gian: chuẩn hoá ${n} hạng mục kết thúc trước khi bắt đầu → 1 ngày${DRY ? ' (KHÔNG ghi — dry-run)' : ''}.`);
  return 0;
}

async function main() {
  const prior = await existing();

  if (RESET) {
    if (!prior) { console.log('Chưa dời ngày lần nào — không có gì để hoàn tác.'); return 0; }
    const off = -prior.offset_days;
    // Tìm lại đúng nhóm đã dời: dự án mà lịch **hiện tại** lệch đúng `offset` về sau
    // so với ngày neo đã ghim. Dùng ngày neo bị đọc ngược là đúng vì offset là hằng số.
    const back = await db.prepare(
      `SELECT p.id FROM projects p JOIN construction_schedule_items i ON i.project_id = p.id
        GROUP BY p.id HAVING max(i.plan_end_date) = (?::date + (? * interval '1 day'))
        ORDER BY p.id`
    ).allAsync(prior.anchor_max_plan_end, prior.offset_days);
    const resetIds = back.map((r) => r.id);
    if (!resetIds.length) { console.log('Không tìm thấy dự án nào khớp offset đã ghim — dừng.'); return 1; }
    console.log(`Hoàn tác: dời ${off} ngày cho ${resetIds.length} dự án.`);
    // Hoàn tác chỉ chạm ô **đã được dời**. Sau khi dời, ô 2019-2020 nằm ở tương lai
    // (2026+); ô vốn đã ở hiện tại thì **chưa từng** bị dời. Nên điều kiện gỡ là
    // "ô nằm ở tương lai" — tự bỏ qua mọi ô không phải do lần dời này tạo ra.
    const futureCut = `'` + addDays(today(), 1) + `'`;
    for (const t of TARGETS) {
      const have = await liveCols(t.table);
      const cols = t.cols.filter((c) => have.has(c));
      if (!cols.length) continue;
      const set = cols.map((c) => `${c} = ${c} - (? * interval '1 day')`).join(', ');
      const where = cols.map((c) => isStaleExpr(c, have.get(c), futureCut).replace(' <', ' >'))
        .join(' AND ');
      await db.prepare(
        `UPDATE ${t.table} t SET ${set} WHERE ${scopeFor(t.how, resetIds)} AND ${where}`
      ).runAsync(off);
    }
    await db.prepare('DELETE FROM demo_date_rebase WHERE id = 1').runAsync();
    console.log('Đã xoá ghim. Chạy lại không có chế độ nào thì demo trở về lịch gốc.');
    return 0;
  }

  // ── Chỉ dời dự án đã cũ, và tính offset từ chính nhóm đó ────────────────────────
  // Bản đầu lấy `max(plan_end_date)` **toàn cục**. Đo 2026-09-30: dự án thử `PILOT-001`
  // kết thúc 2026-10-30, muộn hơn dự án demo 2019-2020 hơn 6 năm ⇒ max rơi vào nó ⇒
  // offset chỉ 60 ngày ⇒ lịch demo chỉ dịch từ 2019-05 lên 2019-07. Vẫn "cũ", vẫn hỏng.
  //
  // Nên: chỉ dự án nào kết thúc **quá lâu** mới tính, và offset tính từ nhóm đó. Dự án
  // đang ở trong cửa sổ hiện tại thì giữ nguyên — nếu không, chạy lại công cụ sẽ kéo
  // dự án đang tốt ra khỏi vị trí của nó.
  // ── Đã ghim thì dừng, và **nói đúng lý do** ──────────────────────────────────────
  // Kiểm tra này phải đứng **trước** lượt quét bên dưới. Nếu quét trước thì sau khi dời
  // xong không còn dự án nào "cũ", và lần chạy sau in *"không làm gì"* thay vì
  // *"đã ghim"*: kết quả vẫn idempotent, nhưng thông báo sai lý do — người đọc tưởng
  // công cụ không nhớ mình đã dời, và có thể xoá ghim rồi chạy lại.
  if (prior) {
    console.log(`Đã dời rồi (offset ${prior.offset_days} ngày, ngày ${iso(prior.applied_at).slice(0, 10)}) — giữ nguyên.`);
    console.log('  dùng --reset để hoàn tác rồi chạy lại.');
    if (FIX_INVERTED) return fixInverted(prior.offset_days);
    return 0;
  }

  // Mốc cắt tính sẵn ở JS rồi truyền **chuỗi ngày**. Bản đầu viết
  // `(? * interval '1 day')::date` ⇒ Postgres nhận `0 * interval` là kiểu interval rồi
  // ép sang `date` ⇒ `cannot cast type interval to date`. Ngày không phải phép nhân.
  const staleCutoff = addDays(today(), -MIN_STALE_DAYS);
  const stale = await db.prepare(
    `SELECT p.id, p.code, max(i.plan_end_date) AS plan_end
       FROM projects p JOIN construction_schedule_items i ON i.project_id = p.id
      WHERE i.plan_end_date IS NOT NULL
      GROUP BY p.id, p.code
     HAVING max(i.plan_end_date) < ?::date
      ORDER BY plan_end`
  ).allAsync(staleCutoff);
  if (!stale?.length) {
    console.log(`Không dự án nào kết thúc trước ${staleCutoff} — không làm gì.`);
    return 0;
  }
  // `plan_end` là `Date`; dùng thẳng vào `Date.parse()` sẽ ra `NaN` ⇒ `Invalid time value`.
  // Chuẩn hoá về chuỗi ngày trước mọi phép tính.
  const maxEnd = { d: iso(stale[stale.length - 1].plan_end) };
  const ids = stale.map((r) => r.id);
  // Mọi `UPDATE` khoanh trong đúng nhóm dự án đã cũ (`scopeFor`): nếu chỉ sửa phép tính
  // mà không khoanh, nó sẽ **kéo cả dự án đang ở 2026** đi 60 ngày — phá đúng dữ liệu
  // mà ta đang muốn giữ.
  console.log(`Dự án sẽ dời (${stale.length}): ${stale.map((r) => `${r.code}→${iso(r.plan_end)}`).join(', ')}`);

  const targetEnd = addDays(today(), TAIL_DAYS);
  const offset = Math.round((Date.parse(`${targetEnd}T00:00:00Z`) - Date.parse(`${maxEnd.d}T00:00:00Z`)) / 86400000);
  console.log(`Lịch hiện tại kết thúc ${maxEnd.d}; muốn ${targetEnd} (hôm nay +${TAIL_DAYS}) ⇒ dời ${offset} ngày.`);

  let rowsTouched = 0;
  let colsMoved = 0;
  let colsKept = 0;
  const detail = [];
  for (const t of TARGETS) {
    const have = await liveCols(t.table);
    const cols = t.cols.filter((c) => have.has(c));
    if (!cols.length) continue;
    const scope = scopeFor(t.how, ids);
    // Mỗi cột một vế: dời ô đã cũ, **giữ nguyên** ô đang ở hiện tại. Không dùng
    // `AND` giữa các cột vì `AND` nghĩa là "mọi cột đều cũ" — dòng nào có một cột
    // hiện tại sẽ bị bỏ qua hẳn, tức sót lại dữ liệu 2019 trong chính dòng đó.
    // Phải có `cột =` trước `CASE`. Bản đầu nối thẳng `CASE` vào `SET` nên SQL thành
    // `UPDATE … t SET CASE WHEN …` ⇒ `syntax error at or near "CASE"`. Dễ sai vì
    // `SET` nhận *danh sách gán*, không phải *biểu thức*.
    const set = cols.map((c) => `${c} = CASE WHEN ${isStaleExpr(c, have.get(c), `'${staleCutoff}'`)}\n` +
      `        THEN ${c} + (? * interval '1 day') ELSE ${c} END`).join(',\n      ');
    const where = `${scope} AND (${cols.map((c) => `${c} IS NOT NULL`).join(' OR ')})`;
    const n = await db.prepare(`SELECT count(*) AS n FROM ${t.table} t WHERE ${where}`).getAsync();
    if (!n?.n) continue;
    if (!DRY) {
      // Thứ tự tham số phải **xen kẽ** theo đúng thứ tự `?` xuất hiện trong SQL:
      // với mỗi cột thì cutoff đứng trước offset (CASE viết trước WHERE). Bản đầu gom
      // hết offset rồi mới tới cutoff ⇒ `bind message supplies N parameters, but
      // prepared statement requires M`. Với `?`/`$N` chỉ sai thứ tự là sai, không phải
      // chỉ sai kiểu.
      await db.prepare(`UPDATE ${t.table} t SET ${set} WHERE ${where}`)
        .runAsync(...cols.flatMap(() => [staleCutoff, offset]));
    }
    rowsTouched += Number(n.n);
    colsMoved += cols.length;
    detail.push(`  ${t.table.padEnd(30)} ${String(n.n).padStart(6)} dòng × ${cols.length} cột`);
  }
  colsKept = colsMoved;

  console.log(detail.join('\n'));
  console.log(`Tổng: ${rowsTouched} dòng${DRY ? ' (KHÔNG ghi — dry-run)' : ' đã dời'}.`);

  if (!DRY) {
    await db.prepare(
      `INSERT INTO demo_date_rebase (id, offset_days, anchor_max_plan_end, new_max_plan_end, note)
       VALUES (1, ?, ?::date, ?::date, ?)
       ON CONFLICT (id) DO UPDATE SET offset_days = EXCLUDED.offset_days`
    ).runAsync(offset, iso(maxEnd.d), targetEnd,
      `Dời ${offset} ngày để lịch demo tương đối với ngày chạy (${today()}). Không dời cột thời gian hệ thống.`);
    console.log(`Đã ghim offset ${offset} vào demo_date_rebase — chạy lại sẽ không dời thêm.`);
  }
  return 0;
}

let code = 1;
try { code = await main(); }
catch (e) { console.error('Lỗi:', e.message); }
finally { await closeDb(); }
process.exit(code);
