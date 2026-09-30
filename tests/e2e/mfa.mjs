// MFA TOTP E2E (SRS: cá nhân + MFA trước production).
// Chạy trên admin@hbg.com, finally TẮT MFA để trả nguyên trạng.
// Env-driven. Lưu ý loginLimiter 10 req/phút — test chỉ dùng 5 lượt login.
import { psqlQuery, apiBase } from '../tools/env.mjs';
import { totp, verifyTotp, devPasswordAllowed } from '../../backend/src/lib/mfa.js';

const BASE = apiBase();
let pass = 0, fail = 0;
const ok = (name, detail) => { pass++; console.log(`  PASS — ${name}: ${detail}`); };
const ng = (name, detail) => { fail++; console.log(`  FAIL — ${name}: ${detail}`); };

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  const t = await r.text();
  let data; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data };
}
const J = (body, token) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const exec = (sql) => psqlQuery(sql).split('\n')[0];

try {
  // 0. Vector RFC 6238 (key ASCII 20 bytes, t=59s → 287082) + guard mặc định.
  (totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000) === '287082' && verifyTotp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', '287082', 59000)
    ? ok : ng)('RFC6238 vector', 't59=287082');
  (devPasswordAllowed() === true ? ok : ng)('dev password allowed in dev', `NODE_ENV=${process.env.NODE_ENV || '(unset)'}`);

  // 1. Login lấy token, setup MFA.
  const login1 = await api('/api/auth/login', J({ email: 'admin@hbg.com', password: 'admin123' }));
  const T = login1.data?.token;
  if (!T) { ng('login', JSON.stringify(login1.data).slice(0, 120)); process.exit(1); }
  ok('login', 'admin@hbg.com');
  const setup = await api('/api/me/mfa/setup', { method: 'POST', headers: { Authorization: `Bearer ${T}` } });
  const secret = setup.data?.secret;
  (/^[A-Z2-7]{32}$/.test(secret || '') && String(setup.data?.otpauth_url || '').startsWith('otpauth://totp/')
    ? ok : ng)('mfa setup', `secret ${String(secret || '').length} chars + otpauth URL`);

  // 2. Enable sai code → 401; đúng code (tự tính) → ok.
  const enBad = await api('/api/me/mfa/enable', J({ code: '000000' }, T));
  (enBad.status === 401 ? ok : ng)('enable wrong code 401', `status=${enBad.status}`);
  const enOk = await api('/api/me/mfa/enable', J({ code: totp(secret) }, T));
  (enOk.status === 200 ? ok : ng)('enable correct code', `status=${enOk.status}`);

  // 3. Login khi MFA bật → 401 MFA_REQUIRED, không cấp token.
  const login2 = await api('/api/auth/login', J({ email: 'admin@hbg.com', password: 'admin123' }));
  (login2.status === 401 && login2.data?.mfa_required === true && !login2.data?.token ? ok : ng)(
    'login gated by MFA', `status=${login2.status} mfa_required=${login2.data?.mfa_required}`);

  // 4. Verify sai → 401; đúng → tokens đầy đủ, gọi được /api/me.
  const vBad = await api('/api/auth/mfa/verify', J({ email: 'admin@hbg.com', password: 'admin123', code: '000000' }));
  (vBad.status === 401 ? ok : ng)('verify wrong code 401', `status=${vBad.status}`);
  const vOk = await api('/api/auth/mfa/verify', J({ email: 'admin@hbg.com', password: 'admin123', code: totp(secret) }));
  (vOk.status === 200 && !!vOk.data?.token ? ok : ng)('verify correct code', `status=${vOk.status}`);
  const me = await api('/api/auth/me', { headers: { Authorization: `Bearer ${vOk.data?.token}` } });
  (me.data?.user?.mfa_enabled === true ? ok : ng)('post-MFA session works', `mfa_enabled=${me.data?.user?.mfa_enabled}`);

  // 5. Disable sai pass → 401; đúng → ok; login lại bình thường.
  const disBad = await api('/api/me/mfa/disable', J({ password: 'wrongpass' }, vOk.data?.token));
  (disBad.status === 401 ? ok : ng)('disable wrong pass 401', `status=${disBad.status}`);
  const disOk = await api('/api/me/mfa/disable', J({ password: 'admin123' }, vOk.data?.token));
  (disOk.status === 200 ? ok : ng)('disable correct pass', `status=${disOk.status}`);
  const login3 = await api('/api/auth/login', J({ email: 'admin@hbg.com', password: 'admin123' }));
  (login3.status === 200 && !!login3.data?.token ? ok : ng)('login normal after disable', `status=${login3.status}`);

  // 6. Audit MFA_ENABLE + MFA_DISABLE.
  const audit = await api('/api/audit?action=MFA_ENABLE&limit=3', { headers: { Authorization: `Bearer ${login3.data?.token}` } });
  (Array.isArray(audit.data) && audit.data.length > 0 ? ok : ng)('audit MFA', `rows=${audit.data?.length ?? '?'}`);
} finally {
  exec(`UPDATE users SET mfa_secret = NULL, mfa_enabled = false WHERE email = 'admin@hbg.com'`);
  console.log('cleanup: admin MFA off');
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
