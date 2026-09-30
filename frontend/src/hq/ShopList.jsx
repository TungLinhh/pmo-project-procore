// Shopdrawing List (mục 6.2)
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { projects, shop as shopApi, exportApi, preferDemoProject } from '../api/index.js';
import { getToken } from '../api/index.js';
import { ICON } from '../icons.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';
import { usePagination } from '../hooks/usePagination.js';
import TablePagination from '../components/TablePagination.jsx';
import { toast } from '../components/Toast.jsx';
import { t, th, useLang } from '../i18n/index.js';
import Modal from '../components/Modal.jsx';

export default function ShopList() {
  useLang(); // re-render table headers on VI/EN toggle
  const [params] = useSearchParams();
  const projectId = params.get('project');
  const [, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(projectId);
  const [search, setSearch] = useState('');
  const [zone, setZone] = useState('');
  const [items, setItems] = useState([]);
  const [serverTotal, setServerTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [asBuiltTarget, setAsBuiltTarget] = useState(null);
  const [asBuiltNote, setAsBuiltNote] = useState('');
  const [savingAsBuilt, setSavingAsBuilt] = useState(false);
  // U5: deep-link từ chuông (?drawing=<id|code>) — highlight + cuộn tới dòng.
  const focusRef = params.get('drawing');
  const scrolled = useRef(false);
  useEffect(() => { scrolled.current = false; }, [selectedProject]);

  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      if (!selectedProject) setSelectedProject(preferDemoProject(list));
    }).catch((e) => toast.error(t('shop.err_projects') + e.message));
  }, []);

  // One fetch per project; filter in memory (like Materials) — no request-per-keystroke race.
  // Stale-response guard: a slow earlier project must never overwrite the current one.
  useEffect(() => {
    if (!selectedProject) return;
    let live = true;
    setLoading(true);
    setSearch('');
    setZone('');
    shopApi.drawingsPage(selectedProject)
      .then(({ rows, total: t }) => { if (live) { setItems(rows); setServerTotal(t); } })
      .catch((e) => { if (live) { setItems([]); setServerTotal(null); toast.error(t('shop.err_load') + e.message); } })
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

  // Phân trang ở trình duyệt: ô tìm kiếm lọc cả trạng thái dẫn xuất
  // (`stateOf`) — thứ SQL không dễ tính, nên đưa lên server sẽ phải nhân bản luật
  // nghiệp vụ vào hai nơi.
  const page = usePagination(filtered);
  const truncated = serverTotal != null && serverTotal > items.length;

  // Display state derived from the canonical status + level responses.
  function stateOf(item) {
    if (item.status === 'REJECTED') return { code: 'REJECTED', label: 'REJECTED' };
    if (item.approval_date || item.status === 'APPROVED') return { code: 'APPROVED', label: 'APPROVED' };
    // 'R' is unreachable: the server only accepts P/F/C, so a drawing that was
    // sent back showed "REVIEW" (i.e. still under review) when it was in fact
    // rejected. Judge on the response value, not a code nobody can write.
    if (item.bql_l1_response === 'F' || item.bql_l2_response === 'F') return { code: 'REVISION', label: 'REVISION' };
    if (item.bql_l1_response) return { code: 'REVIEW', label: 'REVIEW' };
    return { code: 'PENDING', label: 'PENDING' };
  }

  async function saveAsBuilt() {
    if (!asBuiltTarget || savingAsBuilt) return;
    setSavingAsBuilt(true);
    try {
      const updated = await shopApi.asBuilt(asBuiltTarget.id, asBuiltNote.trim());
      setItems((prev) => prev.map((item) => (item.id === updated.id
        ? { ...item, ...updated, zone_code: updated.zone_code ?? item.zone_code, work_item_code: updated.work_item_code ?? item.work_item_code }
        : item)));
      setAsBuiltTarget(null);
      setAsBuiltNote('');
      toast.success(`Đã ghi nhận as-built ${updated.drawing_code}`);
    } catch (e) { toast.error(t('shop.err_save_asbuilt') + e.message); }
    finally { setSavingAsBuilt(false); }
  }

  // Stats follow the filtered rows (per user decision).
  const total = filtered.length;
  const approved = filtered.filter(i => stateOf(i).code === 'APPROVED').length;
  const inReview = filtered.filter(i => stateOf(i).code === 'REVIEW').length;
  const inRevision = filtered.filter(i => ['REVISION', 'REJECTED'].includes(stateOf(i).code)).length;
  const pending = total - approved - inReview - inRevision;
  const overdue = filtered.filter(i => !i.approval_date && i.planned_submit_date && new Date(i.planned_submit_date) < new Date()).length;
  const approvalPct = total > 0 ? Math.round(approved / total * 100) : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.shop')}</h1>
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
          }}><ICON.download size={13} />{t('g.export')}</button>}
        </div>
      </div>

      <div className="filter-bar">
        <label>{t('g.project')}</label>
        <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder={t('shop.pick_project_ph')} />
        <label>{t('g.zone')}</label>
        <select value={zone} onChange={e => setZone(e.target.value)}>
          <option value="">{t('g.all')}</option>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <input data-testid="shop-search" placeholder={t('sl.ph_search_code_name')} value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
      </div>

      <div className="stat-strip">
        <div className="stat"><div className="label">{t('g.total')}</div><div className="value">{total}</div></div>
        <div className="stat"><div className="label">{t('g.approved')}</div><div className="value" style={{ color: 'var(--c-on-track)' }}>{approved}</div></div>
        <div className="stat"><div className="label">{t('sl.in_review')}</div><div className="value" style={{ color: 'var(--c-review)' }}>{inReview}</div></div>
        <div className="stat"><div className="label">{t('g.revision')}</div><div className="value" style={{ color: 'var(--c-behind)' }}>{inRevision}</div></div>
        <div className="stat"><div className="label">{t('g.pending')}</div><div className="value">{pending}</div></div>
        <div className="stat"><div className="label">{t('g.overdue')}</div><div className="value" style={{ color: 'var(--c-behind)' }}>{overdue}</div></div>
        <div className="stat"><div className="label">Approval %</div><div className="value">{approvalPct}%</div></div>
      </div>

      <div className="data-table">
        <div className="data-table-body">
          <table>
            <thead>
              <tr>
                <th>{th("Khu vực")}</th>
                <th>{th("Mã")}</th>
                <th>{th("Tên")}</th>
                <th>{th("Trạng thái")}</th>
                <th>{th("Kế hoạch")}</th>
                <th>{th("Thực tế")}</th>
                <th>{th("Phê duyệt")}</th>
                <th>{th("L1")}</th>
                <th>{th("L2")}</th>
                <th>{th("As-built")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan="10" className="empty">{t('g.loading')}</td></tr> :
               filtered.length === 0 ? <tr><td colSpan="10" className="empty">{t('shop.empty')}</td></tr> :
               page.visible.map(item => {
                  const s = stateOf(item);
                  // Rows stay neutral (like Progress at a glance): status lives in the badge only.
                  const isOverdue = !item.approval_date && item.planned_submit_date && new Date(item.planned_submit_date) < new Date();
                  const isFocus = !!focusRef && (String(item.id) === focusRef || item.drawing_code === focusRef);
                  return (
                    <tr key={item.id}
                      style={isFocus ? { outline: '2px solid var(--c-accent)', outlineOffset: -2 } : undefined}
                      ref={(el) => { if (el && isFocus && !scrolled.current) { scrolled.current = true; try { el.scrollIntoView({ block: 'center' }); } catch {} } }}
                    >
                      <td><code>{item.zone_code || '—'}</code></td>
                     <td><code>{item.drawing_code}</code></td>
                     <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name_vi || '—'}</td>
                     <td><span className={`badge workflow-${s.code}`}>{s.label}</span></td>
                    <td style={{ fontSize: 12 }}>{(item.planned_submit_date || '').slice(0, 10) || '—'}</td>
                    <td style={{ fontSize: 12 }}>{(item.actual_submit_date || '').slice(0, 10) || '—'}</td>
                     <td>{isOverdue ? <span className="badge health-OVERDUE">{t('sl.overdue')}</span> : (item.approval_date || '—')}</td>
                     <td>{item.bql_l1_response || '—'}</td>
                     <td>{item.bql_l2_response || '—'}</td>
                     <td>{item.as_built_status === 'RECORDED'
                       ? <span className="badge workflow-APPROVED">{String(item.as_built_at || '').slice(0, 10)}</span>
                       : item.status === 'APPROVED'
                         ? <button className="btn btn-secondary btn-sm" onClick={() => setAsBuiltTarget(item)}>{t('shop.btn_record')}</button>
                         : '—'}</td>
                   </tr>
                 );
               })}
            </tbody>
          </table>
          {truncated && (
            <div className="meta" style={{ marginTop: 8, color: 'var(--c-pending)' }}>
              Đang hiện {items.length} / {serverTotal} bản vẽ. Dùng bộ lọc zone hoặc ô tìm
              kiếm để thu hẹp, hoặc chọn 100 dòng mỗi trang.
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
              unitKey="unit.drawing"
            />
          )}
        </div>
      </div>
      {asBuiltTarget && (
        <Modal onClose={() => !savingAsBuilt && setAsBuiltTarget(null)} maxWidth={520}>
          <h3>As-built · {asBuiltTarget.drawing_code}</h3>
          <p className="meta">{t('shop.asbuilt_note')}</p>
          <textarea value={asBuiltNote} onChange={(e) => setAsBuiltNote(e.target.value)} placeholder={t('shop.asbuilt_ph')} style={{ width: '100%', minHeight: 100 }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button className="btn btn-secondary" onClick={() => setAsBuiltTarget(null)} disabled={savingAsBuilt}>{t('shop.btn_cancel')}</button>
            <button className="btn" onClick={saveAsBuilt} disabled={savingAsBuilt}>{savingAsBuilt ? t('shop.busy_saving') : t('shop.btn_record_asbuilt')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
