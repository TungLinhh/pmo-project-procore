// SSO OIDC E2E (task 10, SRS 6): mock IdP in-process (discovery/token/userinfo),
// config/tenant qua admin API, start->callback, subject doi, auto-provision,
// SSO+MFA (pending token), xoa config. Can server chay voi
// ALLOW_SSO_INLINE_SECRET=1 (hatch test-only, secret giu trong memory).
// Tu don rac (mock close + xoa config + xoa user rac ke ca audit).
import http from 'node:http';
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
  return { status: r.status, data };
}
const J = (body, token) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const exec = (sql) => psqlQuery(sql).split('\n')[0];

// Mock IdP: email/sub dieu khien duoc theo phase.
let mockEmail = 'admin@hbg.com';
let mockSub = 'mock-sub-1';
let seenVerifier = null;
const mock = http.createServer((req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  if (req.url === '/.well-known/openid-configuration') {
    const base = `http://127.0.0.1:${mock.address().port}`;
    return send(200, {
      issuer: base, authorization_endpoint: `${base}/auth`,
      token_endpoint: `${base}/token`, userinfo_endpoint: `${base}/userinfo`,
    });
  }
  if (req.url === '/token' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const p = new URLSearchParams(body);
      seenVerifier = p.get('code_verifier');
      if (p.get('grant_type') !== 'authorization_code' || p.get('client_secret') !== 'shh-test') {
        return send(401, { error: 'bad token request' });
      }
      return send(200, { access_token: 'mock-at', token_type: 'Bearer' });
    });
    return;
  }
  if (req.url === '/userinfo') {
    if (req.headers.authorization !== 'Bearer mock-at') return send(401, { error: 'bad token' });
    return send(200, { sub: mockSub, email: mockEmail, email_verified: true, name: 'Mock User' });
  }
  send(404, { error: 'nope' });
});
await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
const ISSUER = `http://127.0.0.1:${mock.address().port}`;

const stateOf = (authUrl) => new URL(authUrl).searchParams.get('state');
const createdUsers = [];
async function wipeUser(id) {
  exec(`DELETE FROM audit_log WHERE user_id = ${id}`);
  exec(`DELETE FROM pdpl_requests WHERE user_id = ${id}`);
  exec(`DELETE FROM pdpl_consents WHERE user_id = ${id}`);
  exec(`DELETE FROM users WHERE id = ${id}`);
}

try {
  const admin = await api('/api/auth/login', J({ email: 'admin@hbg.com', password: 'admin123' }));
  const A = admin.data?.token;
  if (!A) { ng('login', 'admin no token'); process.exit(1); }
  ok('login', 'admin@hbg.com');
  const AH = { Authorization: `Bearer ${A}` };

  // 0. Chua config: start 404.
  const pre = await api('/api/auth/sso/start', J({ email: 'admin@hbg.com' }));
  (pre.status === 404 ? ok : ng)('start without config', `status=${pre.status}`);

  // 1. PUT config (inline secret hatch) + test discovery.
  const put = await api('/api/admin/sso', {
    method: 'PUT', headers: { ...AH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ issuer: ISSUER, client_id: 't10-client', enabled: true, auto_provision: false, client_secret: 'shh-test' }),
  });
  (put.status === 200 && put.data?.issuer === ISSUER ? ok : ng)('sso config save', `status=${put.status}`);
  const tst = await api('/api/admin/sso/test', J({}, A));
  (tst.status === 200 && tst.data?.ok === true && tst.data?.userinfo_endpoint?.endsWith('/userinfo')
    ? ok : ng)('sso test discovery', `status=${tst.status}`);
  // Guard: role thuong (site tu tao, DB hien tai chi seed admin) -> 403.
  const sge = `sso-guard-${Date.now()}@hbg.com`;
  exec(`INSERT INTO users (tenant_id, email, name, role, password_hash) SELECT tenant_id, '${sge}', 'Guard', 'site', password_hash FROM users WHERE email = 'admin@hbg.com'`);
  const sgid2 = Number(exec(`SELECT id FROM users WHERE email = '${sge}'`));
  const sgl = await api('/api/auth/login', J({ email: sge, password: 'admin123' }));
  const put403 = await api('/api/admin/sso', {
    method: 'PUT', headers: { Authorization: `Bearer ${sgl.data?.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ issuer: ISSUER, client_id: 'x' }),
  });
  (put403.status === 403 ? ok : ng)('sso config guard', `site -> ${put403.status}`);
  exec(`DELETE FROM users WHERE id = ${sgid2}`);

  // 2. start -> auth_url (PKCE) -> callback login thanh cong.
  mockEmail = 'admin@hbg.com'; mockSub = 'mock-sub-1';
  const st = await api('/api/auth/sso/start', J({ email: 'admin@hbg.com' }));
  const state = st.data?.auth_url ? stateOf(st.data.auth_url) : null;
  ((st.status === 200 && state && st.data.auth_url.includes('code_challenge=')) ? ok : ng)('sso start', 'auth_url + PKCE + state');
  const cb = await api('/api/auth/sso/callback', J({ code: 'c1', state }));
  (cb.status === 200 && cb.data?.user?.email === 'admin@hbg.com' && cb.data?.token
    ? ok : ng)('sso callback login', `status=${cb.status}`);
  (seenVerifier && seenVerifier.length >= 40 ? ok : ng)('pkce verifier', 'server gui code_verifier');
  const linked = exec(`SELECT sso_subject FROM users WHERE email = 'admin@hbg.com'`);
  (linked === 'mock-sub-1' ? ok : ng)('sso link', `subject=${linked}`);
  // state dung lai van duoc chap nhan (JWT chua het han) — nhung subject doi -> chan.
  mockSub = 'mock-sub-EVIL';
  const evil = await api('/api/auth/sso/callback', J({ code: 'c2', state }));
  (evil.status === 403 ? ok : ng)('subject change blocked', `status=${evil.status}`);
  mockSub = 'mock-sub-1';

  // 3. Chua cap + auto_provision=false -> 403; bat -> tu tao (SSO-only).
  mockEmail = `sso-new-${Date.now()}@hbg.com`;
  const st2 = await api('/api/auth/sso/start', J({ email: mockEmail }));
  (st2.status === 404 ? ok : ng)('start unknown email', `status=${st2.status}`);
  // start can user ton tai — tao user shell truoc de di qua start.
  const shellId = Number(exec(`INSERT INTO users (tenant_id, email, name, role) SELECT tenant_id, '${mockEmail}', 'SSO Shell', 'site' FROM users WHERE email = 'admin@hbg.com' RETURNING id`));
  createdUsers.push(shellId);
  const st3 = await api('/api/auth/sso/start', J({ email: mockEmail }));
  const cb3 = await api('/api/auth/sso/callback', J({ code: 'c3', state: stateOf(st3.data.auth_url) }));
  (cb3.status === 200 && cb3.data?.user?.email === mockEmail ? ok : ng)('sso known user', `status=${cb3.status}`);
  await wipeUser(shellId); createdUsers.pop();
  // Auto-provision that su: xoa shell, bat flag, callback tao moi.
  await api('/api/admin/sso', {
    method: 'PUT', headers: { ...AH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ issuer: ISSUER, client_id: 't10-client', enabled: true, auto_provision: true, default_role: 'site', client_secret: 'shh-test' }),
  });
  const st4 = await api('/api/auth/sso/start', J({ email: mockEmail }));
  (st4.status === 404 ? ok : ng)('start still 404 pre-provision', `status=${st4.status}`);
  // Lay state tu tenant khac? state mang tenant — dung state cua admin (cung tenant).
  const stA = await api('/api/auth/sso/start', J({ email: 'admin@hbg.com' }));
  const cb4 = await api('/api/auth/sso/callback', J({ code: 'c4', state: stateOf(stA.data.auth_url) }));
  // mockEmail hien tai la new -> callback provision user moi.
  (cb4.status === 200 && cb4.data?.user?.email === mockEmail ? ok : ng)('auto-provision', `status=${cb4.status}`);
  const provId = Number(exec(`SELECT id FROM users WHERE email = '${mockEmail}'`));
  createdUsers.push(provId);
  (exec(`SELECT password_hash FROM users WHERE id = ${provId}`) === '' ? ok : ng)('provision sso-only', 'password_hash NULL');
  const pwTry = await api('/api/auth/login', J({ email: mockEmail, password: 'admin123' }));
  (pwTry.status === 401 ? ok : ng)('provision no password login', `status=${pwTry.status}`);

  // 4. SSO + MFA: bat TOTP cho user rac -> callback 401 sso_pending -> verify.
  const mfaEmail = `sso-mfa-${Date.now()}@hbg.com`;
  mockEmail = mfaEmail; mockSub = 'mock-sub-mfa';
  const mfaId = Number(exec(`INSERT INTO users (tenant_id, email, name, role, password_hash) SELECT tenant_id, '${mfaEmail}', 'SSO MFA', 'site', password_hash FROM users WHERE email = 'admin@hbg.com' RETURNING id`));
  createdUsers.push(mfaId);
  const ml = await api('/api/auth/login', J({ email: mfaEmail, password: 'admin123' }));
  const MT = ml.data?.token;
  const msetup = await api('/api/me/mfa/setup', { method: 'POST', headers: { Authorization: `Bearer ${MT}` } });
  await api('/api/me/mfa/enable', J({ code: totp(msetup.data.secret) }, MT));
  const stM = await api('/api/auth/sso/start', J({ email: mfaEmail }));
  const cbM = await api('/api/auth/sso/callback', J({ code: 'c5', state: stateOf(stM.data.auth_url) }));
  const pend = cbM.data?.sso_pending;
  ((cbM.status === 401 && cbM.data?.mfa_required === true && pend) ? ok : ng)('sso mfa required', `status=${cbM.status}`);
  const wrong = await api('/api/auth/sso/mfa/verify-sso', J({ sso_pending: pend, code: '000000' }));
  (wrong.status === 401 ? ok : ng)('sso mfa wrong code', `status=${wrong.status}`);
  const right = await api('/api/auth/sso/mfa/verify-sso', J({ sso_pending: pend, code: totp(msetup.data.secret) }));
  (right.status === 200 && right.data?.token ? ok : ng)('sso mfa verify', `status=${right.status}`);

  // 5. Danh sach trang thai + unlink + xoa config.
  const mine = await api('/api/me/sso', { headers: { Authorization: `Bearer ${right.data.token}` } });
  (mine.data?.linked === true ? ok : ng)('sso linked status', JSON.stringify(mine.data));
  const unl = await api('/api/me/sso', { method: 'DELETE', headers: { Authorization: `Bearer ${right.data.token}` } });
  (unl.status === 200 ? ok : ng)('sso unlink', `status=${unl.status}`);
  await api('/api/admin/sso', { method: 'DELETE', headers: AH });
  const after = await api('/api/auth/sso/start', J({ email: 'admin@hbg.com' }));
  (after.status === 404 ? ok : ng)('start after delete', `status=${after.status}`);

  // 6. Don rac: go link admin (subject test) + users rac.
  exec(`UPDATE users SET sso_subject = NULL, sso_issuer = NULL WHERE email = 'admin@hbg.com'`);
  for (const id of createdUsers.splice(0)) {
    try { await wipeUser(id); } catch { /* best effort */ }
  }
  ok('cleanup', 'mock users wiped, admin unlinked');
} catch (e) {
  ng('exception', e.message);
} finally {
  mock.close();
}

console.log(fail ? `\n${fail} FAILURE(S)` : '\nALL PASS');
process.exit(fail ? 1 : 0);
