// Bật MFA cho tài khoản đặc quyền (admin + CEO) trên bản triển khai một máy.
//
// Vì sao cần: `production-readiness` đánh dấu `strong_auth` là mức **fail** —
// "Mọi user admin/CEO có MFA". Đo trước khi chạy: 2/2 user đặc quyền thiếu.
//
// Cách làm: đúng đường API thật (`/api/me/mfa/setup` → `/api/me/mfa/enable`) chứ không
// ghi thẳng `users.mfa_secret` từ SQL — vì cột đó **mã hoá** bằng `DATA_ENC_KEY`
// (`lib/crypto.js`), nên ghi tay sẽ tạo secret không giải mã được và login thất bại.
//
// Mã TOTP sinh bằng chính `lib/mfa.js` của sản phẩm (zero-dependency), không cài app.
//
//   node deploy/single-machine/enable-mfa.mjs
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';
const PASSWORD = process.env.DEMO_PASSWORD || 'admin123';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'logs', 'mfa-secrets.txt');

const { totp } = await import('../../backend/src/lib/mfa.js');

async function call(path, token, method = 'POST', body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

const accounts = (process.env.MFA_ACCOUNTS || 'admin@hbg.com,ceo@hbg.com').split(',').map((s) => s.trim());
const lines = [
  '# Secret MFA — TẠO MỘT LẦN, XOÁ NGAY SAU KHI NHẬP VÀO ỨNG DỤNG XÁC THỰC',
  '#',
  '# Mỗi dòng: <email> <TOTP secret>. Dùng với ứng dụng TOTP (Google Authenticator,',
  '# Aegis, 1Password…) quét QR, hoặc nhập secret bằng tay.',
  '#',
  '# Nếu mất điện thoại: admin đặt lại được MFA cho người khác — xem README.md.',
  '# File này nằm trong .gitignore và có quyền 600.',
  '',
];

for (const email of accounts) {
  const login = await call('/api/auth/login', null, 'POST', { email, password: PASSWORD });
  if (login.status !== 200 || !login.json.token) {
    console.log(`  ✗ ${email}: đăng nhập ${login.status} ${login.json.error || ''}`);
    continue;
  }
  const token = login.json.token;
  if (login.json.mfa_required) {
    console.log(`  – ${email}: đã bật MFA sẵn, giữ nguyên`);
    continue;
  }
  const setup = await call('/api/me/mfa/setup', token);
  if (setup.status !== 200 || !setup.json.secret) {
    console.log(`  ✗ ${email}: setup ${setup.status} ${setup.json.error || ''}`);
    continue;
  }
  const enable = await call('/api/me/mfa/enable', token, 'POST', { code: totp(setup.json.secret) });
  if (enable.status !== 200) {
    console.log(`  ✗ ${email}: enable ${enable.status} ${enable.json.error || ''}`);
    continue;
  }
  lines.push(`${email} ${setup.json.secret}`);
  console.log(`  ✓ ${email}: đã bật MFA`);
}

// Kiểm chứng bằng chính đường login thật: không có mã thì phải bị từ chối.
const admin = accounts[0];
const probe = await call('/api/auth/login', null, 'POST', { email: admin, password: PASSWORD });
const refused = probe.status === 401 && /MFA/i.test(probe.json.error || '');
console.log(`  ${refused ? '✓' : '✗'} đăng nhập không mã thì bị từ chối (status ${probe.status}: ${probe.json.error || 'KHÔNG bị từ chối'})`);

if (lines.length > 6) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, lines.join('\n') + '\n', { mode: 0o600 });
  console.log(`\n  Secret đã ghi vào ${OUT} (quyền 600) — nhập vào ứng dụng TOTP rồi XOÁ file.`);
}

process.exit(refused ? 0 : 1);
