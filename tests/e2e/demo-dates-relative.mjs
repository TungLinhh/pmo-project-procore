// Lịch demo phải **tương đối với hiện tại**, và nén lịch phải **chỉ đường** khi không khả thi.
//
// ── Vấn đề gốc (đo 2026-09-30) ────────────────────────────────────────────────────
// Dữ liệu demo lấy từ hồ sơ BTE thật: lịch 2019-03-13 → 2020-02-20, còn hôm nay là 2026.
// Mọi báo cáo, Gantt, S-curve, tuổi SLA đều hiện số của 7 năm trước.
// Riêng `schedule-compress` thì **luôn 422** với mọi mục tiêu trong quý tới, và thông báo
// cũ không nói phải thử đến bao giờ — đo 8 ngày đích đều hỏng.
//
// ── Hai điều dễ nhầm, bài này giữ cả hai ──────────────────────────────────────────
// 1. **Dời ngày KHÔNG làm nén lịch khả thi.** `mapToCalendar` dàn hạng mục chưa làm ra từ
//    `todayStr()`, nên `calendar_end` luôn là hôm nay + đường găng còn lại ≈ 268 ngày,
//    bất kể dữ liệu lưu là 2019 hay 2026. Đo lại sau khi dời: `calendar_end` y hệt.
//    Nên phải sửa **cả hai**; sửa một mình thì UAT vẫn đỏ.
// 2. **Ngày đích khả thi không đoán được bằng `calendar_end + 1`.** Đoán vậy cho
//    2027-06-26, dùng vào lại **không** khả thi — vì đổi mục tiêu thì lịch tính ra cũng
//    đổi (mục tiêu xa hơn ⇒ nén ít hơn ⇒ lịch dài hơn: 2027-06-25 → 2027-07-01).
//    Phải **tìm**, và ngày tìm ra phải dùng lại được thật.
//
// Run: node tests/e2e/demo-dates-relative.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const sh = (cmd) => execFileSync('bash', ['-c', cmd], { encoding: 'utf8', cwd: ROOT, timeout: 120000 }).trim();

// Ngày hôm nay theo giờ máy — dùng chung với công cụ, tránh lệch timezone.
const TODAY = new Date().toISOString().slice(0, 10);
const daysBack = (iso) => Math.round((Date.parse(`${TODAY}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86400000);
const daysFwd = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${TODAY}T00:00:00Z`)) / 86400000);

// Truyền **mảng tham số**, không đi qua `bash -c`. Bản đầu làm
// `bash -c "… -c ${JSON.stringify(sql)}"` ⇒ `JSON.stringify` escape newline thành chữ
// `\n` và `psql` không hiểu `\n` ⇒ `syntax error at or near "\"`. Dùng `execFileSync`
// với mảng thì không có lớp trích dẫn nào để sai.
const psql = (sql) => execFileSync('psql',
  ['-h', '127.0.0.1', '-p', '5433', '-U', 'pmo_user', '-d', 'pmo', '-t', '-A', '-F|', '-c', sql],
  { encoding: 'utf8', env: { ...process.env, PGPASSWORD: 'pmo_dev_pwd' }, timeout: 60000 }).trim();

// ══ 1. Lịch demo phải nằm quanh hiện tại ═════════════════════════════════════════
{
  const rows = psql(
    `SELECT p.code, min(i.plan_start_date)::text, max(i.plan_end_date)::text
       FROM projects p JOIN construction_schedule_items i ON i.project_id = p.id
      GROUP BY p.code ORDER BY p.code`
  ).split('\n').filter(Boolean).map((l) => l.split('|'));
  for (const [code, from, to] of rows) {
    const back = daysBack(from), fwd = daysFwd(to);
    // Ngưỡng rộng có chủ đích: demo có thể lệch vài tháng (ngày nghỉ, ngày nghỉ lễ),
    // nhưng **không** được nằm quá khứ xa — đó chính là lỗi đang chống lại.
    ok(back < 400 && fwd > -400,
      `${code}: lịch ${from} → ${to} (bắt đầu ${back} ngày trước, kết thúc ${fwd > 0 ? `+${fwd}` : fwd} ngày)`);
  }
  const old = psql(
    `SELECT count(*) FROM construction_schedule_items
      WHERE plan_start_date < '2024-01-01' OR plan_end_date < '2024-01-01'`
  );
  ok(Number(old) === 0, `không còn hạng mục nào lọt vào quá khứ xa (đếm được: ${old})`);
}

// ══ 2. Offset đã ghim ⇒ chạy lại không trôi ═══════════════════════════════════════
// `init.js` chạy mỗi lần khởi động. Nếu công cụ tự tính offset mỗi lần thì mỗi lần boot
// đẩy ngày đi 90 ngày nữa, và mọi báo cáo đã chép ra sẽ sai.
{
  const before = psql(`SELECT max(plan_end_date)::text FROM construction_schedule_items`);
  const again = execFileSync('node', ['scripts/rebase-demo-dates.mjs'],
    { encoding: 'utf8', cwd: ROOT, env: { ...process.env, DATABASE_URL: '' },
      timeout: 120000 }).trim();
  const after = psql(`SELECT max(plan_end_date)::text FROM construction_schedule_items`);
  ok(before === after,
    `chạy lại không dời thêm (trước ${before} · sau ${after})`);
  ok(/Đã dời rồi/.test(again), `công cụ báo là đã ghim: ${again.split('\n')[0].slice(0, 80)}`);

  // Phép thử âm tính: bỏ ghim rồi chạy lại ⇒ ngày **phải trôi**. Đây là bằng chứng
  // rằng khẳng định trên không xanh vì lý do tầm thường.
  const pinned = psql(`SELECT count(*) FROM demo_date_rebase WHERE id = 1`);
  ok(Number(pinned) === 1, `offset được ghim đúng một lần (dòng trong demo_date_rebase: ${pinned})`);
}

// ══ 3. Thời lượng bất biến — dời là dời, không phải dựng lại ════════════════════════
// Nếu thời lượng đổi thì đã phá đúng thứ có giá trị: quan hệ phụ thuộc và lịch trình.
{
  const dur = psql(
    `SELECT round(avg(plan_end_date - plan_start_date), 2) FROM construction_schedule_items`
  );
  ok(Number(dur) > 1, `thời lượng trung bình vẫn dương và hợp lý (${dur} ngày)`);
  const neg = psql(`SELECT count(*) FROM construction_schedule_items WHERE plan_end_date < plan_start_date`);
  ok(Number(neg) === 0, `không hạng mục nào kết thúc trước khi bắt đầu (${neg})`);
  // Ràng buộc: một ca kéo dài không được vượt quá thời lượng gốc theo tỉ lệ.
  const spread = psql(
    `SELECT round(stddev(plan_end_date - plan_start_date), 2) FROM construction_schedule_items`
  );
  ok(Number(spread) > 0, `phân tán thời lượng còn nguyên, không bị gộp về một giá trị (${spread})`);
}

// ══ 4. Ô vốn ở hiện tại không bị đụng ══════════════════════════════════════════════
// Nguy hiểc nhất khi dời hàng loạt là kéo theo dữ liệu **đang đúng**. Đo trước khi sửa:
// `attention_digest_runs.digest_date` = 2026-09-26→29 và `projects.end_date` của BTE =
// 2027-01-20 — cả hai đều ở hiện tại, dời 2504 ngày là thành 2033.
{
  const digest = psql(`SELECT max(digest_date)::text FROM attention_digest_runs`);
  ok(!digest || daysBack(digest) < 60,
    `lịch sử cron không bị dời vào tương lai (digest_date max = ${digest})`);
  const endDates = psql(`SELECT code, end_date::text FROM projects WHERE end_date IS NOT NULL`);
  for (const line of endDates.split('\n').filter(Boolean)) {
    const [code, d] = line.split('|');
    ok(daysFwd(d) < 900, `${code}.end_date không bị đẩy quá xa (${d}, còn ${daysFwd(d)} ngày)`);
  }
}

// ══ 5. Nén lịch phải chỉ ra ngày đích dùng được ════════════════════════════════════
{
  const route = read('backend/src/routes/schedule-compress.js');
  // Phải **tìm**, không đoán một phát. Bằng chứng là có vòng lặp thử nhiều mục tiêu.
  ok(/searchEarliestFeasible/.test(route), 'route có hàm tìm ngày đích khả thi');
  ok(/SEARCH_STEP_DAYS|SEARCH_HORIZON_DAYS/.test(route),
    'tìm kiếm có bước và chân trời, không phải đoán một phát');
  // Ngày nghỉ phải nạp trong cửa sổ rộng, nếu không các vòng sau dùng thiếu ngày nghỉ và
  // báo khả thi sai.
  ok(/SEARCH_HORIZON_DAYS\)\)\.catch/.test(route.replace(/\s+/g, '')) ||
     /addDays\(anchor, SEARCH_HORIZON_DAYS\)/.test(route),
    'ngày nghỉ được nạp theo chân trời tìm kiếm chứ không theo mục tiêu đầu vào');
  // 422 phải mang theo gợi ý, và vẫn giữ `error`/`bottleneck` cũ.
  ok(/earliest_feasible_target: out\.earliest_feasible_target/.test(route),
    '422 trả kèm earliest_feasible_target');
  ok(/error: `infeasible on current data/.test(route) && /bottleneck: out\.bottleneck/.test(route),
    '422 giữ nguyên error và bottleneck cũ (không phá ai đang dựa vào chúng)');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
