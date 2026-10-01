#!/usr/bin/env node
// Một lệnh duy nhất đưa từ "clone repo" tới "mở app thấy dữ liệu demo".
//
// ── Vì sao cần ────────────────────────────────────────────────────────────────────
// Đo 2026-10-01 trên clone sạch của `main`: chạy `node backend/src/db/init.js` xong có
// **1 dự án rỗng** — 0 hạng mục lịch, 0 work item, 0 shop drawing, 0 hợp đồng. Mọi màn
// dashboard, Gantt, S-curve, OTD, thanh toán đều trống, và người kiểm duyệt kết luận
// "sản phẩm hỏng". Nguyên nhân: dữ liệu nghiệp vụ đến từ `reference_sheets/` (100 file
// Excel của dự án BTE) mà thư mục đó gitignore vì là hồ sơ gốc khách hàng.
//
// Nên bốn bước này gói lại thành `npm run setup`. Mỗi bước **idempotent** nên chạy lại
// an toàn — cài đặt nửa vời rồi chạy lại không phải là trò may mắn.
//
// Dùng:  npm run setup
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const t0 = Date.now();

const say = (m) => console.log(m);
const step = (n, total, title) => say(`\n[${n}/${total}] ${title}`);

/** Chạy một bước; không `set -e` ẩn — lỗi phải hiện nguyên văn để chẩn đoán được. */
function run(label, cmd, args) {
  say(`  $ ${cmd} ${args.join(' ')}`);
  try {
    const out = execFileSync(cmd, args, {
      stdio: 'inherit',
      env: process.env,
      cwd: ROOT,
    });
    return true;
  } catch (e) {
    // `stdio:'inherit'` đã in ra lỗi, nhưng `execFileSync` vẫn ném — in thêm dòng chẩn đoán
    // vì lỗi ở bước nào là thông tin quan trọng nhất khi cài đặt hỏng.
    say(`\n❌ Bước "${label}" thất bại (exit ${e.status ?? '?'}).`);
    return false;
  }
}

const TOTAL = 4;

// ── 1. Postgres ───────────────────────────────────────────────────────────────────
step(1, TOTAL, 'Postgres');
const isReady = () => {
  try {
    execFileSync('pg_isready', ['-h', process.env.DB_HOST || '127.0.0.1', '-p', process.env.DB_PORT || '5433', '-q'], { stdio: 'ignore' });
    return true;
  } catch { return false; }
};

if (isReady()) {
  say('  ✓ Postgres đang chạy');
} else if (existsSync(join(ROOT, 'backend/scripts/pg-ctl.sh'))) {
  // `pg-ctl.sh` chỉ khởi động cluster có sẵn (Linux/WSL). Nó có thể in "PG already running"
  // khi pid file cũ còn sót — `pg-ctl.sh` đã tự hỏi cổng, nên tin **probe** của ta.
  if (!run('pg-ctl.sh start', 'bash', ['backend/scripts/pg-ctl.sh', 'start'])) {
    say('  ⚠ Không bật được Postgres tự động. Nếu bạn dùng Postgres cài sẵn, hãy khởi');
    say('    động nó rồi chạy lại:  npm run setup');
    process.exit(1);
  }
  if (!isReady()) {
    say('  ❌ Postgres vẫn không sẵn sàng. Kiểm tra:  pg_isready -h 127.0.0.1 -p 5433');
    process.exit(1);
  }
  say('  ✓ Postgres đang chạy');
} else {
  say('  ⚠ Không thấy pg-ctl.sh — hãy tự khởi động Postgres rồi chạy lại:  npm run setup');
  process.exit(1);
}

// ── 2. Vai trò + database ─────────────────────────────────────────────────────────
step(2, TOTAL, 'Vai trò + database (Postgres superuser)');
// Cần superuser. Nếu script báo không kết nối được, nó **in sẵn** các cách thử
// (user hiện tại / `postgres` / docker / `sudo -u`), nên không cần đoán ở đây.
if (!run('db-bootstrap.sh', 'bash', ['backend/scripts/db-bootstrap.sh'])) process.exit(1);

// ── 3. Schema + dữ liệu danh mục ──────────────────────────────────────────────────
step(3, TOTAL, 'Schema + danh mục');
if (!run('init.js', 'node', ['backend/src/db/init.js'])) {
  say('\n💡 Nếu lỗi là `permission denied` hoặc `role ... does not exist`, xem bước 2 —');
  say('   nguyên nhân là Postgres chưa có vai trò/database cho app.');
  process.exit(1);
}

// ── 4. Dữ liệu dự án demo + neo lịch ──────────────────────────────────────────────
step(4, TOTAL, 'Dữ liệu dự án demo');
if (!run('load-demo-seed.mjs', 'node', ['scripts/load-demo-seed.mjs'])) process.exit(1);

// Neo lịch về ngày chạy. Script tự bỏ qua nếu dữ liệu chưa cũ (ngưỡng 30 ngày), nên
// chạy sau mỗi lần clone ở một ngày mới là đúng, và chạy lại không làm hỏng.
say('\n  — Neo lịch về ngày hiện tại —');
run('rebase-demo-dates.mjs', 'node', ['scripts/rebase-demo-dates.mjs']);

const secs = Math.round((Date.now() - t0) / 1000);
say(`\n${'─'.repeat(62)}`);
say(`✅ Sẵn sàng sau ${secs}s. Chạy app:`);
say('');
say('   npm run dev          # http://localhost:5173');
say('');
say('   Đăng nhập demo:  admin@hbg.com  /  admin123      (quản trị viên)');
say('                    ceo@hbg.com    /  admin123      (giám đốc)');
say('');
say(`Tài liệu: docs/USER_GUIDE_VI.md · ${'─'.repeat(20)}`);
