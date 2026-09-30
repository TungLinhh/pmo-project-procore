import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { projects, qa, preferDemoProject } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';
import { usePagination } from '../hooks/usePagination.js';
import TablePagination from '../components/TablePagination.jsx';
import { t, th, useLang } from '../i18n/index.js';

function statusMeta() {
  return {
  OPEN: { label: t('qa.st_open'), cls: 'workflow-PENDING' },
  FAILED: { label: t('qa.st_fail'), cls: 'workflow-REJECTED' },
  PASSED: { label: t('qa.st_pass'), cls: 'workflow-APPROVED' },
};
}

export default function QaInspections() {
  useLang(); // re-render table headers on VI/EN toggle
  const [params] = useSearchParams();
  const [projectId, setProjectId] = useState(params.get('project'));
  const [items, setItems] = useState([]);
  const [serverTotal, setServerTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ code: '', title_vi: '', inspector: '', note: '', zone_id: '', inspected_at: '' });
  const [zones, setZones] = useState([]);

  useEffect(() => {
    projects.list().then((list) => setProjectId((current) => current || preferDemoProject(list))).catch((e) => toast.error(e.message));
  }, []);
  // The zone picker needs the project's zones; without them the Zone column
  // could never be filled from this screen.
  useEffect(() => {
    if (!projectId) { setZones([]); return; }
    projects.zones(projectId).then((z) => setZones(Array.isArray(z) ? z : [])).catch(() => setZones([]));
  }, [projectId]);
  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    qa.listPage(projectId)
      .then(({ rows, total }) => { setItems(rows); setServerTotal(total); })
      .catch((e) => { setItems([]); setServerTotal(null); toast.error(t('qa.err_load') + e.message); })
      .finally(() => setLoading(false));
  }, [projectId]);

  async function create(e) {
    e.preventDefault();
    if (!projectId || !form.code.trim() || !form.title_vi.trim()) {
      toast.error(t('qa.need_project'));
      return;
    }
    setBusy('create');
    try {
      const row = await qa.create(projectId, {
        ...form,
        code: form.code.trim(),
        title_vi: form.title_vi.trim(),
        zone_id: form.zone_id ? Number(form.zone_id) : null,
        inspected_at: form.inspected_at || null,
      });
      setItems((prev) => [row, ...prev]);
      setForm({ code: '', title_vi: '', inspector: '', note: '', zone_id: '', inspected_at: '' });
      toast.success(t('qa.toast_created'));
    } catch (err) { toast.error(err.message); }
    finally { setBusy(null); }
  }

  async function transition(row, status) {
    setBusy(row.id);
    try {
      const updated = await qa.update(row.id, status);
      setItems((prev) => prev.map((item) => item.id === row.id ? updated : item));
      toast.success(`Đã chuyển ${row.code} sang ${statusMeta()[status].label}`);
    } catch (err) { toast.error(err.message); }
    finally { setBusy(null); }
  }

  const counts = Object.fromEntries(Object.keys(statusMeta()).map((key) => [key, items.filter((row) => row.status === key).length]));

  // Thống kê phía trên tính từ `items`, nên bảng phải cắt ở trình duyệt — nếu chỉ
  // tải một trung thì thống kê sẽ chỉ phản ánh trang đó.
  const page = usePagination(items);
  const truncated = serverTotal != null && serverTotal > items.length;

  return (
    <div>
      <div className="page-header">
        <div><h1>{t('qa.h1')}</h1><div className="meta">{t('qa.subtitle')}</div></div>
      </div>
      <div className="filter-bar">
        <label>{t('qa.lbl_project')}</label><ProjectPicker value={projectId} onChange={setProjectId} placeholder={t('qa.pick_project')} />
      </div>
      <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi-card"><div className="label">{t('qa.lbl_total')}</div><div className="value">{items.length}</div></div>
        <div className="kpi-card watch"><div className="label">{t('qa.st_open')}</div><div className="value">{counts.OPEN || 0}</div></div>
        <div className="kpi-card critical"><div className="label">{t('qa.st_fail')}</div><div className="value">{counts.FAILED || 0}</div></div>
        <div className="kpi-card on-track"><div className="label">{t('qa.st_pass')}</div><div className="value">{counts.PASSED || 0}</div></div>
      </div>
      <form className="section" onSubmit={create}>
        <div className="section-title">{t('qa.btn_create')}</div>
        <div className="filter-bar">
          <input placeholder={t('qa.lbl_code')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <input placeholder={t('qa.lbl_item')} value={form.title_vi} onChange={(e) => setForm({ ...form, title_vi: e.target.value })} style={{ flex: 1 }} />
          <input placeholder={t('qa.lbl_inspector')} value={form.inspector} onChange={(e) => setForm({ ...form, inspector: e.target.value })} />
          <select value={form.zone_id || ''} onChange={(e) => setForm({ ...form, zone_id: e.target.value })} style={{ maxWidth: 160 }}>
            <option value="">-- Zone --</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.code}</option>)}
          </select>
          <input type="date" value={form.inspected_at} onChange={(e) => setForm({ ...form, inspected_at: e.target.value })} title={t('qa.lbl_date')} />
          <input placeholder={t('qa.lbl_note')} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ flex: 1 }} />
          <button className="btn" disabled={busy === 'create'}><ICON.plus size={13} />{busy === 'create' ? t('qa.busy_saving') : t('qa.btn_add')}</button>
        </div>
      </form>
      <div className="data-table"><div className="data-table-body"><table>
        <thead><tr><th>{th("Mã")}</th><th>{th("Hạng mục")}</th><th>{th("Khu vực")}</th><th>{th("Người kiểm tra")}</th><th>{th("Ngày")}</th><th>{th("Trạng thái")}</th><th>{th("Thao tác")}</th></tr></thead>
        <tbody>
          {loading && <tr><td colSpan={7}>{t('qa.busy_loading')}</td></tr>}
          {!loading && page.visible.map((row) => {
            const status = statusMeta()[row.status] || statusMeta().OPEN;
            return <tr key={row.id}>
              <td><code>{row.code}</code></td><td>{row.title_vi}</td><td>{row.zone_code || '—'}</td>
              <td>{row.inspector || '—'}</td><td>{String(row.inspected_at || '').slice(0, 10) || '—'}</td>
              <td><span className={`badge ${status.cls}`}>{status.label}</span></td>
              <td><div style={{ display: 'flex', gap: 6 }}>
                {row.status !== 'PASSED' && <button className="btn btn-sm" disabled={busy === row.id} onClick={() => transition(row, 'PASSED')}>{t('qa.st_pass')}</button>}
                {row.status !== 'FAILED' && <button className="btn btn-secondary" disabled={busy === row.id} onClick={() => transition(row, 'FAILED')}>{t('qa.st_fail')}</button>}
                {row.status !== 'OPEN' && <button className="btn btn-secondary" disabled={busy === row.id} onClick={() => transition(row, 'OPEN')}>{t('qa.btn_reopen')}</button>}
              </div></td>
            </tr>;
          })}
          {!loading && !items.length && <tr><td colSpan={7} className="empty">{t('qa.empty')}</td></tr>}
        </tbody>
      </table>
      {truncated && (
        <div className="meta" style={{ marginTop: 8, color: 'var(--c-pending)' }}>
          Đang hiện {items.length} / {serverTotal} hạng mục nghiệm thu.
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
          unitKey="unit.work_item"
        />
      )}</div></div>
    </div>
  );
}
