// Canh gác cơ sở dữ liệu cho bản triển khai không dùng Docker.
//
// Vì sao cần: trên container, compose healthcheck gọi /api/ready mỗi 30 giây. Chạy
// trực tiếp bằng Node thì không có gì gọi cả — chỉ có người phát hiện khi đăng nhập
// không được. Đã xảy ra: PostgreSQL bị kill lúc 07:55 UTC, phát hiện lúc 19:38,
// tức là demo hỏng im lặng gần 12 giờ. `/api/health` vẫn trả 200 suốt vì đúng
// thiết kế nó không chạm DB.
//
// Dùng:  node scripts/db-watchdog.mjs            (kiểm một lần, exit 1 nếu chưa sẵn sàng)
//        BASE_URL=… node scripts/db-watchdog.mjs (trỏ sang cổng khác)
//        --watch 30                               (lặp mỗi 30 giây, Ctrl-C để dừng)
//        --heal                                   (dò rồi **khôi phục**; timer gọi chế độ này)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const watchIndex = process.argv.indexOf('--watch');
const interval = watchIndex >= 0 ? Number(process.argv[watchIndex + 1]) || 30 : 0;
const heal = process.argv.includes('--heal');

// ── Khôi phục ──────────────────────────────────────────────────────────────────
//
// Vì sao cần: bản đầu **chỉ dò và ghi log**, nên nó phát hiện Postgres chết rồi đứng
// yên. Với timer 30 giây thì việc phát hiện là vô nghĩa — nhật ký đầy mà không ai phục
// hồi. Đo 2026-09-30: Postgres đã chết từ tối hôm trước; timer chạy hết đêm mà
// `/api/ready` vẫn 503, và `pg-ctl.sh start` **không** dọn được pid file cũ nên lệnh
// khôi phục trong runbook cũng không chạy được. Hai lỗi đó đã sửa; phần này là mắt xích
// còn thiếu — tự quay lại thay vì chờ người.
// Một sự vật, một chủ. Bản đầu watchdog gọi `pg-ctl.sh start` **trực tiếp**, tức nó dựng
// một Postgres mà systemd không biết. Rồi khi systemd hạ `pmo-db.service` (restart, stop,
// hay `Requires=` kéo theo) thì `ExecStop` gọi `pg-ctl.sh stop` và giết **đúng instance
// watchdog vừa dựng**. Đo 2026-09-30: Postgres hồi lại lúc 20:40:43 rồi nhận "smart
// shutdown" lúc 20:40:44 — một giây sau khi khoẻ, và không ai hiểu vì sao. Nên watchdog
// phải phục hồi **qua systemd**; `pg-ctl.sh` chỉ còn là đường lùi cho lúc chạy tay.
const PG_CTL = join(ROOT, 'backend/scripts/pg-ctl.sh');

/** Lệnh hệ thống, có đường lùi gọi script trực tiếp khi không chạy dưới systemd. */
function unitCmd(action, units, fallback, timeout) {
  // `stdio: 'ignore'` ⇒ `e.stderr` rỗng, nên thông báo lỗi chỉ còn "Command failed" —
  // vô dụng. Đo 2026-09-30: mất 20 phút chẩn đoán vì đúng lý do đó. Phải bắt `pipe`.
  const run = (cmd, args) => {
    try {
      execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout });
      return null;
    } catch (e) {
      const err = (e.stderr || e.stdout || e.message || '').toString().trim();
      return err || `${cmd} ${args.join(' ')} → exit ${e.status ?? '?'}`;
    }
  };
  // `units` phải là **mảng từng phần tử**, không phải một chuỗi gộp. Truyền
  // `"a.service b.service"` làm systemd đọc đó là *một* tên unit rồi báo
  // `Invalid unit name "a.service b.service" escaped as "a.service\x20b.service"` —
  // đo 2026-09-30, mất 20 phút chẩn đoán cho lỗi ba chữ "đừng gộp argv".
  const e1 = run('systemctl', ['--user', action, ...units]);
  if (!e1) return null;
  const e2 = run(fallback[0], fallback.slice(1));
  if (!e2) return `systemctl lỗi (${e1.slice(0, 100)}) nhưng gọi trực tiếp thành công`;
  // In **cả hai** nguyên nhân và tên lệnh. Cắt bớt chính là thứ giấu lỗi ở đây.
  return `systemctl ${action} ${units.join(' ')} → ${e1.slice(0, 200)} | ${fallback.join(' ').split('/').pop()} → ${e2.slice(0, 200)}`;
}
const COOLDOWN_FILE = join(ROOT, 'deploy/single-machine/logs/heal-cooldown.json');
// Hạn mức giữa hai lần thử. Không có nó thì Postgres chết sẽ bị thử 2.880 lần một đêm
// — mỗi lần đều thất bại và làm nặng thêm tình trạng hỏng.
const COOLDOWN_MS = 5 * 60_000;

function dbIsUp() {
  try {
    execFileSync('pg_isready', ['-h', '127.0.0.1', '-p', process.env.PGPORT || '5433', '-q'],
      { stdio: 'ignore', timeout: 10_000 });
    return true;
  } catch { return false; }
}

function inCooldown() {
  try {
    const { at } = JSON.parse(readFileSync(COOLDOWN_FILE, 'utf8'));
    return Date.now() - Number(at) < COOLDOWN_MS;
  } catch { return false; }
}

function markAttempt() {
  try {
    if (!existsSync(join(ROOT, 'deploy/single-machine/logs'))) return;
    writeFileSync(COOLDOWN_FILE, JSON.stringify({ at: Date.now() }));
  } catch { /* không ghi được hạn mức thì mất chống giật, không mất khả năng phục hồi */ }
}

/** Trả về mô tả việc đã làm, hoặc `null` nếu đang trong hạn mức. */
function healOnce() {
  if (inCooldown()) return null;
  markAttempt();
  if (!dbIsUp()) {
    // `restart` chứ không phải `start`: `pmo-db.service` là oneshot + RemainAfterExit nên
    // systemd vẫn ghi "active" sau khi postmaster chết non. `start` sẽ là no-op (systemd
    // thấy unit đang active) ⇒ **không** dựng lại được. `restart` thì luôn chạy cả
    // `ExecStop` lẫn `ExecStart`, nên nó vừa dọn pid file cũ vừa lên lại, và systemd
    // vẫn nắm quyền sở hữu instance mới.
    // Phải restart **cả hai**: `pmo-api.service` khai `Requires=pmo-db.service`, nên khi
    // `pmo-db` bị hạ thì systemd **dừng** app theo — nhưng không tự bật lại, vì `Requires`
    // không phải `WantedBy`. Chỉ restart DB thì DB lên rồi app vẫn nằm, và `/api/ready`
    // vẫn 503 với thông điệp "không kết nối" trong khi Postgres đang khoẻ.
    const err = unitCmd('restart', ['pmo-db.service', 'pmo-api.service'], [PG_CTL, 'start'], 180_000);
    return err ? `Postgres chết và KHÔNG phục hồi được — ${err}`
      : 'Postgres chết — đã restart pmo-db.service + pmo-api.service';
  }
  // DB sống mà app chưa sẵn sàng ⇒ app treo trên pool hỏng. `Restart=always` của systemd
  // chỉ lo tiến trình chết, không lo trường hợp app còn sống nhưng không phục vụ được —
  // đo 2026-09-30: `/api/ready` **treo quá 10 giây** thay vì trả 503, vì pool đang chờ
  // kết nối tới cổng đã chết.
  const err = unitCmd('restart', ['pmo-api.service'], ['true'], 120_000);
  return err ? `Postgres sống, app không sẵn sàng — restart app thất bại: ${err}`
    : 'Postgres sống, app không sẵn sàng — đã restart pmo-api.service';
}

async function probe() {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/api/ready`, { signal: AbortSignal.timeout(10_000) });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, ms: Date.now() - started, body };
  } catch (e) {
    // fetch bọc lỗi kết nối trong TypeError; nguyên nhân thật nằm ở `cause`.
    // Không lấy `cause` thì "không kết nối" và "chờ quá 10 giây" trông giống nhau,
    // và người vận hành sẽ chẩn đoán nhầm.
    const cause = e?.cause;
    const why = cause
      ? `${cause.code || cause.name || 'lỗi'}: ${cause.message || ''}`.trim()
      : e.name === 'TimeoutError' || /aborted/i.test(e.message) ? 'quá thời gian 10s'
        : e.message;
    return { ok: false, status: 0, ms: Date.now() - started, error: why };
  }
}

function report(r) {
  const at = new Date().toISOString().replace('T', ' ').slice(0, 19);
  if (r.ok) {
    console.log(`${at}  OK  ${r.status}  ${r.ms}ms  db=${r.body?.database ?? 'ok'}`);
  } else {
    // Nêu đúng thứ đang hỏng. `database` là phần hay hỏng nhất: /api/health vẫn
    // 200 nên nhìn từ ngoài thì hệ thống vẫn "sống" trong khi mọi truy vấn hỏng.
    console.error(`${at}  LỖI  ${r.status || 'không kết nối'}  ${r.ms}ms  ${r.error || JSON.stringify(r.body)}`);
  }
}

if (!interval) {
  const r = await probe();
  report(r);
  if (r.ok || !heal) process.exit(r.ok ? 0 : 1);
  const did = healOnce();
  if (did) console.error(`  → ${did}`);
  // Dò lại sau khi phục hồi: exit code phải phản ánh **kết quả cuối**, không phải
  // kết quả trước khi sửa. Nếu không, timer sẽ báo đỏ vĩnh viễn dù đã khỏi.
  const after = await probe();
  report(after);
  process.exit(after.ok ? 0 : 1);
}

console.log(`Canh ${BASE}/api/ready mỗi ${interval}s${heal ? ' + tự phục hồi' : ''} — Ctrl-C để dừng.`);
let wasOk = null;
const tick = async () => {
  const r = await probe();
  // Chỉ in khi trạng thái đổi, trừ khi đang lỗi thì in mỗi vòng — lúc đó là lúc
  // người vận hành cần nhìn thấy nó còn hỏng.
  if (r.ok) {
    if (r.ok !== wasOk) report(r);
    wasOk = true;
    return;
  }
  report(r);
  wasOk = false;
  if (heal) {
    const did = healOnce();
    if (did) console.error(`  → ${did}`);
  }
};
await tick();
setInterval(tick, interval * 1000);
