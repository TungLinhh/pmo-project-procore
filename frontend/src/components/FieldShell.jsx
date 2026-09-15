// Field Shell (mục 37 - tablet first, no hover, touch ≥ 44px)
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getUser, setToken, setUser } from '../api/index.js';
import { ICON } from '../icons.jsx';
import '../styles/field.css';

// Offline queue status bar (resolve: /field/sync — SERVER keeps, CLIENT applies).
function SyncStatusBar() {
  const [status, setStatus] = useState('SYNCED');
  useEffect(() => {
    setStatus(navigator.onLine ? 'SYNCED' : 'OFFLINE');
    const handler = () => setStatus(navigator.onLine ? 'SYNCED' : 'OFFLINE');
    window.addEventListener('online', handler);
    window.addEventListener('offline', handler);
    return () => {
      window.removeEventListener('online', handler);
      window.removeEventListener('offline', handler);
    };
  }, []);
  const labels = {
    OFFLINE: 'Offline — sẽ sync khi có mạng',
    SAVED_LOCALLY: 'Đã lưu local — chờ sync',
    SYNCING: 'Đang đồng bộ...',
    SYNCED: 'Đã đồng bộ tất cả',
  };
  return (
    <div className={`sync-bar ${status.toLowerCase().replace('_', '-')}`}>
      <span><span className="dot" />{labels[status]}</span>
      <span>Queue: 0</span>
    </div>
  );
}

export default function FieldShell() {
  const user = getUser() || { full_name: 'Field' };
  const nav = useNavigate();
  const loc = useLocation();
  const showBack = loc.pathname !== '/field' && loc.pathname !== '/field/home';

  function logout() {
    setToken(null);
    setUser(null);
    nav('/login');
  }

  const initials = (user.full_name || user.email || 'F').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();

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
            <ICON.back size={14} /> Quay lại
          </button> :
          <button className="field-back" onClick={logout}>
            <ICON.logout size={14} /> Đăng xuất
          </button>
        }
      </header>
      <SyncStatusBar />
      <div className="field-content">
        <Outlet />
      </div>
    </div>
  );
}
