// UI-020: Audit Log — Read-only viewer với filter + export CSV/JSON
// Filter: project_id, zone_id, action, resource_type, user_id, search, from/to
// Click vào row → expand before/after JSON

import { useEffect, useState, Fragment } from 'react';
import { getToken } from '../api/index.js';

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function fetchAudit(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  params.set('limit', '200');
  const res = await fetch(`/api/audit?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error('fetch failed');
  return res.json();
}

async function exportAudit(format, filters) {
  const params = new URLSearchParams();
  params.set('format', format);
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
  const res = await fetch(`/api/audit/export?${params}`, { headers: authHeaders() });
  if (!res.ok) { alert('Export failed'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `audit-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

const ACTION_COLORS = {
  CREATE: '#10b981', UPDATE: '#3b82f6', STATUS_CHANGE: '#f59e0b',
  APPROVE: '#10b981', REJECT: '#ef4444', DIRECTIVE: '#8b5cf6',
  ARCHIVE: '#6b7280', RESTORE: '#3b82f6',
};

export default function AuditLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [filters, setFilters] = useState({
    project_id: '', resource_type: '', action: '', user_id: '', search: '', from: '', to: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetchAudit(filters);
      setRows(r);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));
  const clearF = () => setFilters({ project_id: '', resource_type: '', action: '', user_id: '', search: '', from: '', to: '' });

  const today = rows.filter(r => new Date(r.created_at).toDateString() === new Date().toDateString()).length;
  const critical = rows.filter(r => ['STATUS_CHANGE', 'REJECT', 'DIRECTIVE', 'ARCHIVE'].includes(r.action)).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Audit Log</h1>
          <div className="meta">Lịch sử thay đổi dữ liệu · full JSON snapshot (before/after)</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" onClick={() => exportAudit('csv', filters)}>📥 Export CSV</button>
          <button className="btn-secondary" onClick={() => exportAudit('json', filters)}>📥 Export JSON</button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat"><div className="label">Total events</div><div className="value">{rows.length}</div></div>
        <div className="stat"><div className="label">Today</div><div className="value">{today}</div></div>
        <div className="stat"><div className="label">Critical actions</div><div className="value">{critical}</div></div>
      </div>

      <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
        <input placeholder="Search note/user..." value={filters.search} onChange={e => setF('search', e.target.value)} style={{ width: 200 }} />
        <input placeholder="Project ID" value={filters.project_id} onChange={e => setF('project_id', e.target.value)} style={{ width: 110 }} />
        <input placeholder="Resource type" value={filters.resource_type} onChange={e => setF('resource_type', e.target.value)} style={{ width: 150 }} />
        <input placeholder="Action" value={filters.action} onChange={e => setF('action', e.target.value)} style={{ width: 130 }} />
        <input placeholder="User ID" value={filters.user_id} onChange={e => setF('user_id', e.target.value)} style={{ width: 100 }} />
        <label>From <input type="date" value={filters.from} onChange={e => setF('from', e.target.value)} /></label>
        <label>To <input type="date" value={filters.to} onChange={e => setF('to', e.target.value)} /></label>
        <button className="btn-primary" onClick={load} disabled={loading}>{loading ? 'Đang tải...' : '🔍 Lọc'}</button>
        <button className="btn-text" onClick={clearF}>Clear</button>
      </div>

      {rows.length === 0 && !loading && (
        <div className="empty" style={{ padding: 60 }}>
          Không có audit log nào. Thử upload file hoặc thực hiện 1 action (transition shop drawing, tạo issue).
        </div>
      )}

      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Time</th>
              <th>Action</th>
              <th>Resource</th>
              <th>Context</th>
              <th>Actor</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <Fragment key={r.id}>
                <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                  <td>{expanded === r.id ? '▼' : '▶'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{new Date(r.created_at).toLocaleString('vi-VN')}</td>
                  <td>
                    <span style={{ background: ACTION_COLORS[r.action] || '#6b7280', color: 'white', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {r.action}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>{r.resource_type}#{r.resource_id}</td>
                  <td style={{ fontSize: 12 }}>
                    {r.context?.project_id && <span>📁 p={r.context.project_id} </span>}
                    {r.context?.zone_id && <span>· z={r.context.zone_id} </span>}
                    {r.context?.issue_id && <span>· issue#{r.context.issue_id}</span>}
                  </td>
                  <td style={{ fontSize: 12 }}>{r.user_name} <span style={{ color: '#6b7280' }}>({r.actor_role})</span></td>
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
    </div>
  );
}
