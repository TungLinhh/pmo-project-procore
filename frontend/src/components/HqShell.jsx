// App Shell (UI-002) - role-based sidebar, icon đơn sắc
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import { getUser, setToken, setUser, request, auth } from '../api/index.js';
import { t, useLang, setLang, getLang } from '../i18n/index.js';
import { ICON } from '../icons.jsx';
import BellDropdown from './BellDropdown.jsx';
import '../styles/hq.css';

// Task 10 i18n: nhan nav bang key (t() theo ngon ngu hien tai), giu `to` on dinh.
// Mỗi mục một icon riêng biệt: trùng icon khiến rail mode (chỉ còn icon) rất dễ
// nhầm — ví dụ 4 mục dùng chung `settings` và 3 mục dùng chung `check`.
const MENU = [
  { groupKey: 'nav.group_overview', items: [
    { to: '/hq', labelKey: 'nav.control_center', icon: ICON.dashboard, end: true },
    { to: '/hq/security', labelKey: 'nav.security', icon: ICON.settings },
  ]},
  { groupKey: 'nav.group_business', items: [
    { to: '/hq/projects', labelKey: 'nav.projects', icon: ICON.projects },
    { to: '/hq/progress', labelKey: 'nav.progress', icon: ICON.progress },
    { to: '/hq/shop', labelKey: 'nav.shop', icon: ICON.shop },
    { to: '/hq/materials', labelKey: 'nav.materials', icon: ICON.materials },
    { to: '/hq/manpower', labelKey: 'nav.manpower', icon: ICON.manpower },
    { to: '/hq/qa', labelKey: 'nav.qa', icon: ICON.eye },
    { to: '/hq/payment', labelKey: 'nav.payment', icon: ICON.payment },
    { to: '/hq/issues', labelKey: 'nav.issues', icon: ICON.issues },
    { to: '/hq/attention', labelKey: 'nav.attention', icon: ICON.calendar },
    // Enterprise-only: AI assistant (v0.7.0).
    { to: '/hq/assistant', labelKey: 'nav.assistant', icon: ICON.search, flag: 'ai-assistant' },
    // Enterprise-only: BIM library store-only v1 (v0.9.0, chưa có viewer).
    { to: '/hq/bim', labelKey: 'nav.bim', icon: ICON.building, flag: 'bim-library' },
  ]},
  { groupKey: 'nav.group_ops', items: [
    // NFR task 9: đo hiệu năng + roll-up đa dự án + tác vụ nền theo nhóm.
    { to: '/hq/ops', labelKey: 'nav.ops', icon: ICON.cloud_off },
    // Admin/CEO: sao lưu hàng ngày (server giữ chuẩn role).
    { to: '/hq/backups', labelKey: 'nav.backups', icon: ICON.database },
    // PMO-owned: đèn xanh/vàng/đỏ theo ngưỡng (SRS FR-1.6; backend gates role).
    { to: '/hq/health-config', labelKey: 'nav.health_config', icon: ICON.sync },
  ]},
  { groupKey: 'nav.group_admin', items: [
    { to: '/hq/uploads', labelKey: 'nav.uploads', icon: ICON.upload },
    { to: '/hq/notifications', labelKey: 'nav.notifications', icon: ICON.bell },
    { to: '/hq/master-data', labelKey: 'nav.master_data', icon: ICON.hash },
    { to: '/hq/approval', labelKey: 'nav.approval', icon: ICON.check },
    // Enterprise-only: custom L1-L5 chains (lower plans use single-step).
    { to: '/hq/approval-chains', labelKey: 'nav.approval_chains', icon: ICON.bp, flag: 'chains' },
    // Enterprise-only: audit CSV/JSON export. In-app timeline stays everywhere.
    { to: '/hq/audit', labelKey: 'nav.audit', icon: ICON.audit, flag: 'audit-export' },
    // Enterprise-only: AI provider routing (admin/CEO; backend enforces role too).
    { to: '/hq/ai-config', labelKey: 'nav.ai_config', icon: ICON.filter, flag: 'ai-assistant' },
    // Task 10: SSO IdP + ma hoa + DSR (admin/ceo; backend requireRole).
    { to: '/hq/data-security', labelKey: 'nav.data_security', icon: ICON.folder },
  ]},
];

// Sidebar visibility per role (server still enforces everything).
const ROLE_HIDE = {
  // CEO can inspect and decide, but does not enter master data or upload files.
  CEO: ['uploads', 'master-data'],
  PM: ['master-data', 'audit', 'backups', 'data-security', 'health-config', 'ai-config', 'approval-chains'],
  SITE: ['ops', 'payment', 'master-data', 'approval', 'audit', 'backups', 'data-security', 'health-config', 'ai-config', 'approval-chains'],
  TECHNICAL: ['ops', 'master-data', 'approval', 'audit', 'backups', 'data-security', 'health-config', 'ai-config', 'approval-chains'],
  PROCUREMENT: ['ops', 'approval', 'audit', 'backups', 'data-security', 'health-config', 'ai-config', 'approval-chains'],
  ACCOUNTING: ['ops', 'audit', 'backups', 'data-security', 'health-config', 'ai-config', 'approval-chains'],
  PMO: ['approval-chains', 'backups', 'data-security', 'ai-config'],
  DATA_ADMIN: ['progress', 'shop', 'manpower', 'issues', 'notifications', 'backups', 'data-security', 'health-config', 'ai-config', 'approval-chains'],
};

export default function HqShell() {
  const user = getUser() || { full_name: 'Guest', role: 'PMO' };
  const role = (user.is_ceo ? 'CEO' : (user.role || 'PMO')).toUpperCase();
  const hide = ROLE_HIDE[role] || [];
  const nav = useNavigate();
  const location = useLocation();
  // Task 10 i18n: subscribe ngon ngu de re-render nav khi toggle.
  useLang();

  // Plan entitlements (Small/Mid/Enterprise): hide enterprise-only nav items for
  // lower plans. Backend requireFeature() still enforces — this is UX only.
  // Default: show everything until entitlements load (no flicker-deny).
  const [features, setFeatures] = useState(null);
  const [plan, setPlan] = useState('');
  useEffect(() => {
    request('/me/entitlements')
      .then((j) => { if (Array.isArray(j?.features)) { setFeatures(j.features); setPlan(j.plan || ''); } })
      .catch(() => {});
  }, []);

  // Theme: light/dark (lưu localStorage theo mặc định)
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('pmo_theme') || 'light'; } catch { return 'light'; }
  });
  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark');
    try { localStorage.setItem('pmo_theme', theme); } catch {}
  }, [theme]);

  // Rail mode: thu sidebar thành thanh icon mỏng để màn hình chính có thêm
  // không gian. Nhớ qua localStorage; mặc định mở rộng.
  const [rail, setRail] = useState(() => {
    try { return localStorage.getItem('pmo_sidebar_rail') === '1'; } catch { return false; }
  });
  const toggleRail = () => setRail((prev) => {
    const next = !prev;
    try { localStorage.setItem('pmo_sidebar_rail', next ? '1' : '0'); } catch {}
    return next;
  });

  // Mobile drawer state - mặc định ẩn trên mobile
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Auto-close drawer khi route thay đổi (location từ useLocation — reactive)
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Collapsible menu groups — thu gọn từng section, nhớ lựa chọn qua reload.
  // Mặc định mở hết (không gây bỡ ngỡ); group chứa route đang xem tự bung.
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pmo_menu_collapsed') || '{}'); } catch { return {}; }
  });
  // Task 10 i18n: lan dau vao app, neu chua chon tay thi theo locale server.
  useEffect(() => {
    try {
      if (localStorage.getItem('pmo_lang')) return;
    } catch { /* non-browser */ }
    request('/auth/me')
      .then((j) => { if (j?.user?.locale === 'en' || j?.user?.locale === 'vi') setLang(j.user.locale); })
      .catch(() => {});
  }, []);
  const toggleGroup = (g) => setCollapsed(prev => {
    const next = { ...prev, [g]: !prev[g] };
    try { localStorage.setItem('pmo_menu_collapsed', JSON.stringify(next)); } catch {}
    return next;
  });
  const openGroup = (g) => setCollapsed(prev => {
    if (!prev[g]) return prev;
    const next = { ...prev, [g]: false };
    try { localStorage.setItem('pmo_menu_collapsed', JSON.stringify(next)); } catch {}
    return next;
  });
  // Bung nhóm khi điều hướng tới một mục nằm trong nhóm đang thu, để người dùng
  // luôn thấy vị trí của mình. Trước đây nhóm chứa route hiện tại bị ép bung vĩnh
  // viễn (`|| isActiveGroup`) nên nhấn tiêu đề nhóm không thu được.
  // Bỏ qua lần chạy đầu: reload phải giữ nguyên lựa chọn đã lưu, không tự bung.
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return undefined; }
    const active = MENU.find((group) => group.items.some((item) => (
      item.end ? location.pathname === item.to : location.pathname === item.to || location.pathname.startsWith(item.to + '/')
    )));
    if (active) openGroup(active.groupKey);
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);
  async function logout() {
    try { await auth.logout(); } finally {
      setToken(null);
      setUser(null);
      nav('/login');
    }
  }

  // Task 10 i18n: toggle VI/EN + luu server (fire-and-forget).
  function toggleLang() {
    const next = getLang() === 'vi' ? 'en' : 'vi';
    setLang(next);
    request('/me/locale', { method: 'PUT', body: { locale: next } }).catch(() => {});
  }

  const initials = (user.full_name || user.email || '?').split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  // U2: giờ dữ liệu thật do màn hình dispatch (pmo:data-loaded). Chưa có thì
  // không hiển thị gì — không dùng giờ render để giả làm "đã đồng bộ".
  const [dataAt, setDataAt] = useState(null);
  useEffect(() => {
    const onData = (e) => { try { setDataAt(new Date(e.detail?.at || Date.now())); } catch {} };
    window.addEventListener('pmo:data-loaded', onData);
    return () => window.removeEventListener('pmo:data-loaded', onData);
  }, [location.pathname]);
  const dataAtStr = dataAt ? dataAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <div className={`shell${rail ? ' rail' : ''}`}>
      {/* Mobile hamburger - chỉ hiện <768px */}
      <button
        className="shell-hamburger"
        onClick={() => setDrawerOpen(true)}
        aria-label={t('shell.open_menu')}
        title={t('shell.open_menu')}
      >
        <ICON.menu size={18} />
      </button>

      {/* Mobile drawer overlay */}
      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}

      <aside className={`shell-sidebar${drawerOpen ? ' open' : ''}`}>
        <div className="shell-brand">
          {/* Logo công ty chưa có — khi rail chỉ hiện nút mở, tránh logo trùng
              chỗ với nút và tạo cảm giác vướng nhau. */}
          <div className="logo">O</div>
          <div className="text">
            <span className="name">O-NEXUS</span>
            <span className="sub">{t('shell.sub_product')}</span>
          </div>
          <button
            className="rail-toggle"
            onClick={toggleRail}
            aria-label={rail ? t('shell.menu_expand') : t('shell.menu_collapse')}
            aria-pressed={rail}
            title={rail ? t('shell.menu_expand') : t('shell.menu_collapse')}
          >
            <span className="rail-toggle-icon">
              {rail ? <ICON.menu size={15} /> : <ICON.chevron size={14} />}
            </span>
          </button>
          {/* Close button - chỉ hiện trong drawer mode (mobile) */}
          <button className="drawer-close" onClick={() => setDrawerOpen(false)} aria-label={t('shell.close_menu')}>
            <ICON.close size={16} />
          </button>
        </div>
        <nav className="shell-menu" onClick={() => setDrawerOpen(false)}>
          {MENU.map(group => {
            const firstSeg = (to) => to.split('/').filter(Boolean)[1] || '';
            const items = group.items.filter(i =>
              !hide.some(h => firstSeg(i.to) === h) &&
              (!i.flag || features === null || features.includes(i.flag))
            );
            if (items.length === 0) return null;
            // Không ép bung nhóm đang chứa route: người dùng phải thu được
            // bất kỳ nhóm nào. Nhóm sẽ tự bung khi điều hướng vào (effect ở trên).
            const open = !collapsed[group.groupKey];
            return (
              <div key={group.groupKey}>
                <button
                  className="group-toggle"
                  onClick={() => toggleGroup(group.groupKey)}
                  aria-expanded={open}
                  title={open ? `${t('shell.collapse')} ${t(group.groupKey)}` : `${t('shell.expand')} ${t(group.groupKey)}`}
                >
                  <span className="group">{t(group.groupKey)}</span>
                  <span className={`group-chevron${open ? ' open' : ''}`}><ICON.chevron size={13} /></span>
                </button>
                {open && items.map(item => {
                  const Icon = item.icon;
                  return (
                    <NavLink key={item.to} to={item.to} end={item.end} title={t(item.labelKey)}>
                      <Icon size={15} />
                      <span>{t(item.labelKey)}</span>
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
            <div className="shell-user-role">{user.role}{plan ? ` · ${plan}` : ''}</div>
          </div>
          <button className="field-icon-btn" style={{ padding: '4px 8px', minHeight: 28, fontSize: 11 }} onClick={logout} title={t('shell.logout')}>
            <ICON.logout size={13} />
          </button>
        </div>
      </aside>
      <div className="shell-main">
        <div className="shell-header">
          <h2>{t('shell.title')}</h2>
          <div className="shell-header-right">
            {dataAtStr && <span className="shell-freshness"><span className="dot" />{t('shell.synced')} {dataAtStr}</span>}
            <button
              className="field-icon-btn"
              onClick={toggleLang}
              title={getLang() === 'vi' ? t('shell.to_en') : t('shell.to_vi')}
              style={{ background: 'transparent', border: '1px solid var(--c-border)', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}
            >
              {getLang() === 'vi' ? 'EN' : 'VI'}
            </button>
            <button
              className="field-icon-btn theme-toggle"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? t('shell.light') : t('shell.dark')}
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
