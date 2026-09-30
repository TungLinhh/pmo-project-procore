// UI-019: Approval Center - inline expand + confirm + same API/logic
// - Reject ở View Details dùng cùng transition API với Reject ở list
// - Approve/Reject đều có confirm trước khi gọi API
// - View Details = inline expand ngay dưới dòng được chọn
import { useEffect, useState } from 'react';
import { t, useLang } from '../i18n/index.js';
import { projects, shopApi, materials, request, requestPage, preferDemoProject } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import TablePagination from '../components/TablePagination.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';
import Modal from '../components/Modal.jsx';

export default function Approval() {
  useLang(); // tiêu đề trang đổi theo nút [VI|EN]
  const [shopItems, setShopItems] = useState([]);
  const [submittalItems, setSubmittalItems] = useState([]);
  const [paymentItems, setPaymentItems] = useState([]);
  // Tổng server báo cho từng loại: màn này lấy `limit=20` nên phải nói rõ
  // còn bao nhiêu, nếu không 20/47 trông y hệt 20/20.
  const [counts, setCounts] = useState({ shop: null, submittal: null, payment: null });
  // Trang hiện tại của từng loại. Ba danh sách nằm cạnh nhau nên dùng ba
  // chỉ số riêng thay vì một chỉ số chung.
  const [pages, setPages] = useState({ shop: 1, submittal: 1, payment: 1 });
  const [, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState(null); // { type, id, label, reason, onSubmit }
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState(null);
  // Single source of truth for the in-flight key. It used to be spelled out
  // at five call sites with two of them disagreeing with the render-side
  // check, which silently disabled the double-click guard.
  const busyKey = (kind, id) => `${kind}-${id}`;
  const [expandedId, setExpandedId] = useState(null);  // {type, id} or null
  const [detailCache, setDetailCache] = useState({});  // cache fetch details
  const [detailLoading, setDetailLoading] = useState(false);
  const confirm = useConfirm();

  async function load(projectId) {
    const pid = projectId ?? selectedProject;
    if (!pid) return;
    setLoading(true);
    try {
      // Shop drawings awaiting approval (SUBMITTED = sent for approval in this workflow)
      const PAGE = 20;
      const off = (n) => (n - 1) * PAGE;
      // `requestPage` đọc header `X-Total-Count`; `request` bỏ header nên không
      // dùng cho ba lời gọi này nữa.
      const [shopPage, subResp, subAll, payPage] = await Promise.all([
        requestPage(`/shop-drawings?project_id=${pid}&status=SUBMITTED&limit=${PAGE}&offset=${off(pages.shop)}`),
        materials.overdue(pid),
        requestPage(`/material-submittals?project_id=${pid}&status=SUBMITTED&limit=${PAGE}&offset=${off(pages.submittal)}`),
        requestPage(`/projects/${pid}/payment-requests?status=PENDING&limit=${PAGE}&offset=${off(pages.payment)}`),
      ]);
      setShopItems(shopPage.rows);
      // `subAll` là kết quả của `requestPage` nên là `{rows,total}`, KHÔNG phải mảng.
      // `Array.isArray({rows,total})` luôn false ⇒ toàn bộ submittal đang
      // `SUBMITTED` biến mất khỏi danh sách, trong khi `setCounts` lại lấy
      // `subAll.total` (đầy đủ) — nên số đếm và danh sách mâu thuẫn: báo còn 12
      // việc mà hiện ra 0 dòng. Đây là hợp đồng `requestPage`; `ShopList.jsx` và
      // `QaInspections.jsx` destructure `{rows,total}` đúng.
      const allSub = [...(Array.isArray(subResp) ? subResp : []), ...(subAll?.rows || [])];
      const seen = new Set();
      setSubmittalItems(allSub.filter(x => { if (seen.has(x.id)) return false; seen.add(x.id); return true; }));

      setPaymentItems(payPage.rows);
      setCounts({
        shop: shopPage.total,
        submittal: subAll.total,
        payment: payPage.total,
      });
    } catch (e) {
      toast.error(t('ap.err_load') + e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      setSelectedProject(preferDemoProject(list));
    }).catch(() => setLoading(false));
  }, []);
  // Đổi trang thì tải lại. `pages` là object nên so theo từng khoá, nếu không
  // effect chạy mỗi lần render và bắn vô hạn request.
  useEffect(() => {
    if (selectedProject) load(selectedProject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, pages.shop, pages.submittal, pages.payment]);

  // ===== Approve handlers - dùng chung confirmApprove =====
  // Shop approve is chain-aware: with a multi-level chain, approve the
  // current level (backend 422s the single-step shortcut); otherwise legacy.
  async function approveShop(id) {
    const ok = await confirm({
      title: t('ap.confirm_approve'),
      message: `Bạn có chắc chắn muốn DUYỆT shop drawing #${id}?`,
      confirmText: t('ap.btn_approve'),
      confirmStyle: 'primary',
    });
    if (!ok) return;
    setBusyId(busyKey('shop', id));
    try {
      const state = await shopApi.approvalState(id).catch(() => null);
      if (state?.chain && state.chain.length > 1 && state.current_level) {
        const r = await shopApi.approveLevel(id, state.current_level, 'P', '');
        toast.success(`Shop drawing #${id} đã qua L${state.current_level}${r.status === 'APPROVED' ? ' (APPROVED)' : ''}`);
        if (r.status === 'APPROVED') setShopItems(arr => arr.filter(x => x.id !== id));
        else toggleExpandRefresh(id);
      } else {
        await shopApi.transition(id, 'APPROVED', '');
        toast.success(`Shop drawing #${id} ${t('ap.state_approved')}`);
        setShopItems(arr => arr.filter(x => x.id !== id));
      }
      setExpandedId(null);
    } catch (e) {
      toast.error(t('ap.err_approve') + e.message);
    } finally { setBusyId(null); }
  }
  // Refresh the expanded detail after a mid-chain level approval.
  async function toggleExpandRefresh(id) {
    const key = `shop-${id}`;
    const r = await request(`/shop-drawings/${id}/approval-state`).catch(() => null);
    if (r) setDetailCache(prev => ({ ...prev, [key]: r }));
  }
  async function approveSubmittal(id) {
    const ok = await confirm({
      title: t('ap.confirm_approve'),
      message: `Bạn có chắc chắn muốn DUYỆT material submittal #${id}?`,
      confirmText: t('ap.btn_approve'),
      confirmStyle: 'primary',
    });
    if (!ok) return;
    setBusyId(busyKey('submittal', id));
    try {
      await request(`/material-submittals/${id}/approve`, { method: 'POST' });
      toast.success(`Material submittal #${id} ${t('ap.state_approved')}`);
      setSubmittalItems(arr => arr.filter(x => x.id !== id));
      setExpandedId(null);
    } catch (e) {
      toast.error(t('ap.err_approve') + e.message);
    } finally { setBusyId(null); }
  }
  async function updatePhysicalSample(id, status) {
    setBusyId(busyKey('sample', id));
    try {
      const updated = await materials.physicalSample(id, status, status === 'REJECTED' ? t('ap.sample_fail_site') : t('ap.sample_pass'));
      setSubmittalItems((rows) => rows.map((row) => row.id === id ? updated : row));
      toast.success(status === 'ACCEPTED' ? t('ap.toast_sample_pass') : t('ap.toast_sample_fail'));
    } catch (e) { toast.error(t('ap.err_sample') + e.message); }
    finally { setBusyId(null); }
  }

  async function approvePayment(id) {
    const ok = await confirm({
      title: t('ap.confirm_approve'),
      message: `Bạn có chắc chắn muốn DUYỆT payment request #${id}?`,
      confirmText: t('ap.btn_approve'),
      confirmStyle: 'primary',
    });
    if (!ok) return;
    setBusyId(busyKey('payment', id));
    try {
      await request(`/payment-requests/${id}`, { method: 'PUT', body: { status: 'APPROVED' } });
      toast.success(`Payment request #${id} ${t('ap.state_approved')}`);
      setPaymentItems(arr => arr.filter(x => x.id !== id));
      setExpandedId(null);
    } catch (e) {
      toast.error(t('ap.err_approve') + e.message);
    } finally { setBusyId(null); }
  }

  // ===== Reject handlers - dùng modal reason + same API as list view =====
  function openReject(type, id, label) {
    setRejectModal({ type, id, label });
    setRejectReason('');
  }
  async function submitReject() {
    if (!rejectReason.trim()) {
      toast.error(t('ap.need_reject_reason'));
      return;
    }
    const { type, id } = rejectModal;
    setBusyId(busyKey(type, id));
    try {
      // Dùng đúng cùng API logic với Reject ở list
      if (type === 'shop') {
        await shopApi.transition(id, 'REJECTED', rejectReason);
        toast.success(`Shop drawing #${id} ${t('ap.state_rejected')}`);
        setShopItems(arr => arr.filter(x => x.id !== id));
      } else if (type === 'submittal') {
        await materials.reject(id, rejectReason);
        toast.success(`Submittal #${id} ${t('ap.state_rejected')}`);
        setSubmittalItems(arr => arr.filter(x => x.id !== id));
      } else if (type === 'payment') {
        await request(`/payment-requests/${id}`, { method: 'PUT', body: { status: 'REJECTED', notes: rejectReason } });
        toast.success('Payment #' + id + t('ap.suffix_rejected'));
        setPaymentItems(arr => arr.filter(x => x.id !== id));
      }
      setRejectModal(null);
      setExpandedId(null);
    } catch (e) {
      toast.error(t('ap.err_reject') + e.message);
    } finally { setBusyId(null); }
  }

  // ===== Inline expand: fetch detail ngay dưới dòng =====
  async function toggleExpand(type, id) {
    if (expandedId && expandedId.type === type && expandedId.id === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId({ type, id });
    const key = `${type}-${id}`;
    if (detailCache[key]) return;  // already loaded
    setDetailLoading(true);
    try {
      let url = null;
      if (type === 'shop') url = `/shop-drawings/${id}`;
      else if (type === 'submittal') url = `/material-submittals/${id}`;
      else if (type === 'payment') url = `/payment-requests/${id}`;
      if (!url) return;
      const r = await request(url);
      setDetailCache(prev => ({ ...prev, [key]: r }));
    } catch (e) {
      setDetailCache(prev => ({ ...prev, [key]: { error: e.message } }));
    } finally {
      setDetailLoading(false);
    }
  }

  // Reject from inline detail - dùng cùng openReject
  function rejectFromDetail(type, id, label) {
    openReject(type, id, label);
  }

  const totalPending = shopItems.length + submittalItems.length + paymentItems.length;

  // Render helper cho 1 item
  function renderItem(type, i) {
    const isExpanded = expandedId && expandedId.type === type && expandedId.id === i.id;
    const key = `${type}-${i.id}`;
    const detail = detailCache[key];
    const label = i.drawing_code || i.submittal_code || i.request_no || `#${i.id}`;
    return (
      <div key={i.id} style={{ borderBottom: '1px solid var(--c-border)' }}>
        <div style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
              <span className="badge" style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)' }}>
                {type === 'shop' ? t('g.shop') : type === 'submittal' ? t('g.submittal') : t('g.payment')}
              </span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
              <span className={`badge workflow-${i.status || (type === 'shop' ? 'REVIEW' : type === 'submittal' ? 'SUBMITTED' : 'PENDING')}`}>
                {i.status || (type === 'shop' ? 'REVIEW' : type === 'submittal' ? 'SUBMITTED' : 'PENDING')}
              </span>
            </div>
            <div style={{ color: 'var(--c-text-2)', fontSize: 12 }}>
              {type === 'shop' && <>Submitted: {i.submitted_by || '—'} · Revision: {i.revision || 0}</>}
              {type === 'submittal' && <>Revision: {i.revision_number || 0} · SLA: {i.sla_deadline || 'N/A'} {i.sla_deadline && new Date(i.sla_deadline) < new Date() ? '⚠️ OVERDUE' : ''} · Mẫu: {i.physical_sample_status || 'PENDING'}</>}
              {type === 'payment' && <>Amount: {(i.amount || 0).toLocaleString()} · Due: {i.due_date || 'N/A'}</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {type === 'submittal' && i.physical_sample_status !== 'ACCEPTED' && <>
              <button className="btn btn-secondary" onClick={() => updatePhysicalSample(i.id, 'ACCEPTED')} disabled={busyId === busyKey('sample', i.id)}>{t('ap.sample_pass')}</button>
              <button className="btn btn-secondary" onClick={() => updatePhysicalSample(i.id, 'REJECTED')} disabled={busyId === busyKey('sample', i.id)}>{t('ap.sample_fail')}</button>
            </>}
            <button className="btn" onClick={() => type === 'shop' ? approveShop(i.id) : type === 'submittal' ? approveSubmittal(i.id) : approvePayment(i.id)}
              disabled={busyId === busyKey(type, i.id) || (type === 'submittal' && i.physical_sample_status !== 'ACCEPTED')}>
              <ICON.check size={12} />{busyId === busyKey(type, i.id) ? '…' : t('g.approve')}
            </button>
            <button className="btn btn-secondary" onClick={() => openReject(type, i.id, label)}>
              <ICON.x size={12} />{t('g.reject')}
            </button>
            <button className="btn btn-secondary" onClick={() => toggleExpand(type, i.id)}>
              <ICON.eye size={12} />{isExpanded ? t('g.hide') : t('g.view_details')}
            </button>
          </div>
        </div>
        {/* Inline expand: hiển thị ngay dưới dòng */}
        {isExpanded && (
          <div style={{ padding: '0 14px 14px 14px', background: 'var(--c-surface-2)', borderTop: '1px solid var(--c-border)' }}>
            <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--c-text-2)' }}>
              {detailLoading && !detail ? t('ap.busy_detail') :
               detail?.error ? <span style={{ color: 'var(--c-critical)' }}>Lỗi: {detail.error}</span> :
               !detail ? t('ap.empty_detail') :
               <pre style={{ background: 'var(--c-surface)', padding: 10, borderRadius: 4, fontSize: 11, maxHeight: 300, overflow: 'auto', margin: 0 }}>
                 {JSON.stringify(detail, null, 2)}
               </pre>}
            </div>
            {/* Actions in expanded view - gọi cùng logic với list */}
            <div style={{ display: 'flex', gap: 6, paddingBottom: 12, borderTop: '1px dashed var(--c-border)', paddingTop: 10 }}>
              <button className="btn" onClick={() => type === 'shop' ? approveShop(i.id) : type === 'submittal' ? approveSubmittal(i.id) : approvePayment(i.id)}
                disabled={busyId === busyKey(type, i.id) || (type === 'submittal' && i.physical_sample_status !== 'ACCEPTED')}>
                <ICON.check size={12} />{busyId === busyKey(type, i.id) ? '...' : t('ap.btn_approve_detail')}
              </button>
              <button className="btn btn-secondary" onClick={() => rejectFromDetail(type, i.id, label)}>
                <ICON.x size={12} />{t('ap.btn_reject_detail')}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('nav.approval')}</h1>
          <div className="meta">{totalPending} items chờ duyệt {loading ? t('ap.busy_loading_paren') : ''}</div>
        </div>
        <div className="page-header-right">
          <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder={t('ap.pick_project_ph')} />
          <button className="btn btn-secondary" onClick={() => load()} disabled={loading}><ICON.refresh size={12} />{t('g.refresh')}</button>
        </div>
      </div>

      <div className="stat-strip">
        <div className="stat"><div className="label">{t('g.pending')}</div><div className="value" style={{ color: 'var(--c-watch)' }}>{totalPending}</div></div>
        <div className="stat"><div className="label">{t('ap.shop_review')}</div><div className="value">{shopItems.length}</div></div>
        <div className="stat"><div className="label">{t('ap.material_submittal')}</div><div className="value">{submittalItems.length}</div></div>
        <div className="stat"><div className="label">{t('ap.payment_request')}</div><div className="value">{paymentItems.length}</div></div>
      </div>

      {/* Section: Shop drawings */}
      <h2 style={{ fontSize: 14, marginTop: 20, marginBottom: 8 }}>Shop Drawing (REVIEW → APPROVE/REJECT)</h2>
      {(counts.shop ?? 0) > 0 && (
        <TablePagination
          page={pages.shop} pageCount={Math.max(1, Math.ceil(counts.shop / 20))} total={counts.shop}
          pageSize={20} unitKey="unit.drawing"
          onPageChange={(n) => setPages((p) => ({ ...p, shop: n }))}
        />
      )}
      <div className="data-table">
        {loading ? <div className="empty">{t('ap.busy_loading')}</div> :
         shopItems.length === 0 ? <div className="empty">{t('ap.empty_shop')}</div> :
         shopItems.map(i => renderItem('shop', i))}
      </div>

      {/* Section: Material submittals */}
      <h2 style={{ fontSize: 14, marginTop: 20, marginBottom: 8 }}>Material Submittal (SUBMITTED → APPROVE/REJECT)</h2>
      {(counts.submittal ?? 0) > 0 && (
        <TablePagination
          page={pages.submittal} pageCount={Math.max(1, Math.ceil(counts.submittal / 20))} total={counts.submittal}
          pageSize={20} unitKey="unit.material"
          onPageChange={(n) => setPages((p) => ({ ...p, submittal: n }))}
        />
      )}
      <div className="data-table">
        {loading ? <div className="empty">{t('ap.busy_loading')}</div> :
         submittalItems.length === 0 ? <div className="empty">{t('ap.empty_submittal')}</div> :
         submittalItems.map(i => renderItem('submittal', i))}
      </div>

      {/* Section: Payment requests */}
      <h2 style={{ fontSize: 14, marginTop: 20, marginBottom: 8 }}>Payment Request (PENDING → APPROVE/REJECT)</h2>
      {(counts.payment ?? 0) > 0 && (
        <TablePagination
          page={pages.payment} pageCount={Math.max(1, Math.ceil(counts.payment / 20))} total={counts.payment}
          pageSize={20} unitKey="unit.payment"
          onPageChange={(n) => setPages((p) => ({ ...p, payment: n }))}
        />
      )}
      <div className="data-table">
        {loading ? <div className="empty">{t('ap.busy_loading')}</div> :
         paymentItems.length === 0 ? <div className="empty">{t('ap.empty_payment')}</div> :
         paymentItems.map(i => renderItem('payment', i))}
      </div>

      {totalPending === 0 && !loading && (
        <div className="empty" style={{ marginTop: 30, padding: 40, textAlign: 'center', color: 'var(--c-text-2)' }}>{t('ap.toast_all_done')}</div>
      )}

      {/* Reject modal (vẫn dùng modal vì cần nhập reason) */}
      {rejectModal && (
        <Modal onClose={() => setRejectModal(null)} maxWidth={520}>
          <h3>Reject: {rejectModal.label}</h3>
          <p className="meta">{t('ap.reject_reason_hint')}</p>
          <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4} style={{ width: '100%', padding: 8, border: '1px solid var(--c-border)', borderRadius: 6, fontFamily: 'inherit' }} placeholder={t('ap.reject_ph')} />
          <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setRejectModal(null)}>{t('ap.btn_cancel')}</button>
            <button className="btn" style={{ background: 'var(--c-critical)', color: '#fff' }} onClick={submitReject} disabled={busyId}>
              {busyId ? t('ap.busy_working') : t('ap.confirm_reject')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
