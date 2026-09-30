// Column-level encryption (SRS NFR Bao mat: ma hoa khi luu tru).
// AES-256-GCM via node:crypto, zero-dep. Key from DATA_ENC_KEY (base64 32B
// hoac 64-hex). Khong co key -> plaintext + warn (dev) — status() noi that;
// production bat buoc dat key (xem GET /api/admin/security-status).
// Dinh dang: 'enc:v1:<base64(iv12|tag16|cipher)>'. dec() tuong thich nguoc:
// gia tri cu chua co prefix van doc binh thuong, se duoc ma hoa o lan ghi sau.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

function loadKey() {
  const raw = (process.env.DATA_ENC_KEY || '').trim();
  if (!raw) return null;
  try {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
    const b = Buffer.from(raw, 'base64');
    if (b.length === 32) return b;
    return null;
  } catch {
    return null;
  }
}

// Doc env LAZY (moi lan goi) de test co the gan DATA_ENC_KEY giua chung
// ma khong can restart process.
export function encConfigured() {
  return !!loadKey();
}

export function enc(plaintext) {
  if (plaintext == null || plaintext === '') return plaintext;
  const key = loadKey();
  if (!key) {
    if (!enc._warned) {
      enc._warned = true;
      console.warn('[crypto] DATA_ENC_KEY chua dat — luu plaintext (chi dung cho dev). Production phai dat key.');
    }
    return String(plaintext);
  }
  const s = String(plaintext);
  if (s.startsWith(PREFIX)) return s; // da ma hoa
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(s, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

export function dec(stored) {
  if (stored == null || stored === '') return stored;
  const s = String(stored);
  if (!s.startsWith(PREFIX)) return s; // du lieu cu plaintext
  const key = loadKey();
  if (!key) throw new Error('Du lieu da ma hoa nhung DATA_ENC_KEY chua cau hinh');
  const buf = Buffer.from(s.slice(PREFIX.length), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  const d = createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

export function isEncrypted(stored) {
  return typeof stored === 'string' && stored.startsWith(PREFIX);
}

// Cot duoc bao phu boi ma hoa cot (ly do tax_id KHONG nam trong danh sach:
// ERP vendor-matching dung pg_trgm similarity tren plaintext + AP ledger
// export byte-stable; tax_id duoc bao ve bang RBAC+RLS thay vi ma hoa).
export const ENCRYPTED_COLUMNS = [
  'users.mfa_secret',
  'users.zalo_user_id',
  'workers.phone',
  'vendors.contact',
];

export function encStatus() {
  return {
    configured: encConfigured(),
    key_env: 'DATA_ENC_KEY',
    columns: ENCRYPTED_COLUMNS,
    note: 'vendors.tax_id giu plaintext de ERP matching + ledger on dinh (bao ve bang RBAC/RLS)',
  };
}
