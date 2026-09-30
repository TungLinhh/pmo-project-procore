// UI-005: Progress Detail (mục 7)
import { useEffect, useState } from 'react';
import { progressFraction, isComplete } from '../utils/progress.js';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { projects, construction, exportApi, preferDemoProject, request } from '../api/index.js';
import { getToken } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';
import { HEALTH } from '../constants.js';
import ProjectPicker from '../components/ProjectPicker.jsx';
import CompressPanel from '../components/CompressPanel.jsx';
import TablePagination from '../components/TablePagination.jsx';
import { t, th, useLang } from '../i18n/index.js';
import Modal from '../components/Modal.jsx';

export default function ProgressDetail() {
  useLang(); // re-render table headers on VI/EN toggle
  const [params] = useSearchParams();
  const nav = useNavigate();
  const projectId = params.get('project');
  const initialZone = params.get('zone') || '';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(projectId);
  const [zone, setZone] = useState(initialZone);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0); // bump to refetch (e.g. after compression apply)
  const [drill, setDrill] = useState(null); // schedule item open in drill-down
  const [drillFile, setDrillFile] = useState(null); // source upload row
  const [drillFileError, setDrillFileError] = useState('');
  const [issueDraft, setIssueDraft] = useState(null); // prefilled issue from drill-down
  const [issueBusy, setIssueBusy] = useState(false);

  useEffect(() => {
    projects.list().then(list => {
      const arr = Array.isArray(list) ? list : [];
      setAllProjects(arr);
      if (!selectedProject) setSelectedProject(preferDemoProject(arr));
    }).catch(() => {
      setAllProjects([]);
      setLoadError(t('pd.err_projects'));
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) { setItems([]); setLoading(false); return undefined; }
    let live = true;
    setLoading(true);
    setLoadError('');
    construction.schedule(selectedProject, { zone, search: search || undefined, status: statusFilter || undefined })
      .then(rows => { if (live) setItems(Array.isArray(rows) ? rows : []); })
      .catch((error) => { if (live) setLoadError(error.message || t('pd.err_progress')); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [selectedProject, zone, search, statusFilter, reloadTick]);

  function healthOf(item) {
    const pct = progressFraction(item.progress_pct);
    if (pct >= 1) return HEALTH.ON_TRACK;
    if (item.plan_end_date && new Date(item.plan_end_date) < new Date()) return 'OVERDUE';
    if (pct >= 0.7) return HEALTH.WATCH;
    return HEALTH.BEHIND;
  }

  // Drill-down: full extracted record + source file (replaces the old
  // fake issue-detail link — schedule ids are not issue ids).
  async function openDrill(item) {
    setDrill(item);
    setDrillFile(null);
    setDrillFileError('');
    if (item.upload_id) {
      try {
        const r = await request(`/uploads/${item.upload_id}`);
        if (!r.error) setDrillFile(r);
        else setDrillFileError(r.error || t('pd.err_file_info'));
      } catch (e) {
        setDrillFileError(e.message || t('pd.err_file_info'));
      }
    }
  }

  async function createIssueFromDrill() {
    if (!issueDraft?.title?.trim() || !drill) return;
    setIssueBusy(true);
    try {
      const r = await request(`/projects/${selectedProject}/issues`, {
        method: 'POST',
        body: {
          title: issueDraft.title.trim(),
          body: issueDraft.body || '',
          category: 'PROGRESS',
          severity: issueDraft.severity || 'MEDIUM',
          source_resource: 'schedule',
          source_id: drill.id,
          zone_id: drill.zone_id || null,
        },
      });
      if (r.error) throw new Error(r.error);
      toast.success(t('pd.toast_issue_created') + r.id);
      setIssueDraft(null);
      setDrill(null);
      nav(`/hq/issues/item?item=${r.id}`);
    } catch (e) {
      toast.error(t('pd.err_generic') + e.message);
    } finally { setIssueBusy(false); }
  }

  async function downloadOriginal(uploadId, filename) {
    try {
      const r = await fetch(`/api/uploads/${uploadId}/download`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) throw new Error(t('pd.err_source'));
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename || `upload-${uploadId}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function download() {
    // P2-10: was an unguarded await (network throw → unhandled rejection).
    // (Export buttons are currently hidden via exportApi.ENABLED=false, but the
    // handler must still be safe if re-enabled.)
    try {
      const r = await fetch(exportApi.constructionSchedule(selectedProject), {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (!r.ok) throw new Error(t('pd.err_export'));
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `construction-schedule-${selectedProject}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
    } catch (e) {
      toast.error(t('pd.err_export') + e.message);
    }
  }

  // Zone options
  const zones = Array.from(new Set(items.map(i => i.zone_code))).sort();
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [selectedProject, zone, search, statusFilter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // KPI strip
  const total = items.length;
  const done = items.filter(isComplete).length;
  const overdue = items.filter(i => healthOf(i) === HEALTH.OVERDUE).length;
  const behind = items.filter(i => healthOf(i) === HEALTH.BEHIND).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('pd.h1')}</h1>
          <div className="meta">{t('pd.schedule_meta', { n: total, z: zones.length })}</div>
        </div>
        <div className="page-header-right">
          {exportApi.ENABLED && <button className="btn btn-secondary" onClick={download}><ICON.download size={13} />{t('pd.export_excel')}</button>}
        </div>
      </div>

      <div className="filter-bar">
        <label>{t('pd.lbl_project')}</label>
        <ProjectPicker value={selectedProject} onChange={id => { setSelectedProject(id); setZone(''); }} placeholder={t('pd.pick_project_ph')} />
        <label>{t('g.zone')}</label>
        <select value={zone} onChange={e => setZone(e.target.value)}>
          <option value="">{t('pd.lbl_all')}</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <label>{t('pd.lbl_status')}</label>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">{t('pd.lbl_all')}</option>
          <option value="DONE">{t('pd.st_done')}</option>
          <option value="IN_PROGRESS">{t('pd.st_doing')}</option>
          <option value="PENDING">{t('pd.lbl_waiting')}</option>
        </select>
        <input
          placeholder={t('pd.search_ph')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
      </div>

      <div className="stat-strip">
        <div className="stat"><div className="label">{t('pd.lbl_total')}</div><div className="value">{total}</div></div>
        <div className="stat"><div className="label">{t('pd.st_done')}</div><div className="value" style={{ color: 'var(--c-on-track)' }}>{done}</div></div>
        <div className="stat"><div className="label">{t('pd.st_doing')}</div><div className="value" style={{ color: 'var(--c-watch)' }}>{total - done - overdue}</div></div>
        <div className="stat"><div className="label">{t('pd.st_overdue')}</div><div className="value" style={{ color: 'var(--c-behind)' }}>{overdue}</div></div>
        <div className="stat"><div className="label">{t('pd.lbl_late')}</div><div className="value" style={{ color: 'var(--c-behind)' }}>{behind}</div></div>
        <div className="stat"><div className="label">{t('pd.lbl_completion')}</div><div className="value">{total > 0 ? Math.round(done / total * 100) : 0}%</div></div>
      </div>

      <CompressPanel projectId={selectedProject} onApplied={() => setReloadTick(t => t + 1)} />

      <div className="data-table">
        <div className="data-table-header">
          <h2>{t('pd.sec_work_items')}</h2>
          <div className="filters">
            <span style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('pd.hint_row')}</span>
          </div>
        </div>
        {loading ? <div className="empty loading-state"><span className="spinner" />{t('pd.busy_loading')}</div> :
         loadError ? <div className="empty gate-error"><strong>{t('pd.err_progress')}</strong><div style={{ marginTop: 6 }}>{loadError}</div><button className="btn" style={{ marginTop: 10 }} onClick={() => setReloadTick((n) => n + 1)}>{t('pd.btn_retry')}</button></div> :
         items.length === 0 ? <div className="empty">{t('pd.empty')}</div> :
        <div className="data-table-body">
          <table>
            <thead>
              <tr>
                <th>{th("Khu vực")}</th>
                <th>{th("Cấp")}</th>
                <th>{th("Tên hạng mục")}</th>
                <th>{th("Sheet nguồn")}</th>
                <th className="num">{th("Tiến độ")}</th>
                <th>{th("Kết thúc KH")}</th>
                <th>{th("Sức khỏe")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(item => {
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
                        <div className="bar"><div className="fill" style={{ width: `${progressFraction(item.progress_pct) * 100}%` }} /></div>
                        <span style={{ minWidth: 30 }}>{Math.round(progressFraction(item.progress_pct) * 100)}%</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>{(item.plan_end_date || '').slice(0, 10) || '—'}</td>
                    <td><span className={`badge health-${h.replace(/\s+/g, '_')}`}>{h.replace(/_/g, ' ')}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
        {!loading && <TablePagination page={safePage} pageCount={pageCount} total={items.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} unitKey="unit.work_item" />}
      </div>

      {drill && (
        <Modal onClose={() => setDrill(null)} maxWidth={560}>
          <h3 style={{ marginBottom: 4 }}>{drill.name_vi || `Item #${drill.id}`}</h3>
          <p className="meta" style={{ marginBottom: 12 }}>
            Zone {drill.zone_code || '—'} · Level {[drill.level_roman, drill.level_arabic, drill.sublevel].filter(Boolean).join('.') || '—'} · Sheet {drill.source_sheet || '—'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 13, marginBottom: 12 }}>
            <span style={{ color: 'var(--c-text-2)' }}>{t('pd.lbl_progress')}</span><strong>{drill.progress_pct != null ? `${Math.round(drill.progress_pct * 100)}%` : '—'}</strong>
            <span style={{ color: 'var(--c-text-2)' }}>{t('pd.lbl_status')}</span><strong>{drill.status || '—'}</strong>
            <span style={{ color: 'var(--c-text-2)' }}>{t('pd.lbl_plan_start')}</span><span>{(drill.plan_start_date || '').slice(0, 10) || '—'}</span>
            <span style={{ color: 'var(--c-text-2)' }}>{t('pd.lbl_actual_start')}</span><span>{(drill.actual_start_date || '').slice(0, 10) || '—'}</span>
            <span style={{ color: 'var(--c-text-2)' }}>{t('pd.lbl_plan_finish')}</span><span>{(drill.plan_end_date || '').slice(0, 10) || '—'}</span>
            <span style={{ color: 'var(--c-text-2)' }}>{t('pd.lbl_actual_finish')}</span><span>{(drill.actual_end_date || '').slice(0, 10) || '—'}</span>
            <span style={{ color: 'var(--c-text-2)' }}>{t('pd.lbl_plan_days')}</span><span>{drill.plan_duration_days ?? '—'}</span>
            <span style={{ color: 'var(--c-text-2)' }}>{t('g.health')}</span><span>{healthOf(drill).replace('_', ' ')}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--c-text-2)', marginBottom: 12 }}>
            Nguồn: {drillFile ? (
              <>{drillFile.relative_path || drillFile.original_filename} (<button className="btn-text" onClick={() => downloadOriginal(drill.upload_id, drillFile.original_filename)}>{t('pd.link_source')}</button>)</>
            ) : drill.upload_id && drillFileError ? (
              <span className="login-error">{t('pd.err_file_info')}{drillFileError}</span>
            ) : drill.upload_id ? (
              t('pd.busy_file_info')
            ) : (
              t('pd.link_lineage')
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => { setDrill(null); nav(`/hq/issues?project=${selectedProject}`); }}>{t('pd.sec_issues')}</button>
            <button className="btn btn-secondary" onClick={() => setIssueDraft({
              title: drill.name_vi || `Task #${drill.id} zone ${drill.zone_code || ''}`,
              body: `Zone ${drill.zone_code || '—'} · Sheet ${drill.source_sheet || '—'} · Tiến độ ${drill.progress_pct != null ? Math.round(drill.progress_pct * 100) + '%' : '—'} · KH kết thúc ${((drill.plan_end_date || '').slice(0, 10)) || '—'}`,
              severity: 'MEDIUM',
            })}>{t('pd.btn_create_issue')}</button>
            <button className="btn" onClick={() => setDrill(null)}>{t('pd.btn_close')}</button>
          </div>
        </Modal>
      )}

      {issueDraft && (
        <Modal onClose={() => !issueBusy && setIssueDraft(null)} maxWidth={520}>
          <h3>{t('pd.btn_create_issue_task')}</h3>
          <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
            <label>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('pd.f_title')}</div>
              <input value={issueDraft.title} onChange={e => setIssueDraft({ ...issueDraft, title: e.target.value })} style={{ width: '100%', padding: 6 }} />
            </label>
            <label>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('g.severity')}</div>
              <select value={issueDraft.severity} onChange={e => setIssueDraft({ ...issueDraft, severity: e.target.value })} style={{ width: '100%', padding: 6 }}>
                <option value="CRITICAL">{t('g.critical')}</option>
                <option value="HIGH">{t('g.sev_high')}</option>
                <option value="MEDIUM">{t('g.sev_medium')}</option>
                <option value="LOW">{t('g.sev_low')}</option>
              </select>
            </label>
            <label>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('pd.f_desc')}</div>
              <textarea value={issueDraft.body} onChange={e => setIssueDraft({ ...issueDraft, body: e.target.value })} rows={3} style={{ width: '100%', padding: 6, fontFamily: 'inherit' }} />
            </label>
            <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('pd.lbl_source')}<code>schedule:{drill?.id}</code> · Category: PROGRESS</div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setIssueDraft(null)} disabled={issueBusy}>{t('pd.btn_cancel')}</button>
            <button className="btn" onClick={createIssueFromDrill} disabled={issueBusy || !issueDraft.title?.trim()}>{issueBusy ? '...' : t('pd.btn_create')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
