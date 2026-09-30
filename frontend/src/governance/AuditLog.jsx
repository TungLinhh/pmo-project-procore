// UI-020: Audit Log — Read-only viewer với filter + export CSV/JSON
// Filter: project_id, zone_id, action, resource_type, user_id, search, from/to
// Click vào row → expand before/after JSON

import { useEffect, useState, Fragment } from 'react';
import { getToken, audit as auditApi } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { formatApiDate, parseApiDate } from '../utils/datetime.js';
import { t, th, useLang } from '../i18n/index.js';
import { useServerPage } from '../hooks/usePagination.js';
import TablePagination from '../components/TablePagination.jsx';

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// Nhật ký demo có gần 7.000 dòng. Trước đây màn này tải một lần 200 dòng rồi
// hiện, nên 97% nhật ký không bao giờ xuất hiện mà không có dấu hiệu gì — người
// dùng tưởng hệ thống chỉ ghi bấy nhiêu đó. Nay phân trang thật ở server.
async function fetchAudit(filters, pageParams) {
  return auditApi.listPage({ ...filters, ...pageParams });
}

async function exportAudit(format, filters) {
  // P2-10: export click floated the promise — network throw was unhandled.
  try {
    const params = new URLSearchParams();
    params.set('format', format);
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    const res = await fetch(`/api/audit/export?${params}`, { headers: authHeaders() });
    if (!res.ok) { toast.error(t('aud.export_failed')); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${new Date().toLocaleString('sv-SE').replace(/[:]/g, '-')}.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) {
    toast.error(t('aud.err_export') + e.message);
  }
}

const ACTION_COLORS = {
  CREATE: '#10b981', UPDATE: '#3b82f6', STATUS_CHANGE: '#f59e0b',
  APPROVE: '#10b981', REJECT: '#ef4444', DIRECTIVE: '#a78bfa',
  ARCHIVE: '#94a3b8', RESTORE: '#60a5fa',
};

export default function AuditLog() {
  useLang(); // re-render table headers on VI/EN toggle
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useState({
    project_id: '', resource_type: '', action: '', user_id: '', search: '', from: '', to: '',
  });

  const [total, setTotal] = useState(null);
  const page = useServerPage(total, { initialSize: 50 });

  const load = async () => {
    setLoading(true);
    try {
      const { rows: r, total: t } = await fetchAudit(filters, page.params);
      setRows(r);
      setTotal(t);
      setLoadError('');
    } catch (e) {
      setRows([]);
      setTotal(null);
      setLoadError(e.message || t('aud.load_failed'));
      toast.error(t('aud.err_load_short') + e.message);
    }
    setLoading(false);
  };

  // Một effect duy nhất cho cả lần đầu lẫn khi đổi trang/bộ lọc — tách làm hai
  // thì lúc mở trang sẽ bắn hai request trùng nhau.
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page.page, page.pageSize, filters]);
  // Bộ lọc mới thì tổng thay đổi theo → về trang 1, không thì trang 40 sẽ trống.
  useEffect(() => { page.setPage(1); /* eslint-disable-next-line */ }, [filters]);

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const clearF = () => setFilters({ project_id: '', resource_type: '', action: '', user_id: '', search: '', from: '', to: '' });

  const todayKey = new Date().toDateString();
  const today = rows.filter((r) => parseApiDate(r.created_at)?.toDateString() === todayKey).length;
  const critical = rows.filter(r => ['STATUS_CHANGE', 'REJECT', 'DIRECTIVE', 'ARCHIVE'].includes(r.action)).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('aud.h1')}</h1>
          <div className="meta">{t('aud.subtitle')}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => exportAudit('csv', filters)}>📥 Export CSV</button>
          <button className="btn-secondary" onClick={() => exportAudit('json', filters)}>📥 Export JSON</button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat"><div className="label">{t('aud.total_events')}</div><div className="value">{rows.length}</div></div>
        <div className="stat"><div className="label">{t('g.today')}</div><div className="value">{today}</div></div>
        <div className="stat"><div className="label">{t('aud.critical_actions')}</div><div className="value">{critical}</div></div>
      </div>

      <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
        <input placeholder={t('aud.ph_search_user')} value={filters.search} onChange={e => setF('search', e.target.value)} style={{ width: 200 }} />
        <input placeholder={t('aud.ph_project_id')} value={filters.project_id} onChange={e => setF('project_id', e.target.value)} style={{ width: 110 }} />
        <input placeholder={t('aud.ph_resource_type')} value={filters.resource_type} onChange={e => setF('resource_type', e.target.value)} style={{ width: 150 }} />
        <input placeholder={t('aud.ph_action')} value={filters.action} onChange={e => setF('action', e.target.value)} style={{ width: 130 }} />
        <input placeholder={t('aud.ph_user_id')} value={filters.user_id} onChange={e => setF('user_id', e.target.value)} style={{ width: 100 }} />
        <label>{t('g.from')} <input type="date" value={filters.from} onChange={e => setF('from', e.target.value)} /></label>
        <label>{t('g.to')} <input type="date" value={filters.to} onChange={e => setF('to', e.target.value)} /></label>
        <button className="btn-primary" onClick={load} disabled={loading}>{loading ? t('aud.busy_loading') : t('aud.filter_label')}</button>
        <button className="btn-text" onClick={clearF}>{t('g.clear')}</button>
      </div>

      {loadError && !loading && (
        <div className="empty gate-error" style={{ padding: 40 }}>
          <strong>{t('aud.load_failed')}</strong>
          <div style={{ marginTop: 6 }}>{loadError}</div>
          <button className="btn" style={{ marginTop: 12 }} onClick={load}>{t('aud.btn_retry')}</button>
        </div>
      )}
      {!loadError && rows.length === 0 && !loading && (
        <div className="empty" style={{ padding: 60 }}>{t('aud.empty_hint2')}</div>
      )}

      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>{th("Thời gian")}</th>
              <th>{th("Hành động")}</th>
              <th>{th("Tài nguyên")}</th>
              <th>{th("Ngữ cảnh")}</th>
              <th>{th("Người thực hiện")}</th>
              <th>{th("Ghi chú")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <Fragment key={r.id}>
                <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                  <td>{expanded === r.id ? '▼' : '▶'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{formatApiDate(r.created_at)}</td>
                  <td>
                    <span
                      className="audit-action-chip"
                      data-action={r.action}
                      style={{ background: ACTION_COLORS[r.action] || '#94a3b8' }}
                    >
                      {r.action}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{r.resource_type}#{r.resource_id}</td>
                  <td style={{ fontSize: 12 }}>
                    {r.context?.project_id && <span>📁 p={r.context.project_id} </span>}
                    {r.context?.zone_id && <span>· z={r.context.zone_id} </span>}
                    {r.context?.issue_id && <span>· issue#{r.context.issue_id}</span>}
                  </td>
                  <td style={{ fontSize: 12 }}>{r.user_name} <span className="actor-role">({r.actor_role})</span></td>
                  <td style={{ fontSize: 12, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.note}</td>
                </tr>
                {expanded === r.id && (
                  <tr>
                    <td colSpan="7" style={{ background: '#f9fafb', padding: 16 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: 12 }}>BEFORE</h4>
                          <pre style={{ background: '#fee2e2', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto', maxHeight: 300 }}>
                            {JSON.stringify(r.before, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: 12 }}>AFTER</h4>
                          <pre style={{ background: '#d1fae5', padding: 8, borderRadius: 4, fontSize: 11, overflow: 'auto', maxHeight: 300 }}>
                            {JSON.stringify(r.after, null, 2)}
                          </pre>
                        </div>
                      </div>
                      {r.field_changes && (
                        <div style={{ marginTop: 8 }}>
                          <strong>Field changes:</strong>
                          <pre style={{ background: '#fef3c7', padding: 8, borderRadius: 4, fontSize: 11, margin: '4px 0 0 0' }}>
                            {JSON.stringify(r.field_changes, null, 2)}
                          </pre>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
      {!loading && !loadError && (
        <TablePagination
          page={page.page}
          pageCount={page.pageCount}
          total={page.total || 0}
          pageSize={page.pageSize}
          onPageChange={page.setPage}
          onPageSizeChange={page.changePageSize}
          unitKey="unit.log"
        />
      )}
    </div>
  );
}
