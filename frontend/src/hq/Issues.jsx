// UI-006: Issues list - table view với filter + click → IssueDetail
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { projects, issues as issuesApi, getToken, preferDemoProject } from '../api/index.js';
import { ICON } from '../icons.jsx';
import { toast } from '../components/Toast.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';

const SEV_COLORS = {
  CRITICAL: { bg: 'var(--c-critical-bg)', fg: 'var(--c-critical)' },
  HIGH: { bg: 'var(--c-behind-bg)', fg: 'var(--c-behind)' },
  MEDIUM: { bg: 'var(--c-watch-bg)', fg: 'var(--c-watch)' },
  LOW: { bg: 'var(--c-surface-2)', fg: 'var(--c-text-2)' },
};

const STATUS_COLORS = {
  OPEN: 'workflow-DRAFT',
  ACK: 'workflow-SUBMITTED',
  IN_PROGRESS: 'workflow-REVIEW',
  RESOLVED: 'workflow-APPROVED',
  CLOSED: 'workflow-CLOSED',
};

export default function Issues() {
  const [params] = useSearchParams();
  const initialProject = params.get('project');
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(initialProject);
  const [filter, setFilter] = useState({ severity: '', status: '', category: '' });
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ title: '', body: '', category: 'PROGRESS', severity: 'MEDIUM' });
  const [addBusy, setAddBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      if (!selectedProject) setSelectedProject(preferDemoProject(list));
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    const qs = {};
    if (filter.severity) qs.severity = filter.severity;
    if (filter.status) qs.status = filter.status;
    if (filter.category) qs.category = filter.category;
    issuesApi.list(selectedProject, qs).then(setItems).finally(() => setLoading(false));
  }, [selectedProject, filter]);

  const filtered = items.filter(i =>
    !search || JSON.stringify(i).toLowerCase().includes(search.toLowerCase())
  );

  // Stats
  const open = items.filter(i => i.status === 'OPEN').length;
  const crit = items.filter(i => i.severity === 'CRITICAL').length;
  const inProgress = items.filter(i => i.status === 'IN_PROGRESS').length;
  const resolved = items.filter(i => i.status === 'RESOLVED').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Issues</h1>
          <div className="meta">{items.length} issues · {open} open · {crit} critical</div>
        </div>
        <div className="page-header-right">
          <button className="btn" onClick={() => setShowAddModal(true)}><ICON.plus size={13} />Tạo issue</button>
        </div>
      </div>

      <div className="filter-bar">
        <label>Project</label>
        <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder="Chọn dự án..." />
        <label>Severity</label>
        <select value={filter.severity} onChange={e => setFilter({ ...filter, severity: e.target.value })}>
          <option value="">All</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <label>Status</label>
        <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}>
          <option value="">All</option>
          <option value="OPEN">Open</option>
          <option value="ACK">Ack</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
        <label>Category</label>
        <select value={filter.category} onChange={e => setFilter({ ...filter, category: e.target.value })}>
          <option value="">All</option>
          <option value="PROGRESS">Progress</option>
          <option value="QUALITY">Quality</option>
          <option value="MATERIAL">Material</option>
          <option value="PAYMENT">Payment</option>
          <option value="DESIGN">Design</option>
          <option value="SAFETY">Safety</option>
        </select>
        <input
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
      </div>

      <div className="stat-strip">
        <div className="stat"><div className="label">Total</div><div className="value">{items.length}</div></div>
        <div className="stat"><div className="label">Open</div><div className="value" style={{ color: 'var(--c-watch)' }}>{open}</div></div>
        <div className="stat"><div className="label">In Progress</div><div className="value" style={{ color: 'var(--c-review)' }}>{inProgress}</div></div>
        <div className="stat"><div className="label">Critical</div><div className="value" style={{ color: 'var(--c-behind)' }}>{crit}</div></div>
        <div className="stat"><div className="label">Resolved</div><div className="value" style={{ color: 'var(--c-on-track)' }}>{resolved}</div></div>
      </div>

      <div className="data-table">
        <div className="data-table-body">
          {loading ? <div className="empty">Loading...</div> :
           filtered.length === 0 ? <div className="empty">Chưa có issue nào</div> :
           <table>
             <thead>
               <tr>
                 <th>ID</th>
                 <th>Severity</th>
                 <th>Title</th>
                 <th>Category</th>
                 <th>Source</th>
                 <th>Status</th>
                 <th>Created</th>
               </tr>
             </thead>
             <tbody>
               {filtered.map(i => {
                 const sev = SEV_COLORS[i.severity] || SEV_COLORS.MEDIUM;
                 const rowCls = i.severity === 'CRITICAL' ? 'critical' : i.severity === 'HIGH' ? 'exception' : '';
                 return (
                   <tr key={i.id} className={`issue-row ${rowCls}`} onClick={() => nav(`/hq/issues/item?item=${i.id}`)}>
                     <td><code>{i.id}</code></td>
                     <td><span className="badge" style={{ background: sev.bg, color: sev.fg }}>{i.severity}</span></td>
                     <td style={{ maxWidth: 400 }}>{i.title}</td>
                     <td><span className="badge" style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)' }}>{i.category}</span></td>
                     <td style={{ fontSize: 11 }}><code>{i.source_resource}{i.source_id ? `:${i.source_id}` : ''}</code></td>
                     <td><span className={`badge ${STATUS_COLORS[i.status] || 'workflow-DRAFT'}`}>{i.status}</span></td>
                     <td style={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>{(i.created_at || '').slice(0, 16)}</td>
                   </tr>
                 );
               })}
             </tbody>
           </table>
          }
        </div>
      </div>

      {/* Add issue modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => !addBusy && setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <h3>Tạo Issue mới</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              <label style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Tiêu đề *</div>
                <input value={addForm.title} onChange={e => setAddForm({...addForm, title: e.target.value})} style={{ width: '100%', padding: 6 }} required />
              </label>
              <label>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Severity</div>
                <select value={addForm.severity} onChange={e => setAddForm({...addForm, severity: e.target.value})} style={{ width: '100%', padding: 6 }}>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </label>
              <label>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Category</div>
                <select value={addForm.category} onChange={e => setAddForm({...addForm, category: e.target.value})} style={{ width: '100%', padding: 6 }}>
                  <option value="PROGRESS">Progress</option>
                  <option value="QUALITY">Quality</option>
                  <option value="MATERIAL">Material</option>
                  <option value="PAYMENT">Payment</option>
                  <option value="DESIGN">Design</option>
                  <option value="SAFETY">Safety</option>
                </select>
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Mô tả</div>
                <textarea value={addForm.body} onChange={e => setAddForm({...addForm, body: e.target.value})} rows={4} style={{ width: '100%', padding: 6, fontFamily: 'inherit' }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)} disabled={addBusy}>Hủy</button>
              <button className="btn" onClick={async () => {
                if (!addForm.title) { toast.error('Tiêu đề bắt buộc'); return; }
                if (!selectedProject) { toast.error('Chọn dự án trước'); return; }
                setAddBusy(true);
                try {
                  const r = await fetch(`/api/projects/${selectedProject}/issues`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...addForm, project_id: Number(selectedProject) })
                  }).then(r => r.json());
                  if (r.error) throw new Error(r.error);
                  toast.success('Đã tạo issue #' + r.id);
                  setItems([r, ...items]);
                  setShowAddModal(false);
                  setAddForm({ title: '', body: '', category: 'PROGRESS', severity: 'MEDIUM' });
                } catch (e) {
                  toast.error('Lỗi: ' + e.message);
                } finally { setAddBusy(false); }
              }} disabled={addBusy}>{addBusy ? '...' : 'Tạo'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
