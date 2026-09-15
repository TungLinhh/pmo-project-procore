// Shopdrawing List (mục 6.2)
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { projects, shop as shopApi, exportApi, preferDemoProject } from '../api/index.js';
import { getToken } from '../api/index.js';
import { ICON } from '../icons.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';

export default function ShopList() {
  const [params] = useSearchParams();
  const projectId = params.get('project');
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(projectId);
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      if (!selectedProject) setSelectedProject(preferDemoProject(list));
    });
  }, []);

  // One fetch per project; filter in memory (like Materials) — no request-per-keystroke race.
  // Stale-response guard: a slow earlier project must never overwrite the current one.
  useEffect(() => {
    if (!selectedProject) return;
    let live = true;
    setLoading(true);
    setSearch('');
    setZone('');
    shopApi.drawings(selectedProject)
      .then(rows => { if (live) setItems(Array.isArray(rows) ? rows : []); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [selectedProject]);

  // AND logic: zone + search (code/name/zone/state), like Progress combines its filters.
  const zones = useMemo(() => Array.from(new Set(items.map(i => i.zone_code).filter(Boolean))).sort(), [items]);
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter(i =>
      (!zone || i.zone_code === zone) &&
      (!q || [i.drawing_code, i.name_vi, i.name_en, i.zone_code, stateOf(i).label]
        .some(v => (v || '').toLowerCase().includes(q))));
  }, [items, search, zone]);

  // Display state derived from the canonical status + level responses.
  function stateOf(item) {
    if (item.approval_date) return { code: 'APPROVED', label: 'APPROVED' };
    if (item.bql_l1_response === 'R') return { code: 'REVISION', label: 'REVISION' };
    if (item.bql_l1_response) return { code: 'REVIEW', label: 'REVIEW' };
    return { code: 'PENDING', label: 'PENDING' };
  }

  // Stats follow the filtered rows (per user decision).
  const total = filtered.length;
  const approved = filtered.filter(i => i.approval_date).length;
  const inReview = filtered.filter(i => !i.approval_date && i.bql_l1_response && i.bql_l1_response !== 'R').length;
  const inRevision = filtered.filter(i => !i.approval_date && i.bql_l1_response === 'R').length;
  const pending = total - approved - inReview - inRevision;
  const overdue = filtered.filter(i => !i.approval_date && i.planned_submit_date && new Date(i.planned_submit_date) < new Date()).length;
  const approvalPct = total > 0 ? Math.round(approved / total * 100) : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Shopdrawing</h1>
          <div className="meta">Pipeline: Draft → Submit → BQL Review → Approval</div>
        </div>
        <div className="page-header-right">
          {exportApi.ENABLED && <button className="btn btn-secondary" onClick={async () => {
            const r = await fetch(exportApi.shopDrawings(selectedProject), { headers: { Authorization: `Bearer ${getToken()}` } });
            const blob = await r.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `shop-drawings-${selectedProject}.xlsx`;
            a.click();
          }}><ICON.download size={13} />Export</button>}
        </div>
      </div>

      <div className="filter-bar">
        <label>Project</label>
        <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder="Chọn dự án..." />
        <label>Zone</label>
        <select value={zone} onChange={e => setZone(e.target.value)}>
          <option value="">All</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <input placeholder="Search code / name..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
      </div>

      <div className="stat-strip">
        <div className="stat"><div className="label">Total</div><div className="value">{total}</div></div>
        <div className="stat"><div className="label">Approved</div><div className="value" style={{ color: 'var(--c-on-track)' }}>{approved}</div></div>
        <div className="stat"><div className="label">In review</div><div className="value" style={{ color: 'var(--c-review)' }}>{inReview}</div></div>
        <div className="stat"><div className="label">Revision</div><div className="value" style={{ color: 'var(--c-behind)' }}>{inRevision}</div></div>
        <div className="stat"><div className="label">Pending</div><div className="value">{pending}</div></div>
        <div className="stat"><div className="label">Overdue</div><div className="value" style={{ color: 'var(--c-behind)' }}>{overdue}</div></div>
        <div className="stat"><div className="label">Approval %</div><div className="value">{approvalPct}%</div></div>
      </div>

      <div className="data-table">
        <div className="data-table-body">
          <table>
            <thead>
              <tr>
                <th>Zone</th>
                <th>Code</th>
                <th>Name</th>
                <th>State</th>
                <th>Planned</th>
                <th>Actual</th>
                <th>Approval</th>
                <th>L1</th>
                <th>L2</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="9" className="empty">Loading...</td></tr> :
               filtered.length === 0 ? <tr><td colSpan="9" className="empty">Chưa có data. Upload file Shop [zone].xlsx</td></tr> :
               filtered.slice(0, 300).map(item => {
                  const s = stateOf(item);
                  // Rows stay neutral (like Progress at a glance): status lives in the badge only.
                  const isOverdue = !item.approval_date && item.planned_submit_date && new Date(item.planned_submit_date) < new Date();
                  return (
                    <tr key={item.id}>
                      <td><code>{item.zone_code || '—'}</code></td>
                     <td><code>{item.drawing_code}</code></td>
                     <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name_vi || '—'}</td>
                     <td><span className={`badge workflow-${s.code}`}>{s.label}</span></td>
                    <td style={{ fontSize: 12 }}>{(item.planned_submit_date || '').slice(0, 10) || '—'}</td>
                    <td style={{ fontSize: 12 }}>{(item.actual_submit_date || '').slice(0, 10) || '—'}</td>
                     <td>{isOverdue ? <span className="badge health-OVERDUE">OVERDUE</span> : (item.approval_date || '—')}</td>
                     <td>{item.bql_l1_response || '—'}</td>
                     <td>{item.bql_l2_response || '—'}</td>
                   </tr>
                 );
               })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
