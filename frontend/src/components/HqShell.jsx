// App Shell (UI-002) - role-based sidebar, icon đơn sắc
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { getUser, setToken, setUser } from '../api/index.js';
import { ICON } from '../icons.jsx';
import BellDropdown from './BellDropdown.jsx';
import '../styles/hq.css';

const MENU = [
  { group: 'Tổng quan', items: [
    { to: '/hq', label: 'Project Control Center', icon: ICON.dashboard, end: true },
  ]},
  { group: 'Nghiệp vụ', items: [
    { to: '/hq/projects', label: 'Dự án', icon: ICON.projects },
    { to: '/hq/progress', label: 'Progress', icon: ICON.progress },
    { to: '/hq/shop', label: 'Shopdrawing', icon: ICON.shop },
    { to: '/hq/materials', label: 'Materials', icon: ICON.materials },
    { to: '/hq/manpower', label: 'Manpower', icon: ICON.manpower },
    { to: '/hq/payment', label: 'Payment', icon: ICON.payment },
    { to: '/hq/issues', label: 'Issues', icon: ICON.issues },
  ]},
  { group: 'Quản trị', items: [
    { to: '/hq/uploads', label: 'Uploads', icon: ICON.upload },
    { to: '/hq/notifications', label: 'Thông báo', icon: ICON.bell },
    { to: '/hq/master-data', label: 'Master Data', icon: ICON.database },
    { to: '/hq/approval', label: 'Approval', icon: ICON.check },
    { to: '/hq/approval-chains', label: 'Cấu hình duyệt', icon: ICON.check },
    { to: '/hq/audit', label: 'Audit Log', icon: ICON.audit },
  ]},
];

// Sidebar visibility per role (server still enforces everything).
const ROLE_HIDE = {
  CEO: ['manpower', 'materials', 'master-data', 'approval'],
  PM: ['master-data', 'approval', 'audit'],
  SITE: ['payment', 'master-data', 'approval', 'audit'],
  PROCUREMENT: ['progress', 'manpower', 'payment', 'master-data', 'audit'],
  ACCOUNTING: ['progress', 'manpower', 'master-data', 'audit'],
  DATA_ADMIN: ['progress', 'shop', 'manpower', 'issues', 'notifications'],
};

const ICON_BG = {
  'Project Control Center': ICON.dashboard,
  'Dự án': ICON.projects,
  'Progress': ICON.progress,
  'Shopdrawing': ICON.shop,
  'Materials': ICON.materials,
  'Manpower': ICON.manpower,
  'Payment': ICON.payment,
  'Issues': ICON.issues,
  'Thông báo': ICON.bell,
  'Master Data': ICON.database,
  'Approval': ICON.check,
  'Audit Log': ICON.audit,
};

export default function HqShell() {
  const user = getUser() || { full_name: 'Guest', role: 'PMO' };
  const role = (user.role || 'PMO').toUpperCase();
  const hide = ROLE_HIDE[role] || [];
  const nav = useNavigate();

  // Theme: light/dark (lưu localStorage theo mặc định)
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('pmo_theme') || 'light'; } catch { return 'light'; }
  });
  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    try { localStorage.setItem('pmo_theme', theme); } catch {}
  }, [theme]);

  // Mobile drawer state - mặc định ẩn trên mobile
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Auto-close drawer khi route thay đổi
  useEffect(() => { setDrawerOpen(false); }, [window.location.pathname]);

  function logout() {
    setToken(null);
    setUser(null);
    nav('/login');
  }

  const initials = (user.full_name || user.email || '?').split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
  const Now = new Date();
  const timeStr = Now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="shell">
      {/* Mobile hamburger - chỉ hiện <768px */}
      <button
        className="shell-hamburger"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
        title="Open menu"
      >
        <ICON.menu size={18} />
      </button>

      {/* Mobile drawer overlay */}
      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}

      <aside className={`shell-sidebar${drawerOpen ? ' open' : ''}`}>
        <div className="shell-brand">
          <div className="logo">O</div>
          <div className="text">
            <span className="name">O-NEXUS</span>
            <span className="sub">Project Control</span>
          </div>
          {/* Close button - chỉ hiện trong drawer mode (mobile) */}
          <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Close menu">
            <ICON.close size={16} />
          </button>
        </div>
        <nav className="shell-menu" onClick={() => setDrawerOpen(false)}>
          {MENU.map(group => {
            const items = group.items.filter(i => !hide.some(h => i.to.includes(h)));
            if (items.length === 0) return null;
            return (
              <div key={group.group}>
                <div className="group">{group.group}</div>
                {items.map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink key={item.to} to={item.to} end={item.end}>
                      <Icon size={15} />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="shell-footer">
          <div className="shell-avatar">{initials}</div>
          <div className="shell-user">
            <div className="shell-user-name">{user.full_name || user.email}</div>
            <div className="shell-user-role">{user.role}</div>
          </div>
          <button className="field-icon-btn" style={{ padding: '4px 8px', minHeight: 28, fontSize: 11 }} onClick={logout}>
            <ICON.logout size={13} />
          </button>
        </div>
      </aside>
      <div className="shell-main">
        <div className="shell-header">
          <h2>Project Control Center</h2>
          <div className="shell-header-right">
            <span className="shell-freshness"><span className="dot" />Synced {timeStr}</span>
            <button
              className="field-icon-btn theme-toggle"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Chuyển sang Light mode' : 'Chuyển sang Dark mode'}
              style={{ background: 'transparent', border: '1px solid var(--c-border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
            >
              {theme === 'dark' ? <ICON.sun size={14} /> : <ICON.moon size={14} />}
            </button>
            <BellDropdown />
          </div>
        </div>
        <div className="shell-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
