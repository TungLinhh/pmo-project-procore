// UI-004: Project Overview
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projects, construction, shopApi, exportApi, getToken, getUser, masterData } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';

export default function ProjectOverview() {
  const { id } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [shopData, setShopData] = useState([]);
  const [departments, setDepartments] = useState([]);
  const me = getUser() || {};
  const canEdit = me.role === 'admin' || me.is_ceo;

  useEffect(() => {
    projects.list().then(list => {
      const p = list.find(x => x.id === Number(id));
      setProject(p);
    });
    if (canEdit) masterData.departments().then(setDepartments).catch(() => {});
    if (id) {
      construction.schedule(id).then(setSchedule);
      shopApi.drawings(id).then(setShopData);
    }
  }, [id]);

  async function setDept(departmentId) {
    try {
      const updated = await projects.update(id, { department_id: departmentId ? Number(departmentId) : null });
      setProject(updated);
      toast.success('Đã gán bộ phận');
    } catch (e) { toast.error('Lỗi: ' + e.message); }
  }

  function openSchedule() {
    nav(`/hq/progress?project=${id}`);
  }
  async function doExport() {
    try {
      const url = exportApi.constructionSchedule(id);
      const r = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` }});
      if (!r.ok) throw new Error('Export thất bại: ' + r.status);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `construction-schedule-${project?.code || id}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success('Đã tải về ' + a.download);
    } catch (e) {
      toast.error('Export lỗi: ' + e.message);
    }
  }

  if (!project) return <div className="empty">Loading...</div>;

  const byZone = {};
  schedule.forEach(s => {
    if (!byZone[s.zone_code]) byZone[s.zone_code] = { total: 0, done: 0, inProgress: 0, overdue: 0, items: [] };
    byZone[s.zone_code].total++;
    if ((s.progress_pct || 0) >= 1) byZone[s.zone_code].done++;
    else byZone[s.zone_code].inProgress++;
    if (s.plan_end_date && new Date(s.plan_end_date) < new Date() && (s.progress_pct || 0) < 1) byZone[s.zone_code].overdue++;
    byZone[s.zone_code].items.push(s);
  });

  const totalDone = Object.values(byZone).reduce((s, z) => s + z.done, 0);
  const totalItems = schedule.length;
  const totalOverdue = Object.values(byZone).reduce((s, z) => s + z.overdue, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{project.code}</h1>
          <div className="meta">{project.name_vi} · {project.name_en} · Package: {project.package || '—'}</div>
          <div className="meta" style={{ marginTop: 4 }}>
            Bộ phận:{' '}
            {canEdit ? (
              <select value={project.department_id || ''} onChange={e => setDept(e.target.value)} style={{ fontSize: 12 }}>
                <option value="">— chưa gán —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.code} · {d.name_vi}</option>)}
              </select>
            ) : (
              project.department_id || '—'
            )}
          </div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={openSchedule}><ICON.calendar size={13} />Schedule</button>
          {exportApi.ENABLED && <button className="btn" onClick={doExport}><ICON.download size={13} />Export</button>}
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat"><div className="label">Total items</div><div className="value">{totalItems}</div></div>
        <div className="stat"><div className="label">Completed</div><div className="value" style={{ color: 'var(--c-on-track)' }}>{totalDone}</div></div>
        <div className="stat"><div className="label">In progress</div><div className="value" style={{ color: 'var(--c-watch)' }}>{totalItems - totalDone}</div></div>
        <div className="stat"><div className="label">Overdue</div><div className="value" style={{ color: 'var(--c-behind)' }}>{totalOverdue}</div></div>
        <div className="stat"><div className="label">Shop drawings</div><div className="value">{shopData.length}</div></div>
        <div className="stat"><div className="label">Approved</div><div className="value" style={{ color: 'var(--c-on-track)' }}>{shopData.filter(s => s.approval_date).length}</div></div>
        <div className="stat"><div className="label">Zones</div><div className="value">{Object.keys(byZone).length}</div></div>
      </div>

      <div className="section">
        <div className="section-title">
          <span>Zones ({Object.keys(byZone).length})</span>
          <button className="btn btn-secondary btn-sm" onClick={() => nav(`/hq/progress?project=${id}`)}>
            Mở Progress Detail <ICON.arrow size={11} />
          </button>
        </div>
        <div className="data-table">
          <div className="data-table-body">
            <table>
              <thead>
                <tr>
                  <th>Zone</th>
                  <th className="num">Items</th>
                  <th className="num">Done</th>
                  <th className="num">In progress</th>
                  <th className="num">Overdue</th>
                  <th>Progress</th>
                  <th>Health</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byZone).map(([zone, info]) => {
                  const pct = info.total > 0 ? Math.round(info.done / info.total * 100) : 0;
                  const health = info.overdue > 0 ? 'CRITICAL' : (pct >= 90 ? 'ON_TRACK' : pct >= 70 ? 'WATCH' : pct >= 50 ? 'BEHIND' : 'CRITICAL');
                  const rowCls = info.overdue > 0 ? 'critical' : (pct < 50 ? 'exception' : '');
                  return (
                    <tr key={zone} className={rowCls} onClick={() => nav(`/hq/progress?project=${id}&zone=${zone}`)} style={{ cursor: 'pointer' }}>
                      <td><code>{zone}</code></td>
                      <td className="num">{info.total}</td>
                      <td className="num">{info.done}</td>
                      <td className="num">{info.inProgress}</td>
                      <td className="num">{info.overdue}</td>
                      <td>
                        <div className="cell-bar">
                          <div className="bar"><div className="fill" style={{ width: `${pct}%`, background: health === 'CRITICAL' ? 'var(--c-behind)' : health === 'BEHIND' ? 'var(--c-watch)' : 'var(--c-on-track)' }} /></div>
                          <span>{pct}%</span>
                        </div>
                      </td>
                      <td><span className={`badge health-${health}`}>{health.replace('_', ' ')}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
