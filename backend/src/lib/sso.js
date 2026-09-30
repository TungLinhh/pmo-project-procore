// SSO OIDC generic qua IdP ngoai (SRS 6: bo mat khau demo dung chung, chuyen
// sang dang nhap ca nhan SSO/email cong ty + MFA truoc production).
// Zero-dep: discovery (.well-known) + PKCE S256 + code exchange + userinfo
// qua fetch. Khong verify id_token signature — lay email tu userinfo endpoint
// (server-side, Bearer access_token) nen khong can JWKS.
// Secret KHONG luu DB: doc tu env theo cfg.secret_env (mac dinh
// SSO_CLIENT_SECRET); hatch ALLOW_SSO_INLINE_SECRET=1 cho phep test nap
// secret vao memory (mat khi restart — production dung env).
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-me';
const STATE_TTL_SEC = 600;
const DISCOVERY_TTL_MS = 5 * 60 * 1000;

const discoveryCache = new Map(); // issuer -> { doc, at }
const memSecrets = new Map(); // tenantId -> secret (test-only hatch)

export function allowInlineSecret() {
  return process.env.ALLOW_SSO_INLINE_SECRET === '1';
}

export function setMemorySecret(tenantId, secret) {
  memSecrets.set(Number(tenantId), String(secret));
}

export function getClientSecret(cfg) {
  if (!cfg) return null;
  const mem = memSecrets.get(Number(cfg.tenant_id));
  if (mem) return mem;
  const name = cfg.secret_env || 'SSO_CLIENT_SECRET';
  return process.env[name] || null;
}

export function publicBase() {
  return (process.env.PUBLIC_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '');
}

export function redirectUri() {
  return `${publicBase()}/sso/callback`;
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function discover(issuer) {
  const iss = String(issuer || '').replace(/\/+$/, '');
  if (!/^https?:\/\//.test(iss)) throw new Error('issuer phai la http(s) URL');
  const hit = discoveryCache.get(iss);
  if (hit && Date.now() - hit.at < DISCOVERY_TTL_MS) return hit.doc;
  const r = await fetch(`${iss}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`Discovery that bai: HTTP ${r.status}`);
  const doc = await r.json();
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.userinfo_endpoint) {
    throw new Error('Discovery thieu endpoint (authorization/token/userinfo)');
  }
  discoveryCache.set(iss, { doc, at: Date.now() });
  return doc;
}

// state = JWT ky (chong gia mao) + mang theo PKCE verifier (khong luu server).
export function buildState(tenantId, verifier) {
  return jwt.sign(
    { t: Number(tenantId), v: verifier, n: randomBytes(8).toString('hex'), purpose: 'sso-state' },
    JWT_SECRET,
    { expiresIn: STATE_TTL_SEC }
  );
}

export function verifyState(state) {
  const p = jwt.verify(state, JWT_SECRET);
  if (!p || p.purpose !== 'sso-state' || !p.t || !p.v) throw new Error('state khong hop le');
  return { tenantId: Number(p.t), verifier: String(p.v) };
}

export async function buildAuthUrl(cfg, tenantId) {
  const doc = await discover(cfg.issuer);
  const verifier = b64url(randomBytes(32));
  const state = buildState(tenantId, verifier);
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.client_id,
    redirect_uri: redirectUri(),
    scope: 'openid email profile',
    state,
    code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
  });
  return { auth_url: `${doc.authorization_endpoint}?${q.toString()}`, state };
}

export async function exchangeCode(cfg, code, verifier) {
  const doc = await discover(cfg.issuer);
  const secret = getClientSecret(cfg);
  if (!secret) throw new Error(`Thieu client secret (dat env ${cfg.secret_env || 'SSO_CLIENT_SECRET'})`);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: String(code),
    redirect_uri: redirectUri(),
    client_id: cfg.client_id,
    client_secret: secret,
    code_verifier: verifier,
  });
  const r = await fetch(doc.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Doi code that bai: HTTP ${r.status}`);
  const tok = await r.json();
  if (!tok.access_token) throw new Error('Token endpoint khong tra access_token');
  const u = await fetch(doc.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!u.ok) throw new Error(`Userinfo that bai: HTTP ${u.status}`);
  const info = await u.json();
  const email = String(info.email || '').trim().toLowerCase();
  if (!email || info.email_verified === false) throw new Error('IdP khong tra email hop le');
  return { email, name: info.name || info.preferred_username || email.split('@')[0], subject: String(info.sub || '') };
}

// Pending token cho nhom SSO+MFA: user da qua IdP nhung phai nhap them TOTP.
export function issueSsoPending(user) {
  return jwt.sign({ uid: user.id, tenant: user.tenant_id, purpose: 'sso-mfa' }, JWT_SECRET, { expiresIn: '5m' });
}

export function verifySsoPending(token) {
  const p = jwt.verify(token, JWT_SECRET);
  if (!p || p.purpose !== 'sso-mfa' || !p.uid) throw new Error('pending token khong hop le');
  return { userId: Number(p.uid), tenantId: Number(p.tenant) };
}
