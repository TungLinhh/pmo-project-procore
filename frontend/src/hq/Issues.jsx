// UI-006: Issues list - table view với filter + click → IssueDetail
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { projects, issues as issuesApi, request, preferDemoProject } from '../api/index.js';
import { ICON } from '../icons.jsx';
import { toast } from '../components/Toast.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';
import Modal from '../components/Modal.jsx';
import { t, th, useLang } from '../i18n/index.js';
import { usePagination } from '../hooks/usePagination.js';
import TablePagination from '../components/TablePagination.jsx';

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
  useLang(); // re-render table headers on VI/EN toggle
  const [params] = useSearchParams();
  const initialProject = params.get('project');
  const [, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(initialProject);
  const [filter, setFilter] = useState({ severity: '', status: '', category: '' });
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ title: '', body: '', category: 'PROGRESS', severity: 'MEDIUM' });
  const [addBusy, setAddBusy] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      if (!selectedProject) setSelectedProject(preferDemoProject(list));
    }).catch((e) => toast.error(t('iss.err_projects') + e.message));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    let live = true;
    setLoading(true);
    const qs = {};
    if (filter.severity) qs.severity = filter.severity;
    if (filter.status) qs.status = filter.status;
    if (filter.category) qs.category = filter.category;
    issuesApi.listPage(selectedProject, qs)
      .then(({ rows, total: t }) => {
        if (!live) return;
        setItems(rows);
        setTotal(t);
      })
      // Không `.catch` thì lỗi rơi ra ngoài im lặng: danh sách cũ vẫn hiện và
      // người dùng tưởng dữ liệu chỉ đơn giản là ít đi.
      .catch((e) => {
        if (!live) return;
        setItems([]);
        setTotal(null);
        toast.error(t('iss.err_load') + e.message);
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [selectedProject, filter]);

  const filtered = items.filter(i =>
    !search || JSON.stringify(i).toLowerCase().includes(search.toLowerCase())
  );

  // Cắt ở trình duyệt, không phải ở server: ô tìm kiếm và ba ô thống kê phía
  // trên cũng tính từ `items`. Nếu chỉ tải một trang, thống kê sẽ chỉ phản ánh
  // trang đó và người dùng tưởng dự án không có sự cố.
  const page = usePagination(filtered);

  // Server giữ trần danh sách. Khi tổng lớn hơn số dòng đã tải, phải nói ra —
  // im lặng cắt bớt là nguyên nhân khiến người dùng tin là đã xem hết dữ liệu.
  const truncated = total != null && total > items.length;

  // Stats
  const open = items.filter(i => i.status === 'OPEN').length;
  const crit = items.filter(i => i.severity === 'CRITICAL').length;
  const inProgress = items.filter(i => i.status === 'IN_PROGRESS').length;
  const resolved = items.filter(i => i.status === 'RESOLVED').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.issues')}</h1>
          <div className="meta">{items.length} issues · {open} open · {crit} critical</div>
        </div>
        <div className="page-header-right">
          <button className="btn" onClick={() => setShowAddModal(true)}><ICON.plus size={13} />{t('iss.btn_create')}</button>
        </div>
      </div>

      <div className="filter-bar">
        <label>{t('g.project')}</label>
        <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder={t('iss.pick_project_ph')} />
        <label>{t('g.severity')}</label>
        <select value={filter.severity} onChange={e => setFilter({ ...filter, severity: e.target.value })}>
          <option value="">{t('g.all')}</option>
          <option value="CRITICAL">{t('g.critical')}</option>
          <option value="HIGH">{t('g.sev_high')}</option>
          <option value="MEDIUM">{t('g.sev_medium')}</option>
          <option value="LOW">{t('g.sev_low')}</option>
        </select>
        <label>{t('g.status')}</label>
        <select value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value })}>
          <option value="">{t('g.all')}</option>
          <option value="OPEN">{t('g.open')}</option>
          <option value="ACK">{t('g.ack')}</option>
          <option value="IN_PROGRESS">{t('iss.in_progress')}</option>
          <option value="RESOLVED">{t('g.resolved')}</option>
          <option value="CLOSED">{t('g.closed')}</option>
        </select>
        <label>{t('g.category')}</label>
        <select value={filter.category} onChange={e => setFilter({ ...filter, category: e.target.value })}>
          <option value="">{t('g.all')}</option>
          <option value="PROGRESS">{t('g.progress')}</option>
          <option value="QUALITY">{t('g.quality')}</option>
          <option value="MATERIAL">{t('g.material')}</option>
          <option value="PAYMENT">{t('g.payment')}</option>
          <option value="DESIGN">{t('g.design')}</option>
          <option value="SAFETY">{t('g.safety')}</option>
        </select>
        <input
          placeholder={t('g.ph_search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 160 }}
        />
      </div>

      <div className="stat-strip">
        <div className="stat"><div className="label">{t('g.total')}</div><div className="value">{items.length}</div></div>
        <div className="stat"><div className="label">{t('g.open')}</div><div className="value" style={{ color: 'var(--c-watch)' }}>{open}</div></div>
        <div className="stat"><div className="label">{t('g.in_progress')}</div><div className="value" style={{ color: 'var(--c-review)' }}>{inProgress}</div></div>
        <div className="stat"><div className="label">{t('g.critical')}</div><div className="value" style={{ color: 'var(--c-behind)' }}>{crit}</div></div>
        <div className="stat"><div className="label">{t('g.resolved')}</div><div className="value" style={{ color: 'var(--c-on-track)' }}>{resolved}</div></div>
      </div>

      <div className="data-table">
        <div className="data-table-body">
          {loading ? <div className="empty">{t('g.loading')}</div> :
           filtered.length === 0 ? <div className="empty">{t('iss.empty')}</div> :
           <table>
             <thead>
               <tr>
                 <th>{th("ID")}</th>
                 <th>{th("Mức độ")}</th>
                 <th>{th("Tiêu đề")}</th>
                 <th>{th("Phân loại")}</th>
                 <th>{th("Nguồn")}</th>
                 <th>{th("Trạng thái")}</th>
                 <th>{th("Đã tạo")}</th>
               </tr>
             </thead>
             <tbody>
               {page.visible.map(i => {
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
          {truncated && (
            <div className="meta" style={{ marginTop: 8, color: 'var(--c-pending)' }}>
              Đang hiện {items.length} / {total} sự cố. Dùng ô tìm kiếm hoặc bộ lọc để
              thu hẹp, hoặc chọn 100 dòng mỗi trang.
            </div>
          )}
          {!loading && (
            <TablePagination
              page={page.page}
              pageCount={page.pageCount}
              total={page.total}
              pageSize={page.pageSize}
              onPageChange={page.setPage}
              onPageSizeChange={page.changePageSize}
              unitKey="unit.issue"
            />
          )}
        </div>
      </div>

      {/* Add issue modal */}
      {showAddModal && (
        <Modal onClose={() => !addBusy && setShowAddModal(false)} maxWidth={540}>
          <h3>{t('iss.create_new')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('iss.lbl_title')}</div>
              <input value={addForm.title} onChange={e => setAddForm({...addForm, title: e.target.value})} style={{ width: '100%', padding: 6 }} required />
            </label>
            <label>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('g.severity')}</div>
              <select value={addForm.severity} onChange={e => setAddForm({...addForm, severity: e.target.value})} style={{ width: '100%', padding: 6 }}>
                <option value="CRITICAL">{t('g.critical')}</option>
                <option value="HIGH">{t('g.sev_high')}</option>
                <option value="MEDIUM">{t('g.sev_medium')}</option>
                <option value="LOW">{t('g.sev_low')}</option>
              </select>
            </label>
            <label>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('g.category')}</div>
              <select value={addForm.category} onChange={e => setAddForm({...addForm, category: e.target.value})} style={{ width: '100%', padding: 6 }}>
                <option value="PROGRESS">{t('g.progress')}</option>
                <option value="QUALITY">{t('g.quality')}</option>
                <option value="MATERIAL">{t('g.material')}</option>
                <option value="PAYMENT">{t('g.payment')}</option>
                <option value="DESIGN">{t('g.design')}</option>
                <option value="SAFETY">{t('g.safety')}</option>
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('iss.lbl_desc')}</div>
              <textarea value={addForm.body} onChange={e => setAddForm({...addForm, body: e.target.value})} rows={4} style={{ width: '100%', padding: 6, fontFamily: 'inherit' }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)} disabled={addBusy}>{t('iss.btn_cancel')}</button>
            <button className="btn" onClick={async () => {
              if (!addForm.title) { toast.error(t('iss.need_title')); return; }
              if (!selectedProject) { toast.error(t('iss.pick_project')); return; }
              setAddBusy(true);
              try {
                const r = await request(`/projects/${selectedProject}/issues`, {
                  method: 'POST',
                  body: { ...addForm, project_id: Number(selectedProject) },
                });
                if (r.error) throw new Error(r.error);
                toast.success(t('iss.toast_created') + r.id);
                setItems([r, ...items]);
                setShowAddModal(false);
                setAddForm({ title: '', body: '', category: 'PROGRESS', severity: 'MEDIUM' });
              } catch (e) {
                toast.error(t('iss.err_generic') + e.message);
              } finally { setAddBusy(false); }
            }} disabled={addBusy}>{addBusy ? '...' : t('iss.btn_create2')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
