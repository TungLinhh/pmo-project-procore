#!/usr/bin/env node
// Chạy TẤT CẢ bài e2e, kể cả những bài `release-gate.mjs` không gọi.
//
// Vì sao cần: repo có 142 bài `tests/e2e/*.mjs` nhưng gate chỉ gọi 55. 88 bài **chưa
// từng được chạy** trong đợt này, nên không thể nói "hệ thống ổn" khi phần lớn bài kiểm
// chưa từng chạy. Bộ này chỉ báo cáo trung thực, không chặn.
//
//   node scripts/run-all-e2e.mjs                 # chạy tuần tự
//   node scripts/run-all-e2e.mjs --filter=step1  # lọc theo tên
//   node scripts/run-all-e2e.mjs --skip-known-blocked
//
// Tuần tự là bắt buộc: các bài dùng chung một database demo, chạy song song sẽ
// đụng dữ liệu của nhau và làm hỏng đúng những bài đang kiểm.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { join } from 'node:path';

const E2E = 'tests/e2e';
const ROOT = process.cwd();
const SHARED_BASE = 'http://127.0.0.1:3000';
const ALL = readdirSync(E2E).filter((f) => f.endsWith('.mjs'));

// Không phải bài kiểm.
const NOT_A_TEST = new Set(['lib.mjs', 'lib-cleanup.mjs', 'cleanup-demo.mjs']);

// Bài **đo** thì phải chạy một mình: chúng dùng server dùng chung `:3000` và khẳng
// định ngưỡng độ trễ. Chạy chung với 130 bài còn lại thì phép đo bị nhiễu và bài đỏ
// trông như lỗi hiệu năng sản phẩm. Đo 2026-09-28: `perf.mjs` đỏ khi chạy trong bộ,
// ALL PASS khi chạy một mình.
const RUN_ALONE = ['perf.mjs'];

// Chạy **cuối cùng**, và **không** nâng `LOGIN_RATE_MAX`: bài này cố tình dính 429
// để kiểm giới hạn. Chạy giữa bộ sẽ làm các bài sau nhận 429. Đưa nó vào
// `NEEDS_EXTERNAL` là né, không phải giải quyết.
const RUN_LAST = ['auth-rate-limit.mjs'];

// Cờ phải bật trên **server dùng chung** cho bài này (bài tự dựng IdP giả lập,
// không cần gì ngoài đời). Đo 2026-09-28: bỏ qua vì lý do 'cần IdP' là sai —
// bài tự làm IdP; chạy thật với cờ bật là ALL PASS.
const SHARED_SERVER_ENV = { ALLOW_SSO_INLINE_SECRET: '1' };

// Cần ngoài môi trường này — SKIP, không tính là lỗi sản phẩm.
//
// Mỗi lý do dưới đây đều **đã bị kiểm chứng**, không phải phỏng đoán. Đợt 17 phát
// hiện 10 lý do ở đây là sai và mỗi lý do sai đều giấu một bài chạy được:
//
//   - 4 bài `step1-01..04` ghi *"cần file nguồn BTE"* nhưng `step1-01`/`02` **tự dựng
//     workbook** (0 tham chiếu `BTE_DATA_DIR`) và `step1-03`/`04` chỉ cần dịch tên —
//     dữ liệu thật nằm ngay trong `reference_sheets/`. Nay cả 4 ALL PASS.
//   - 2 bài ERP ghi *"cần ERP thật"* nhưng cả hai tự spawn server và bắn vào **HTTP
//     stub localhost** ("No real network beyond localhost"). Chạy thật: ALL PASS.
//   - 2 bài AI ghi *"tốn phí"* — đúng, nhưng đã chạy và xanh (8/8 câu hỏi, kể cả câu
//     hỏi thiếu dữ liệu bị từ chối đúng). Nay là `RUN_AI` bật bằng `RUN_AI=1`.
//
// Bài học: một mục trong danh sách bỏ qua là **khẳng định** về môi trường. Sai một lần là
// một bài chưa từng chạy — và `AGENTS.md` đã ghi đúng lần trước: 87 bài chưa từng chạy là
// nơi giấu lỗi nặng nhất. Thêm mục mà chưa thử chạy thì đừng ghi lý do.
const NEEDS_EXTERNAL = {
  // Rỗng — và đó là kết quả của việc kiểm từng mục thay vì tin lời giải thích.
  //
  // Lịch sử: đợt 17 xoá 4 mục có lý do lỗi thời; đợt 18 xoá tiếp 6 mục
  // (2 ERP tự dựng HTTP stub, 2 AI chạy thật với nhà cung cấp, 4/6 bài `step1` chỉ thiếu
  // việc dịch tên file nguồn). Đợt 19 xoá nốt 4 bài "Docker" — cả bốn đều **không cần
  // Docker daemon**, và chính chúng đã ghi rõ ở dòng đầu:
  //   - `p0-08-docker-context`: "No docker daemon here" — kiểm COPY/lockfile tĩnh
  //   - `p2-01-docker-build`: "hermetic — no daemon, no /tmp" — kiểm cấu trúc tĩnh
  //   - `p4-docker`: "no docker daemon here — static + unit checks"
  //   - `p4-docker-verify`: cần **ứng dụng** ở :3000 + Postgres, không cần container
  // Cả bốn nay ALL PASS (verify: 27/27).
  //
  // Còn lại duy nhất là 2 bài `step1-05`/`step1-06` cần **sổ S&P của khách hàng** — file đó
  // không có trên máy này (đo: cả 14 file `Vật tư *.xlsx` có cột thanh toán nhưng ô rỗng).
  // Hai bài tự in đường dẫn cần đặt, nên không cần khai trong danh sách bỏ qua.
  //
  // **Bài học giữ lại:** mỗi mục trong danh sách này là một *khẳng định* về môi trường. Từ
  // 17 → 8 → 2, và 6 mục trong số đó hóa ra sai vì *ai đó tin lời giải thích* thay vì
  // chạy thử. Trước khi thêm một mục, hãy chạy thử bài đó một lần.
  //
  // Nhóm gọi AI thật vẫn nằm ở `RUN_AI` (bật bằng `RUN_AI=1`) — không phải vì thiếu gì, mà
  // vì chậm và tốn phí; cả hai đã chạy thật và xanh (8/8 câu hỏi, $0).
};

// Gọi nhà cung cấp AI **thật**: đúng và chậm (>240s) và tốn phí, nên không chạy mặc định.
// Chạy: `RUN_AI=1 node scripts/run-all-e2e.mjs`. Cần `OPENROUTER_API_KEY` trong môi
// trường chạy bộ (nạp từ `backend/.env` nếu cần).
const RUN_AI = ['demo-real-ai.mjs', 'ai-srs-evaluation.mjs'];


const args = process.argv.slice(2);
const filter = (args.find((a) => a.startsWith('--filter=')) || '').slice(9);
const perTestMs = Number((args.find((a) => a.startsWith('--timeout=')) || '').slice(10)) || 180000;
const onlyExternal = args.includes('--only-external');

function run(file, envOverride = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    // `LOGIN_RATE_MAX=1000` **bắt buộc** khi chạy cả bộ: giới hạn mặc định là
    // 10 đăng nhập/phút/IP, và 130+ bài đăng nhập liên tiếp sẽ dính 429 — biểu hiện là
    // hàng loạt khẳng định `got 401` trong `p2-jwt-auth`, `p1-real-numbers`,
    // `p2-jobs-masterdata`, `p1-project-close`… (đo 2026-09-28: 9 bài đỏ, tất cả vì
    // một nguyên nhân). Bài `auth-rate-limit.mjs` **tự kiểm hạn mức này** nên nó nằm
    // trong `NEEDS_EXTERNAL` và không bị ảnh hưởng.
    const child = spawn('node', [join(E2E, file)], {
      env: { ...process.env, LOGIN_RATE_MAX: '1000', ...SHARED_SERVER_ENV, ...envOverride },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    const cap = (b) => { if (out.length < 200000) out += b; };
    child.stdout.on('data', cap);
    child.stderr.on('data', cap);
    const timer = setTimeout(() => child.kill('SIGKILL'), perTestMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      sweepStrayServers();
      resolve({ code, signal, out, ms: Date.now() - started });
    });
  });
}

// Dừng mọi server backend mà bài kiểm vừa để lại.
//
// Vì sao cần: nhiều bài tự spawn `backend/src/index.js` với `stdio: 'ignore'`, nên khi
// cổng đã bị chiếm thì spawn **thất bại trong im lặng** và bài nói chuyện với server cũ
// của lần chạy trước — mang cấu hình khác. Đo 2026-09-28: `p2-jwt-auth` spawn server
// với `ACCESS_TTL_SEC=3` trên cổng 3107, mà cổng đó còn bị server cũ giữ ⇒ test nhận
// token TTL 24h và đỏ "expired access → 401" — trông như lỗi sản phẩm nhưng hoàn toàn
// là hạ tầng của bộ chạy. Giữ `:3000` vì đó là server dùng chung cho bài không tự spawn.
function sweepStrayServers() {
  try {
    const pids = execSync("pgrep -f 'node .*backend/src/index.js' || true", { encoding: 'utf8' })
      .split('\n').map((x) => x.trim()).filter(Boolean);
    for (const pid of pids) {
      if (String(pid) === String(process.pid)) continue;
      let env = '';
      try { env = readFileSync(`/proc/${pid}/environ`, 'utf8'); } catch { continue; }
      const port = (env.match(/(?:\0|\n)PORT=(\d+)/) || [])[1];
      if (port && port !== '3000') { try { process.kill(Number(pid), 'SIGKILL'); } catch { /* đã chết */ } }
    }
  } catch { /* pgrep không có sẵn: bỏ qua, không chặn bộ chạy */ }
}

// Khởi động **server dùng chung** (`:3000`) do chính bộ chạy quản lý.
//
// Vì sao phải tự khởi động: trước đây bộ chạy giả định người chạy đã bật sẵn server ở
// `:3000`. `LOGIN_RATE_MAX=1000` trong `run()` chỉ áp cho **tiến trình bài kiểm**, không
// áp cho server — nên bộ chạy vẫn trở thành nạn nhân của chính bẫy mà nó ghi cảnh báo.
// Đo 2026-09-28: server khởi động tay thiếu `LOGIN_RATE_MAX` ⇒ `auth-tenant.mjs` và
// `audit-scope.mjs` đỏ toàn `429`/`401` (`Quá nhiều lần thử, vui lòng đợi một phút`) trong
// khi sản phẩm không hỏng gì.
//
// `DATABASE_URL` bị **xoá khỏi** môi trường server: export nó ra làm `db/index.js` bỏ
// qua `backend/.env`, mất `APP_DB_USER`, pool chạy bằng owner ⇒ **mất RLS**. `backend/.env`
// đã có đủ `DATABASE_URL` lẫn `APP_DB_*`.
function startSharedServer() {
  const child = spawn('node', ['src/index.js'], {
    cwd: join(ROOT, 'backend'),
    env: (() => {
      const e = { ...process.env, PORT: '3000', LOGIN_RATE_MAX: '1000', ...SHARED_SERVER_ENV };
      delete e.DATABASE_URL;
      delete e.AI_MOCK;
      // `ai-srs-evaluation.mjs` gọi `/api/ai/ask` trên **server dùng chung**, nên key
      // phải nằm trong env của server (bài không tự nạp). Nạp từ `backend/.env` khi
      // người chạy chưa đặt — nếu không thì bài sẽ báo BLOCKED và bị tính là fail.
      if (!e.OPENROUTER_API_KEY) {
        try {
          const line = readFileSync('backend/.env', 'utf8')
            .split('\n').find((l) => l.startsWith('OPENROUTER_API_KEY='));
          if (line) e.OPENROUTER_API_KEY = line.slice(line.indexOf('=') + 1).trim();
        } catch { /* không có .env thì bài tự báo BLOCKED */ }
      }
      return e;
    })(),
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  process.on('exit', () => { try { child.kill('SIGKILL'); } catch { /* đã chết */ } });
  return child;
}

async function waitForServer(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${SHARED_BASE}/api/health`);
      if (r.ok) return true;
    } catch { /* chưa lên */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

const report = [];
let pass = 0; let fail = 0; let skip = 0;

// Dọt cổng `:3000` trước, rồi bật server. Dọt trước vì server cũ giữ cổng thì spawn
// mới **thất bại trong im lặng** (xem `sweepStrayServers`).
//
// `BASE_URL` do người chạy đặt thì bộ chạy **không** tự bật server — khi đó người chạy
// tự chịu trách nhiệm cấu hình, và bộ chạy nhắc lại bẫy `LOGIN_RATE_MAX` cho rõ.
if (process.env.BASE_URL) {
  console.log('  ! BASE_URL được đặt — bộ chạy không tự bật server dùng chung.');
  console.log('    Server phải có LOGIN_RATE_MAX=1000, nếu không sẽ dính 429 và bài đỏ toàn 401.');
} else {
  try { execSync('fuser -k 3000/tcp 2>/dev/null || true', { stdio: 'ignore' }); } catch { /* không có fuser */ }
  startSharedServer();
  if (!(await waitForServer())) {
    console.log('  ✗ server dùng chung :3000 không lên trong 45s — dừng bộ chạy.');
    process.exit(1);
  }
}

// Bước 1: các bài đo, chạy một mình, **trước** khi bộ còn lại làm tải hệ thống.
for (const file of ALL.filter((f) => RUN_ALONE.includes(f))) {
  if (NOT_A_TEST.has(file)) continue;
  process.stdout.write(`  … ${file} (chạy một mình)`);
  const r = await run(file);
  const lines = r.out.split('\n').filter((l) => /^FAIL|Error|error:/.test(l)).slice(0, 3);
  const status = r.code === 0 ? 'PASS' : 'FAIL';
  if (status === 'PASS') pass += 1; else fail += 1;
  report.push({ file, status, code: r.code, ms: r.ms, lines });
  console.log(`\r  ${status === 'PASS' ? '✓' : '✗'} ${file} (đơn)  ${Math.round(r.ms / 1000)}s   `);
  if (lines.length) for (const l of lines) console.log(`       ${l.slice(0, 140)}`);
}

// Bước 2: toàn bộ bài còn lại (trừ nhóm đo và nhóm chạy cuối).
for (const file of ALL) {
  if (RUN_ALONE.includes(file) || RUN_LAST.includes(file)) continue;
  if (NOT_A_TEST.has(file)) { skip += 1; report.push({ file, status: 'HELPER' }); continue; }
  if (filter && !file.includes(filter)) continue;
  if (RUN_AI.includes(file) && !process.env.RUN_AI && !onlyExternal) {
    skip += 1;
    report.push({ file, status: 'SKIP', why: 'gọi AI thật — bật bằng RUN_AI=1' });
    continue;
  }
  if (NEEDS_EXTERNAL[file] && !onlyExternal) {
    skip += 1;
    report.push({ file, status: 'SKIP', why: NEEDS_EXTERNAL[file] });
    continue;
  }
  process.stdout.write(`  … ${file}`);
  const r = await run(file);
  const fails = (r.out.match(/^FAIL/gm) || []).length;
  const status = r.code === 0 ? 'PASS' : 'FAIL';
  if (status === 'PASS') pass += 1; else fail += 1;
  const lines = r.out.split('\n').filter((l) => /^FAIL|Error|error:|AssertionError/.test(l)).slice(0, 4);
  report.push({ file, status, code: r.code, signal: r.signal, ms: r.ms, fails, lines });
  console.log(`\r  ${status === 'PASS' ? '✓' : '✗'} ${file.padEnd(34)} ${String(Math.round(r.ms / 1000)).padStart(4)}s${fails ? ` · ${fails} FAIL` : ''}${r.signal ? ` · ${r.signal}` : ''}   `);
  if (status === 'FAIL' && lines.length) for (const l of lines) console.log(`       ${l.slice(0, 150)}`);
}

// Bước 3: nhóm chạy cuối, với hạn mức đăng nhập mặc định.
for (const file of ALL.filter((f) => RUN_LAST.includes(f))) {
  process.stdout.write(`  … ${file} (chạy cuối, hạn mức mặc định)`);
  const r = await run(file, { LOGIN_RATE_MAX: '' });
  const lines = r.out.split('\n').filter((l) => /^FAIL|Error|error:/.test(l)).slice(0, 3);
  const status = r.code === 0 ? 'PASS' : 'FAIL';
  if (status === 'PASS') pass += 1; else fail += 1;
  report.push({ file, status, code: r.code, ms: r.ms, lines });
  console.log(`\r  ${status === 'PASS' ? '✓' : '✗'} ${file} (cuối)  ${Math.round(r.ms / 1000)}s   `);
  if (lines.length) for (const l of lines) console.log(`       ${l.slice(0, 140)}`);
}

writeFileSync('/tmp/opencode/e2e-all.json', JSON.stringify(report, null, 2));
console.log(`\n  TỔNG: ${pass} PASS · ${fail} FAIL · ${skip} bỏ qua/helper`);
if (fail) {
  console.log('\n  BÀI ĐỎ:');
  for (const r of report.filter((x) => x.status === 'FAIL')) {
    console.log(`   ✗ ${r.file} (exit ${r.code}${r.signal ? `, ${r.signal}` : ''}, ${Math.round(r.ms / 1000)}s)`);
    for (const l of r.lines || []) console.log(`       ${l.slice(0, 150)}`);
  }
}
process.exit(fail ? 1 : 0);
