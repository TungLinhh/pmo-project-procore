// Khôi phục sau sự cố — những lỗi mà bài kiểm tĩnh không bắt được.
//
// Vì sao cần bài riêng: đợt 18 triển khai thật, đợt 19 sửa 4 bài "Docker". Cả hai đều
// **tĩnh** — đọc Dockerfile, đọc compose, kiểm `.dockerignore`. Không bài nào chạm tới
// câu hỏi duy nhất quan trọng khi máy thật: *sau khi nó chết, nó có tự quay lại không?*
//
// Đo 2026-09-30, sau một đêm dùng bản demo đã "triển khai":
//   1. Postgres **không còn sống** mà `pmo-api.service` báo `active`; `/api/health` trả
//      200 (đúng thiết kế) nên nhìn từ ngoài thì hệ thống vẫn "chạy".
//   2. `pg-ctl.sh start` in **"PG already running"** rồi `pg_isready` trả "no response" —
//      tức lệnh khôi phục trong runbook **không chạy được**. Nguyên nhân: tin sự tồn tại
//      của `postmaster.pid` thay vì hỏi cổng.
//   3. `pmo-watchdog.timer` chạy mỗi 30 giây nhưng chỉ **ghi log**, không phục hồi.
//   4. `pg-ctl.sh` tìm `pg_ctl` **chỉ qua `PATH`** ⇒ chạy tay thì được, dưới systemd user
//      unit thì fail (PATH tối giản không có Homebrew) ⇒ unit Postgres không lên được.
//
// Bài này kiểm **hành vi thật** của các mắt xích đó, và có phép thử âm tính: mọi cách
// viết mà trước đây sẽ báo "đã xong" trong khi việc chưa xảy ra đều phải bị bắt.
//
// Run: node tests/e2e/deploy-recovery.mjs
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} — ${msg}`); if (!cond) failures++; };
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const has = (bin) => { try { execSync(`command -v ${bin}`, { stdio: 'ignore' }); return true; } catch { return false; } };

// ══ 1. `pg-ctl.sh start` phải hỏi CỔNG, không hỏi pid file ═══════════════════════
//
// Đây là lỗi đã làm hỏng thật. Bản cũ: `if [ -f postmaster.pid ]` ⇒ in "already running".
// Dựng data dir giả có `postmaster.pid` trỏ tới pid **chết**, cùng `pg_ctl` và
// `pg_isready` giả: `pg_isready` chỉ trả 0 **sau khi** `pg_ctl start` được gọi — đúng
// mô hình "Postgres chết rồi được dựng lại".
const sandbox = mkdtempSync(join(tmpdir(), 'pmo-pgctl-'));
try {
  const dataDir = join(sandbox, 'pgdata');
  const binDir = join(sandbox, 'bin');
  execSync(`mkdir -p ${JSON.stringify(dataDir)} ${JSON.stringify(binDir)}`);
  // 999999 không có process nào trên máy kiểm thử ⇒ pid file chắc chắn là **cũ**.
  writeFileSync(join(dataDir, 'postmaster.pid'), '999999\n/data\n5433\n');
  const marker = join(sandbox, 'started');
  // `pg_isready` chỉ báo khoẻ **sau khi** `pg_ctl start` đã chạy — nếu không, phép thử
  // sẽ xanh ngay cả khi script vẫn tin pid file.
  writeFileSync(join(binDir, 'pg_isready'), `#!/bin/sh\n[ -f ${JSON.stringify(marker)} ] && exit 0\nexit 1\n`);
  writeFileSync(join(binDir, 'pg_ctl'), `#!/bin/sh\necho "$@" >> ${JSON.stringify(join(sandbox, 'calls.log'))}\ntouch ${JSON.stringify(marker)}\nexit 0\n`);
  execSync(`chmod +x ${JSON.stringify(join(binDir, 'pg_ctl'))} ${JSON.stringify(join(binDir, 'pg_isready'))}`);

  const run = () => execFileSync('bash', [join(ROOT, 'backend/scripts/pg-ctl.sh'), 'start'], {
    env: { ...process.env, PG_DATA: dataDir, PGBIN: binDir, PATH: `${binDir}:${process.env.PATH}` },
    encoding: 'utf8', timeout: 60_000,
  });

  const first = run();
  const calls = existsSync(join(sandbox, 'calls.log')) ? readFileSync(join(sandbox, 'calls.log'), 'utf8') : '';
  ok(/start/.test(calls),
    `pid file trỏ tới pid CHẾT ⇒ pg-ctl.sh vẫn gọi pg_ctl start (thấy: ${calls.trim() || 'KHÔNG gọi — vẫn tin pid file'})`);
  ok(!/already running/.test(first),
    `pid file còn mà Postgres chết ⇒ KHÔNG in "already running" (thấy: ${JSON.stringify(first.trim())})`);
  ok(!existsSync(join(dataDir, 'postmaster.pid')),
    'postmaster.pid cũ đã bị dọn sau khi khởi động lại');
  // Phép thử dương: lần sau Postgres **thật sự** sống thì phải báo already running và
  // KHÔNG gọi pg_ctl. Không có phép thử dương thì phép thử âm tính ở trên chỉ chứng minh
  // "có gọi pg_ctl", chứ không chứng minh nó gọi **đúng lúc**.
  const second = run();
  const callsAfter = readFileSync(join(sandbox, 'calls.log'), 'utf8');
  ok(/already running/.test(second) && callsAfter.trim().split('\n').length === 1,
    'Postgres đã sống ⇒ báo "already running" và không gọi pg_ctl lần nữa');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

// ── Phép thử âm tính cho chính khẳng định trên: bản cũ PHẢI đỏ ───────────────────
// Không có bước này thì "PASS" ở trên chỉ chứng minh bài kiểm không hỏng, chứ không
// chứng minh nó bắt được lỗi. Đo 2026-09-29/30: đã ba lần có bộ đo xanh vì lỗi.
{
  const stale = mkdtempSync(join(tmpdir(), 'pmo-pgctl-neg-'));
  try {
    const d = join(stale, 'pgdata');
    const b = join(stale, 'bin');
    execSync(`mkdir -p ${JSON.stringify(d)} ${JSON.stringify(b)}`);
    writeFileSync(join(d, 'postmaster.pid'), '999999\n/data\n5433\n');
    const marker = join(stale, 'started');
    writeFileSync(join(b, 'pg_isready'), `#!/bin/sh\n[ -f ${JSON.stringify(marker)} ] && exit 0\nexit 1\n`);
    writeFileSync(join(b, 'pg_ctl'), `#!/bin/sh\ntouch ${JSON.stringify(marker)}\nexit 0\n`);
    execSync(`chmod +x ${JSON.stringify(join(b, 'pg_ctl'))} ${JSON.stringify(join(b, 'pg_isready'))}`);
    // Bản CỐ — đúng lỗi gốc: tin pid file.
    const legacy = join(stale, 'legacy.sh');
    writeFileSync(legacy, `#!/bin/bash\nPG_DATA=${JSON.stringify(d)}\nPG_BIN=${JSON.stringify(b)}\nif [ -f "$PG_DATA/postmaster.pid" ]; then echo "PG already running (pid file exists)"; else $PG_BIN/pg_ctl -D "$PG_DATA" start; fi\n`);
    const out = execFileSync('bash', [legacy], { encoding: 'utf8' });
    ok(/already running/.test(out) && !existsSync(marker),
      'phép thử âm tính: bản cũ (tin pid file) đúng là báo "already running" mà không dựng Postgres');
  } finally {
    rmSync(stale, { recursive: true, force: true });
  }
}

// ══ 2. `pg-ctl.sh` phải tìm được `pg_ctl` với PATH tối giản ═════════════════════
// Dưới systemd user unit, PATH là `/usr/local/bin:/usr/bin:/bin:...`. Script chỉ dựa
// vào `PATH` thì fail ở đúng chỗ đó — và báo chung chung khiến người đọc tưởng máy
// chưa cài Postgres.
{
  const script = read('backend/scripts/pg-ctl.sh');
  ok(!/PG_BIN="\$\{PGBIN:-\$\(dirname "\$\(command -v/.test(script),
    'pg-ctl.sh không chỉ tìm pg_ctl qua PATH (systemd user unit có PATH tối giản)');
  ok(/linuxbrew|opt\/homebrew|usr\/lib\/postgresql/.test(script),
    'pg-ctl.sh có danh sách đường dẫn dự phòng ngoài PATH');
  // Thông báo lỗi phải **liệt kê** chỗ đã thử, không phải một dòng chung chung.
  const notFound = script.slice(script.indexOf('Không tìm thấy pg_ctl'), script.indexOf('Không tìm thấy pg_ctl') + 700);
  ok(/Đã thử/.test(notFound) && (notFound.match(/PGBIN/g) || []).length >= 1,
    'khi không tìm thấy pg_ctl, thông báo liệt kê các chỗ đã thử');
  // Không xoá `postmaster.pid` khi pid còn sống: làm vậy cho phép `pg_ctl` dựng postmaster
  // thứ hai trên cùng data dir ⇒ hỏng dữ liệu.
  ok(/kill -0 "\$oldpid"/.test(script),
    'pg-ctl.sh dùng `kill -0` để phân biệt pid còn sống với pid file cũ');
  const drop = script.slice(script.indexOf('drop_stale_pid()'), script.indexOf('drop_stale_pid()') + 700);
  ok(!/rm -f "\$PG_DATA\/postmaster\.pid"[\s\S]*kill -0/.test(drop),
    'lệnh `rm postmaster.pid` không nằm trước bước kiểm pid còn sống');
}

// ══ 3. Watchdog phải PHỤC HỒI, không chỉ ghi log ═══════════════════════════════
{
  const w = read('scripts/db-watchdog.mjs');
  ok(/--heal/.test(w), 'db-watchdog.mjs có chế độ --heal');
  ok(/systemctl/.test(w) && /pmo-db\.service/.test(w),
    'watchdog phục hồi Postgres (qua systemd, không gọi pg-ctl.sh trực tiếp)');
  // Một sự vật, một chủ: gọi `pg-ctl.sh start` trực tiếp tạo ra Postgres mà systemd
  // không biết, rồi `ExecStop` của unit giết đúng instance đó. Đo 2026-09-30: Postgres
  // hồi lại 21:40:43 rồi nhận "smart shutdown" 21:40:44 — một giây sau khi khoẻ.
  // Bỏ comment trước khi so — lần này **chính comment trong `healOnce` làm hỏng khẳng
  // định**: nó giải thích `Requires=pmo-db.service` nên khi tôi xoá lệnh `unitCmd(...)`
  // đi, chữ `pmo-db.service` **vẫn còn trong comment** và khẳng định vẫn xanh. Đo
  // 2026-09-30 bằng phép thử âm tính; đây là lần thứ ba trong phiên này một khẳng định
  // xanh vì đọc nhầm comment.
  const stripComments = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|#)/.test(l)).join('\n');
  const heal = stripComments(w.slice(w.indexOf('function healOnce()')));
  ok(!/pg-ctl\.sh start`\]|PG_CTL, \['start'\]/.test(heal),
    'healOnce() không dựng Postgres ngoài systemd');
  // Hạn mức chống giật: không có nó thì Postgres chết sẽ bị thử 2.880 lần một đêm.
  // Chỉ kiểm "có tên `COOLDOWN_MS`" là **quá yếu** — phép thử âm tính đặt nó bằng `0` và
  // bài vẫn xanh, tức hạn mức bị biến thành vô nghĩa mà không ai biết. Phải kiểm **giá
  // trị**: một hạn mức dưới một phút là không có hạn mức.
  // Phải **tính** biểu thức, không bắt chữ số đầu tiên. Bản đầu dùng
  // `/COOLDOWN_MS\s*=\s*([\d_]+)/` nên trên `5 * 60_000` ra `5` ⇒ báo hạn mức 5ms
  // và đỏ oan. Chỉ chấp nhận biểu thức toán học thuần rồi mới tính, để không phải
  // `eval` mã tuỳ ý.
  const rhs = (w.match(/COOLDOWN_MS\s*=\s*([^;\n]+)/) || [])[1] || '';
  let cd = 0;
  if (/^[\d\s_*+()-]+$/.test(rhs.trim())) {
    // eslint-disable-next-line no-new-func
    cd = Number(new Function(`"use strict";return (${rhs.trim().replace(/_/g, '')})`)());
  }
  ok(cd >= 60_000, `hạn mức phục hồi có giá trị thật (COOLDOWN_MS = ${cd}ms, cần ≥60000)`);
  // Phải hồi lại **cả app**: `Requires=pmo-db.service` làm app bị dừng theo, mà `Requires`
  // không tự bật lại. Chỉ restart DB thì DB khoẻ mà `/api/ready` vẫn 503.
  // Phải soi **đối số của lời gọi `unitCmd`**, không phải "chuỗi con xuất hiện ở đâu đó
  // trong hàm". Bản đầu so `/pmo-db\.service/.test(heal)` nên **thông báo trả về** làm
  // nó xanh dù lệnh phục hồi đã bị xoá hẳn (đo 2026-09-30 bằng phép thử âm tính) — đúng
  // loại "bám chuỗi thay vì bám hành vi" mà AGENTS.md đã cảnh báo.
  const restartCall = (heal.match(/unitCmd\('restart',\s*(\[[^\]]*\])/) || [])[1] || '';
  ok(/'pmo-db\.service'/.test(restartCall) && /'pmo-api\.service'/.test(restartCall),
    `healOnce() phục hồi DB và app trong CÙNG một lệnh (thấy: ${restartCall || 'không có lệnh nào'})`);
  // Lỗi phải in **nguyên nhân thật**. Bản đầu dùng `stdio:'ignore'` ⇒ `e.stderr` rỗng
  // ⇒ thông báo chỉ còn "Command failed"; và `slice(0,120)` cắt mất phần còn lại.
  // Cắt **đúng phần `unitCmd`**: từ `function unitCmd` tới hằng kế tiếp sau nó.
  // Bản đầu cắt tới `dbIsUp` — hàm đó nằm **trước** `unitCmd` nên lát cắt rỗng và
  // khẳng định luôn xanh. Lần sau cắt tới `healOnce` thì lại **rộng quá**: `dbIsUp()`
  // nằm trong đó và nó cố ý dùng `stdio:'ignore'` (chỉ cần biết postgres còn sống, không
  // cần đọc lý do) ⇒ đỏ. Lát cắt phải khớp **đúng ranh giới hàm**, không phải "vùng rộng
  // có chứa nó" — cùng loại lỗi với việc bám nhãn thay vì bám hành vi.
  const unitCmdSrc = w.slice(w.indexOf('function unitCmd'), w.indexOf('const COOLDOWN_FILE'));
  ok(unitCmdSrc.length > 200, `lát cắt unitCmd lấy đủ nội dung (${unitCmdSrc.length} ký tự)`);
  // Phải **lọc comment** trước khi so. Comment giải thích trong `unitCmd` có chứa
  // đúng chuỗi `stdio: 'ignore'` (vì nói về lỗi đó), nên khẳng định quét cả comment thì
  // luôn đỏ. Đây là bẫy đã ghi trong AGENTS.md — bài kiểm dò trên **toàn bộ** nội dung
  // file kể cả comment, nên comment giải thích cũng phải tránh viết lại chính mẫu đó.
  const unitCmdCode = unitCmdSrc.split('\n').filter((l) => !/^\s*(\/\/|\*|#)/.test(l)).join('\n');
  ok(!/stdio: 'ignore'/.test(unitCmdCode),
    "unitCmd không nuốt stderr (e.stderr rỗng khi stdio:'ignore')");
  ok(/e\.stderr/.test(unitCmdCode),
    "unitCmd in ra e.stderr — không có nó thì lỗi chỉ còn dòng 'Command failed'");
  // `units` phải là mảng từng phần tử: gộp chuỗi khiến systemd báo
  // `Invalid unit name "a.service b.service"`. Đo 2026-09-30, mất 20 phút chẩn đoán.
  ok(/\['--user', action, \.\.\.units\]/.test(w), 'unitCmd truyền từng unit thành phần tử argv riêng');
}

// ══ 4. Unit: DB phải lên TRƯỚC app, và timeout phải đủ ═════════════════════════
{
  const api = read('deploy/single-machine/pmo-api.service');
  const db = read('deploy/single-machine/pmo-db.service');
  const wd = read('deploy/single-machine/pmo-watchdog.service');
  ok(/Requires=pmo-db\.service/.test(api), 'pmo-api.service Requires=pmo-db.service (DB lỗi thì app không bật)');
  ok(/After=.*pmo-db\.service/.test(api), 'pmo-api.service After=pmo-db.service (DB trước app)');
  ok(/^RemainAfterExit=yes$/m.test(db), 'pmo-db.service là oneshot + RemainAfterExit');
  // Thời gian tối thiểu: probe 10s (thực tế ~13s) + dựng PG ~25s + probe lại ~13s.
  // Bản đầu đặt `TimeoutStartSec=60` ⇒ systemd giết watchdog giữa lúc đang dựng DB,
  // rồi hạn mức 5 phút làm mất cả cửa sổ hồi phục kế tiếp.
  const t = Number((wd.match(/TimeoutStartSec=(\d+)/) || [])[1] || 0);
  ok(t >= 180, `pmo-watchdog.service TimeoutStartSec đủ lớn (thấy ${t}s, cần ≥180s)`);
  ok(/--heal/.test(read('deploy/single-machine/pmo-watchdog.timer')) || /--heal/.test(wd),
    'timer gọi watchdog ở chế độ --heal');
  ok(existsSync(join(ROOT, 'deploy/single-machine/pmo-db.service')),
    'pmo-db.service có trong thư mục deploy (nguồn chân lý)');
  const inst = read('deploy/single-machine/install.sh');
  ok(/install -m 644 "\$DEPLOY\/pmo-db\.service"/.test(inst) && /enable --now pmo-db\.service/.test(inst),
    'install.sh cài và bật pmo-db.service');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
