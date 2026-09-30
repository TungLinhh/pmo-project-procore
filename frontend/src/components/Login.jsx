// UI-001: Login (HQ + Field) - với 7 demo accounts cho mục 43.2
// Task 10: song ngu VI/EN + nut SSO (IdP ngoai) + nhan sso_pending tu /sso/callback.
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, sso, setToken, setRefreshToken, setUser } from '../api/index.js';
import { t, useLang, setLang, getLang } from '../i18n/index.js';
import '../styles/login.css';

// Demo credentials exist only in a Vite dev build. Production starts blank and
// never renders one-click accounts.
const SHOW_DEMO = import.meta.env.DEV;
const DEV_PASS = 'admin123';
const DEMO_ACCOUNTS = SHOW_DEMO ? [
  { email: 'admin@hbg.com',     pass: DEV_PASS,  role: 'PMO (Admin)',     desc: t('lg.role_ceo') },
  { email: 'ceo@hbg.com',       pass: DEV_PASS,  role: 'CEO',             desc: t('lg.role_ceo_note') },
  { email: 'pm@hbg.com',        pass: DEV_PASS,  role: 'PM',              desc: t('lg.role_pmo') },
  { email: 'pmo@hbg.com',       pass: DEV_PASS,  role: 'PMO',             desc: t('lg.role_pmo_note') },
  { email: 'site@hbg.com',      pass: DEV_PASS,  role: 'Site',            desc: t('lg.role_field') },
  { email: 'procurement@hbg.com', pass: DEV_PASS, role: 'Procurement',     desc: t('lg.role_procurement') },
  { email: 'accounting@hbg.com',  pass: DEV_PASS, role: 'Accounting',      desc: 'Thanh toán' },
] : [];

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  useLang();
  const [email, setEmail] = useState(SHOW_DEMO ? 'admin@hbg.com' : '');
  const [password, setPassword] = useState(SHOW_DEMO ? DEV_PASS : '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tenant, setTenant] = useState('');
  const [tenantChoices, setTenantChoices] = useState([]);
  // Forced rotation (Wave 2 A2): login answers 403 + token; collect the new
  // password on this screen instead of entering the app locked-out.
  const [forceChange, setForceChange] = useState(null); // { token, refresh_token, user }
  const [newPw1, setNewPw1] = useState('');
  const [newPw2, setNewPw2] = useState('');
  // SRS MFA: login answers 401 + mfa_required; collect the 6-digit code here.
  // Sau SSO tu /sso/callback: { email, sso_pending } (khong can password).
  const [mfaStep, setMfaStep] = useState(() => loc.state?.sso_pending
    ? { email: loc.state?.email || '', sso_pending: loc.state.sso_pending }
    : null);
  const [mfaCode, setMfaCode] = useState('');
  const isField = loc.pathname.startsWith('/field');

  function enterApp(user) {
    setUser(user);
    if (user?.locale === 'en' || user?.locale === 'vi') setLang(user.locale);
    // Site → /field, các role khác → /hq (DB seeds lowercase, constants uppercase)
    const isSiteRole = String(user.role || '').toLowerCase() === 'site';
    nav(isField || isSiteRole ? '/field' : '/hq', { replace: true });
  }

  function fillAccount(acc) {
    setEmail(acc.email);
    setPassword(acc.pass);
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await auth.login(email, password, tenant);
      if (!r || !r.token) throw new Error(t('login.failed'));
      setToken(r.token);
      if (r.refresh_token) setRefreshToken(r.refresh_token);
      enterApp(r.user);
    } catch (e) {
      if (e.status === 403 && e.response?.must_change_password && e.response?.token) {
        setToken(e.response.token);
        if (e.response.refresh_token) setRefreshToken(e.response.refresh_token);
        setForceChange(e.response);
        setError(null);
      } else if (e.status === 401 && e.response?.mfa_required) {
        setMfaStep({ email, tenant });
        setMfaCode('');
        setError(null);
      } else if (e.status === 409 && e.response?.error === 'TENANT_REQUIRED') {
        const choices = Array.isArray(e.response.tenants) ? e.response.tenants : [];
        setTenantChoices(choices);
        setTenant('');
        setError(t('lg.multi_tenant'));
      } else {
        setError(e.message || t('login.failed'));
      }
    } finally {
      setBusy(false);
    }
  }

  // SSO: lay auth_url theo email roi chuyen browser sang IdP ngoai.
  async function submitSso() {
    setError(null);
    // The error box was showing the FIELD LABEL ("Email / Username") instead
    // of a reason. A validation message has to say what to do.
    if (!email || !/^\S+@\S+\.\S+$/.test(email.trim())) { setError(t('login.email_invalid')); return; }
    setBusy(true);
    try {
      const r = await sso.start(email.trim().toLowerCase(), tenant);
      if (!r?.auth_url) throw new Error(t('login.failed'));
      window.location.href = r.auth_url;
    } catch (e) {
      if (e.status === 409 && e.response?.error === 'TENANT_REQUIRED') {
        setTenantChoices(Array.isArray(e.response.tenants) ? e.response.tenants : []);
        setTenant('');
        setError(t('lg.multi_tenant_sso'));
      } else {
        setError(e.message || t('login.sso_unavailable'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(e) {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(mfaCode.trim())) { setError(t('login.mfa_bad')); return; }
    setBusy(true);
    try {
      const r = mfaStep?.sso_pending
        ? await sso.mfaVerify(mfaStep.sso_pending, mfaCode.trim())
        : await auth.mfaVerify(mfaStep.email, password, mfaCode.trim(), mfaStep.tenant);
      if (!r || !r.token) throw new Error(t('login.mfa_failed'));
      setToken(r.token);
      if (r.refresh_token) setRefreshToken(r.refresh_token);
      enterApp(r.user);
    } catch (err) {
      if (err.status === 403 && err.response?.must_change_password && err.response?.token) {
        setToken(err.response.token);
        if (err.response.refresh_token) setRefreshToken(err.response.refresh_token);
        setForceChange(err.response);
        setMfaStep(null);
        setError(null);
      } else {
        setError(err.message || t('login.mfa_failed'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitChange(e) {
    e.preventDefault();
    setError(null);
    if (newPw1 !== newPw2) { setError(t('login.pass_mismatch')); return; }
    if (newPw1.length < 10) { setError(t('login.pass_short')); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/me/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${forceChange.token}` },
        body: JSON.stringify({ old_password: password, new_password: newPw1 }),
      }).then((res) => res.json().then((body) => ({ ok: res.ok, ...body })));
      if (!r.ok || r.error) throw new Error(r.error || t('login.change_failed'));
      // The server bumps token_version and revokes every refresh token as part
      // of the change, then hands back a FRESH pair. Not storing them left the
      // old (now dead) access token in place, so the very next API call 401'd
      // and tryRefresh() had nothing valid to use — the user was dumped into a
      // blank shell with no way back to /login.
      if (r.token) setToken(r.token);
      if (r.refresh_token) setRefreshToken(r.refresh_token);
      setUser(forceChange.user);
      setForceChange(null);
      const isSiteRole = String(forceChange.user.role || '').toLowerCase() === 'site';
      nav(isField || isSiteRole ? '/field' : '/hq', { replace: true });
    } catch (err) {
      setError(err.message || t('login.change_failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-side">
        <div>
          <div className="brand-mark">O-NEXUS</div>
          <div className="brand-sub">{isField ? t('login.brand_field') : t('login.brand_hq')}</div>
        </div>
        <div>
          <div className="headline">{t('login.headline')}</div>
          <div className="caption">{t('login.caption')}</div>
        </div>
        <div className="legal">© 2026 O-Nexus · PMO MVP</div>
      </div>
      <div className="login-form">
        <div style={{ alignSelf: 'flex-end', marginBottom: 8 }}>
          <button type="button" className="demo-chip" onClick={() => setLang(getLang() === 'vi' ? 'en' : 'vi')} title="VI/EN">
            {getLang() === 'vi' ? 'EN' : 'VI'}
          </button>
        </div>
        {mfaStep ? (
          <form className="login-card" onSubmit={submitMfa}>
            <h2>{t('login.mfa_title')}</h2>
            <div className="sub">{t('login.mfa_account')} {mfaStep.email} {t('login.mfa_sub')}</div>
            <div className="login-field">
              <label>{t('login.mfa_code')}</label>
              <input inputMode="numeric" pattern="[0-9]*" maxLength={6} value={mfaCode} onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required autoComplete="one-time-code" />
            </div>
            <button className="login-submit" type="submit" disabled={busy}>
              {busy ? t('login.busy') : t('login.mfa_confirm')}
            </button>
            <div className="login-forgot">
              <a href="#" onClick={e => { e.preventDefault(); setMfaStep(null); setError(null); }}>{t('login.mfa_back')}</a>
            </div>
            {error && <div className="login-error">{error}</div>}
          </form>
        ) : forceChange ? (
          <form className="login-card" onSubmit={submitChange}>
            <h2>{t('login.change_title')}</h2>
            <div className="sub">{t('login.mfa_account')} {forceChange.user?.email} {t('login.change_sub')}</div>
            <div className="login-field">
              <label>{t('login.new_pass')}</label>
              <input type="password" value={newPw1} onChange={e => setNewPw1(e.target.value)} required autoComplete="new-password" />
            </div>
            <div className="login-field">
              <label>{t('login.new_pass2')}</label>
              <input type="password" value={newPw2} onChange={e => setNewPw2(e.target.value)} required autoComplete="new-password" />
            </div>
            <button className="login-submit" type="submit" disabled={busy}>
              {busy ? t('login.busy') : t('login.change_submit')}
            </button>
            {/* Without this the form is a dead end: the temporary password is
                still valid, so going back to sign-in and trying again works. */}
            <div className="login-alt">
              <a href="#" onClick={(e) => { e.preventDefault(); setForceChange(null); setError(null); setNewPw1(''); setNewPw2(''); }}>{t('login.mfa_back')}</a>
            </div>
            {error && <div className="login-error">{error}</div>}
          </form>
        ) : (
        <form className="login-card" onSubmit={submit}>
          <h2>{t('login.title')}</h2>
          <div className="sub">{t('login.subtitle')}</div>
          <div className="login-field">
            <label>{t('login.email')}</label>
            <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setTenant(''); setTenantChoices([]); setError(null); }} required autoComplete="username" />
          </div>
          {tenantChoices.length > 0 && (
            <div className="login-field">
              <label>{t('lg.lbl_tenant')}</label>
              <select value={tenant} onChange={(e) => setTenant(e.target.value)} required>
                <option value="">{t('lg.pick_tenant')}</option>
                {tenantChoices.map((t) => <option key={t.id} value={t.code || t.id}>{t.name || t.code} ({t.code || `#${t.id}`})</option>)}
              </select>
            </div>
          )}
          <div className="login-field">
            <label>{t('login.password')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          <button className="login-submit" type="submit" disabled={busy}>
            {busy ? t('login.busy') : t('login.submit')}
          </button>
          <button type="button" className="login-submit" onClick={submitSso} disabled={busy}
            title={t('login.sso_hint')}
            style={{ marginTop: 8, background: 'transparent', color: 'var(--c-text)', border: '1px solid var(--c-border)' }}>
            {t('login.sso')}
          </button>
          {error && <div className="login-error">{error}</div>}
          <div className="login-forgot">
            {/* There is no self-service reset endpoint (only
                POST /api/admin/users/:id/reset-password), so this used to be a
                link that did nothing. Say who can actually reset it. */}
            {t('login.forgot')}
          </div>
          {SHOW_DEMO && <div className="login-info">
            <strong>{t('login.demo_title')}</strong>
            <div className="demo-grid">
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.email} type="button" className="demo-chip" onClick={() => fillAccount(a)} title={a.desc}>
                  <span className="demo-role">{a.role}</span>
                  <span className="demo-email">{a.email}</span>
                </button>
              ))}
            </div>
          </div>}
        </form>
        )}
      </div>
    </div>
  );
}
