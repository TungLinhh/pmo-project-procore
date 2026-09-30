#!/usr/bin/env node
// Disposable release gate: API, authorization, transaction, Control Layer,
// AI progress, browser smoke, lint/build and schema audit.
// It never runs SSO (explicitly out of scope) and never prints secrets.
import { spawn } from 'node:child_process';
import { writeFileSync, unlinkSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = fileURLToPath(new URL('..', import.meta.url));

// Chặn chạy hai gate cùng lúc, bằng khoá PID chứ không bằng `pgrep -f`.
//
// `pgrep -f 'release-gate'` báo động giả: nó khớp **mọi** tiến trình có chuỗi đó
// trong dòng lệnh, kể cả chính `bash -c` đang gọi gate — nên bản thứ hai luôn bị
// chặn oan. Đã thử và thấy đúng như vậy. Khoá PID chỉ nhận diện tiến trình thật.
//
// Vì sao cần: cổng `port` là của riêng gate này, nên bản thứ hai đâm cổng bản thứ
// nhất rồi `SIGTERM` tiến trình của nó; suite đang chạy báo
// `ECONNREFUSED 127.0.0.1:<port>` — trông y hệt hồi quy mã nguồn nhưng không
// phải, và suite bị giết giữa chừng thì để lại dữ liệu rò trong DB demo.
//
// Đã xảy ra hai lần trong một buổi, cả hai do chạy nền song song.
const LOCK = '/tmp/opencode/release-gate.lock';
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
let held = false;
try {
  mkdirSync('/tmp/opencode', { recursive: true });
  let holder = null;
  try { holder = Number(readFileSync(LOCK, 'utf8').trim()); } catch { /* chưa có khoá */ }
  if (holder && holder !== process.pid && alive(holder)) {
    console.error(`DỪNG: release-gate khác đang chạy (pid ${holder}).`);
    console.error(`Cổng ${port} dùng chung — chạy song song sẽ giết server của nhau và để lại dữ liệu rò.`);
    console.error('Chờ bản kia xong, hoặc nếu chắc nó đã chết: rm ' + LOCK);
    process.exit(2);
  }
  writeFileSync(LOCK, String(process.pid));
  held = true;
} catch { /* không ghi được khoá thì vẫn chạy — tốt hơn là chặn oan */ }
// Nhả khoá khi tiến trình kết thúc.
// Phải bắt SIGTERM/SIGINT **tường minh**: `process.on('exit')` KHÔNG chạy khi bị
// tín hiệu tắt, nên chỉ dựa vào nó thì gate bị `timeout` hay Ctrl-C sẽ để lại khoá
// cũ. Đã kiểm: `timeout 90` làm khoá còn nguyên.
//
// Dù khoá cũ cũng không chặn vĩnh viễn — lần chạy sau thấy pid đã chết thên chiếm
// khoá. Nhưng để lại rác thì thông báo "đang chạy" hiện ra với một pid chết, gây
// hiểu nhầm là gate còn sống.
const release = () => { if (!held) return; held = false; try { unlinkSync(LOCK); } catch { /* đã bị xoá tay */ } };
process.on('exit', release);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { release(); process.exit(1); });
const port = Number(process.env.RELEASE_GATE_PORT || 3147);
const base = `http://127.0.0.1:${port}`;
const reportPath = process.env.RELEASE_GATE_REPORT || '/tmp/opencode/release-gate.json';
const db = process.env.DATABASE_URL || 'postgresql://pmo_user:pmo_dev_pwd@127.0.0.1:5433/pmo';
const serverEnv = {
  ...process.env,
  DATABASE_URL: db,
  PORT: String(port),
  LOGIN_RATE_MAX: '1000',
  AI_RATE_MAX: '1000',
  AI_MONTHLY_CAP_USD: '20',
  AI_MOCK: '0',
};
const started = new Date().toISOString();
const results = [];
let server;

const run = (label, command, args, env = {}, timeoutMs = 20 * 60 * 1000) => new Promise((resolve, reject) => {
  const t0 = Date.now();
  console.log(`\n=== ${label} ===`);
  const child = spawn(command, args, { cwd: root, env: { ...serverEnv, ...env }, stdio: 'inherit' });
  const timer = setTimeout(() => {
    child.kill('SIGTERM');
    reject(new Error(`${label} timeout after ${timeoutMs}ms`));
  }, timeoutMs);
  child.on('error', (error) => { clearTimeout(timer); reject(error); });
  child.on('exit', (code, signal) => {
    clearTimeout(timer);
    const ok = code === 0;
    results.push({ label, ok, code, signal, duration_ms: Date.now() - t0 });
    if (ok) resolve();
    else reject(new Error(`${label} exited ${code ?? signal}`));
  });
});

const e2e = (script, env = {}) => run(script, 'node', [`tests/e2e/${script}`], { BASE_URL: base, ...env });

const waitForServer = async (isDead) => {
  for (let i = 0; i < 60; i += 1) {
    // Server chết thì dừng ngay. Chờ đủ 15 giây rồi báo "không khoẻ" là che mất
    // nguyên nhân thật, vốn đã nằm trong stderr.
    if (isDead()) throw new Error('release gate server đã chết trong lúc khởi động');
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('release gate server did not become healthy');
};

// Cổng đã bị chiếm thì dừng ngay, đừng thử chạy tiếp.
//
// Lý do: server cũ còn sống sẽ trả `/api/health` OK, nên `waitForServer` bên dưới
// tưởng server của mình đã lên và **âm thầm chạy toàn bộ gate trên code cũ**.
// Đã xảy ra: một tiến trình từ lần gate trước giữ cổng 3147, `spawn` báo
// EADDRINUSE nhưng `stdio: 'ignore'` nuốt mất, và gate báo FAIL vì lý do hoàn toàn
// khác với lý do thật. Tệ hơn nhiềa so với dừng: một lần gate chạy trên code cũ
// có thể báo PASS cho cả bộ kiểm.
const portInUse = (p) => new Promise((resolve) => {
  const socket = net.connect({ host: '127.0.0.1', port: p });
  const done = (used) => { socket.destroy(); resolve(used); };
  socket.setTimeout(1500);
  socket.once('connect', () => done(true));
  socket.once('timeout', () => done(false));
  socket.once('error', () => done(false));
});

if (await portInUse(port)) {
  // Báo rồi thoát. Không vào `try`/`finally` vì chưa có server nào để dọn, và
  // dừng ở đây là chính xác: chạy tiếp nghĩa là đo code cũ.
  console.error(
    `\nRELEASE GATE FAILED: cổng ${port} đã bị chiếm.\n`
    + `Một server cũ còn sống sẽ khiến gate chạy trên code cũ và báo kết quả sai.\n`
    + `Dừng tiến trình đó trước:  fuser -k ${port}/tcp   `
    + `(hoặc đổi RELEASE_GATE_PORT sang cổng khác).`,
  );
  results.push({ label: 'release-gate', ok: false, error: `port ${port} already in use` });
  writeFileSync(reportPath, JSON.stringify({ started, finished: new Date().toISOString(), base_url: base, sso: 'excluded by request', results, passed: false }, null, 2));
  process.exit(1);
}

let serverExited = null;
const serverLog = [];
try {
  // stderr giữ lại thay vì `ignore`: nếu server chết vì lý do gì đó, thấy được
  // ngay thay vì mất 15 giây chờ rồi báo chung chung "không khoẻ".
  server = spawn('node', ['backend/src/index.js'], {
    cwd: root, env: serverEnv, stdio: ['ignore', 'ignore', 'pipe'],
  });
  server.stderr.on('data', (chunk) => { serverLog.push(String(chunk)); });
  server.on('exit', (code, signal) => { serverExited = { code, signal }; });
  await waitForServer(() => serverExited);
  if (serverExited) {
    throw new Error(
      `server của gate đã chết ngay (code=${serverExited.code} signal=${serverExited.signal}). `
      + `stderr: ${serverLog.join('').slice(-600)}`,
    );
  }

  // Core API, payment, approval and schema contracts.
  for (const script of ['api.mjs', 'payment-sla.mjs', 'shop-approval.mjs', 'schema.mjs']) await e2e(script);

  // Authorization, tenant isolation and project scope.
  for (const script of [
    'p2-authz-matrix.mjs', 'p2-tenant-access.mjs', 'auth-tenant.mjs',
    'cross-tenant-guard.mjs', 'project-list-roles.mjs', 'dashboard-scope.mjs',
    'file-access.mjs', 'p1-ceo-roles.mjs', 'audit-scope.mjs', 'erp-push-scope.mjs',
  ]) await e2e(script);

  // Auth, session, MFA and password rotation. SSO is intentionally excluded.
  // auth-rate-limit.mjs is run separately because it requires the default
  // LOGIN_RATE_MAX=10, while the long release gate raises the limit to avoid
  // unrelated suites tripping the shared limiter.
  for (const script of [
    'p2-jwt-auth.mjs', 'p2-password-auth.mjs', 'password-rotation.mjs', 'mfa.mjs',
    'refresh-reuse.mjs', 'realtime.mjs',
  ]) await e2e(script);

  // Cron paths: they carry no request, so no app.current_tenant. A broken RLS
  // hatch makes them fail silently, which is exactly why they need a test.
  for (const script of ['digest-cron-rls.mjs', 'attention.mjs']) await e2e(script);
  // Cron KHÔNG có ngữ cảnh tenant ⇒ RLS mở hatch ⇒ truy vấn không khoá tenant trả
  // dữ liệu mọi tenant. Đã tích luỹ 25 dòng thông báo rò chéo tenant trong DB
  // (mã dự án, mã submittal, tên PM) trước khi sửa.
  await e2e('cron-tenant-scope.mjs');
  // Song song: 6 request tạo bản sửa của cùng bản gốc (từng ra 6 bản "số 1"),
  // apply song song cùng scenario (khoá FOR UPDATE), và rollback kịch bản cũ khi
  // đã có kịch bản mới hơn (từng xoá mất lịch không có dấu vết). Bài dựng dự án
  // thử riêng vì `runCompression` neo vào hôm nay còn lịch demo nằm ở 2019-2020.
  await e2e('concurrency.mjs');
  // `entitlements.js` fail-open: plan lạ hoặc tenant đọc lỗi ⇒ mở khoá toàn bộ
  // feature flag. Nay fail-closed về 'small' có log.
  await e2e('entitlements-fail-closed.mjs');
  // Gọi `checkProjectAccess` bên trong transaction sẽ lấy connection thứ hai từ pool
  // ⇒ đủ PG_POOL_MAX (10) request song song là chết pool. Đo trước khi sửa: 13 699 ms
  // + `timeout exceeded when trying to connect`. Sau: 87 ms.
  await e2e('sync-pool.mjs');
  // Thông báo chéo khách hàng: `notify()` không kiểm tenant của người nhận, và
  // `user_ids` đi thẳng từ body. `upload-access.js` cũng thiếu so sánh `tenant_id`.
  await e2e('notify-tenant-scope.mjs');
  await e2e('upload-tenant-scope.mjs');

  // Transactions, concurrency, sync and schema ledger.
  for (const script of ['p3-transitions.mjs', 'p3-txaudit.mjs', 'p3-pool.mjs', 'p3-ledger.mjs', 'p1-02-sync.mjs', 'p4-sync-apply.mjs']) await e2e(script);

  // Control Layer and derived metrics.
  for (const script of ['cpm.mjs', 'pillar-sim.mjs', 'pillar-gates.mjs', 'health-thresholds.mjs', 's-curves.mjs', 'manpower-plan.mjs']) await e2e(script);

  // Money, retention and AI progress safety.
  for (const script of ['payment-ar.mjs', 'p5-money.mjs', 'p5-golden.mjs', 'sp-ap-unknown-payment.mjs', 'ai-progress-proposals.mjs', 'ai-progress-concurrency.mjs']) await e2e(script);

  // Regression suite for the 2026-09-25/26 fix wave. Each check corresponds to a
  // shipped defect, so a revert of any single fix turns exactly one check red.
  await e2e('regression-wave5.mjs');

  // SRS 9.1 value reconciliation. Slow (parses every pilot workbook) and needs
  // reference_sheets/, so it is a gate step but not part of `npm test`.
  await e2e('reconcile-values.mjs');

  // Performance, monitoring surface, retention and production checker.
  await e2e('perf.mjs');
  await e2e('monitoring.mjs');
  await e2e('retention.mjs');
  await e2e('production-readiness.mjs');
  // Storage hygiene is reported, never auto-fixed: uploads grow without bound
  // and the app never deleted them, so an unreferenced pile-up must be visible
  // in the gate rather than discovered when a volume fills up.
  await run('storage gc (dry run)', 'node', ['scripts/storage-gc.mjs']);

  // Frontend build/lint, browser smoke and schema audit.
  await run('frontend lint', 'npm', ['run', 'lint', '--workspace=frontend']);
  await run('frontend build', 'npm', ['run', 'build', '--workspace=frontend']);
  await e2e('browser.mjs');
  // Hộp thoại: Escape, ngữ nghĩa dialog, focus vào/ra. Script này chỉ mở rồi
  // đóng hộp thoại, không ghi gì — khác `ui-verify-control-layer.mjs` bật/tắt
  // MFA và sửa cấu hình gate nên cố ý không đưa vào gate.
  await run('ui modal semantics', 'node', ['scripts/ui-verify-modal.mjs'], { BASE_URL: base });
  // Lỗi tải dữ liệu phải hiện ra cho người dùng. Trước đợt 7, `projects.list()` ở 6
  // màn không `.catch` nên API hỏng là màn trống im lặng, trông y hệt "chưa có dữ
  // liệu". Script chặn `GET /api/projects` rồi đòi thấy thông báo lỗi.
  await run('ui load errors visible', 'node', ['scripts/ui-verify-load-error.mjs'], { BASE_URL: base });
  await run('schema audit', 'node', ['tests/tools/schema-audit.mjs']);
  // Hai lỗi lặp lại dễ quay lại nên phải có máy bắt, không chỉ ghi vào tài liệu:
  //  · `.then()` không `.catch` — lỗi tải dữ liệu thành màn trống im lặng.
  //  · nhãn trong sổ tay lệch với mã nguồn — người đọc tìm không thấy nút đó.
  await run('promise catch coverage', 'node', ['scripts/find-missing-catch.mjs']);
  await run('guide labels in sync', 'node', ['scripts/check-guide-labels.mjs']);
  // Endpoint có phân trang: kiểm đúng hình dạng body + header tổng, đủ cả biến
  // thể có bộ lọc. Một truy vấn đếm thiếu JOIN đã làm /payment-requests trả 500
  // mà chỉ `p5-money.mjs` mới bắt được — quá hẹp.
  await run('paged endpoints shape', 'node', ['scripts/check-paged-endpoints.mjs'], { BASE_URL: base });
  // 5xx phải đi qua `errorBody()`: bọc trong `res.status(500)` vừa lộ lỗi Postgres ở
  // production (đo 2026-09-28: `value too long for type character varying(100)` lọt
  // thẳng ra client), vừa nuốt mất `e.status` mà `lib/baseline.js` cố ý bơm vào.
  await run('5xx bodies go through errorBody', 'node', ['scripts/check-5xx-bodies.mjs']);
  // KHÔNG đặt `check-id-reuse.mjs` ở đây — đã thử và nó **tự đỏ chính mình**: bài kiểm của
  // gate tạo rồi xoá dữ liệu thử, nên mốc `audit_log` dịch lên trong lúc gate chạy, và
  // đến lượt bài canh gác thì nó báo nguy cơ do chính gate tạo ra. Đó là đặc tính của
  // bất biến này (mốc chỉ đúng tại lúc nó được đo), không phải lỗi. Nó thuộc
  // `deploy/single-machine/install.sh`, chạy **trước** khi dịch vụ lên.
  // Danh mục demo: `init.js` là bước chuẩn bị demo đầu tiên, hỏng nó thì màn Dữ liệu
  // chủ trống lúc trình diễn. Kiểm cả MST bịa không trùng doanh nghiệp thật.
  await run('master data seed', 'node', ['scripts/check-master-seed.mjs']);
  // Sửa / ẩn / kích hoạt lại danh mục (2026-09-27). Bài e2e chạy trực tiếp trên
  // server; bài trình duyệt kiểm phần API không soi được — form sửa có điền sẵn
  // dữ liệu cũ không, và nút ẩn có hỏi trước không.
  await e2e('master-data-crud.mjs');
  await run('ui master data edit', 'node', ['scripts/ui-verify-master-data.mjs'], { BASE_URL: base });
  // i18n: ratchet chặn chuỗi tiếng Việt cứng tăng thêm + parity VI/EN, và một
  // kiểm thật trên trình duyệt bắt loại "dịch nửa vời" (khung đã dịch, đơn vị còn
  // tiếng Việt).
  await run('i18n ratchet + parity', 'node', ['scripts/check-i18n.mjs']);
  // Tiêu đề bảng gọi `th()` mà thiếu bản dịch: ở chế độ EN cột đó **vẫn hiện tiếng
  // Việt** mà không có gì báo. `check-i18n.mjs` cố ý bỏ `th("…")` khỏi số đếm nên
  // không thấy loại này — phải có một bài riêng.
  await run('table headers translated', 'node', ['scripts/check-table-headers.mjs']);
  // oxlint mặc định thoát 0 dù có cảnh báo, nên `npm run lint` báo "78 warnings" mà
  // vẫn xanh. Đã có 8 chỗ dùng `<Modal>` không import: build thành công, gate xanh,
  // người dùng bấm nút thì trang sập. Bài này biến đúng các quy tắc báo lỗi lúc
  // chạy thành lỗi thật.
  await run('frontend lint (runtime rules)', 'node', ['scripts/check-frontend-lint.mjs']);
  // Tham số callback tên `t` che hàm dịch: build xanh, `no-undef` không báo (vì `t`
  // đã import ở phạm vi ngoài), `no-unused-vars` cũng không báo (vì `t` còn dùng
  // chỗ khác). Đã mắc ở Materials, Ops, FieldStubs — mỗi lần đều là màn trắng.
  await run('i18n not shadowed by callback param', 'node', ['scripts/check-i18n-shadow.mjs']);
  // `t()` trong biến cấp module ⇒ nhãn đóng băng, không đổi khi bấm [VI|EN]. Đo
  // được 43 chỗ ở 6 file (STATUS_LABELS, TYPES, METRIC_LABELS, DIR_HINT, STEPS…).
  await run('i18n labels not frozen at module scope', 'node', ['scripts/check-i18n-module-scope.mjs']);
  // Điểm mù của bộ đo i18n: nó chỉ đo chuỗi CÓ dấu tiếng Việt, nên nhãn tiếng Anh
  // (`>Total<`, `placeholder="Search..."`) không bao giờ bị đo. Đo thực tế: 145 chỗ ở 40
  // file — giao diện tiếng Việt hiện chữ Anh. Lần này là lần thứ hai của cùng điểm mù.
  await run('no hardcoded English labels in JSX', 'node', ['scripts/check-hardcoded-labels.mjs']);
  // `t()` trả về chính khoá khi thiếu ⇒ UI hiện `G.FILTER` mà không có lỗi console.
  // `check-i18n.mjs` không bắt được (nó đếm chuỗi tiếng Việt trong JSX, không phải từ điển).
  // Đã mắc thật ở đợt 14: 51 khoá ghi sai, chỉ khi chạy trình duyệt mới thấy.
  await run('every t() key resolves, every th() key in th.js', 'node', ['scripts/check-i18n-keys.mjs']);
  await run('ui i18n completeness', 'node', ['scripts/ui-verify-i18n.mjs'], { BASE_URL: base });
  // Hộp thoại gọi confirm() từ bên trong nó = lớp phủ chồng lên nhau. Chưa màn nào
  // vậy; nếu có thì ngăn xếp Escape trở thành mã quan trọng và cần người biết.
  await run('nested confirm guard', 'node', ['scripts/check-nested-confirm.mjs']);

  // Real provider evaluation is opt-in because it spends quota and takes minutes.
  if (process.env.RELEASE_RUN_AI === '1') {
    await e2e('ai-srs-evaluation.mjs', { AI_EVAL_PROJECT_ID: process.env.AI_EVAL_PROJECT_ID || '1', AI_EVAL_OUTPUT: process.env.AI_EVAL_OUTPUT || '/tmp/opencode/ai-srs-evaluation.json' });
  }
} catch (error) {
  results.push({ label: 'release-gate', ok: false, error: error.message });
  console.error(`\nRELEASE GATE FAILED: ${error.message}`);
} finally {
  server?.kill('SIGTERM');
  const report = { started, finished: new Date().toISOString(), base_url: base, sso: 'excluded by request', results, passed: results.every((r) => r.ok) };
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nRELEASE GATE REPORT: ${reportPath}`);
  if (!report.passed) process.exitCode = 1;
}
