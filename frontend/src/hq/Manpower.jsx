// UI-008: Manpower & Machinery - tab 2 loại (manpower + machinery)
// MVP scope: show data from subcontractors + suppliers + (future: workers/machinery tables)
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { projects, getToken, masterData, manpower, preferDemoProject } from '../api/index.js';
import { ICON } from '../icons.jsx';
import { toast } from '../components/Toast.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';

export default function Manpower() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState('workers');  // workers | machinery
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(params.get('project'));
  const [subs, setSubs] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [mpRows, setMpRows] = useState([]); // daily_manpower rollup rows (real)
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      if (!selectedProject) setSelectedProject(preferDemoProject(list));
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      masterData.subcontractors().catch(() => []),
      masterData.suppliers().catch(() => []),
      manpower.rollup().catch(() => ({ rows: [] })),
    ]).then(([s, sup, roll]) => {
      setSubs(s);
      setSuppliers(sup);
      setMpRows(Array.isArray(roll?.rows) ? roll.rows : []);
      setLoading(false);
    });
  }, [selectedProject]);

  // Real worker stats from daily_manpower rollup (selected project).
  // today = latest period sum per role; total = all-period sum per role.
  const workerStats = (() => {
    const rows = mpRows.filter(r => !selectedProject || Number(r.project_id) === Number(selectedProject));
    if (!rows.length) return [];
    const latest = rows.map(r => String(r.period).slice(0, 10)).sort().pop();
    const byRole = {};
    for (const r of rows) {
      const k = r.role_name_vi || r.role_code || '—';
      if (!byRole[k]) byRole[k] = { role: k, today: 0, total: 0, is_internal: false };
      byRole[k].total += Number(r.total_workers) || 0;
      if (String(r.period).slice(0, 10) === latest) byRole[k].today += Number(r.total_workers) || 0;
    }
    return Object.values(byRole).sort((a, b) => b.today - a.today);
  })();
  const totalWorkers = workerStats.reduce((s, w) => s + w.today, 0);
  const totalCapacity = workerStats.reduce((s, w) => s + w.total, 0);

  // No machinery source exists in the product — honest empty state, no fake fleet.
  const machines = [];
  const statusBadge = (s) => {
    const map = { operational: 'workflow-APPROVED', maintenance: 'workflow-REVIEW', broken: 'workflow-REJECTED' };
    return <span className={`badge ${map[s] || 'workflow-PENDING'}`}>{s.toUpperCase()}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Manpower &amp; Machinery</h1>
          <div className="meta">Tổng hợp nhân lực và thiết bị</div>
        </div>
        <div className="page-header-right">
          <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder="Chọn dự án..." />
        </div>
      </div>

      <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi-card on-track">
          <div className="label">Total workers</div>
          <div className="value">{totalWorkers}</div>
          <div className="sub">Đang làm hôm nay</div>
        </div>
        <div className="kpi-card">
          <div className="label">Capacity</div>
          <div className="value">{totalCapacity}</div>
          <div className="sub">Tổng theo kế hoạch</div>
        </div>
        <div className="kpi-card watch">
          <div className="label">Teams</div>
          <div className="value">{subs.length}</div>
          <div className="sub">Nhà thầu phụ</div>
        </div>
        <div className="kpi-card">
          <div className="label">Suppliers</div>
          <div className="value">{suppliers.length}</div>
          <div className="sub">Nhà cung cấp</div>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="filter-bar">
        <button className={tab === 'workers' ? 'btn' : 'btn btn-secondary'} onClick={() => setTab('workers')}>
          <ICON.manpower size={13} />Workers ({totalWorkers})
        </button>
        <button className={tab === 'machinery' ? 'btn' : 'btn btn-secondary'} onClick={() => setTab('machinery')}>
          <ICON.bp size={13} />Machinery ({machines.reduce((s, m) => s + m.qty, 0)})
        </button>
        <button className={tab === 'teams' ? 'btn' : 'btn btn-secondary'} onClick={() => setTab('teams')}>
          <ICON.audit size={13} />Subcontractors ({subs.length})
        </button>
        <button className={tab === 'suppliers' ? 'btn' : 'btn btn-secondary'} onClick={() => setTab('suppliers')}>
          <ICON.database size={13} />Suppliers ({suppliers.length})
        </button>
      </div>

      {/* Workers tab */}
      {tab === 'workers' && (
        <div className="data-table">
          <div className="data-table-body">
            <table>
              <thead>
                <tr>
                  <th>Role</th>
                  <th className="num">Today</th>
                  <th className="num">Total Capacity</th>
                  <th className="num">% On-site</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                 {loading ? <tr><td colSpan={5}>Loading...</td></tr> :
                 workerStats.length === 0 ? <tr><td colSpan={5}>Chưa có manpower — nhập báo cáo ngày (field) hoặc ingest file daily.</td></tr> :
                workerStats.map(w => {
                  const pct = w.total > 0 ? Math.round(w.today / w.total * 100) : 0;
                  return (
                    <tr key={w.role}>
                      <td>{w.role}</td>
                      <td className="num">{w.today}</td>
                      <td className="num">{w.total}</td>
                      <td className="num">
                        <div className="cell-bar">
                          <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
                          <span>{pct}%</span>
                        </div>
                      </td>
                      <td>
                        {pct >= 50
                          ? <span className="badge workflow-APPROVED">OK</span>
                          : pct >= 30
                            ? <span className="badge workflow-REVIEW">WATCH</span>
                            : <span className="badge workflow-REJECTED">LOW</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Machinery tab */}
      {tab === 'machinery' && (
        <div className="data-table">
          <div className="data-table-body">
            <table>
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th className="num">Qty</th>
                  <th>Location</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {machines.length === 0 ? <tr><td colSpan={4}>Chưa có dữ liệu thiết bị — rail máy móc chưa có nguồn số liệu.</td></tr> :
                machines.map((m, i) => (
                  <tr key={i}>
                    <td>{m.name}</td>
                    <td className="num">{m.qty}</td>
                    <td><code>{m.location}</code></td>
                    <td>{statusBadge(m.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Subcontractors tab */}
      {tab === 'teams' && (
        <div className="data-table">
          <div className="data-table-body">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Capability</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={3}>Loading...</td></tr> :
                 subs.length === 0 ? <tr><td colSpan={3}>Chưa có data</td></tr> :
                 subs.slice(0, 100).map(s => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.capability_summary || '—'}</td>
                    <td><span className="badge workflow-APPROVED">{s.status || 'ACTIVE'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Suppliers tab */}
      {tab === 'suppliers' && (
        <div className="data-table">
          <div className="data-table-body">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>System</th>
                  <th>Category</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={4}>Loading...</td></tr> :
                 suppliers.length === 0 ? <tr><td colSpan={4}>Chưa có data</td></tr> :
                 suppliers.map(s => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.system || '—'}</td>
                    <td>{s.category || '—'}</td>
                    <td>{s.location || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="empty" style={{ marginTop: 16, fontSize: 11 }}>
        Số liệu từ /manpower/rollup (daily reports).
      </p>
    </div>
  );
}
