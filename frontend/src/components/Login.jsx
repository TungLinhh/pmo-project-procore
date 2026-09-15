// UI-001: Login (HQ + Field) - với 7 demo accounts cho mục 43.2
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { auth, setToken, setRefreshToken, setUser } from '../api/index.js';
import '../styles/login.css';

// Demo: mọi account dùng chung mật khẩu dev 'admin123' (hash bcrypt phía server).
// Password riêng từng user chưa từng hoạt động — chip chỉ fill đúng password dùng được.
const DEV_PASS = 'admin123';
const DEMO_ACCOUNTS = [
  { email: 'admin@hbg.com',     pass: DEV_PASS,  role: 'PMO (Admin)',     desc: 'Toàn quyền' },
  { email: 'ceo@hbg.com',       pass: DEV_PASS,  role: 'CEO',             desc: 'Ra chỉ thị + xem tất cả' },
  { email: 'pm@hbg.com',        pass: DEV_PASS,  role: 'PM',              desc: 'Quản lý dự án' },
  { email: 'pmo@hbg.com',       pass: DEV_PASS,  role: 'PMO',             desc: 'Vận hành + governance' },
  { email: 'site@hbg.com',      pass: DEV_PASS,  role: 'Site',            desc: 'Hiện trường' },
  { email: 'procurement@hbg.com', pass: DEV_PASS, role: 'Procurement',     desc: 'Mua vật tư' },
  { email: 'accounting@hbg.com',  pass: DEV_PASS,  role: 'Accounting',      desc: 'Thanh toán' },
];

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('admin@hbg.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const isField = loc.pathname.startsWith('/field');

  function fillAccount(acc) {
    setEmail(acc.email);
    setPassword(acc.pass);
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await auth.login(email, password);
      if (!r || !r.token) throw new Error('Đăng nhập thất bại');
      setToken(r.token);
      if (r.refresh_token) setRefreshToken(r.refresh_token);
      setUser(r.user);
      // Site → /field, các role khác → /hq (DB seeds lowercase, constants uppercase)
      const isSiteRole = String(r.user.role || '').toLowerCase() === 'site';
      nav(isField || isSiteRole ? '/field' : '/hq', { replace: true });
    } catch (e) {
      setError(e.message || 'Đăng nhập thất bại');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-side">
        <div>
          <div className="brand-mark">O-NEXUS</div>
          <div className="brand-sub">{isField ? 'Field Operations' : 'Project Control Center'}</div>
        </div>
        <div>
          <div className="headline">Quản lý dự án xây dựng tập trung.</div>
          <div className="caption">Bản vẽ · Vật tư · Nhân lực · Thanh toán — một nguồn dữ liệu duy nhất.</div>
        </div>
        <div className="legal">© 2026 O-Nexus · PMO MVP</div>
      </div>
      <div className="login-form">
        <form className="login-card" onSubmit={submit}>
          <h2>Đăng nhập</h2>
          <div className="sub">Tiếp tục vào không gian làm việc của bạn</div>
          <div className="login-field">
            <label>Email / Username</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username" />
          </div>
          <div className="login-field">
            <label>Mật khẩu</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
          </div>
          <button className="login-submit" type="submit" disabled={busy}>
            {busy ? 'Đang xử lý...' : 'ĐĂNG NHẬP'}
          </button>
          {error && <div className="login-error">{error}</div>}
          <div className="login-forgot">
            <a href="#" onClick={e => e.preventDefault()}>Quên mật khẩu?</a>
          </div>
          <div className="login-info">
            <strong>Demo accounts (click để auto-fill):</strong>
            <div className="demo-grid">
              {DEMO_ACCOUNTS.map(a => (
                <button key={a.email} type="button" className="demo-chip" onClick={() => fillAccount(a)} title={a.desc}>
                  <span className="demo-role">{a.role}</span>
                  <span className="demo-email">{a.email}</span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
