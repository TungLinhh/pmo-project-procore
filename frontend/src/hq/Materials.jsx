// Material list page (Mục 6.3) — submittal workflow: DRAFT → SUBMITTED → APPROVED/REJECTED (+SLA).
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { projects, materials, getUser, preferDemoProject } from '../api/index.js';
import { ICON } from '../icons.jsx';
import PieChart from '../components/PieChart.jsx';
import PieTooltip from '../components/PieTooltip.jsx';
import { toast } from '../components/Toast.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';
import TablePagination from '../components/TablePagination.jsx';
import { t, th, useLang } from '../i18n/index.js';
import Modal from '../components/Modal.jsx';

// Hàm chứ không phải hằng ở cấp module: `t()` gọi ở cấp module được tính MỘT LẦN
// lúc nạp, nên bấm [VI|EN] sau đó nhãn vẫn giữ ngôn ngữ cũ. Hàm thì tính lại
// mỗi lần render, và `useLang()` trong component ép render lại.
function lifecycleLabel(status) {
  return {
    REQUESTED: t('mat.st_requested'),
    MSB_PREPARING: t('mat.st_msb'),
    MSB_APPROVED: t('mat.st_msb_approved'),
    PO_ISSUED: t('mat.st_po'),
    PRODUCTION: t('mat.st_production'),
    IN_TRANSIT: t('mat.st_delivery'),
    DELIVERED: t('mat.st_received'),
    ACCEPTED: t('mat.st_accepted'),
  }[status];
}

export default function Materials() {
  useLang(); // re-render table headers on VI/EN toggle
  const [params] = useSearchParams();
  const [, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(params.get('project'));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [hovered, setHovered] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ material_code: '', name_vi: '', name_en: '', zone_id: '', progress_pct: 0 });
  const [addBusy, setAddBusy] = useState(false);
  const me = getUser() || {};
  const canAdvance = ['admin', 'procurement', 'site', 'pm'].includes(String(me.role || '').toLowerCase());
  const canAccept = ['admin', 'site'].includes(String(me.role || '').toLowerCase());

  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      if (!selectedProject) setSelectedProject(preferDemoProject(list));
    }).catch((e) => toast.error(t('mat.err_projects') + e.message));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    materials.list(selectedProject, 500)
      .then((rows) => setItems(Array.isArray(rows) ? rows : []))
      .catch((e) => { setItems([]); toast.error(t('mat.err_load') + e.message); })
      .finally(() => setLoading(false));
  }, [selectedProject]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const status = String(item.procurement_status || 'REQUESTED').toUpperCase();
      if (statusFilter && status !== statusFilter) return false;
      if (!query) return true;
      return [item.material_code, item.name_vi, item.name_en, item.zone_code, status]
        .filter(Boolean).join(' ').toLowerCase().includes(query);
    });
  }, [items, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => {
    setPage(1);
  }, [selectedProject, search, statusFilter]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const nextStatus = (material) => {
    const status = String(material.procurement_status || 'REQUESTED').toUpperCase();
    const next = {
      REQUESTED: ['MSB_PREPARING', t('mat.btn_send_msb2')],
      MSB_PREPARING: ['MSB_APPROVED', t('mat.btn_send_msb')],
      MSB_APPROVED: ['PO_ISSUED', t('mat.btn_po')],
      PO_ISSUED: ['IN_TRANSIT', t('mat.st_delivery_start')],
      PRODUCTION: ['IN_TRANSIT', t('mat.btn_deliver')],
      IN_TRANSIT: ['DELIVERED', t('mat.btn_receive')],
      DELIVERED: ['ACCEPTED', t('mat.btn_accept')],
    }[status];
    if (!next || (status === 'DELIVERED' && !canAccept)) return null;
    return { to: next[0], label: next[1] };
  };
  async function advanceMaterial(material) {
    const next = nextStatus(material);
    if (!next) return;
    try {
      const updated = await materials.lifecycle(material.id, {
        to_status: next.to,
        expected_status: material.procurement_status || 'REQUESTED',
        ...(next.to === 'PO_ISSUED' ? { po_number: material.po_number || `PO-${material.material_code}` } : {}),
        ...(next.to === 'ACCEPTED' ? { acceptance_result: 'PASS' } : {}),
      });
      setItems((rows) => rows.map((row) => row.id === updated.id ? updated : row));
      toast.success(`${material.material_code}: ${next.label}`);
    } catch (error) {
      toast.error(`Không chuyển được vật tư: ${error.message}`);
    }
  }

  // Group by name prefix for pie
  const byCat = {};
  items.forEach(m => {
    const name = m.name_vi || m.material_code || t('g.other');
    const first = name.split(/\s+/)[0].toUpperCase().slice(0, 16);
    byCat[first] = (byCat[first] || 0) + 1;
  });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const colors = ['#1e3a5f', '#2c5282', '#2563eb', '#7c3aed', '#b45309', '#15803d'];
  const pieData = cats.map(([label, value], i) => ({
    label, value, color: colors[i % colors.length],
    breakdown: [{ k: t('mat.lbl_qty'), v: value }, { k: t('mat.lbl_ratio'), v: items.length > 0 ? `${Math.round(value / items.length * 100)}%` : '0%' }],
  }));

  const accepted = items.filter(m => ['ACCEPTED', 'DELIVERED'].includes(String(m.procurement_status || '').toUpperCase())).length;
  const inTransit = items.filter(m => ['IN_TRANSIT', 'PRODUCTION', 'PO_ISSUED'].includes(String(m.procurement_status || '').toUpperCase())).length;
  const acceptedPct = items.length > 0 ? Math.round(accepted / items.length * 100) : null;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.materials')}</h1>
          <div className="meta">{t('mat.counts', { items: items.length, cats: cats.length })}</div>
        </div>
        <div className="page-header-right">
          <button className="btn" onClick={() => setShowAddModal(true)}><ICON.plus size={13} />{t('mat.btn_add')}</button>
        </div>
      </div>

      <div className="filter-bar">
        <label>{t('mat.lbl_project')}</label>
        <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder={t('mat.pick_project_ph')} />
        <label>{t('mat.lbl_status')}</label>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="">{t('mat.lbl_all')}</option>
          {Object.entries({ REQUESTED: 1, MSB_PREPARING: 1, MSB_APPROVED: 1, PO_ISSUED: 1, PRODUCTION: 1, IN_TRANSIT: 1, DELIVERED: 1, ACCEPTED: 1 })
            .map(([value]) => <option key={value} value={value}>{lifecycleLabel(value)}</option>)}
        </select>
        <input placeholder={t('mat.search_ph')} value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
      </div>

      <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi-card on-track">
          <div className="label">{t('mat.lbl_total')}</div>
          <div className="value">{items.length}</div>
          <div className="sub">{t('mat.stat_total')}</div>
        </div>
        <div className="kpi-card on-track">
          <div className="label">{t('mat.st_received_accepted')}</div>
          <div className="value">{accepted}</div>
          <div className="sub">{acceptedPct == null ? t('mat.empty') : `${acceptedPct}% vật tư`}</div>
        </div>
        <div className="kpi-card watch">
          <div className="label">{t('mat.st_in_transit_caps')}</div>
          <div className="value">{inTransit}</div>
          <div className="sub">{t('mat.f_status')}</div>
        </div>
        <div
          className="kpi-card watch"
          onMouseEnter={() => setHovered('cats')}
          onMouseLeave={() => setHovered(null)}
          style={{ position: 'relative' }}
        >
          <div className="label">{t('mat.lbl_by_group')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {cats.length > 0 ? (
              <div className="pie-wrap">
                <PieChart data={pieData} size={64} thickness={14} centerText={`${cats.length}`} centerSub={t('mat.suffix_group')} />
                {hovered === 'cats' && <PieTooltip data={pieData} />}
              </div>
            ) : <div style={{ color: 'var(--c-text-3)' }}>—</div>}
            <div style={{ fontSize: 11.5, color: 'var(--c-text-2)' }}>
              {cats.slice(0, 3).map(([k, v], i) => (
                <div key={k}><span style={{ display: 'inline-block', width: 8, height: 8, background: colors[i], marginRight: 4, borderRadius: 2 }} />{k}: {v}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="data-table">
        <div className="data-table-body">
          {loading ? <div className="empty">{t('mat.busy_loading')}</div> :
           filtered.length === 0 ? <div className="empty">{t('mat.empty_filtered')}</div> :
           <table>
             <thead>
               <tr>
                 <th>{th("Mã")}</th>
                 <th>{th("Tên (VI)")}</th>
                 <th>{th("Tên (EN)")}</th>
                 <th>{th("Khu vực")}</th>
                 <th className="num">{th("Tiến độ nhập")}</th>
                  <th>{th("Vòng đời")}</th>
                  <th>{th("Thao tác")}</th>
               </tr>
             </thead>
             <tbody>
               {visibleItems.map(m => (
                 <tr key={m.id}>
                   <td><code>{m.material_code}</code></td>
                   <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name_vi || '—'}</td>
                   <td style={{ color: 'var(--c-text-2)', fontSize: 12 }}>{m.name_en || '—'}</td>
                   <td>{m.zone_code ? <code>{m.zone_code}</code> : (m.zone_id ? <code>#{m.zone_id}</code> : '—')}</td>
                   <td className="num">
                     <div className="cell-bar" style={{ display: 'inline-flex', minWidth: 100 }}>
                       <div className="bar"><div className="fill" style={{ width: `${(m.progress_pct || 0) * 100}%` }} /></div>
                       <span style={{ minWidth: 30 }}>{m.progress_pct ? Math.round(m.progress_pct * 100) : 0}%</span>
                     </div>
                   </td>
                   <td><span className="badge workflow-DRAFT">{lifecycleLabel(m.procurement_status) || m.procurement_status || t('mat.st_requested')}</span></td>
                   <td>{canAdvance && nextStatus(m) ? <button className="btn btn-secondary btn-sm" onClick={() => advanceMaterial(m)}>{nextStatus(m).label}</button> : '—'}</td>
                 </tr>
               ))}
             </tbody>
           </table>
          }
        </div>
        {!loading && <TablePagination page={safePage} pageCount={pageCount} total={filtered.length} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} unitKey="unit.material" />}
      </div>
      {/* Add material modal */}
      {showAddModal && (
        <Modal onClose={() => !addBusy && setShowAddModal(false)} maxWidth={480}>
          <h3>{t('mat.btn_add')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <label style={{ gridColumn: 'span 1' }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('mat.f_code')}</div>
              <input value={addForm.material_code} onChange={e => setAddForm({...addForm, material_code: e.target.value})} required style={{ width: '100%', padding: 6 }} placeholder="Vd: MEP-PLB-001" />
            </label>
            <label>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('mat.lbl_zone')}</div>
              <input type="number" value={addForm.zone_id} onChange={e => setAddForm({...addForm, zone_id: e.target.value})} style={{ width: '100%', padding: 6 }} />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('mat.f_name_vi')}</div>
              <input value={addForm.name_vi} onChange={e => setAddForm({...addForm, name_vi: e.target.value})} style={{ width: '100%', padding: 6 }} />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('mat.f_name_en')}</div>
              <input value={addForm.name_en} onChange={e => setAddForm({...addForm, name_en: e.target.value})} style={{ width: '100%', padding: 6 }} />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('mat.f_progress')}</div>
              {/* type="number" rejects a comma decimal: typing "50,5" leaves
                  value === '' and Number('') is 0, so the material was saved
                  at 0% with no warning. text+inputMode keeps the Vietnamese
                  format working and validates explicitly below. */}
              <input type="text" inputMode="decimal" placeholder={t('mat.qty_ph')}
                value={addForm.progress_pct}
                onChange={e => setAddForm({ ...addForm, progress_pct: e.target.value })}
                style={{ width: '100%', padding: 6 }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)} disabled={addBusy}>{t('mat.btn_cancel')}</button>
            <button className="btn" onClick={async () => {
              if (!addForm.material_code) { toast.error(t('mat.err_code_required')); return; }
              // Accept "50", "50,5", "50.5"; reject anything else instead of
              // Number('') silently turning a typo into 0%.
              const rawPct = String(addForm.progress_pct ?? '').trim().replace(',', '.');
              const pct = rawPct === '' ? 0 : Number(rawPct);
              if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
                toast.error(t('mat.err_progress_range')); return;
              }
              setAddBusy(true);
              try {
                const r = await materials.createUsage({ ...addForm, project_id: Number(selectedProject), progress_pct: pct / 100, zone_id: Number(addForm.zone_id) || null });
                if (r.error) throw new Error(r.error);
                toast.success(t('mat.toast_added') + addForm.material_code);
                setItems([r, ...items]);
                setShowAddModal(false);
                setAddForm({ material_code: '', name_vi: '', name_en: '', zone_id: '', progress_pct: 0 });
              } catch (e) {
                toast.error(t('mat.err_generic') + e.message);
              } finally { setAddBusy(false); }
            }} disabled={addBusy}>{addBusy ? t('mat.busy_saving') : t('mat.btn_save')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
