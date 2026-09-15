// UI-017: Master Data List - fix auth header + add 2 resources (workers, materials)
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ICON } from '../icons.jsx';
import { getToken, projects, masterData } from '../api/index.js';
import { toast } from '../components/Toast.jsx';

const RESOURCES = [
  { key: 'subcontractors', label: 'Subcontractors', icon: ICON.manpower, fetch: () => masterData.subcontractors() },
  { key: 'suppliers',      label: 'Suppliers',      icon: ICON.database,  fetch: () => masterData.suppliers() },
  { key: 'business-processes', label: 'Business Processes', icon: ICON.bp, fetch: () => masterData.businessProcesses() },
  { key: 'projects',       label: 'Projects',       icon: ICON.folder,    fetch: () => projects.list() },
  { key: 'departments',    label: 'Departments',    icon: ICON.manpower, fetch: () => masterData.departments() },
  { key: 'kpi-targets',    label: 'KPI Targets (43.10)', icon: ICON.bell, fetch: () => projects.kpiTargets(1) },
];

export default function MasterDataList() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const resource = params.get('r') || 'subcontractors';
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const r = RESOURCES.find(x => x.key === resource);
      if (!r) { setItems([]); return; }
      const data = await r.fetch();
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error('Lỗi tải ' + resource + ': ' + e.message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [resource]);

  const filtered = items.filter(i => JSON.stringify(i).toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Master Data</h1>
          <div className="meta">Quản lý dữ liệu nền tảng (43.2 + 43.10)</div>
        </div>
        <div className="page-header-right">
          <button className="btn" onClick={() => nav(`/hq/master-data/edit?r=${resource}`)}>
            <ICON.plus size={13} />Thêm mới
          </button>
          <button className="btn btn-secondary" onClick={load}><ICON.refresh size={12} />Refresh</button>
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

      <div className="filter-bar">
        <input
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <span style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{filtered.length} items</span>
      </div>

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
                   <tr key={row.id || i}>
                     {Object.keys(row).slice(0, 7).map(k => <td key={k}><code>{String(row[k] ?? '—').slice(0, 80)}</code></td>)}
                   </tr>
                 ))}
               </tbody>
             </table>
           </>
          }
        </div>
      </div>
      <p className="empty" style={{ marginTop: 16, fontSize: 11 }}>
        Ghi master data yêu cầu quyền (server kiểm tra theo role).
      </p>
    </div>
  );
}
