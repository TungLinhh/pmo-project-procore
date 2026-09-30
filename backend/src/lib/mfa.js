// TOTP MFA (RFC 6238, SHA1, 30s) + production dev-password guard.
// Zero-dep (node:crypto): base32 decode, HMAC dynamic truncation, ±1 step
// window khi verify. KHÔNG import db — file này pure, test trực tiếp được.
import { randomBytes, createHmac } from 'node:crypto';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newSecret(bytes = 20) {
  let bits = '';
  for (const b of randomBytes(bytes)) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  }
  return out;
}

export function base32Decode(s) {
  const clean = String(s || '').toUpperCase().replace(/=+$/, '');
  let bits = '';
  for (const ch of clean) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error('invalid base32');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

// Code 6 số tại thời điểm atMs (mặc định now). counter 8-byte big-endian.
export function totp(secret, atMs = Date.now(), step = 30, digits = 6) {
  const counter = Math.floor(atMs / 1000 / step);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function verifyTotp(secret, code, atMs = Date.now(), window = 1) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return false;
  try {
    for (let w = -window; w <= window; w++) {
      if (totp(secret, atMs + w * 30000) === c) return true;
    }
  } catch { return false; }
  return false;
}

export function otpauthUrl({ secret, email, issuer = 'O-Nexus PMO' }) {
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// Chặn mật khẩu dev dùng chung ở production (SRS: tuyệt đối không dùng cho
// dữ liệu thật). Mở khóa khẩn cấp: ALLOW_DEV_PASSWORD=1 (ghi log mỗi lần dùng).
export function devPasswordAllowed() {
  if (process.env.ALLOW_DEV_PASSWORD === '1') return true;
  return process.env.NODE_ENV !== 'production';
}

export const DEV_PASSWORD = 'admin123';
