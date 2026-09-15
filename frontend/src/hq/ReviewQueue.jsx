// Review queue: staged batch files → classification → confirm (wizard configure) → commit.
// Lists every file_uploads row with its classification; ambiguous/unknown rows
// get one-click confirm that delegates to the existing wizard configure flow.
import { useEffect, useState } from 'react';
import { uploads, projects as apiProjects, getToken } from '../api/index.js';
import { toast } from '../components/Toast.jsx';

const BASE = '/api';
function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  return fetch(`${BASE}${path}`, { ...opts, headers }).then(async r => {
    const j = await r.json().catch(() => ({ error: r.statusText }));
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  });
}

const reviewApi = {
  list: () => req('/uploads/review'),
  classify: (ids) => req('/upload/classify', { method: 'POST', body: JSON.stringify(ids?.length ? { upload_ids: ids } : {}) }),
};

export default function ReviewQueue() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('needs-review');
  const [projects, setProjects] = useState([]);
  const [confirmId, setConfirmId] = useState(null);
  const [confirmForm, setConfirmForm] = useState({ project_id: '', doc_type: '' });
  const [newProjOpen, setNewProjOpen] = useState(false);
  const [newProj, setNewProj] = useState({ code: '', name_vi: '' });
  const [rowsView, setRowsView] = useState({}); // uploadId -> {loading, rows, error}

  async function createProjectInline() {
    if (!newProj.code.trim()) { toast.error('Nhập project code'); return; }
    try {
      const p = await uploads.createProject({ code: newProj.code.trim(), name_vi: newProj.name_vi.trim() || newProj.code.trim() });
      setProjects(prev => [...prev, p]);
      setConfirmForm(f => ({ ...f, project_id: p.id }));
      setNewProjOpen(false);
      setNewProj({ code: '', name_vi: '' });
      toast.success('Đã tạo project ' + p.code);
    } catch (e) { toast.error('Lỗi tạo project: ' + e.message); }
  }

  async function load() {
    setLoading(true);
    try {
      const d = await reviewApi.list();
      setRows(Array.isArray(d) ? d : []);
    } catch (e) { toast.error('Lỗi tải review queue: ' + e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); apiProjects.list().then(setProjects).catch(() => {}); }, []);

  async function classifyAll() {
    setBusy(true);
    try {
      const staged = rows.filter(r => r.status === 'STAGED').map(r => r.id);
      const r = await reviewApi.classify(staged.length ? staged : undefined);
      toast.success(`Classified ${r.classified} files`);
      load();
    } catch (e) { toast.error('Classify lỗi: ' + e.message); }
    finally { setBusy(false); }
  }

  async function confirmRow(id) {
    if (!confirmForm.project_id || !confirmForm.doc_type) { toast.error('Chọn project + doc_type'); return; }
    setBusy(true);
    try {
      const r = await uploads.wizard.configure(id, { project_id: Number(confirmForm.project_id), doc_type: confirmForm.doc_type });
      if (r.error) throw new Error(r.error);
      toast.success(`Configured: ${r.total_rows} rows preview`);
      setConfirmId(null);
      load();
    } catch (e) { toast.error('Confirm lỗi: ' + e.message); }
    finally { setBusy(false); }
  }

  async function toggleRows(id) {
    if (rowsView[id]?.rows || rowsView[id]?.error) {
      setRowsView(v => { const n = { ...v }; delete n[id]; return n; });
      return;
    }
    setRowsView(v => ({ ...v, [id]: { loading: true } }));
    try {
      const d = await req(`/uploads/${id}/rows`);
      setRowsView(v => ({ ...v, [id]: { rows: d.rows || [] } }));
    } catch (e) {
      setRowsView(v => ({ ...v, [id]: { error: e.message } }));
    }
  }

  async function commitRow(id) {
    setBusy(true);
    try {
      const r = await uploads.wizard.commit(id);
      if (r.error) throw new Error(r.error);
      toast.success(`Committed: ${r.status}`);
      load();
    } catch (e) { toast.error('Commit lỗi: ' + e.message); }
    finally { setBusy(false); }
  }

  const visible = rows.filter(r => {
    if (filter === 'all') return true;
    if (filter === 'needs-review') return ['STAGED', 'CONFIGURED'].includes(r.status) && (!r.classification || r.classification.family === 'unknown');
    if (filter === 'staged') return ['STAGED', 'CONFIGURED'].includes(r.status);
    if (filter === 'skipped') return (r.status || '').startsWith('SKIPPED');
    if (filter === 'done') return ['SUCCESS', 'PARTIAL', 'FAILED'].includes(r.status);
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Uploads Review Queue</h1>
          <div className="meta">{rows.length} files · {rows.filter(r => r.status === 'STAGED').length} staged · {rows.filter(r => (r.status || '').startsWith('SKIPPED')).length} skipped</div>
        </div>
        <div className="page-header-right">
          <button className="btn" onClick={classifyAll} disabled={busy}>Classify staged</button>
          <button className="btn btn-secondary" onClick={load} disabled={loading}>Refresh</button>
        </div>
      </div>

      <div className="filter-bar">
        <label>Filter</label>
        <select value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="needs-review">Needs review</option>
          <option value="staged">Staged</option>
          <option value="skipped">Skipped (with reason)</option>
          <option value="done">Committed</option>
          <option value="all">All</option>
        </select>
      </div>

      <div className="data-table">
        {loading ? <div className="empty">Đang tải...</div> :
          visible.length === 0 ? <div className="empty">Không có file</div> :
          visible.map(r => {
            const c = r.classification || {};
            return (
              <div key={r.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--c-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{r.relative_path || r.original_filename}</div>
                    <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>
                      {c.family || '—'}{c.zone ? ` · zone ${c.zone}` : ''}{c.summary ? ' · rollup' : ''} · {r.expected_doc_type || 'no type'} · {r.project_code || 'no project'}
                    </div>
                    {r.skip_reason && <div style={{ fontSize: 11, color: 'var(--c-watch)' }}>Skip: {r.skip_reason}</div>}
                    {c.reason && <div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>Guess: {c.reason} ({c.confidence})</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="badge">{r.status}</span>
                    {['STAGED', 'CONFIGURED'].includes(r.status) && confirmId !== r.id && (
                      <button className="btn btn-secondary" onClick={() => { setConfirmId(r.id); setNewProjOpen(false); setConfirmForm({ project_id: r.project_id || '', doc_type: r.expected_doc_type || '' }); }}>Confirm</button>
                    )}
                    {r.status === 'CONFIGURED' && (
                      <button className="btn" onClick={() => commitRow(r.id)} disabled={busy}>Commit</button>
                    )}
                    {['SUCCESS', 'PARTIAL'].includes(r.status) && (
                      <button className="btn btn-secondary" onClick={() => toggleRows(r.id)} disabled={!!rowsView[r.id]?.loading}>
                        {rowsView[r.id]?.rows ? 'Ẩn rows' : 'Xem rows'}
                      </button>
                    )}
                  </div>
                </div>
                {confirmId === r.id && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {!newProjOpen ? (
                      <>
                        <select value={confirmForm.project_id} onChange={e => setConfirmForm({ ...confirmForm, project_id: e.target.value })}>
                          <option value="">-- project --</option>
                          {projects.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
                        </select>
                        <button className="btn-text" onClick={() => setNewProjOpen(true)}>+ Dự án mới</button>
                      </>
                    ) : (
                      <>
                        <input placeholder="Code (vd: HBG-LVK-BCTH)" value={newProj.code} onChange={e => setNewProj({ ...newProj, code: e.target.value })} style={{ width: 200 }} />
                        <input placeholder="Tên (tùy chọn)" value={newProj.name_vi} onChange={e => setNewProj({ ...newProj, name_vi: e.target.value })} style={{ width: 200 }} />
                        <button className="btn" onClick={createProjectInline} disabled={busy}>Tạo</button>
                        <button className="btn-text" onClick={() => setNewProjOpen(false)}>Hủy</button>
                      </>
                    )}
                    <input placeholder="doc_type" value={confirmForm.doc_type} onChange={e => setConfirmForm({ ...confirmForm, doc_type: e.target.value })} style={{ width: 180 }} />
                    <button className="btn" onClick={() => confirmRow(r.id)} disabled={busy}>Configure →</button>
                    <button className="btn btn-secondary" onClick={() => { setConfirmId(null); setNewProjOpen(false); }}>Hủy</button>
                  </div>
                )}
                {rowsView[r.id] && (
                  <div style={{ marginTop: 8, overflowX: 'auto' }}>
                    {rowsView[r.id].loading && <div style={{ fontSize: 12 }}>Đang tải rows…</div>}
                    {rowsView[r.id].error && <div style={{ fontSize: 12, color: 'var(--c-text-2)' }}>{rowsView[r.id].error}</div>}
                    {rowsView[r.id].rows && (
                      <table className="wizard-preview-table">
                        <thead><tr><th>Sheet</th><th>#</th><th>C1</th><th>C2</th><th>C3</th><th>C4</th><th>C5</th><th>C6</th></tr></thead>
                        <tbody>
                          {rowsView[r.id].rows.slice(0, 50).map((g, i) => (
                            <tr key={i}>
                              <td style={{ fontSize: 11 }}>{g.source_sheet}</td>
                              <td>{g.ordinal}</td>
                              {[g.col_1, g.col_2, g.col_3, g.col_4, g.col_5, g.col_6].map((c, j) => (
                                <td key={j} style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c ?? ''}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
