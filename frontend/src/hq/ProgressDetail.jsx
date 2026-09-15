// UI-005: Progress Detail (mục 7)
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { projects, construction, exportApi, preferDemoProject } from '../api/index.js';
import { getToken } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';
import { HEALTH } from '../constants.js';
import ProjectPicker from '../components/ProjectPicker.jsx';

export default function ProgressDetail() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const projectId = params.get('project');
  const initialZone = params.get('zone') || '';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(projectId);
  const [zone, setZone] = useState(initialZone);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [drill, setDrill] = useState(null); // schedule item open in drill-down
  const [drillFile, setDrillFile] = useState(null); // source upload row
  const [issueDraft, setIssueDraft] = useState(null); // prefilled issue from drill-down
  const [issueBusy, setIssueBusy] = useState(false);

  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      if (!selectedProject) setSelectedProject(preferDemoProject(list));
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    construction.schedule(selectedProject, { zone, search: search || undefined, status: statusFilter || undefined })
      .then(items => { setItems(items); setLoading(false); });
  }, [selectedProject, zone, search, statusFilter]);

  function healthOf(item) {
    const pct = item.progress_pct || 0;
    if (pct >= 1) return HEALTH.ON_TRACK;
    if (item.plan_end_date && new Date(item.plan_end_date) < new Date()) return 'OVERDUE';
    if (pct >= 0.7) return HEALTH.WATCH;
    return HEALTH.BEHIND;
  }

  // Drill-down: full extracted record + source file (replaces the old
  // fake issue-detail link — schedule ids are not issue ids).
  async function openDrill(item) {    setDrill(item);
    setDrillFile(null);
    if (item.upload_id) {
      try {
        const r = await fetch(`/api/uploads/${item.upload_id}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        }).then(x => x.json());
        if (!r.error) setDrillFile(r);
      } catch { /* source row may predate lineage — modal still shows item data */ }
    }
  }

  async function createIssueFromDrill() {
    if (!issueDraft?.title?.trim() || !drill) return;
    setIssueBusy(true);
    try {
      const r = await fetch(`/api/projects/${selectedProject}/issues`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: issueDraft.title.trim(),
          body: issueDraft.body || '',
          category: 'PROGRESS',
          severity: issueDraft.severity || 'MEDIUM',
          source_resource: 'schedule',
          source_id: drill.id,
          zone_id: drill.zone_id || null,
        }),
      }).then(x => x.json());
      if (r.error) throw new Error(r.error);
      toast.success('Đã tạo issue #' + r.id);
      setIssueDraft(null);
      setDrill(null);
      nav(`/hq/issues/item?item=${r.id}`);
    } catch (e) {
      toast.error('Lỗi: ' + e.message);
    } finally { setIssueBusy(false); }
  }

  async function downloadOriginal(uploadId, filename) {
    try {
      const r = await fetch(`/api/uploads/${uploadId}/download`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) throw new Error('Không tải được file gốc');
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || `upload-${uploadId}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      alert(e.message);
    }
  }

  async function download() {
    const r = await fetch(exportApi.constructionSchedule(selectedProject), {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `construction-schedule-${selectedProject}.xlsx`;
    a.click();
  }

  // Zone options
  const zones = Array.from(new Set(items.map(i => i.zone_code))).sort();

  // KPI strip
  const total = items.length;
  const done = items.filter(i => (i.progress_pct || 0) >= 1).length;
  const overdue = items.filter(i => healthOf(i) === HEALTH.OVERDUE).length;
  const behind = items.filter(i => healthOf(i) === HEALTH.BEHIND).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Progress Detail</h1>
          <div className="meta">Construction schedule · {total} items · {zones.length} zones</div>
        </div>
        <div className="page-header-right">
          {exportApi.ENABLED && <button className="btn btn-secondary" onClick={download}><ICON.download size={13} />Export Excel</button>}
        </div>
      </div>

      <div className="filter-bar">
        <label>Project</label>
        <ProjectPicker value={selectedProject} onChange={id => { setSelectedProject(id); setZone(''); }} placeholder="Chọn dự án..." />
        <label>Zone</label>
        <select value={zone} onChange={e => setZone(e.target.value)}>
          <option value="">All</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <label>Status</label>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All</option>
          <option value="DONE">Done</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="PENDING">Pending</option>
        </select>
        <input
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
      </div>

      <div className="stat-strip">
        <div className="stat"><div className="label">Total</div><div className="value">{total}</div></div>
        <div className="stat"><div className="label">Done</div><div className="value" style={{ color: 'var(--c-on-track)' }}>{done}</div></div>
        <div className="stat"><div className="label">In progress</div><div className="value" style={{ color: 'var(--c-watch)' }}>{total - done - overdue}</div></div>
        <div className="stat"><div className="label">Overdue</div><div className="value" style={{ color: 'var(--c-behind)' }}>{overdue}</div></div>
        <div className="stat"><div className="label">Behind</div><div className="value" style={{ color: 'var(--c-behind)' }}>{behind}</div></div>
        <div className="stat"><div className="label">Completion</div><div className="value">{total > 0 ? Math.round(done / total * 100) : 0}%</div></div>
      </div>

      <div className="data-table">
        <div className="data-table-header">
          <h2>Items</h2>
          <div className="filters">
            <span style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Click row để xem chi tiết trích xuất</span>
          </div>
        </div>
        {loading ? <div className="empty">Loading...</div> :
         items.length === 0 ? <div className="empty">Chưa có dữ liệu. Upload file "TĐ [zone].xlsx".</div> :
        <div className="data-table-body">
          <table>
            <thead>
              <tr>
                <th>Zone</th>
                <th>Level</th>
                <th>Name</th>
                <th>Source sheet</th>
                <th className="num">Progress</th>
                <th>Plan end</th>
                <th>Health</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 500).map(item => {
                const h = healthOf(item);
                const cls = h === HEALTH.OVERDUE || h === HEALTH.CRITICAL ? 'critical' : h === HEALTH.BEHIND ? 'exception' : '';
                return (
                  <tr key={item.id} className={cls} onClick={() => openDrill(item)} style={{ cursor: 'pointer' }}>
                    <td><code>{item.zone_code}</code></td>
                    <td>{item.level_roman || item.level_arabic || '—'}</td>
                    <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name_vi || '—'}</td>
                    <td style={{ color: 'var(--c-text-2)', fontSize: 11 }}>{item.source_sheet || '—'}</td>
                    <td className="num">
                      <div className="cell-bar" style={{ display: 'inline-flex', minWidth: 100 }}>
                        <div className="bar"><div className="fill" style={{ width: `${(item.progress_pct || 0) * 100}%` }} /></div>
                        <span style={{ minWidth: 30 }}>{item.progress_pct ? Math.round(item.progress_pct * 100) : 0}%</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{(item.plan_end_date || '').slice(0, 10) || '—'}</td>
                    <td><span className={`badge health-${h}`}>{h.replace('_', ' ')}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
      </div>

      {drill && (
        <div className="modal-backdrop" onClick={() => setDrill(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3 style={{ marginBottom: 4 }}>{drill.name_vi || `Item #${drill.id}`}</h3>
            <p className="meta" style={{ marginBottom: 12 }}>
              Zone {drill.zone_code || '—'} · Level {[drill.level_roman, drill.level_arabic, drill.sublevel].filter(Boolean).join('.') || '—'} · Sheet {drill.source_sheet || '—'}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 13, marginBottom: 12 }}>
              <span style={{ color: 'var(--c-text-2)' }}>Tiến độ</span><strong>{drill.progress_pct != null ? `${Math.round(drill.progress_pct * 100)}%` : '—'}</strong>
              <span style={{ color: 'var(--c-text-2)' }}>Trạng thái</span><strong>{drill.status || '—'}</strong>
              <span style={{ color: 'var(--c-text-2)' }}>Bắt đầu (KH)</span><span>{(drill.plan_start_date || '').slice(0, 10) || '—'}</span>
              <span style={{ color: 'var(--c-text-2)' }}>Bắt đầu (TT)</span><span>{(drill.actual_start_date || '').slice(0, 10) || '—'}</span>
              <span style={{ color: 'var(--c-text-2)' }}>Kết thúc (KH)</span><span>{(drill.plan_end_date || '').slice(0, 10) || '—'}</span>
              <span style={{ color: 'var(--c-text-2)' }}>Kết thúc (TT)</span><span>{(drill.actual_end_date || '').slice(0, 10) || '—'}</span>
              <span style={{ color: 'var(--c-text-2)' }}>Số ngày KH</span><span>{drill.plan_duration_days ?? '—'}</span>
              <span style={{ color: 'var(--c-text-2)' }}>Health</span><span>{healthOf(drill).replace('_', ' ')}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--c-text-2)', marginBottom: 12 }}>
              Nguồn: {drillFile ? (
                <>{drillFile.relative_path || drillFile.original_filename} (<button className="btn-text" onClick={() => downloadOriginal(drill.upload_id, drillFile.original_filename)}>tải file gốc</button>)</>
              ) : drill.upload_id ? (
                'đang tải thông tin file…'
              ) : (
                'hàng nhập trước khi có lineage (chỉ có tên sheet)'
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setDrill(null); nav(`/hq/issues?project=${selectedProject}`); }}>Issues dự án</button>
              <button className="btn btn-secondary" onClick={() => setIssueDraft({
                title: drill.name_vi || `Task #${drill.id} zone ${drill.zone_code || ''}`,
                body: `Zone ${drill.zone_code || '—'} · Sheet ${drill.source_sheet || '—'} · Tiến độ ${drill.progress_pct != null ? Math.round(drill.progress_pct * 100) + '%' : '—'} · KH kết thúc ${((drill.plan_end_date || '').slice(0, 10)) || '—'}`,
                severity: 'MEDIUM',
              })}>Tạo issue</button>
              <button className="btn" onClick={() => setDrill(null)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {issueDraft && (
        <div className="modal-backdrop" onClick={() => !issueBusy && setIssueDraft(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>Tạo Issue từ task</h3>
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              <label>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Tiêu đề *</div>
                <input value={issueDraft.title} onChange={e => setIssueDraft({ ...issueDraft, title: e.target.value })} style={{ width: '100%', padding: 6 }} />
              </label>
              <label>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Severity</div>
                <select value={issueDraft.severity} onChange={e => setIssueDraft({ ...issueDraft, severity: e.target.value })} style={{ width: '100%', padding: 6 }}>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </label>
              <label>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Mô tả (tự điền từ task)</div>
                <textarea value={issueDraft.body} onChange={e => setIssueDraft({ ...issueDraft, body: e.target.value })} rows={3} style={{ width: '100%', padding: 6, fontFamily: 'inherit' }} />
              </label>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Nguồn: <code>schedule:{drill?.id}</code> · Category: PROGRESS</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setIssueDraft(null)} disabled={issueBusy}>Hủy</button>
              <button className="btn" onClick={createIssueFromDrill} disabled={issueBusy || !issueDraft.title?.trim()}>{issueBusy ? '...' : 'Tạo'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
