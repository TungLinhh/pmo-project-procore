// Kiểm thử SONG SONG cho ba chỗ từng ghi đọc-rồi-ghi không khoá.
//
// Vì sao cần: mọi bài kiểm e2e hiện có chạy **tuần tự**, nên không bài nào
// thấy được lớp lỗi này. Hai bài trước đã từng xanh trong khi lỗi còn nguyên vì
// vậy — `cron-tenant-scope.mjs` phải sửa mới chạm được đúng đường cron.
//
// Ba tình huống dưới, tất cả đều **không cần may mắn về thời điểm**:
//
//   1. `revision_number` — tạo 6 bản sửa của cùng một bản gốc, gọi song song.
//      `routes/material-submittals.js` đọc `revision_number` của bản gốc **ngoài**
//      transaction rồi `+1`; không có unique index nào chặn. Hai request đồng thời
//      cùng đọc `0` ⇒ hai bản sửa "số 1".
//   2. apply hai lần cùng một scenario, song song — khoá `FOR UPDATE` trong
//      transaction phải khiến đúng một lần thắng, lần kia 409.
//   3. apply A, apply B, rồi rollback A — thứ tự này **tuần tự** cũng đã đủ để mất
//      dữ liệu nếu rollback khôi phục ảnh chụp cũ đè lên thay đổi của B. Đây là
//      biến thể tuần tự của cùng một lỗi, nên kiểm nó không cần chạy song song.
//
//   node tests/e2e/concurrency.mjs
import { api, loginAs, auth, ok, summary, psql } from './lib.mjs';
import { getDb, closeDb } from '../../backend/src/db/index.js';
import { cleanupProjectsOnExit, cleanupRowsOnExit } from './lib-cleanup.mjs';

// `admin` thay vì `ceo`: CEO bị 403 ở `POST /api/material-submittals`, còn
// apply/rollback scenario thì `CAN_APPROVE = [requireRole('admin','ceo'), …]` nên
// admin cũng đủ. Một tài khoản cho cả bài để không lẫn quyền.
const token = await loginAs('admin@hbg.com');
const H = auth(token);
const db = getDb();
const PROJECT = 1;


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['TST-CONC-%'], { label: 'concurrency' });
// Submittal thử **không** nằm trong dự án thử (mã `TST-CONC-…`, `project_id = 1` là
// dự án demo) nên `cleanupProjectsOnExit` không xoá được. Trước đây bài dọn chúng ở
// **cuối file**, nên mọi lần chết sớm để lại rác — và khẳng định "đã dọn submittal thử"
// đếm **toàn cục** (`LIKE 'TST-CONC-%'`) nên rác của lần chết sớm làm đỏ lần chạy sau.
//
// Đo 2026-09-28: chính lệnh chẩn đoán `node … | head -14` của tôi đóng pipe ⇒ node chết
// SIGPIPE trước đoạn dọn ⇒ 3 dòng rác ⇒ lần chạy kế sau đỏ ở đúng khẳng định đó.
// Đăng ký ở `exit` là cách duy nhất chịu được cả SIGPIPE, cả `process.exit(1)`.
cleanupRowsOnExit(
  [
    // Khớp theo `note` chứ không theo `resource_id`: các dòng audit tạo submittal từ
    // trước khi `withAudit` dựng được `resource_id` thật vẫn mang `resource_id = 0`
    // (đo 2026-09-28: 12 dòng `CREATE` ngày 02:22), nên lọc bằng id sẽ bỏ sót chúng.
    ['audit_log', "resource_type = 'material_submittal' AND note LIKE '%TST-CONC-%'"],
    ['material_submittals', "submittal_code LIKE 'TST-CONC-%'"],
  ],
  { label: 'concurrency-submittals' },
);
const stamp = Date.now().toString().slice(-7);
const madeSubmittals = [];
const madeScenarios = [];

// ---------------------------------------------------------------------------
// 1. revision_number khi tạo bản sửa song song
// ---------------------------------------------------------------------------
const parent = Number(psql(`
  INSERT INTO material_submittals (project_id, status, submittal_code, revision_number, created_at)
  SELECT ${PROJECT}, 'DRAFT', 'TST-CONC-P' || '${stamp}', 0, now()
  FROM projects WHERE id = ${PROJECT} RETURNING id`));

if (!parent) {
  ok(false, 'tạo được bản gốc để thử bản sửa');
} else {
  madeSubmittals.push(parent);
  ok(true, `tạo bản gốc #${parent} (revision 0)`);

  // 6 request cùng lúc, cùng một `parent_submittal_id`.
  const N = 6;
  const results = await Promise.all(Array.from({ length: N }, (_, i) => api('/api/material-submittals', {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      project_id: PROJECT,
      submittal_code: `TST-CONC-C${stamp}-${i}`,
      parent_submittal_id: parent,
    }),
  })));

  const created = results.filter((r) => r.status === 201);
  const conflicts = results.filter((r) => r.status === 409);
  for (const r of created) madeSubmittals.push(Number(r.data?.id).valueOf());

  // Mô hình là **chuỗi tuyến tính** (`revision = parent.revision + 1` cùng
  // `parent_submittal_id`), nên một bản gốc chỉ có thể có **một** bản sửa. Trước
  // khi sửa, cả 6 request đều 201 và cả 6 ghi `revision_number = 1`.
  ok(created.length === 1,
    `đúng một bản sửa được tạo (thấy ${created.length}); các mã khác: ${JSON.stringify(results.map((r) => r.status))}`);
  ok(conflicts.length === N - 1,
    `${N - 1} request còn lại bị từ chối bằng 409 (thấy ${conflicts.length})`);
  ok(conflicts.every((r) => /revision/i.test(String(r.data?.error || ''))),
    'thông điệp 409 nói rõ là xung đột bản sửa, không phải lỗi Postgres'
    + (conflicts[0] ? ` (thấy: "${conflicts[0].data?.error}")` : ''));

  // Bất biến quan trọng nhất: trong DB không được có hai dòng cùng
  // `(parent, revision)`. Đây là điều index unique `…_parent_revision_uq` bảo vệ.
  const dupes = psql(`
    SELECT count(*) FROM (
      SELECT parent_submittal_id, revision_number
      FROM material_submittals WHERE parent_submittal_id = ${parent}
      GROUP BY 1, 2 HAVING count(*) > 1
    ) x`);
  ok(dupes === '0', `không có nhóm (bản gốc, số thứ tự) nào trùng (thấy ${dupes})`);

  // Và chuỗi vẫn đi tiếp được: bản sửa của bản sửa phải nhận số +1.
  if (created.length) {
    const rev1 = Number(psql(`SELECT revision_number FROM material_submittals WHERE id = ${Number(created[0].data.id)}`));
    ok(rev1 === 1, `bản sửa đầu tiên nhận số 1 (thấy ${rev1})`);
    const next = await api('/api/material-submittals', {
      method: 'POST', headers: H,
      body: JSON.stringify({ project_id: PROJECT, submittal_code: `TST-CONC-N-${stamp}`, parent_submittal_id: Number(created[0].data.id) }),
    });
    ok(next.status === 201 && Number(next.data?.revision_number) === 2,
      `bản sửa tiếp theo trên bản sửa nhận số 2 (HTTP ${next.status}, rev=${next.data?.revision_number})`);
    if (next.status === 201) madeSubmittals.push(Number(next.data.id));
  }
}

// ---------------------------------------------------------------------------
// 2. apply cùng một scenario hai lần song song
// ---------------------------------------------------------------------------
// Cần một lịch mà nén **khả thi**. Không dùng lịch dự án demo: `runCompression` neo
// vào `todayStr()` (xem `lib/cpm.js`), mà lịch demo nằm ở 2019-2020, tức quá khứ
// so với "hôm nay" ⇒ `targetDays` âm ⇒ mọi case đều 422 với thông điệp gây hiểu
// nhầm. Dựng dự án thử riêng có lịch quanh hiện tại, dọn trong `finally`.
//
// Mắt xích: 5 hạng mục × 20 ngày, tuần tự, bắt đầu 10 ngày trước hôm nay ⇒ lịch
// dài ~100 ngày. Đích = hôm nay + 60 ngày ⇒ nén được (mỗi hạng 20 → 12, trần
// `min_pct` mặc định 0.5).
const TODAY = psql('SELECT CURRENT_DATE') || '';
const d = (days) => psql(`SELECT (CURRENT_DATE + (${days})::int)::date::text`);
const startDay = await d(-10);
const targetDay = await d(60);

const projId = psql(`
  INSERT INTO projects (tenant_id, code, name_vi, name_en, status, created_at)
  SELECT tenant_id, 'TST-CONC-' || '${stamp}', 'Dự án thử song song', 'Concurrency fixture', 'ACTIVE', now()
  FROM projects WHERE id = ${PROJECT} RETURNING id`);

let zoneId = null;
let scenarioA = null;

if (!projId || !startDay || !targetDay) {
  ok(false, `dựng được dự án thử (#${projId || 'không'}), ngày ${startDay} → ${targetDay}`);
} else {
  zoneId = psql(`
    INSERT INTO zones (project_id, code, name_vi, name_en)
    VALUES (${projId}, 'TST', 'Khu thử', 'Test zone') RETURNING id`);

  // 5 hạng mục nối tiếp, mỗi hạng 20 ngày, có quan hệ tiền tố/hậu tố.
  const itemIds = [];
  for (let i = 1; i <= 5; i += 1) {
    const s0 = psql(`SELECT (DATE '${startDay}' + (${(i - 1) * 20})::int)::date::text`);
    const e0 = psql(`SELECT (DATE '${s0}' + 20)::date::text`);
    const id = psql(`
      INSERT INTO construction_schedule_items
        (project_id, zone_id, name_vi, name_en, plan_start_date, plan_end_date,
         plan_duration_days, progress_pct, status, created_at)
      VALUES (${projId}, ${zoneId}, 'Hạng mục thử ${i}', 'Fixture item ${i}',
              '${s0}', '${e0}', 20, 0, 'NOT_STARTED', now()) RETURNING id`);
    itemIds.push(id);
    if (i > 1) {
      await db.prepare(`INSERT INTO schedule_links (project_id, predecessor_id, successor_id, link_type, lag_days)
                  VALUES (${projId}, ?, ?, 'FS', 0)`).runAsync(itemIds[i - 2], id);
    }
  }
  ok(itemIds.length === 5, `dựng 5 hạng mục nối tiếp cho dự án thử #${projId}`);

  const pv = await api(`/api/projects/${projId}/schedule-compress/preview`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ target_end_date: targetDay, name: `TST-CONC-A-${stamp}` }),
  });
  ok(pv.status === 201, `tạo scenario thử qua preview (HTTP ${pv.status}${pv.data?.error ? `: ${pv.data.error}` : ''})`);
  ok(pv.data?.feasible === true,
    `kịch bản nén khả thi trên dự án thử (feasible=${pv.data?.feasible}, tiết kiệm ${pv.data?.days_saved} ngày)`);
  if (pv.status === 201) {
    scenarioA = Number(pv.data.scenario_id);
    madeScenarios.push(scenarioA);
  }
}

if (scenarioA) {
  // Hai apply cùng lúc cho CÙNG một scenario: khoá `FOR UPDATE` phải khiến đúng
  // một lần thắng. Nếu cả hai cùng 200 thì trạng thái bị ghi đè hai lần.
  const [r1, r2] = await Promise.all([
    api(`/api/schedule-scenarios/${scenarioA}/apply`, { method: 'POST', headers: H, body: '{}' }),
    api(`/api/schedule-scenarios/${scenarioA}/apply`, { method: 'POST', headers: H, body: '{}' }),
  ]);
  const codes = [r1.status, r2.status].sort();
  ok(codes[0] === 200 && codes[1] === 409,
    `apply song song cùng một scenario: đúng một 200, một 409 (thấy ${JSON.stringify(codes)})`);

  // Chỉ một lần ghi trạng thái — kiểm bằng dấu vết audit, không tin HTTP status.
  //
  // Thông điệp lỗi mang kèm `scenarioA` và các dòng audit tìm thấy: đo 2026-09-28
  // bài đỏ 2 lần với số đếm 5 rồi 3 trong khi chạy cả bộ, nhưng chạy riêng thì luôn 1 —
  // không thể tái hiện. Không có id trong thông điệp thì lần đỏ sau lại phải đoán.
  const applies = psql(`SELECT count(*) FROM audit_log
    WHERE resource_type = 'schedule_scenario' AND resource_id = ${scenarioA} AND action = 'APPLY'`);
  const found = psql(`SELECT id || '/' || action || '/' || COALESCE(resource_id::text, 'NULL')
    FROM audit_log WHERE resource_type = 'schedule_scenario' ORDER BY id DESC LIMIT 8`)
    .split('\n').filter(Boolean);
  ok(Number(applies) === 1,
    `chỉ có 1 lần APPLY trong audit (thấy ${applies}; scenario=${scenarioA}; 8 dòng gần nhất: ${found.join(' ')})`);

  // Rollback ngay sau apply phải đi được — đây là đường hạnh phúc, và nó còn
  // đưa lịch về trạng thái gốc để phần 3 bắt đầu từ lịch chưa bị nén. Nếu bỏ,
  // phần 3 chạy trên lịch đã bị nén chặt nên cả hai kịch bản đều `days_saved = 0`
  // và không kiểm được gì (đã vấp đúng chỗ này).
  const rb = await api(`/api/schedule-scenarios/${scenarioA}/rollback`, { method: 'POST', headers: H, body: '{}' });
  ok(rb.status === 200, `rollback ngay sau apply → HTTP ${rb.status}${rb.data?.error ? `: ${rb.data.error}` : ''}`);
}

// ---------------------------------------------------------------------------
// 3. apply kịch bản cũ rồi rollback nó khi đã có kịch bản mới hơn
// ---------------------------------------------------------------------------
// Điều kiện để lỗi xảy ra: kịch bản **lỏng** phải được apply **trước**, kịch bản
// **chặt** apply **sau**. Nếu làm ngược thì kịch bản chặt đã nén tới mức kịch bản
// lỏng không còn gì để nén (`days_saved = 0`, vân tay trùng nhau) và rollback là
// hợp lệ. Đo được đúng như vậy ở lần thử đầu — bài kiểm tưởng hỏng nhưng hoá ra
// kịch bản viết sai.
let scenarioLoose = null;   // đích xa hơn → nén ít
let scenarioTight = null;   // đích gần hơn → nén nhiều
if (projId && scenarioA) {
  const pv2 = await api(`/api/projects/${projId}/schedule-compress/preview`, {
    method: 'POST', headers: H,
    body: JSON.stringify({
      // Đích phải **xa** đủ để bản nén nhẹ còn khả thi: với sàn 0.9 thì lịch chỉ
      // rút được ~10%, nên ép nó về +60 ngày sẽ 422 (đo được: calendar end
      // 2026-12-27 > target). +90 ngày là ngày kết thúc tự nhiên của lịch thử.
      target_end_date: await d(90), name: `TST-CONC-loose-${stamp}`,
      // `min_pct` = sàn thời lượng: 0.9 ⇒ chỉ bóp tối đa 10%. Kịch bản chặt dùng
      // mặc định 0.5. Nếu cả hai cùng chạm sàn thì ra cùng kết quả.
      policy: { min_pct: 0.9, min_days_floor: 1 },
    }),
  });
  if (pv2.status === 201) {
    scenarioLoose = Number(pv2.data.scenario_id);
    madeScenarios.push(scenarioLoose);
  }
  ok(Boolean(scenarioLoose),
    `tạo được kịch bản lỏng (đích +70 ngày) (HTTP ${pv2.status}${pv2.data?.error ? `: ${pv2.data.error}` : ''})`);

  // Cần một kịch bản **chưa apply** ở trạng thái DRAFT. Không dùng lại
  // `scenarioA` vì phần 2 đã apply nó, nên apply lại trả 409.
  const pv3 = await api(`/api/projects/${projId}/schedule-compress/preview`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ target_end_date: targetDay, name: `TST-CONC-tight-${stamp}` }),
  });
  if (pv3.status === 201) {
    scenarioTight = Number(pv3.data.scenario_id);
    madeScenarios.push(scenarioTight);
  }
  ok(Boolean(scenarioTight) && scenarioTight !== scenarioA,
    `tạo được kịch bản chặt mới ở DRAFT (HTTP ${pv3.status}${pv3.data?.error ? `: ${pv3.data.error}` : ''})`);
}

if (scenarioLoose && scenarioTight) {
  const lịch = () => psql(`SELECT coalesce(string_agg(coalesce(plan_start_date::text,'') || '|' || coalesce(plan_end_date::text,'') || '|' || coalesce(plan_duration_days::text,''), ',' ORDER BY id), '')
                              FROM construction_schedule_items WHERE project_id = ${projId}`);

  // 1) Apply kịch bản LỎNG trước — lịch ở trạng thái nén ít.
  const aLoose = await api(`/api/schedule-scenarios/${scenarioLoose}/apply`, { method: 'POST', headers: H, body: '{}' });
  ok(aLoose.status === 200, `apply kịch bản lỏng → HTTP ${aLoose.status}${aLoose.data?.error ? `: ${aLoose.data.error}` : ''}`);
  const lịchSauLoose = lịch();

  // 2) Apply kịch bản CHẶT — lịch bị kéo về ngắn hơn.
  const aTight = await api(`/api/schedule-scenarios/${scenarioTight}/apply`, { method: 'POST', headers: H, body: '{}' });
  ok(aTight.status === 200, `apply kịch bản chặt → HTTP ${aTight.status}${aTight.data?.error ? `: ${aTight.data.error}` : ''}`);
  const lịchSauTight = lịch();
  ok(lịchSauLoose !== lịchSauTight,
    'hai kịch bản cho ra hai trạng thái lịch khác nhau'
    + (lịchSauLoose === lịchSauTight ? ' — nếu trùng thì phần dưới không kiểm được gì' : ''));

  // 3) Rollback kịch bản CŨ (lỏng). Ảnh chụp `applied_before` của nó là trạng thái
  //    trước khi nén, nên ghi đè lúc này sẽ **xoá mất** thay đổi của kịch bản chặt
  //    vừa apply. Phải bị từ chối, hoặc thành công mà lịch phải không đổi.
  const rb = await api(`/api/schedule-scenarios/${scenarioLoose}/rollback`, { method: 'POST', headers: H, body: '{}' });
  const lịchSauRb = lịch();

  if (rb.status === 200) {
    ok(lịchSauTight === lịchSauRb,
      'rollback kịch bản cũ thành công mà KHÔNG xoá thay đổi của kịch bản mới');
  } else {
    ok(rb.status === 409, `rollback kịch bản cũ bị từ chối (HTTP ${rb.status}: ${rb.data?.error || 'không có thông điệp'})`);
    ok(/changed|newer|overwrite/i.test(String(rb.data?.error || '')),
      `thông điệp 409 giải thích lý do là lịch đã đổi (thấy: "${rb.data?.error}")`);
    ok(lịchSauTight === lịchSauRb, 'bị từ chối mà lịch giữ nguyên — không đụng vào dữ liệu');
  }

  // 4) Đường hạnh phúc: rollback kịch bản MỚI NHẤT thì phải đi được.
  const rbTight = await api(`/api/schedule-scenarios/${scenarioTight}/rollback`, { method: 'POST', headers: H, body: '{}' });
  ok(rbTight.status === 200,
    `rollback kịch bản mới nhất thì thành công (HTTP ${rbTight.status}${rbTight.data?.error ? `: ${rbTight.data.error}` : ''})`);
  ok(lịch() === lịchSauLoose,
    'sau khi rollback kịch bản mới nhất, lịch về đúng trạng thái của kịch bản lỏng');
}

// ---------------------------------------------------------------------------
// 4. Ghi chu trình vào lịch bằng hai request ngược chiều chạy song song
// ---------------------------------------------------------------------------
// Hai request `A→B` và `B→A` cùng lúc. Trước khi sửa, `validateNewLink` chạy trên
// ảnh chụp lấy **trước** `BEGIN` nên cả hai đều thấy đồ thị không chu trình, cùng qua
// kiểm tra, cùng commit — và chu trình được ghi vào. Hậu quả vĩnh viễn:
// `lib/cpm.js:topoSort` ném `cyclic schedule graph` cho mọi lần tính CPM, nên
// `schedule-compress/preview` và `apply` của dự án đó trả 500 tới khi ai đó xoá
// thủ công quan hệ. Nay kiểm tra nằm trong transaction sau `lockProject`.
if (projId) {
  // Fixture đã có sẵn chuỗi 1→2→3→4→5, nên phải chọn **hai đầu dãy**: cặp đó chưa có
  // quan hệ trực tiếp, `a→b` không tạo chu trình, và `b→a` thì đóng vòng. Chọn hai
  // hạng liền nhau sẽ đụng cạnh có sẵn và cả hai request đều bị 422 vì lý do khác —
  // bài kiểm xanh vì lý do sai.
  const row = psql(`SELECT (array_agg(id ORDER BY id))[1] AS a,
                           (array_agg(id ORDER BY id DESC))[1] AS b
                    FROM construction_schedule_items WHERE project_id = ${projId}`);
  const a = Number((row || '').split('|')[0]);
  const b = Number((row || '').split('|')[1]);
  ok(Boolean(a && b && a !== b), `có 2 hạng mục ở hai đầu dãy để thử chu trình (${a} ↔ ${b})`);

  if (a && b) {
    // **Vòng** N cạnh, tất cả bắn cùng lúc, thay vì đúng 2 cạnh ngược chiều.
    //
    // Lý do: với 2 request, cửa sổ tranh chấp quá hẹp để chắc chắn — đo được bài kiểm
    // 2-request **PASS 5/5 lần cả khi đã gỡ khoá**, tức nó không bắt được lỗi. Bài
    // kiểm không bắt được lỗi thì tệ hơn không có bài kiểm, vì nó tạo cảm giác an toàn.
    // Vòng 6 cạnh mở rộng cửa sổ đủ rộng: không khoá thì gần như chắc chắn có một
    // vòng được ghi vào; có khoá thì request sau chờ và thấy vòng nên bị 422.
    // Phải có **cả hai chiều**; nếu tất cả cùng một cạnh `a→b` thì index unique
    // `schedule_links_pred_succ_uq` chặn hết và vòng không bao giờ hình thành.
    //
    // ⚠️ **Bài này KHÔNG chứng minh được lỗi đã sửa.** Đo thật: bỏ `lockProject` và
    // đưa `validateNewLink` ra ngoài transaction, chạy lại 5 lần — **5/5 lần PASS**.
    // Cửa sổ tranh chấp quá hẹp để tái hiện trong môi trường này (đường request ngắn,
    // Node chạy JS một luồng, index unique chặn phần trùng). Giữ bài kiểm vì nó vẫn
    // bảo vệ **hợp đồng** quan trọng: không vòng nào được ghi và CPM không được gãy
    // sau đó. Nhưng đừng đọc là "đã chứng minh khoá hoạt động" — bằng chứng cho điều đó
    // là mã, không phải bài kiểm này. Xem mục 11.22 trong `docs/CODEBASE_BUG_AUDIT.md`.
    const HALF = 4;
    const ring = await Promise.all(Array.from({ length: HALF * 2 }, (_, k) => {
      const fwd = k % 2 === 0;
      return api(`/api/projects/${projId}/schedule-links`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          predecessor_id: fwd ? a : b, successor_id: fwd ? b : a, link_type: 'FS', lag_days: 0,
        }),
      });
    }));
    const created = ring.filter((r) => r.status === 201).length;
    const codes = {};
    for (const r of ring) codes[r.status] = (codes[r.status] || 0) + 1;
    ok(created === 1,
      `${HALF * 2} request (${HALF} mỗi chiều) chỉ tạo được đúng 1 cạnh — không có vòng (thấy ${created}; mã: ${JSON.stringify(codes)})`);
    ok(!ring.some((r) => r.status >= 500),
      `không request nào 5xx (mã: ${JSON.stringify(codes)})`);

    // Bằng chứng quyết định: đồ thị sau đó **không** có chu trình, nên CPM vẫn chạy.
    const cpm = await api(`/api/projects/${projId}/schedule-compress/preview`, {
      method: 'POST', headers: H, body: JSON.stringify({ target_end_date: await d(60), name: `TST-CONC-cyc-${stamp}` }),
    });
    ok(cpm.status === 201 || cpm.status === 422,
      `CPM vẫn tính được sau khi thử chu trình (HTTP ${cpm.status}) — không bị "cyclic schedule graph"`);
    ok(!/cyclic/i.test(String(cpm.data?.error || '')),
      `không có lỗi cyclic (thấy "${cpm.data?.error || 'không lỗi'}")`);
    if (cpm.status === 201) madeScenarios.push(Number(cpm.data.scenario_id));
  }
}

// ---------------------------------------------------------------------------
// Dọn
// ---------------------------------------------------------------------------
for (const id of madeScenarios) {
  // Trả lịch về trạng thái trước khi thử: xoá bản ghi scenario và rollback mọi
  // thay đổi còn treo.
  await db.prepare(`UPDATE schedule_scenarios SET status = 'APPLIED',
    result = result || jsonb_build_object('applied_before', COALESCE(result->'applied_before', '[]'::jsonb))
    WHERE id = ?`).runAsync(id).catch(() => {});
  await db.prepare('DELETE FROM schedule_scenarios WHERE id = ?').runAsync(id);
  await db.prepare("DELETE FROM audit_log WHERE resource_type = 'schedule_scenario' AND resource_id = ?").runAsync(id);
}
if (projId) {
  // FK notifications.project_id → projects: phải xoá thông báo trước, nếu không
  // lần dọn này ném lỗi ràng buộc và mọi dòng sau bị bỏ (bài dọn 3 lần trước đã
  // để lại dữ liệu vì đúng lý do này).
  await db.prepare('DELETE FROM notifications WHERE project_id = ?').runAsync(projId);
  await db.prepare('DELETE FROM schedule_links WHERE project_id = ?').runAsync(projId);
  await db.prepare('DELETE FROM construction_schedule_items WHERE project_id = ?').runAsync(projId);
  await db.prepare('DELETE FROM zones WHERE project_id = ?').runAsync(projId);
  await db.prepare('DELETE FROM projects WHERE id = ?').runAsync(projId);
  await db.prepare("DELETE FROM audit_log WHERE resource_type = 'projects' AND resource_id = ?").runAsync(projId);
}
if (madeSubmittals.length) {
  const list = madeSubmittals.join(',');
  await db.prepare(`DELETE FROM material_submittals WHERE id IN (${list})`).runAsync();
  await db.prepare(`DELETE FROM audit_log WHERE resource_type = 'material_submittal' AND resource_id IN (${list})`).runAsync();
}
await closeDb();

const leftSub = psql("SELECT count(*) FROM material_submittals WHERE submittal_code LIKE 'TST-CONC-%'");
ok(leftSub === '0', `đã dọn submittal thử (còn ${leftSub})`);
const leftSc = psql("SELECT count(*) FROM schedule_scenarios WHERE name LIKE 'TST-CONC-%'");
ok(leftSc === '0', `đã dọn scenario thử (còn ${leftSc})`);
const leftProj = psql("SELECT count(*) FROM projects WHERE code LIKE 'TST-CONC-%'");
ok(leftProj === '0', `đã dọn dự án thử (còn ${leftProj})`);

summary();
