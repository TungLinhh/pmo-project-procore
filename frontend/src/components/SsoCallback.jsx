// SSO callback (frontend): IdP redirect ve /sso/callback?code=&state= — doi
// lay tokens qua backend (token khong qua URL). MFA bat -> chuyen ve /login
// kem sso_pending de nhap TOTP. Khong doi duoc code 2 lan (StrictMode guard).
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { sso, setToken, setRefreshToken, setUser } from '../api/index.js';
import { t, useLang, setLang } from '../i18n/index.js';
import '../styles/login.css';

export default function SsoCallback() {
  useLang();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [error, setError] = useState(null);
  const once = useRef(false);

  function enterApp(user) {
    setUser(user);
    if (user?.locale === 'en' || user?.locale === 'vi') setLang(user.locale);
    const isSiteRole = String(user.role || '').toLowerCase() === 'site';
    nav(isSiteRole ? '/field' : '/hq', { replace: true });
  }

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) {
      setError(t('sso.failed'));
      return;
    }
    sso.callback(code, state).then((r) => {
      if (!r?.token) throw new Error(t('sso.failed'));
      setToken(r.token);
      if (r.refresh_token) setRefreshToken(r.refresh_token);
      enterApp(r.user);
    }).catch((e) => {
      // 401 + sso_pending = user bat MFA: ve login nhap TOTP (khong mat phien).
      if (e.status === 401 && e.response?.sso_pending) {
        nav('/login', { replace: true, state: { sso_pending: e.response.sso_pending, email: e.response.email || '' } });
        return;
      }
      setError(e.message || t('sso.failed'));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="login-page">
      <div className="login-side">
        <div>
          <div className="brand-mark">O-NEXUS</div>
          <div className="brand-sub">{t('login.brand_hq')}</div>
        </div>
        <div>
          <div className="headline">{t('login.headline')}</div>
          <div className="caption">{t('login.caption')}</div>
        </div>
        <div className="legal">© 2026 O-Nexus · PMO MVP</div>
      </div>
      <div className="login-form">
        <div className="login-card">
          <h2>SSO</h2>
          {!error ? (
            <div className="sub">{t('sso.working')}</div>
          ) : (
            <>
              <div className="login-error">{error}</div>
              <div className="login-forgot">
                <Link to="/login">{t('sso.back_login')}</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
