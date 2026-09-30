// UI-017: Master Data List - fix auth header + add 2 resources (workers, materials)
import { useEffect, useState } from 'react';
import { t, useLang } from '../i18n/index.js';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ICON } from '../icons.jsx';
import { projects, masterData, businessProcess, preferDemoProject } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import HolidaysPanel from '../components/HolidaysPanel.jsx';
import { visibleColumns, cellValue } from './master-data-columns.js';
import { usePagination } from '../hooks/usePagination.js';
import TablePagination from '../components/TablePagination.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';

// Must mirror the keys of TABLES in backend/src/routes/master-data.js.
const CREATEABLE = ['vendors', 'workers', 'teams', 'subcontractors', 'suppliers', 'business-processes', 'departments'];

// Danh mục có `PUT/PATCH` + xoá mềm. `projects` và `kpi-targets` có route riêng,
// `holidays` có panel riêng — nên không dùng form chung này.
const EDITABLE = CREATEABLE;
// Không có cột `status` → không ẩn/kích hoạt lại được (server trả 409).
const NO_STATUS = new Set(['business-processes']);

const RESOURCES = [
  { key: 'vendors',       label: () => t('md.res_vendors'),  icon: ICON.database,  fetch: () => masterData.vendors() },
  { key: 'workers',       label: () => t('md.res_workers'),        icon: ICON.manpower, fetch: () => masterData.workers() },
  { key: 'teams',         label: () => t('md.res_teams'),          icon: ICON.bp,       fetch: () => masterData.teams() },
  { key: 'subcontractors', label: () => t('md.res_subcontractors'), icon: ICON.manpower, fetch: () => masterData.subcontractors() },
  { key: 'suppliers',      label: () => t('md.res_suppliers'),      icon: ICON.database,  fetch: () => masterData.suppliers() },
  { key: 'business-processes', label: () => t('md.res_processes'), icon: ICON.bp, fetch: () => masterData.businessProcesses() },
  { key: 'projects',       label: () => t('md.res_projects'),       icon: ICON.folder,    fetch: () => projects.list() },
  { key: 'departments',    label: () => t('md.res_departments'),    icon: ICON.manpower, fetch: () => masterData.departments() },
  // KPI targets are per-project — picker below supplies the id (was hardcoded 1).
  { key: 'kpi-targets',    label: () => t('md.res_kpi'), icon: ICON.bell, fetch: (pid) => projects.kpiTargets(pid), needsProject: true },
  // Site holidays (P1): tenant CRUD + global read-only — custom panel, not MasterDataEdit.
  { key: 'holidays',       label: () => t('md.res_holidays'),       icon: ICON.calendar,  custom: 'holidays' },
];

export default function MasterDataList() {
  useLang(); // tiêu đề trang đổi theo nút [VI|EN]
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
  // id → tên tổ, để cột `team_id` của Workers hiện tên thay vì số thứ tự.
  const [teamNames, setTeamNames] = useState({});
  const [workerNames, setWorkerNames] = useState({});
  // Chỉ hiện bản ghi INACTIVE khi bật — mặc định ẩn để danh sách chọn không
  // nhiễu, nhưng bản ghi vẫn còn và bấm "Kích hoạt lại" là lấy về được.
  const [showInactive, setShowInactive] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const confirm = useConfirm();

  // Ẩn = xoá mềm. Hỏi lại trước vì người dùng có thể tưởng đây là xoá hẳn; nói
  // rõ dữ liệu vẫn còn và có thể kích hoạt lại.
  async function toggleInactive(row) {
    const hiding = row.status !== 'INACTIVE';
    const okDo = await confirm(hiding
      ? { title: t('md.hide_title'), message: t('md.hide_msg', { name: row.name || row.full_name || row.code || `#${row.id}` }), confirmText: t('md.hide'), confirmStyle: 'danger' }
      : { title: t('md.restore_title'), message: t('md.restore_msg'), confirmText: t('md.restore') });
    if (!okDo) return;
    setBusyId(row.id);
    try {
      if (hiding) await masterData.deactivate(resource, row.id);
      else await masterData.restore(resource, row.id);
      toast.success(hiding ? t('md.hidden_toast') : t('md.restored_toast'));
      await load();
    } catch (e) {
      toast.error(`${t('md.action_failed')}: ${e.message}`);
    } finally { setBusyId(null); }
  }

  async function toggleBp(code) {
    if (bpDetail?.code === code) { setBpDetail(null); return; }
    setBpLoading(true);
    try {
      setBpDetail(await businessProcess.get(code));
    } catch (e) { toast.error(`${t('md.err_process')}: ${e.message}`); }
    finally { setBpLoading(false); }
  }

  useEffect(() => {
    projects.list().then(list => { if (!kpiProject) setKpiProject(preferDemoProject(list)); }).catch(() => {});
  }, []);

  useEffect(() => {
    masterData.teams()
      .then((rows) => setTeamNames(Object.fromEntries((Array.isArray(rows) ? rows : []).map((w) => [w.id, w.name]))))
      .catch(() => setTeamNames({}));
    masterData.workers()
      .then((rows) => setWorkerNames(Object.fromEntries((Array.isArray(rows) ? rows : []).map((w) => [w.id, w.full_name]))))
      .catch(() => setWorkerNames({}));
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
      toast.error(`${t('md.err_load', { r: resource })}: ${e.message}`);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [resource, kpiProject]);

  // Ẩn bản ghi INACTIVE trừ khi người dùng bật công tắc — mặc định chỉ hiện cái
  // đang dùng được. Số bị ẩn hiện ngay cạnh ô tìm, không biến mất im lặng.
  const canToggle = EDITABLE.includes(resource) && !NO_STATUS.has(resource);
  const searched = items.filter(i => JSON.stringify(i).toLowerCase().includes(search.toLowerCase()));
  const hiddenCount = canToggle ? searched.filter(i => i.status === 'INACTIVE').length : 0;
  const filtered = canToggle && !showInactive ? searched.filter(i => i.status !== 'INACTIVE') : searched;
  const cols = visibleColumns(resource, filtered[0]);
  // Trước đây `filtered.slice(0, 200)` — cắt bớt không báo, cùng lớp lỗi với các
  // màn bảng khác. API lấy tối đa 500, nên phần bị cắt là do chính màn này.
  const page = usePagination(filtered);
  const showActions = EDITABLE.includes(resource);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.master_data')}</h1>
          <div className="meta">{t('md.meta')}</div>
        </div>
        <div className="page-header-right">
          {resource === 'kpi-targets' && (
            <ProjectPicker value={kpiProject} onChange={setKpiProject} placeholder={t('md.pick_project')} />
          )}
          {/* Only offer "Thêm mới" where POST /api/master-data/:resource exists.
              `projects` and `kpi-targets` are readable here but created elsewhere
              (POST /api/projects, and the per-project KPI endpoint), so the button
              used to post to a non-existent path and always 404. */}
          {CREATEABLE.includes(resource) && (
            <button className="btn" onClick={() => nav(`/hq/master-data/edit?r=${resource}`)}>
              <ICON.plus size={13} />{t('md.add_new')}
            </button>
          )}
          {!CREATEABLE.includes(resource) && resource !== 'holidays' && (
            <span className="metric-label">
              {resource === 'projects' ? t('md.hint_projects')
                : resource === 'kpi-targets' ? t('md.hint_kpi')
                : t('md.hint_readonly')}
            </span>
          )}
          {resource !== 'holidays' && (
          <button className="btn btn-secondary" onClick={load}><ICON.refresh size={12} />{t('md.refresh')}</button>
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
              <Icon size={12} />{r.label()}
            </button>
          );
        })}
      </div>

      {resource !== 'holidays' && (
      <div className="filter-bar">
        <input
          placeholder={t('md.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        {canToggle && hiddenCount > 0 && (
          <label style={{ fontSize: 11, color: 'var(--c-text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            {t('md.show_inactive', { n: hiddenCount })}
          </label>
        )}
        <span style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('md.item_count', { n: filtered.length })}</span>
      </div>
      )}

      {resource === 'holidays' ? <HolidaysPanel /> : (
      <div className="data-table">
        <div className="data-table-body">
          {loading ? <div className="empty">{t('md.loading')}</div> :
           filtered.length === 0 ? <div className="empty">{t('md.empty', { r: resource })}</div> :
           <>
             <table>
               <thead>
                 <tr>
                   {cols.map((c) => <th key={c.key}>{c.label}</th>)}
                   {showActions && <th style={{ width: 88 }}>{t('md.col_actions')}</th>}
                 </tr>
               </thead>
                <tbody>
                  {page.visible.map((row, i) => (
                    <tr key={row.id || i}
                      onClick={resource === 'business-processes' && row.code ? () => toggleBp(row.code) : undefined}
                      style={{
                        ...(resource === 'business-processes' && row.code ? { cursor: 'pointer' } : {}),
                        // Bản ghi đã ẩn: làm mờ để không ai vô tình chọn phải cái
                        // không dùng được nữa.
                        ...(row.status === 'INACTIVE' ? { opacity: 0.5 } : {}),
                      }}
                      title={resource === 'business-processes' ? t('md.click_steps') : undefined}>
                      {cols.map((c) => <td key={c.key}><code>{cellValue(row, c.key, { teamNames, workerNames })}</code></td>)}
                      {showActions && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <button
                            className="btn btn-sm"
                            title={t('md.edit')}
                            onClick={() => nav(`/hq/master-data/edit?r=${resource}&id=${row.id}`)}
                          ><ICON.edit size={12} /></button>{' '}
                          {canToggle && (
                            <button
                              className="btn btn-sm"
                              title={row.status === 'INACTIVE' ? t('md.restore') : t('md.hide')}
                              disabled={busyId === row.id}
                              onClick={() => toggleInactive(row)}
                            >
                              {row.status === 'INACTIVE' ? <ICON.refresh size={12} /> : <ICON.trash size={12} />}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {resource === 'business-processes' && (bpLoading ? <div className="empty">{t('md.loading_steps')}</div> : bpDetail && (
                <div style={{ marginTop: 12 }}>
                  <div className="section-title" style={{ fontSize: 12 }}>
                    {bpDetail.code} — {t('md.step_count', { n: (bpDetail.steps || []).length })}
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
          {!loading && filtered.length > 0 && (
            <TablePagination
              page={page.page}
              pageCount={page.pageCount}
              total={page.total}
              pageSize={page.pageSize}
              onPageChange={page.setPage}
              onPageSizeChange={page.changePageSize}
              unitKey="unit.record"
            />
          )}
        </div>
      </div>
      )}
      <p className="empty" style={{ marginTop: 16, fontSize: 11 }}>{t('md.perm_note')}</p>
    </div>
  );
}
