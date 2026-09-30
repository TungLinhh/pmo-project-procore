// Field Shell (mục 37 - tablet first, no hover, touch ≥ 44px)
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { t, useLang } from '../i18n/index.js';
import { useState, useEffect } from 'react';
import { getUser, setToken, setUser, auth } from '../api/index.js';
import { loadOutbox } from '../field/outbox.js';
import { ICON } from '../icons.jsx';
import '../styles/field.css';

// Offline queue status bar (resolve: /field/sync — SERVER keeps, CLIENT applies).
function SyncStatusBar() {
  const [status, setStatus] = useState('SYNCED');
  const [queued, setQueued] = useState(0);
  useEffect(() => {
    const refresh = () => {
      try {
        const pending = loadOutbox().filter((i) => i.status === 'queued' || i.status === 'sending').length;
        setQueued(pending);
        setStatus(!navigator.onLine ? 'OFFLINE' : pending > 0 ? 'SAVED_LOCALLY' : 'SYNCED');
      } catch { /* non-browser */ }
    };
    refresh();
    const handler = () => refresh();
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    window.addEventListener('pmo:outbox', handler);
    const t = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
      window.removeEventListener('pmo:outbox', handler);
      clearInterval(t);
    };
  }, []);
  const labels = {
    OFFLINE: t('fsh.st_offline'),
    SAVED_LOCALLY: t('fsh.st_saved_local'),
    SYNCING: t('fsh.st_syncing'),
    SYNCED: t('fsh.st_synced_all'),
  };
  return (
    <div className={`sync-bar ${status.toLowerCase().replace('_', '-')}`}>
      <span><span className="dot" />{labels[status]}</span>
      <span>Queue: {queued}</span>
    </div>
  );
}

export default function FieldShell() {
  useLang(); // khung field: nhãn đổi ngay khi bấm [VI|EN]
  const user = getUser() || { full_name: 'Field' };
  const nav = useNavigate();
  const loc = useLocation();
  const showBack = loc.pathname !== '/field' && loc.pathname !== '/field/home';

  async function logout() {
    try { await auth.logout(); } finally {
      setToken(null);
      setUser(null);
      nav('/login');
    }
  }

  return (
    <div className="field-shell">
      <header className="field-header">
        <div className="brand">
          <div className="logo">O</div>
          <div className="text">
            <h1>O-NEXUS Field</h1>
            <div className="role">{user.full_name || user.email} · {user.role}</div>
          </div>
        </div>
        {showBack ?
          <button className="field-back" onClick={() => nav(-1)}>
            <ICON.back size={14} /> {t('fld.btn_back_plain')}
          </button> :
          <button className="field-back" onClick={logout}>
            <ICON.logout size={14} />{t('fsh.btn_logout')}</button>
        }
      </header>
      <SyncStatusBar />
      <div className="field-content">
        <Outlet />
      </div>
    </div>
  );
}
