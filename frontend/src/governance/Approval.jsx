// UI-019: Approval Center - inline expand + confirm + same API/logic
// - Reject ở View Details dùng cùng transition API với Reject ở list
// - Approve/Reject đều có confirm trước khi gọi API
// - View Details = inline expand ngay dưới dòng được chọn
import { useEffect, useState } from 'react';
import { projects, shopApi, materials, getToken } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';
import { useConfirm } from '../components/Confirm.jsx';

export default function Approval() {
  const [shopItems, setShopItems] = useState([]);
  const [submittalItems, setSubmittalItems] = useState([]);
  const [paymentItems, setPaymentItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState(null); // { type, id, label, reason, onSubmit }
  const [rejectReason, setRejectReason] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);  // {type, id} or null
  const [detailCache, setDetailCache] = useState({});  // cache fetch details
  const [detailLoading, setDetailLoading] = useState(false);
  const confirm = useConfirm();

  async function load() {
    setLoading(true);
    try {
      // Shop drawings awaiting approval (SUBMITTED = sent for approval in this workflow)
      const shopResp = await fetch('/api/shop-drawings?project_id=1&status=SUBMITTED&limit=20', {
        headers: { Authorization: `Bearer ${getToken()}` }
      }).then(r => r.json()).catch(() => []);
      setShopItems(Array.isArray(shopResp) ? shopResp : []);

      // Material submittals
      const subResp = await materials.overdue(1).catch(() => []);
      const subAll = await fetch('/api/material-submittals?project_id=1&status=SUBMITTED&limit=20', {
        headers: { Authorization: `Bearer ${getToken()}` }
      }).then(r => r.json()).catch(() => []);
      const allSub = [...(Array.isArray(subResp) ? subResp : []), ...(Array.isArray(subAll) ? subAll : [])];
      const seen = new Set();
      setSubmittalItems(allSub.filter(x => { if (seen.has(x.id)) return false; seen.add(x.id); return true; }));

      // Payment requests PENDING
      const payResp = await fetch('/api/projects/1/payment-requests?status=PENDING&limit=20', {
        headers: { Authorization: `Bearer ${getToken()}` }
      }).then(r => r.json()).catch(() => []);
      setPaymentItems(Array.isArray(payResp) ? payResp : []);
    } catch (e) {
      toast.error('Lỗi tải approval list: ' + e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  // ===== Approve handlers - dùng chung confirmApprove =====
  // Shop approve is chain-aware: with a multi-level chain, approve the
  // current level (backend 422s the single-step shortcut); otherwise legacy.
  async function approveShop(id) {
    const ok = await confirm({
      title: 'Xác nhận duyệt',
      message: `Bạn có chắc chắn muốn DUYỆT shop drawing #${id}?`,
      confirmText: 'Duyệt',
      confirmStyle: 'primary',
    });
    if (!ok) return;
    setBusyId('shop-' + id);
    try {
      const state = await shopApi.approvalState(id).catch(() => null);
      if (state?.chain && state.chain.length > 1 && state.current_level) {
        const r = await shopApi.approveLevel(id, state.current_level, 'P', '');
        toast.success(`Shop drawing #${id} đã qua L${state.current_level}${r.status === 'APPROVED' ? ' (APPROVED)' : ''}`);
        if (r.status === 'APPROVED') setShopItems(arr => arr.filter(x => x.id !== id));
        else toggleExpandRefresh(id);
      } else {
        await shopApi.transition(id, 'APPROVED', '');
        toast.success('Shop drawing #' + id + ' đã APPROVED');
        setShopItems(arr => arr.filter(x => x.id !== id));
      }
      setExpandedId(null);
    } catch (e) {
      toast.error('Approve thất bại: ' + e.message);
    } finally { setBusyId(null); }
  }
  // Refresh the expanded detail after a mid-chain level approval.
  async function toggleExpandRefresh(id) {
    const key = `shop-${id}`;
    const r = await fetch('/api/shop-drawings/' + id + '/approval-state', {
      headers: { Authorization: `Bearer ${getToken()}` }
    }).then(r => r.json()).catch(() => null);
    if (r) setDetailCache(prev => ({ ...prev, [key]: r }));
  }
  async function approveSubmittal(id) {
    const ok = await confirm({
      title: 'Xác nhận duyệt',
      message: `Bạn có chắc chắn muốn DUYỆT material submittal #${id}?`,
      confirmText: 'Duyệt',
      confirmStyle: 'primary',
    });
    if (!ok) return;
    setBusyId('sub-' + id);
    try {
      const r = await fetch('/api/material-submittals/' + id + '/approve', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' }
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      toast.success('Material submittal #' + id + ' đã APPROVED');
      setSubmittalItems(arr => arr.filter(x => x.id !== id));
      setExpandedId(null);
    } catch (e) {
      toast.error('Approve thất bại: ' + e.message);
    } finally { setBusyId(null); }
  }
  async function approvePayment(id) {
    const ok = await confirm({
      title: 'Xác nhận duyệt',
      message: `Bạn có chắc chắn muốn DUYỆT payment request #${id}?`,
      confirmText: 'Duyệt',
      confirmStyle: 'primary',
    });
    if (!ok) return;
    setBusyId('pay-' + id);
    try {
      const r = await fetch('/api/payment-requests/' + id, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'APPROVED' })
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      toast.success('Payment request #' + id + ' đã APPROVED');
      setPaymentItems(arr => arr.filter(x => x.id !== id));
      setExpandedId(null);
    } catch (e) {
      toast.error('Approve thất bại: ' + e.message);
    } finally { setBusyId(null); }
  }

  // ===== Reject handlers - dùng modal reason + same API as list view =====
  function openReject(type, id, label) {
    setRejectModal({ type, id, label });
    setRejectReason('');
  }
  async function submitReject() {
    if (!rejectReason.trim()) {
      toast.error('Vui lòng nhập lý do reject');
      return;
    }
    const { type, id } = rejectModal;
    setBusyId(type + '-' + id);
    try {
      // Dùng đúng cùng API logic với Reject ở list
      if (type === 'shop') {
        await shopApi.transition(id, 'REJECTED', rejectReason);
        toast.success('Shop drawing #' + id + ' đã REJECTED');
        setShopItems(arr => arr.filter(x => x.id !== id));
      } else if (type === 'submittal') {
        await materials.reject(id, rejectReason);
        toast.success('Submittal #' + id + ' đã REJECTED');
        setSubmittalItems(arr => arr.filter(x => x.id !== id));
      } else if (type === 'payment') {
        const r = await fetch('/api/payment-requests/' + id, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'REJECTED', notes: rejectReason })
        }).then(r => r.json());
        if (r.error) throw new Error(r.error);
        toast.success('Payment #' + id + ' đã REJECTED');
        setPaymentItems(arr => arr.filter(x => x.id !== id));
      }
      setRejectModal(null);
      setExpandedId(null);
    } catch (e) {
      toast.error('Reject thất bại: ' + e.message);
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
      if (type === 'shop') url = '/api/shop-drawings/' + id;
      else if (type === 'submittal') url = '/api/material-submittals/' + id;
      else if (type === 'payment') url = '/api/payment-requests/' + id;
      if (!url) return;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json());
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
                {type === 'shop' ? 'Shop' : type === 'submittal' ? 'Submittal' : 'Payment'}
              </span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
              <span className={`badge workflow-${i.status || (type === 'shop' ? 'REVIEW' : type === 'submittal' ? 'SUBMITTED' : 'PENDING')}`}>
                {i.status || (type === 'shop' ? 'REVIEW' : type === 'submittal' ? 'SUBMITTED' : 'PENDING')}
              </span>
            </div>
            <div style={{ color: 'var(--c-text-2)', fontSize: 12 }}>
              {type === 'shop' && <>Submitted: {i.submitted_by || '—'} · Revision: {i.revision || 0}</>}
              {type === 'submittal' && <>Revision: {i.revision_number || 0} · SLA: {i.sla_deadline || 'N/A'} {i.sla_deadline && new Date(i.sla_deadline) < new Date() ? '⚠️ OVERDUE' : ''}</>}
              {type === 'payment' && <>Amount: {(i.amount || 0).toLocaleString()} · Due: {i.due_date || 'N/A'}</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn" onClick={() => type === 'shop' ? approveShop(i.id) : type === 'submittal' ? approveSubmittal(i.id) : approvePayment(i.id)}
              disabled={busyId === type + '-' + i.id}>
              <ICON.check size={12} />{busyId === type + '-' + i.id ? '...' : 'Approve'}
            </button>
            <button className="btn btn-secondary" onClick={() => openReject(type, i.id, label)}>
              <ICON.x size={12} />Reject
            </button>
            <button className="btn btn-secondary" onClick={() => toggleExpand(type, i.id)}>
              <ICON.eye size={12} />{isExpanded ? 'Hide' : 'View Details'}
            </button>
          </div>
        </div>
        {/* Inline expand: hiển thị ngay dưới dòng */}
        {isExpanded && (
          <div style={{ padding: '0 14px 14px 14px', background: 'var(--c-surface-2)', borderTop: '1px solid var(--c-border)' }}>
            <div style={{ padding: '12px 0', fontSize: 12, color: 'var(--c-text-2)' }}>
              {detailLoading && !detail ? 'Đang tải chi tiết...' :
               detail?.error ? <span style={{ color: 'var(--c-critical)' }}>Lỗi: {detail.error}</span> :
               !detail ? 'Không có dữ liết chi tiết' :
               <pre style={{ background: 'var(--c-surface)', padding: 10, borderRadius: 4, fontSize: 11, maxHeight: 300, overflow: 'auto', margin: 0 }}>
                 {JSON.stringify(detail, null, 2)}
               </pre>}
            </div>
            {/* Actions in expanded view - gọi cùng logic với list */}
            <div style={{ display: 'flex', gap: 6, paddingBottom: 12, borderTop: '1px dashed var(--c-border)', paddingTop: 10 }}>
              <button className="btn" onClick={() => type === 'shop' ? approveShop(i.id) : type === 'submittal' ? approveSubmittal(i.id) : approvePayment(i.id)}
                disabled={busyId === type + '-' + i.id}>
                <ICON.check size={12} />{busyId === type + '-' + i.id ? '...' : 'Approve từ chi tiết'}
              </button>
              <button className="btn btn-secondary" onClick={() => rejectFromDetail(type, i.id, label)}>
                <ICON.x size={12} />Reject từ chi tiết
              </button>
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
          <h1>Approval Center</h1>
          <div className="meta">{totalPending} items chờ duyệt {loading ? '(đang tải...)' : ''}</div>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading}><ICON.refresh size={12} />Refresh</button>
      </div>

      <div className="stat-strip">
        <div className="stat"><div className="label">Pending</div><div className="value" style={{ color: 'var(--c-watch)' }}>{totalPending}</div></div>
        <div className="stat"><div className="label">Shop review</div><div className="value">{shopItems.length}</div></div>
        <div className="stat"><div className="label">Material submittal</div><div className="value">{submittalItems.length}</div></div>
        <div className="stat"><div className="label">Payment request</div><div className="value">{paymentItems.length}</div></div>
      </div>

      {/* Section: Shop drawings */}
      <h2 style={{ fontSize: 14, marginTop: 20, marginBottom: 8 }}>Shop Drawing (REVIEW → APPROVE/REJECT)</h2>
      <div className="data-table">
        {loading ? <div className="empty">Đang tải...</div> :
         shopItems.length === 0 ? <div className="empty">Không có shop drawing nào đang REVIEW</div> :
         shopItems.map(i => renderItem('shop', i))}
      </div>

      {/* Section: Material submittals */}
      <h2 style={{ fontSize: 14, marginTop: 20, marginBottom: 8 }}>Material Submittal (SUBMITTED → APPROVE/REJECT)</h2>
      <div className="data-table">
        {loading ? <div className="empty">Đang tải...</div> :
         submittalItems.length === 0 ? <div className="empty">Không có material submittal nào đang chờ duyệt</div> :
         submittalItems.map(i => renderItem('submittal', i))}
      </div>

      {/* Section: Payment requests */}
      <h2 style={{ fontSize: 14, marginTop: 20, marginBottom: 8 }}>Payment Request (PENDING → APPROVE/REJECT)</h2>
      <div className="data-table">
        {loading ? <div className="empty">Đang tải...</div> :
         paymentItems.length === 0 ? <div className="empty">Không có payment request nào đang PENDING</div> :
         paymentItems.map(i => renderItem('payment', i))}
      </div>

      {totalPending === 0 && !loading && (
        <div className="empty" style={{ marginTop: 30, padding: 40, textAlign: 'center', color: 'var(--c-text-2)' }}>
          ✓ Tất cả approval items đã xử lý
        </div>
      )}

      {/* Reject modal (vẫn dùng modal vì cần nhập reason) */}
      {rejectModal && (
        <div className="modal-backdrop" onClick={() => setRejectModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Reject: {rejectModal.label}</h3>
            <p className="meta">Lý do reject (bắt buộc) sẽ được lưu vào audit log:</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={4} style={{ width: '100%', padding: 8, border: '1px solid var(--c-border)', borderRadius: 6, fontFamily: 'inherit' }} placeholder="Vd: Thiếu dimension kỹ thuật..." />
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setRejectModal(null)}>Hủy</button>
              <button className="btn" style={{ background: 'var(--c-critical)', color: '#fff' }} onClick={submitReject} disabled={busyId}>
                {busyId ? 'Đang xử lý...' : 'Xác nhận Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
