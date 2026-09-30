// UI-004: Project Overview
import { useEffect, useState } from 'react';
import { isComplete, isOverdue } from '../utils/progress.js';
import { useParams, useNavigate } from 'react-router-dom';
import { projects, construction, shopApi, exportApi, getToken, getUser, masterData } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';
import { t, th, useLang } from '../i18n/index.js';

export default function ProjectOverview() {
  useLang(); // re-render table headers on VI/EN toggle
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
    }).catch((e) => toast.error(t('ov.err_projects') + e.message));
    if (canEdit) masterData.departments().then(setDepartments).catch(() => {});
    if (id) {
      construction.schedule(id)
        .then(setSchedule)
        .catch((e) => toast.error(t('ov.err_schedule') + e.message));
      shopApi.drawings(id)
        .then(setShopData)
        .catch((e) => toast.error(t('ov.err_shop') + e.message));
    }
  }, [id]);

  async function setDept(departmentId) {
    try {
      const updated = await projects.update(id, { department_id: departmentId ? Number(departmentId) : null });
      setProject(updated);
      toast.success(t('ov.toast_dept_set'));
    } catch (e) { toast.error(t('ov.err_load') + e.message); }
  }

  function openSchedule() {
    nav(`/hq/progress?project=${id}`);
  }
  async function doExport() {
    try {
      const url = exportApi.constructionSchedule(id);
      const r = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` }});
      if (!r.ok) throw new Error(t('ov.err_export_failed') + r.status);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `construction-schedule-${project?.code || id}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      toast.success(t('ov.toast_downloaded') + a.download);
    } catch (e) {
      toast.error(t('ov.err_export') + e.message);
    }
  }

  if (!project) return <div className="empty">{t('g.loading')}</div>;

  const byZone = {};
  schedule.forEach(s => {
    if (!byZone[s.zone_code]) byZone[s.zone_code] = { total: 0, done: 0, inProgress: 0, overdue: 0, items: [] };
    byZone[s.zone_code].total++;
    if (isComplete(s)) byZone[s.zone_code].done++;
    else byZone[s.zone_code].inProgress++;
    if (isOverdue(s)) byZone[s.zone_code].overdue++;
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
                <option value="">{t('ov.unassigned')}</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.code} · {d.name_vi}</option>)}
              </select>
            ) : (
              project.department_id || '—'
            )}
          </div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={openSchedule}><ICON.calendar size={13} />{t('g.schedule')}</button>
          {exportApi.ENABLED && <button className="btn" onClick={doExport}><ICON.download size={13} />{t('g.export')}</button>}
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat"><div className="label">{t('po.total_items')}</div><div className="value">{totalItems}</div></div>
        <div className="stat"><div className="label">{t('g.completed')}</div><div className="value" style={{ color: 'var(--c-on-track)' }}>{totalDone}</div></div>
        <div className="stat"><div className="label">{t('po.in_progress')}</div><div className="value" style={{ color: 'var(--c-watch)' }}>{totalItems - totalDone}</div></div>
        <div className="stat"><div className="label">{t('g.overdue')}</div><div className="value" style={{ color: 'var(--c-behind)' }}>{totalOverdue}</div></div>
        <div className="stat"><div className="label">{t('po.shop_drawings')}</div><div className="value">{shopData.length}</div></div>
        <div className="stat"><div className="label">{t('g.approved')}</div><div className="value" style={{ color: 'var(--c-on-track)' }}>{shopData.filter(s => s.approval_date).length}</div></div>
        <div className="stat"><div className="label">{t('g.zones')}</div><div className="value">{Object.keys(byZone).length}</div></div>
      </div>

      <div className="section">
        <div className="section-title">
          <span>{t('g.zones')} ({Object.keys(byZone).length})</span>
          <button className="btn btn-secondary btn-sm" onClick={() => nav(`/hq/progress?project=${id}`)}>{t('ov.btn_open_detail')}<ICON.arrow size={11} />
          </button>
        </div>
        <div className="data-table">
          <div className="data-table-body">
            <table>
              <thead>
                <tr>
                  <th>{th("Khu vực")}</th>
                  <th className="num">{th("Hạng mục")}</th>
                  <th className="num">{th("Xong")}</th>
                  <th className="num">{th("Đang thực hiện")}</th>
                  <th className="num">{th("Quá hạn")}</th>
                  <th>{th("Tiến độ")}</th>
                  <th>{th("Sức khỏe")}</th>
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
