// Bell dropdown - click bell → panel list of notifications
// Click item → navigate to related Issue Detail / record
// Read/unread state - mark as read on click
import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ICON } from '../icons.jsx';
import { api } from '../api/index.js';
import { relativeTimeVi } from '../utils/datetime.js';
import { t } from '../i18n/index.js';

function navTargetFor(n) {
  // Map notification → URL (detail route is /hq/issues/item?item=)
  if (n.resource_type === 'issue' && n.resource_id) return `/hq/issues/item?item=${n.resource_id}`;
  if (n.resource_type === 'directive' && n.issue_id) return `/hq/issues/item?item=${n.issue_id}`;
  if (n.resource_type === 'shop_drawing' && n.resource_id) return `/hq/shop?project=${n.project_id || ''}&drawing=${n.resource_id}`;
  if (n.resource_type === 'daily_report') return `/hq`;
  if (n.resource_type === 'overdue_digest' && n.project_id) return `/hq/attention?project=${n.project_id}`;
  if (['material_submittal', 'construction_schedule_item'].includes(n.resource_type) && n.project_id) {
    return `/hq/attention?project=${n.project_id}`;
  }
  if (n.issue_id) return `/hq/issues/item?item=${n.issue_id}`;
  return '/hq';
}

export default function BellDropdown() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], counts: { total: 0, unread: 0, critical: 0, warning: 0 } });
  const [filter, setFilter] = useState('all');
  const wrapRef = useRef(null);
  const nav = useNavigate();
  // P1-8 overlap guard: SSE bursts + 30s poll can stack load() calls; skip
  // while one is in flight instead of letting responses race.
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      // Always fetch the unfiltered page and filter here. Asking the server for
      // `unread_only=1` returned ONLY unread rows, so `total` became the unread
      // count and the "Tất cả (n)" button lied while the Chưa đọc tab was open.
      // One request, honest counts.
      const d = await api.notifications.list();
      const all = Array.isArray(d) ? d : (d?.items || []);
      const unread = all.filter(n => !n.read_at).length;
      const critical = all.filter(n => String(n.severity).toLowerCase() === 'critical').length;
      const warning = all.filter(n => String(n.severity).toLowerCase() === 'warning').length;
      const items = filter === 'unread' ? all.filter(n => !n.read_at) : all;
      setData({ items, counts: { total: all.length, unread, critical, warning } });
    } catch { /* keep the last good list; polling will retry */ } finally { loadingRef.current = false; }
  }, [filter]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);  // fallback poll (SSE primary below)
    // Realtime (Wave D3): EventSource push → instant reload. After 3 consecutive
    // failures the poll above is all that remains (graceful degradation).
    //
    // We reconnect BY HAND instead of letting EventSource retry: the URL now
    // carries a single-use ticket, so a native retry would replay a burnt
    // ticket and 401 forever. The server also recycles every stream at 90s
    // (dead-peer bound), so a healthy re-mint every 90s is the normal path —
    // onopen resets the failure count so that never trips the 3-strike cutoff.
    let es = null;
    let failures = 0;
    let stopped = false;
    let retry = null;
    const connect = async () => {
      if (stopped || typeof EventSource === 'undefined') return;
      try {
        const { ticket } = await api.stream.ticket();
        if (stopped || !ticket) return;
        es = new EventSource('/api/stream?ticket=' + encodeURIComponent(ticket));
        // Server sends NAMED events (notification.created, approval.decided,
        // compression.applied) — onmessage alone never fires for those.
        const refresh = () => load();
        es.addEventListener('notification.created', refresh);
        es.addEventListener('approval.decided', refresh);
        es.addEventListener('compression.applied', refresh);
        es.onmessage = refresh; // unnamed fallback
        es.onopen = () => { failures = 0; };
        es.onerror = () => {
          if (es) { es.close(); es = null; }
          if (stopped) return;
          failures++;
          if (failures >= 3) return;   // polling covers it from here
          retry = setTimeout(connect, 1500 * failures);   // 1.5s, 3s
        };
      } catch {
        // Ticket refused (logged out, DB down, network blip). Polling covers the
        // gap, but a blip should not cost realtime for the rest of the session —
        // retry on the same backoff, bounded by the same 3-strike cutoff.
        if (stopped) return;
        failures++;
        if (failures < 3) retry = setTimeout(connect, 1500 * failures);
      }
    };
    connect();
    return () => {
      stopped = true;
      clearInterval(interval);
      clearTimeout(retry);
      if (es) es.close();
    };
  }, [load]);

  useEffect(() => {
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function handleItemClick(n) {
    // P2-10: unguarded awaits — a failed mark-read left the click hanging.
    try {
      if (!n.read_at) {
        await api.notifications.markRead(n.id);
        load();
      }
    } catch { /* badge refresh is best-effort */ }
    setOpen(false);
    nav(navTargetFor(n));
  }

  async function handleMarkAll() {
    try {
      await api.notifications.markAllRead();
      load();
    } catch { /* best-effort */ }
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
        title={t('bell.title')}
      >
        <ICON.bell size={15} />
        {c.unread > 0 && (
          <span style={{
            position: 'absolute',
            top: -2, right: -2,
            background: 'var(--c-solid-alert)',
            color: 'var(--c-solid-alert-fg)',
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
              <h3>{t('bell.title')}</h3>
              <div className="meta">{t('bell.unread_summary', { unread: c.unread, critical: c.critical, warning: c.warning })}</div>
            </div>
            {c.unread > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={handleMarkAll} style={{ fontSize: 11 }}>{t('bell.mark_all')}</button>
            )}
          </div>
          <div className="filter-bar" style={{ margin: 0, padding: '8px 12px', borderRadius: 0, border: 'none', borderBottom: '1px solid var(--c-border)', background: 'var(--c-surface-2)' }}>
            {filterBtn('all', `Tất cả (${c.total})`)}
            {filterBtn('unread', `Chưa đọc (${c.unread})`)}
          </div>
          <div>
            {items.length === 0 ? <div className="empty">{t('bell.empty')}</div> :
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
                      <span>{relativeTimeVi(n.created_at)}</span>
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
