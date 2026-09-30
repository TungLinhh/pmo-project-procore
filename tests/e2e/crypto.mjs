// Column encryption E2E (task 10, SRS NFR Bao mat: ma hoa khi luu tru).
// Thu Pour 2 tang: lib AES-256-GCM thuan (round-trip, sai key, chong gia mao)
// + hanh vi server (mfa_secret/workers.phone/vendors.contact: GHI -> doc
// DB tho thay ciphertext khi co key / plaintext khi chua, GET luon tra
// plaintext, enable MFA van pass). Tu don rac.
import { psqlQuery, apiBase } from '../tools/env.mjs';
import { totp } from '../../backend/src/lib/mfa.js';

const BASE = apiBase();
let pass = 0, fail = 0;
const ok = (name, detail) => { pass++; console.log(`  PASS — ${name}: ${detail}`); };
const ng = (name, detail) => { fail++; console.log(`  FAIL — ${name}: ${detail}`); };

async function api(path, opts = {}) {
  const r = await fetch(BASE + path, opts);
  const t = await r.text();
  let data; try { data = JSON.parse(t); } catch { data = t; }
  return { status: r.status, data, headers: r.headers };
}
const J = (body, token) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const exec = (sql) => psqlQuery(sql).split('\n')[0];

try {
  // 0. Lib-level voi key tam (khong dung cham server).
  const { enc, dec, isEncrypted, encStatus } = await import('../../backend/src/lib/crypto.js');
  const { randomBytes } = await import('node:crypto');
  const prev = process.env.DATA_ENC_KEY;
  process.env.DATA_ENC_KEY = randomBytes(32).toString('base64');
  const c1 = enc('hello-pii');
  (isEncrypted(c1) && dec(c1) === 'hello-pii' ? ok : ng)('lib round-trip', 'enc:v1: prefix + giai ma dung');
  (enc('hello-pii') !== c1 ? ok : ng)('lib random IV', '2 lan ma hoa khac nhau');
  process.env.DATA_ENC_KEY = randomBytes(32).toString('base64');
  let threw = false;
  try { dec(c1); } catch { threw = true; }
  (threw ? ok : ng)('lib wrong key', 'sai key -> throw (auth tag)');
  const tamp = c1.slice(0, -2) + (c1.endsWith('A') ? 'BB' : 'AA');
  threw = false;
  try { dec(tamp); } catch { threw = true; }
  (threw ? ok : ng)('lib tamper', 'sua ciphertext -> throw');
  (enc('') === '' && dec(null) === null ? ok : ng)('lib passthrough', 'rong/null giu nguyen');
  (dec('plaintext-cu') === 'plaintext-cu' ? ok : ng)('lib legacy', 'du lieu cu khong prefix van doc');
  delete process.env.DATA_ENC_KEY;
  (enc('x') === 'x' && encStatus().configured === false ? ok : ng)('lib no-key', 'thieu key -> plaintext + warn');
  if (prev) process.env.DATA_ENC_KEY = prev;

  // 1. Server: login + setup MFA, kiem tra DB tho.
  const login = await api('/api/auth/login', J({ email: 'admin@hbg.com', password: 'admin123' }));
  const T = login.data?.token;
  if (!T) { ng('login', JSON.stringify(login.data).slice(0, 120)); process.exit(1); }
  ok('login', 'admin@hbg.com');
  const H = { Authorization: `Bearer ${T}` };
  const setup = await api('/api/me/mfa/setup', { method: 'POST', headers: H });
  const secret = setup.data?.secret;
  if (!secret) { ng('mfa setup', 'no secret'); process.exit(1); }
  ok('mfa setup', 'secret issued');
  const raw = exec(`SELECT mfa_secret FROM users WHERE email = 'admin@hbg.com'`);
  const serverKey = raw.startsWith('enc:v1:');
  if (serverKey) ok('mfa_secret at rest', 'ciphertext (server co DATA_ENC_KEY)');
  else (raw === secret ? ok : ng)('mfa_secret at rest', 'plaintext (chua dat DATA_ENC_KEY — dev)');
  // Enable van pass = server giai ma dung.
  const en = await api('/api/me/mfa/enable', J({ code: totp(secret) }, T));
  (en.status === 200 ? ok : ng)('mfa enable with enc secret', `status=${en.status}`);
  const dis = await api('/api/me/mfa/disable', J({ password: 'admin123' }, T));
  (dis.status === 200 ? ok : ng)('mfa disable cleanup', `status=${dis.status}`);

  // 2. vendors.contact / workers.phone: POST -> GET tron ven + DB tho.
  const v = await api('/api/master-data/vendors', J({ name: `ENC-V-${Date.now()}`, contact: 'Nguyen Van A 0901234567' }, T));
  const vid = v.data?.id;
  (vid ? ok : ng)('vendor create', `id=${vid}`);
  const w = await api('/api/master-data/workers', J({ full_name: `ENC-W-${Date.now()}`, phone: '0909999888' }, T));
  const wid = w.data?.id;
  (wid ? ok : ng)('worker create', `id=${wid}`);
  const lv = await api(`/api/master-data/vendors`, { headers: H });
  const gotV = (lv.data || []).find((r) => r.id === vid);
  (gotV?.contact === 'Nguyen Van A 0901234567' ? ok : ng)('vendor contact round-trip', 'GET tra plaintext');
  const lw = await api(`/api/master-data/workers`, { headers: H });
  const gotW = (lw.data || []).find((r) => r.id === wid);
  (gotW?.phone === '0909999888' ? ok : ng)('worker phone round-trip', 'GET tra plaintext');
  const rawV = exec(`SELECT contact FROM vendors WHERE id = ${vid}`);
  const rawW = exec(`SELECT phone FROM workers WHERE id = ${wid}`);
  ((rawV.startsWith('enc:v1:') || rawV === 'Nguyen Van A 0901234567') && (rawW.startsWith('enc:v1:') || rawW === '0909999888')
    ? ok : ng)('pii at rest', `vendor.contact ${rawV.startsWith('enc:') ? 'enc' : 'plain'}, workers.phone ${rawW.startsWith('enc:') ? 'enc' : 'plain'}`);

  // 3. security-status phan anh that.
  const st = await api('/api/admin/security-status', { headers: H });
  (st.status === 200 && Array.isArray(st.data?.encryption?.columns) && st.data.encryption.columns.includes('users.mfa_secret')
    ? ok : ng)('security-status', `configured=${st.data?.encryption?.configured}`);
  // Guard: role thuong (site tu tao, DB hien tai chi seed admin) -> 403.
  const sg = `crypto-guard-${Date.now()}@hbg.com`;
  const sgid = Number(exec(`INSERT INTO users (tenant_id, email, name, role, password_hash) SELECT tenant_id, '${sg}', 'Guard', 'site', password_hash FROM users WHERE email = 'admin@hbg.com' RETURNING id`));
  const sgLogin = await api('/api/auth/login', J({ email: sg, password: 'admin123' }));
  const st403 = await api('/api/admin/security-status', { headers: { Authorization: `Bearer ${sgLogin.data?.token}` } });
  (st403.status === 403 ? ok : ng)('security-status guard', `site -> ${st403.status}`);
  exec(`DELETE FROM users WHERE id = ${sgid}`);

  // 4. Don rac.
  exec(`DELETE FROM vendors WHERE id = ${vid}`);
  exec(`DELETE FROM workers WHERE id = ${wid}`);
  ok('cleanup', 'vendor + worker removed');
} catch (e) {
  ng('exception', e.message);
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
