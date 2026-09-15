// Bell dropdown - click bell → panel list of notifications
// Click item → navigate to related Issue Detail / record
// Read/unread state - mark as read on click
import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ICON } from '../icons.jsx';
import { api } from '../api/index.js';

function relativeTime(iso) {
  // Parse SQLite "YYYY-MM-DD HH:MM:SS" UTC → relative
  const date = new Date(iso.replace(' ', 'T') + 'Z');
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'Vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
  return date.toLocaleDateString('vi-VN');
}

function navTargetFor(n) {
  // Map notification → URL (detail route is /hq/issues/item?item=)
  if (n.resource_type === 'issue' && n.resource_id) return `/hq/issues/item?item=${n.resource_id}`;
  if (n.resource_type === 'directive' && n.issue_id) return `/hq/issues/item?item=${n.issue_id}`;
  if (n.resource_type === 'shop_drawing' && n.resource_id) return `/hq/shop?drawing=${n.resource_id}`;
  if (n.resource_type === 'daily_report') return `/hq`;
  if (n.issue_id) return `/hq/issues/item?item=${n.issue_id}`;
  return '/hq';
}

export default function BellDropdown() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], counts: { total: 0, unread: 0, critical: 0, warning: 0 } });
  const [filter, setFilter] = useState('all');
  const wrapRef = useRef(null);
  const nav = useNavigate();

  const load = useCallback(async () => {
    try {
      const d = await api.notifications.list(filter === 'unread');
      // Normalize: backend trả array thẳng, derive counts
      const items = Array.isArray(d) ? d : (d?.items || []);
      const unread = items.filter(n => !n.read_at).length;
      const critical = items.filter(n => n.severity === 'critical' || n.severity === 'CRITICAL').length;
      const warning = items.filter(n => n.severity === 'warning' || n.severity === 'WARNING').length;
      setData({ items, counts: { total: items.length, unread, critical, warning } });
    } catch (e) { /* swallow */ }
  }, [filter]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);  // refresh 30s
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function handleItemClick(n) {
    if (!n.read_at) {
      await api.notifications.markRead(n.id);
      load();
    }
    setOpen(false);
    nav(navTargetFor(n));
  }

  async function handleMarkAll() {
    await api.notifications.markAllRead();
    load();
  }

  const items = data.items;
  const c = data.counts;
  const filterBtn = (key, label) => (
    <button
      className={filter === key ? 'btn btn-sm' : 'btn btn-secondary btn-sm'}
      onClick={() => setFilter(key)}
      style={{ fontSize: 11, padding: '3px 8px' }}
    >
      {label}
    </button>
  );

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button
        className="field-icon-btn"
        style={{ padding: 6, minHeight: 32, position: 'relative' }}
        onClick={() => setOpen(!open)}
        title="Thông báo"
      >
        <ICON.bell size={15} />
        {c.unread > 0 && (
          <span style={{
            position: 'absolute',
            top: -2, right: -2,
            background: 'var(--c-behind)',
            color: 'white',
            fontSize: 9.5,
            fontWeight: 700,
            borderRadius: 999,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>{c.unread > 99 ? '99+' : c.unread}</span>
        )}
      </button>
      {open && (
        <div className="bell-dropdown" onClick={e => e.stopPropagation()}>
          <div className="head">
            <div>
              <h3>Thông báo</h3>
              <div className="meta">{c.unread} chưa đọc · {c.critical} critical · {c.warning} warning</div>
            </div>
            {c.unread > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={handleMarkAll} style={{ fontSize: 11 }}>
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>
          <div className="filter-bar" style={{ margin: 0, padding: '8px 12px', borderRadius: 0, border: 'none', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-2)' }}>
            {filterBtn('all', `Tất cả (${c.total})`)}
            {filterBtn('unread', `Chưa đọc (${c.unread})`)}
          </div>
          <div>
            {items.length === 0 ? <div className="empty">Không có thông báo</div> :
              items.map(n => (
                <button
                  key={n.id}
                  className={`bell-item ${n.read_at ? '' : 'unread'} ${n.severity}`}
                  onClick={() => handleItemClick(n)}
                >
                  {!n.read_at && <span className="dot" />}
                  <div className="content">
                    <div className="title">{n.title}</div>
                    {n.body && <div className="body">{n.body}</div>}
                    <div className="meta">
                      <span>{relativeTime(n.created_at)}</span>
                      <code style={{ fontSize: 10 }}>{n.resource_type}{n.resource_id ? `:${n.resource_id}` : ''}</code>
                    </div>
                  </div>
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}
