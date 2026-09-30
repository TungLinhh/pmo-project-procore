// UI-007: Notification Center (in-app only — Email/Zalo OA/Telegram/Push để sau).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ICON } from '../icons.jsx';
import { notifications } from '../api/index.js';
import { relativeTimeVi } from '../utils/datetime.js';
import { t } from '../i18n/index.js';
import { toast } from '../components/Toast.jsx';

function navFor(n) {
  if (n.resource_type === 'issue' && n.resource_id) return `/hq/issues/item?item=${n.resource_id}`;
  if (n.resource_type === 'directive' && n.issue_id) return `/hq/issues/item?item=${n.issue_id}`;
  if (n.issue_id) return `/hq/issues/item?item=${n.issue_id}`;
  return '/hq';
}

export default function NotificationCenter() {
  const [data, setData] = useState({ items: [], counts: { total: 0, unread: 0, critical: 0, warning: 0 }, failed: false });
  const [filter, setFilter] = useState('all');
  const nav = useNavigate();

  // Bộ đếm đặt `null` nghĩa là "chưa biết", khác với 0 nghĩa là "không có". Không
  // phân biệt hai thứ thì hỏng token ⇒ màn hiện "không có thông báo" và mọi thẻ
  // thống kê đọc `0`, tức người dùng tin là không có gì trong khi thực ra không gọi
  // được API. `BellDropdown.jsx` đã có chốt này; ở đây thì thiếu.
  async function load() {
    try {
      const d = await notifications.list(filter === 'unread');
      // Normalize: backend trả array thẳng
      const items = Array.isArray(d) ? d : (d?.items || []);
      const unread = items.filter(n => !n.read_at).length;
      const critical = items.filter(n => n.severity === 'critical' || n.severity === 'CRITICAL').length;
      const warning = items.filter(n => n.severity === 'warning' || n.severity === 'WARNING').length;
      setData({ items, counts: { total: items.length, unread, critical, warning }, failed: false });
    } catch {
      setData((prev) => ({ items: prev.items, counts: prev.counts, failed: true }));
      toast.error(t('nc.load_failed'));
    }
  }
  useEffect(() => { load(); }, [filter]);

  const items = data.items;
  const c = data.counts;
  const filtered = filter === 'critical' ? items.filter(n => n.severity === 'critical') :
                    filter === 'warning' ? items.filter(n => n.severity === 'warning') :
                    filter === 'info' ? items.filter(n => n.severity === 'info') :
                    items;

  // `markRead` lỗi thì `nav()` phía dưới **không chạy** ⇒ bấm thông báo không điều
  // hướng, không báo lỗi, không phản hồi gì. Đánh dấu đã đọc là việc phụ, điều
  // hướng là việc chính — phải sang điều hướng bất kể kết quả đánh dấu.
  async function handleClick(n) {
    if (!n.read_at) {
      try {
        await notifications.markRead(n.id);
      } catch { /* đánh dấu đã đọc là best-effort */ }
      load();
    }
    nav(navFor(n));
  }

  async function markAll() {
    try {
      await notifications.markAllRead();
    } catch {
      toast.error(t('nc.mark_all_failed'));
    }
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nc.h1')}</h1>
          <div className="meta">{t('bell.center_summary', { unread: c.unread, shown: items.length, critical: c.critical })}</div>
        </div>
        <div className="page-header-right">
          {c.unread > 0 && <button className="btn btn-secondary" onClick={markAll}>{t('bell.mark_all')}</button>}
        </div>
      </div>

      <div className="filter-bar">
        <button className="btn" onClick={() => nav('/hq/attention')}><ICON.issues size={13} />{t('bell.open_attention')}</button>
      </div>

      <div className="filter-bar">
        <label>{t('g.filter')}</label>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="all">{t('g.all')} ({c.total})</option>
          <option value="unread">{t('g.unread')} ({c.unread})</option>
          <option value="critical">{t('g.critical')} ({items.filter(n => n.severity === 'critical').length})</option>
          <option value="warning">{t('g.warning')} ({items.filter(n => n.severity === 'warning').length})</option>
          <option value="info">{t('g.info')} ({items.filter(n => n.severity === 'info').length})</option>
        </select>
      </div>

      <div className="stat-strip">
        <div className="stat"><div className="label">{t('g.total')}</div><div className="value">{c.total}</div></div>
        <div className="stat"><div className="label">{t('g.unread')}</div><div className="value" style={{ color: 'var(--c-accent)' }}>{c.unread}</div></div>
        <div className="stat"><div className="label">{t('g.critical')}</div><div className="value" style={{ color: 'var(--c-critical)' }}>{c.critical}</div></div>
        <div className="stat"><div className="label">{t('g.warning')}</div><div className="value" style={{ color: 'var(--c-watch)' }}>{c.warning}</div></div>
        <div className="stat"><div className="label">{t('g.info')}</div><div className="value">{c.total - c.critical - c.warning}</div></div>
      </div>

      <div className="data-table">
        {data.failed
          ? <div className="empty">{t('nc.load_failed')}</div>
          : filtered.length === 0 ? <div className="empty">{t('bell.empty')}</div> :
          filtered.map(n => {
            const isCrit = n.severity === 'critical';
            const isWarn = n.severity === 'warning';
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid #f1f5f9',
                  background: n.read_at ? 'var(--c-surface)' : (isCrit ? 'var(--c-critical-bg)' : isWarn ? 'var(--c-watch-bg)' : 'var(--c-primary-bg)'),
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  borderLeft: n.read_at ? '3px solid transparent' : `3px solid ${isCrit ? 'var(--c-critical)' : isWarn ? 'var(--c-watch)' : 'var(--c-primary)'}`,
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontWeight: n.read_at ? 400 : 600, fontSize: 13 }}>{n.title}</div>
                    {!n.read_at && <span style={{ fontSize: 10, fontWeight: 600, color: isCrit ? 'var(--c-critical)' : isWarn ? 'var(--c-watch)' : 'var(--c-primary)' }}>NEW</span>}
                  </div>
                  {n.body && <div style={{ color: 'var(--c-text-2)', fontSize: 12.5 }}>{n.body}</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11 }}>
                    <span style={{ color: 'var(--c-text-3)' }}>{relativeTimeVi(n.created_at)}</span>
                    <code style={{ color: 'var(--c-text-3)' }}>{n.resource_type}{n.resource_id ? `:${n.resource_id}` : ''}</code>
                  </div>
                </div>
              </button>
            );
          })
        }
      </div>
      <p className="empty" style={{ marginTop: 16, fontSize: 11 }}>{t('bell.channels_note')}</p>
    </div>
  );
}
