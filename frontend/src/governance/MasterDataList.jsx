// UI-017: Master Data List - fix auth header + add 2 resources (workers, materials)
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ICON } from '../icons.jsx';
import { getToken, projects, masterData, businessProcess, preferDemoProject } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import HolidaysPanel from '../components/HolidaysPanel.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';

const RESOURCES = [
  { key: 'subcontractors', label: 'Subcontractors', icon: ICON.manpower, fetch: () => masterData.subcontractors() },
  { key: 'suppliers',      label: 'Suppliers',      icon: ICON.database,  fetch: () => masterData.suppliers() },
  { key: 'business-processes', label: 'Business Processes', icon: ICON.bp, fetch: () => masterData.businessProcesses() },
  { key: 'projects',       label: 'Projects',       icon: ICON.folder,    fetch: () => projects.list() },
  { key: 'departments',    label: 'Departments',    icon: ICON.manpower, fetch: () => masterData.departments() },
  // KPI targets are per-project — picker below supplies the id (was hardcoded 1).
  { key: 'kpi-targets',    label: 'KPI Targets (43.10)', icon: ICON.bell, fetch: (pid) => projects.kpiTargets(pid), needsProject: true },
  // Site holidays (P1): tenant CRUD + global read-only — custom panel, not MasterDataEdit.
  { key: 'holidays',       label: 'Holidays',       icon: ICON.calendar,  custom: 'holidays' },
];

export default function MasterDataList() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const resource = params.get('r') || 'subcontractors';
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [kpiProject, setKpiProject] = useState(null);
  // P3-14: business-process detail wiring — the GET /api/business-process/:code
  // route (process + steps) had no UI. Clicking a business-processes row
  // expands its steps inline.
  const [bpDetail, setBpDetail] = useState(null);
  const [bpLoading, setBpLoading] = useState(false);

  async function toggleBp(code) {
    if (bpDetail?.code === code) { setBpDetail(null); return; }
    setBpLoading(true);
    try {
      setBpDetail(await businessProcess.get(code));
    } catch (e) { toast.error('Lỗi tải quy trình: ' + e.message); }
    finally { setBpLoading(false); }
  }

  useEffect(() => {
    projects.list().then(list => { if (!kpiProject) setKpiProject(preferDemoProject(list)); }).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    setBpDetail(null);
    try {
      const r = RESOURCES.find(x => x.key === resource);
      if (!r || r.custom) { setItems([]); return; }
      if (r.needsProject && !kpiProject) { setItems([]); return; }
      const data = await r.fetch(kpiProject);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error('Lỗi tải ' + resource + ': ' + e.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [resource, kpiProject]);

  const filtered = items.filter(i => JSON.stringify(i).toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Master Data</h1>
          <div className="meta">Quản lý dữ liệu nền tảng (43.2 + 43.10)</div>
        </div>
        <div className="page-header-right">
          {resource === 'kpi-targets' && (
            <ProjectPicker value={kpiProject} onChange={setKpiProject} placeholder="Chọn dự án..." />
          )}
          {resource !== 'holidays' && (
          <button className="btn" onClick={() => nav(`/hq/master-data/edit?r=${resource}`)}>
            <ICON.plus size={13} />Thêm mới
          </button>
          )}
          {resource !== 'holidays' && (
          <button className="btn btn-secondary" onClick={load}><ICON.refresh size={12} />Refresh</button>
          )}
        </div>
      </div>

      <div className="filter-bar">
        {RESOURCES.map(r => {
          const Icon = r.icon;
          const active = resource === r.key;
          return (
            <button
              key={r.key}
              className={active ? 'btn' : 'btn btn-secondary'}
              onClick={() => setParams({ r: r.key })}
              style={{ fontSize: 12, padding: '5px 10px' }}
            >
              <Icon size={12} />{r.label}
            </button>
          );
        })}
      </div>

      {resource !== 'holidays' && (
      <div className="filter-bar">
        <input
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <span style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{filtered.length} items</span>
      </div>
      )}

      {resource === 'holidays' ? <HolidaysPanel /> : (
      <div className="data-table">
        <div className="data-table-body">
          {loading ? <div className="empty">Loading...</div> :
           filtered.length === 0 ? <div className="empty">Chưa có data cho "{resource}"</div> :
           <>
             <table>
               <thead>
                 <tr>{Object.keys(filtered[0] || {}).slice(0, 7).map(k => <th key={k}>{k}</th>)}</tr>
               </thead>
                <tbody>
                  {filtered.slice(0, 200).map((row, i) => (
                    <tr key={row.id || i}
                      onClick={resource === 'business-processes' && row.code ? () => toggleBp(row.code) : undefined}
                      style={resource === 'business-processes' && row.code ? { cursor: 'pointer' } : undefined}
                      title={resource === 'business-processes' ? 'Click để xem các bước' : undefined}>
                      {Object.keys(row).slice(0, 7).map(k => <td key={k}><code>{String(row[k] ?? '—').slice(0, 80)}</code></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {resource === 'business-processes' && (bpLoading ? <div className="empty">Đang tải các bước...</div> : bpDetail && (
                <div style={{ marginTop: 12 }}>
                  <div className="section-title" style={{ fontSize: 12 }}>
                    {bpDetail.code} — {(bpDetail.steps || []).length} bước
                  </div>
                  <ol style={{ fontSize: 12, paddingLeft: 20 }}>
                    {(bpDetail.steps || []).map(s => (
                      <li key={s.id} style={{ marginBottom: 4 }}>
                        <strong>{s.name_vi}</strong>
                        {s.responsibility_vi && <span style={{ color: 'var(--c-text-2)' }}> · {String(s.responsibility_vi).slice(0, 80)}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </>
           }
        </div>
      </div>
      )}
      <p className="empty" style={{ marginTop: 16, fontSize: 11 }}>
        Ghi master data yêu cầu quyền (server kiểm tra theo role).
      </p>
    </div>
  );
}
