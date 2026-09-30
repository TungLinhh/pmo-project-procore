// Payment page (Mục 6.4) — contract → invoice → payment_request → payment.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { projects, getToken, getUser, preferDemoProject, request } from '../api/index.js';
import { ICON } from '../icons.jsx';
import PieChart from '../components/PieChart.jsx';
import PieTooltip from '../components/PieTooltip.jsx';
import { toast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';
import TablePagination from '../components/TablePagination.jsx';
import { todayLocal } from '../utils/datetime.js';
import { t, th, useLang } from '../i18n/index.js';
import Modal from '../components/Modal.jsx';

const STATUS_COLORS = {
  PENDING: 'var(--c-draft)',
  APPROVED: 'var(--c-submitted)',
  REJECTED: 'var(--c-behind)',
  PAID: 'var(--c-on-track)',
};

function statusLabels() {
  return {
  PENDING: t('pay.st_waiting'),
  SUBMITTED: t('pay.st_submitted'),
  APPROVED: t('pay.st_approved'),
  REJECTED: t('pay.act_reject'),
  PAID: t('pay.st_paid'),
};
}

export default function Payment() {
  useLang(); // re-render table headers on VI/EN toggle
  const confirm = useConfirm();
  const me = getUser() || {};
  const canPay = me.role === 'admin' || me.role === 'accounting';
  const canManageRequest = ['admin', 'accounting', 'pm', 'pmo'].includes(String(me.role || '').toLowerCase());
  const [params] = useSearchParams();
  const [, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(params.get('project'));
  const [contracts, setContracts] = useState([]);
  const [invoices, setInvoices] = useState({});  // contractId -> [invoices]
  const [paymentRequests, setPaymentRequests] = useState({});  // invoiceId -> [requests]
  const [payments, setPayments] = useState([]);
  const [arContracts, setArContracts] = useState([]);  // phải thu từ CĐT
  const [arLines, setArLines] = useState([]);
  const [arSheet, setArSheet] = useState('');
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(null);
  // AR (receivables) is Mid(read)/Enterprise(full) only — Small (AP-only) gets
  // 403 from the API; skip the fetch and hide the section (hide, not delete).
  const [canAR, setCanAR] = useState(true);
  // ERP round-trip (v0.9.0, Enterprise 'erp-export'): ledger export, vendor
  // CSV import with match suggestions, SFTP push per profile + push log.
  const [canERP, setCanERP] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [pushProfile, setPushProfile] = useState('');
  const [pushLog, setPushLog] = useState([]);
  const [vendorSugs, setVendorSugs] = useState(null);
  const [erpBusy, setErpBusy] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ contract_id: '', invoice_id: '', request_no: '', amount: '', retention_amount: 0, due_date: '' });
  const [addBusy, setAddBusy] = useState(false);
  const [paying, setPaying] = useState(null);
  const [deciding, setDeciding] = useState(null);
  const [releasing, setReleasing] = useState(null);
  const [lastPayment, setLastPayment] = useState(null);
  const [payForm, setPayForm] = useState(null);
  const [requestSearch, setRequestSearch] = useState('');
  const [requestStatus, setRequestStatus] = useState('');
  const [requestPage, setRequestPage] = useState(1);
  const [requestPageSize, setRequestPageSize] = useState(25);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(25);

  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      if (!selectedProject) setSelectedProject(preferDemoProject(list));
    }).catch((e) => toast.error(t('pay.err_projects') + e.message));
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    // 3 bulk requests (was N+1 fan-out: 77 contracts → hundreds of sequential
    // fetches that left the tab stuck on Loading). Group client-side below.
    Promise.all([
      request(`/projects/${selectedProject}/contracts`),
      request(`/projects/${selectedProject}/invoices?limit=1000`),
      request(`/projects/${selectedProject}/payment-requests?limit=1000`),
      request(`/projects/${selectedProject}/payments?limit=2000`),
    ]).then(async ([cs, invList, prList, paymentRows]) => {
      try {
        setContracts(Array.isArray(cs) ? cs : []);
        const invs = {};
        for (const inv of (Array.isArray(invList) ? invList : [])) {
          (invs[inv.contract_id] = invs[inv.contract_id] || []).push(inv);
        }
        const prs = {};
        for (const req of (Array.isArray(prList) ? prList : [])) {
          (prs[req.invoice_id] = prs[req.invoice_id] || []).push(req);
        }
        setInvoices(invs);
        setPaymentRequests(prs);
        setPayments(Array.isArray(paymentRows) ? paymentRows : []);
        // AR (phải thu từ CĐT) — separate tables, never mixed with AP chain.
        // Gated by plan: Small has no ar-read/ar-full → API 403s, skip early.
        const ent = await request('/me/entitlements').catch(() => null);
        const okAR = Array.isArray(ent?.features) && (ent.features.includes('ar-read') || ent.features.includes('ar-full'));
        setCanAR(okAR);
        setCanERP(Array.isArray(ent?.features) && ent.features.includes('erp-export'));
        if (okAR) {
          const [arcs, lines] = await Promise.all([
            request(`/projects/${selectedProject}/ar-contracts`),
            request(`/projects/${selectedProject}/ar-lines`),
          ]);
          setArContracts(Array.isArray(arcs) ? arcs : []);
          setArLines(Array.isArray(lines) ? lines : []);
        } else {
          setArContracts([]);
          setArLines([]);
        }
        setArSheet('');
        setLoading(false);
      } catch (e) {
        toast.error(t('pay.err_load') + e.message);
        setLoading(false);
      }
      // P2-10: trailing .catch — anything thrown outside the inner try (e.g.
      // a synchronous setState path) still clears Loading instead of hanging.
      }).catch((e) => {
        toast.error(t('pay.err_load') + (e?.message || e));
        setLoading(false);
      });
  }, [selectedProject]);

  // KPI — amounts arrive as NUMERIC strings from PG; coerce (string + would concatenate).
  const num = (v) => Number(v) || 0;
  const allRequests = Object.values(paymentRequests).flat();
  const totalAmount = allRequests.reduce((s, r) => s + num(r.amount), 0);
  const paidValue = payments.reduce((sum, payment) => sum + num(payment.paid_amount), 0);
  const paid = allRequests.filter(r => r.status === 'PAID').length;
  const approved = allRequests.filter(r => r.status === 'APPROVED').length;
  const overdue = allRequests.filter(r => r.due_date && new Date(r.due_date) < new Date() && r.status !== 'PAID').length;
  const paidValuePct = totalAmount > 0 ? Math.round((paidValue / totalAmount) * 1000) / 10 : null;

  const invoiceEntries = useMemo(() => {
    const entries = [];
    for (const contract of contracts) {
      for (const invoice of invoices[contract.id] || []) {
        const requests = paymentRequests[invoice.id] || [];
        if (requests.length) {
          for (const request of requests) entries.push({ contract, invoice, request });
        } else {
          entries.push({ contract, invoice, request: null });
        }
      }
    }
    return entries;
  }, [contracts, invoices, paymentRequests]);
  const filteredEntries = useMemo(() => {
    const query = requestSearch.trim().toLowerCase();
    return invoiceEntries.filter(({ contract, invoice, request }) => {
      const status = request?.status || '';
      if (requestStatus && status !== requestStatus) return false;
      if (!query) return true;
      return [contract.contract_no, contract.contract_name, invoice.invoice_no, request?.request_no, status]
        .filter(Boolean).join(' ').toLowerCase().includes(query);
    });
  }, [invoiceEntries, requestSearch, requestStatus]);
  const requestPageCount = Math.max(1, Math.ceil(filteredEntries.length / requestPageSize));
  const safeRequestPage = Math.min(requestPage, requestPageCount);
  const pagedEntries = filteredEntries.slice((safeRequestPage - 1) * requestPageSize, safeRequestPage * requestPageSize);
  const visibleInvoiceIds = new Set(pagedEntries.map(({ invoice }) => invoice.id));
  const pagedRequestIds = new Set(pagedEntries.filter(({ request }) => request).map(({ request }) => request.id));
  const visibleContracts = contracts
    .map((contract) => ({
      ...contract,
      visibleInvoices: (invoices[contract.id] || []).filter((invoice) => visibleInvoiceIds.has(invoice.id)),
    }))
    .filter((contract) => contract.visibleInvoices.length > 0);
  const ledgerPageCount = Math.max(1, Math.ceil(payments.length / ledgerPageSize));
  const safeLedgerPage = Math.min(ledgerPage, ledgerPageCount);
  const visiblePayments = payments.slice((safeLedgerPage - 1) * ledgerPageSize, safeLedgerPage * ledgerPageSize);

  useEffect(() => {
    setRequestPage(1);
    setLedgerPage(1);
  }, [selectedProject, requestSearch, requestStatus]);

  useEffect(() => {
    if (requestPage > requestPageCount) setRequestPage(requestPageCount);
    if (ledgerPage > ledgerPageCount) setLedgerPage(ledgerPageCount);
  }, [requestPage, requestPageCount, ledgerPage, ledgerPageCount]);

  const byStatus = {};
  allRequests.forEach(r => { byStatus[r.status || 'PENDING'] = (byStatus[r.status || 'PENDING'] || 0) + 1; });
  const pieData = Object.entries(byStatus).map(([label, value]) => ({
    label, value, color: STATUS_COLORS[label] || 'var(--c-draft)',
    breakdown: [{ k: 'Count', v: value }, { k: t('pay.lbl_ratio'), v: allRequests.length > 0 ? `${Math.round(value / allRequests.length * 100)}%` : '0%' }],
  }));

  async function doAdd() {
    if (!addForm.contract_id || !addForm.invoice_id || !addForm.request_no || !addForm.amount) {
      toast.error(t('pay.err_required'));
      return;
    }
    setAddBusy(true);
    try {
      const r = await request(`/invoices/${addForm.invoice_id}/payment-requests`, {
        method: 'POST',
        body: {
          request_no: addForm.request_no,
          request_date: todayLocal(),
          amount: Number(addForm.amount),
          retention_amount: Number(addForm.retention_amount) || 0,
          due_date: addForm.due_date || null,
        },
      });
      if (r.error) throw new Error(r.error);
      toast.success(t('pay.msg_request_created') + addForm.request_no);
      const invoiceId = addForm.invoice_id;
      setShowAddModal(false);
      setAddForm({ contract_id: '', invoice_id: '', request_no: '', amount: '', retention_amount: 0, due_date: '' });
      const list = await request(`/invoices/${invoiceId}/payment-requests`);
      setPaymentRequests((prev) => ({ ...prev, [invoiceId]: Array.isArray(list) ? list : [] }));
    } catch (e) {
      toast.error(t('pay.err_generic') + e.message);
    } finally { setAddBusy(false); }
  }

  async function decideRequest(req, status) {
    if (!canManageRequest || deciding) return;
    const approved = status === 'APPROVED';
    const ok = await confirm({
      title: `${approved ? t('pay.act_approve') : t('pay.act_reject')} ${req.request_no}`,
      message: `${vnd(req.amount)} VND${req.retention_amount ? ` · retention ${vnd(req.retention_amount)} VND` : ''}`,
      confirmText: approved ? t('pay.act_approve') : t('pay.act_reject'),
      confirmStyle: approved ? 'primary' : 'danger',
    });
    if (!ok) return;
    setDeciding(req.id);
    try {
      const updated = await request(`/payment-requests/${req.id}`, { method: 'PUT', body: { status } });
      if (updated?.error) throw new Error(updated.error);
      setPaymentRequests((prev) => ({
        ...prev,
        [req.invoice_id]: (prev[req.invoice_id] || []).map((item) => item.id === req.id ? { ...item, status } : item),
      }));
      toast.success(`${req.request_no}: ${approved ? t('pay.toast_approved') : t('pay.toast_rejected')}`);
    } catch (error) {
      toast.error(t('pay.err_update') + error.message);
    } finally {
      setDeciding(null);
    }
  }

  function openPay(req) {
    if (!canPay) return;
    const key = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `pay-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setPayForm({
      request: req,
      paid_amount: Number(req.amount) || 0,
      paid_date: todayLocal(),
      retention_held: Number(req.retention_amount) || 0,
      vat_paid: 0,
      paid_method: 'BANK_TRANSFER',
      notes: '',
      idempotency_key: key,
    });
  }

  async function confirmPay() {
    if (!payForm || paying) return;
    const amount = Number(payForm.paid_amount);
    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount - Number(payForm.request.amount || 0)) > 0.005) {
      toast.error(t('pay.err_amount_mismatch'));
      return;
    }
    const reqRow = payForm.request;
    const paidToDate = payments
      .filter((p) => p.invoice_no && p.invoice_no === reqRow.invoice_no)
      .reduce((sum, p) => sum + num(p.paid_amount), 0);
    const retention = num(reqRow.retention_amount);
    setPaying(reqRow.id);
    const ok = await confirm({
      title: `Xác nhận chi ${reqRow.request_no}`,
      message: `Phải trả: ${vnd(reqRow.amount)} VND · Đã trả cùng hóa đơn: ${vnd(paidToDate)} VND · Retention còn giữ: ${vnd(retention)} VND`,
      confirmText: t('pay.act_pay'),
      confirmStyle: 'danger',
    });
    if (!ok) { setPaying(null); return; }
    try {
      const body = await request(`/payment-requests/${reqRow.id}/payments`, {
        method: 'POST',
        headers: { 'Idempotency-Key': payForm.idempotency_key },
        body: {
          paid_amount: amount,
          paid_date: payForm.paid_date,
          retention_held: Number(payForm.retention_held) || 0,
          vat_paid: Number(payForm.vat_paid) || 0,
          paid_method: payForm.paid_method,
          notes: payForm.notes,
        },
      });
      setPayments((prev) => [body, ...prev.filter((p) => p.id !== body.id)]);
      setPaymentRequests((prev) => ({
        ...prev,
        [reqRow.invoice_id]: (prev[reqRow.invoice_id] || []).map((item) => item.id === reqRow.id ? { ...item, status: 'PAID' } : item),
      }));
      setLastPayment(body);
      setPayForm(null);
      toast.success(`Đã ghi payment #${body.id}`);
    } catch (e) {
      toast.error(t('pay.err_pay') + e.message);
    } finally {
      setPaying(null);
    }
  }

  async function releaseRetention(reqRow) {
    const payment = payments.find((row) => Number(row.payment_request_id) === Number(reqRow.id));
    const held = num(payment?.retention_held);
    const released = num(reqRow.retention_released_amount);
    const remaining = Math.max(0, held - released);
    if (!payment || remaining <= 0) return;
    const ok = await confirm({
      title: `Release retention ${reqRow.request_no}`,
      message: `Còn giữ ${vnd(remaining)} VND. Sau thao tác sẽ ghi thêm ${vnd(remaining)} VND vào retention đã hoàn trả.`,
      confirmText: t('pay.btn_release_all'),
      confirmStyle: 'danger',
    });
    if (!ok) return;
    setReleasing(reqRow.id);
    try {
      const updated = await request(`/payment-requests/${reqRow.id}/retention/release`, {
        method: 'POST', body: { released_amount: remaining },
      });
      setPaymentRequests((prev) => ({
        ...prev,
        [reqRow.invoice_id]: (prev[reqRow.invoice_id] || []).map((item) => item.id === reqRow.id ? updated : item),
      }));
      setPayments((prev) => prev.map((item) => item.id === payment.id ? {
        ...item,
        retention_released_amount: updated.retention_released_amount,
        retention_released_at: updated.retention_released_at,
      } : item));
      toast.success(t('pay.msg_retention_released'));
    } catch (e) { toast.error(t('pay.err_release') + e.message); }
    finally { setReleasing(null); }
  }

  const totalFmt = (n) => (n / 1e9).toFixed(2);
  const vnd = (n) => (n == null ? '—' : Number(n).toLocaleString('vi-VN'));
  const arSheets = Array.from(new Set(arLines.map(l => l.source_sheet))).sort();
  const arLinesShown = arSheet ? arLines.filter(l => l.source_sheet === arSheet) : arLines.slice(0, 100);
  const arSum = (k) => arContracts.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const availableInvoices = Object.entries(invoices).flatMap(([cid, invs]) => invs.filter(inv => String(inv.contract_id) === String(addForm.contract_id)).map(inv => ({ ...inv, contract_id: cid })));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('pay.lbl_payment')}</h1>
          <div className="meta">{contracts.length} {t('pay.unit_contract')} · {allRequests.length} {t('pay.unit_request')} · {totalFmt(totalAmount)} {t('pay.unit_billion_vnd')}</div>
        </div>
        <div className="page-header-right">
          {canManageRequest && <button className="btn" onClick={() => setShowAddModal(true)}><ICON.plus size={13} />{t('pay.sec_add_request')}</button>}
        </div>
      </div>

      <div className="filter-bar">
        <label>{t('pay.lbl_project')}</label>
        <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder={t('pay.pick_project')} />
        <label>{t('pay.btn_find')}</label>
        <input value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} placeholder={t('pay.search_ph')} style={{ minWidth: 180 }} />
        <label>{t('pay.lbl_status')}</label>
        <select value={requestStatus} onChange={(event) => setRequestStatus(event.target.value)}>
          <option value="">{t('pay.lbl_all')}</option>
          {Object.entries(statusLabels()).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi-card">
          <div className="label">{t('pay.lbl_total_value')}</div>
          <div className="value">{totalFmt(totalAmount)} tỷ</div>
          <div className="sub">{t('pay.paid_summary', { amount: totalFmt(paidValue), pct: paidValuePct == null ? '—' : `${paidValuePct}%` })}</div>
        </div>
        <div className="kpi-card on-track">
          <div className="label">{t('pay.st_approved')}</div>
          <div className="value">{approved}</div>
          <div className="sub">{t('pay.sec_ready')}</div>
        </div>
        <div className="kpi-card critical">
          <div className="label">{t('pay.lbl_overdue')}</div>
          <div className="value">{overdue}</div>
          <div className="sub">{t('pay.note_overdue')}</div>
        </div>
        <div className="kpi-card watch" onMouseEnter={() => setHovered('status')} onMouseLeave={() => setHovered(null)} style={{ position: 'relative' }}>
          <div className="label">{t('pay.lbl_by_status')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {pieData.length > 0 ? (
              <div className="pie-wrap">
                <PieChart data={pieData} size={64} thickness={14} centerText={`${paid}`} centerSub={t('pay.suffix_paid')} />
                {hovered === 'status' && <PieTooltip data={pieData} />}
              </div>
            ) : <div style={{ color: 'var(--c-text-3)' }}>—</div>}
          </div>
        </div>
      </div>

      {/* AR — phải thu từ CĐT (Mid/Enterprise only; Small AP-only hides it) */}
      {!loading && canAR && (arContracts.length > 0 || arLines.length > 0) && (
        <div className="section">
          <div className="section-title">
            <span>{t('pay.sec_ar')}</span>
            <span style={{ fontSize: 12, color: 'var(--c-text-2)' }}>
              {t('pay.ar_summary', { total: totalFmt(arSum('contract_value')), paid: totalFmt(arSum('paid_value')), left: totalFmt(arSum('remaining_value')) })}
            </span>
          </div>
          <div className="data-table">
            <div className="data-table-body">
              <table>
                <thead>
                  <tr>
                    <th>{th("Dự án")}</th>
                    <th>{th("Khách hàng")}</th>
                    <th className="num">{th("Giá trị HĐ")}</th>
                    <th className="num">{th("Đã TU/TT")}</th>
                    <th className="num">{th("Còn lại HĐ")}</th>
                    <th className="num">{th("HĐ đã xuất")}</th>
                    <th className="num">{th("Đủ ĐK TT ngay")}</th>
                  </tr>
                </thead>
                <tbody>
                  {arContracts.map(c => (
                    <tr key={c.id}>
                      <td>{c.project_name || '—'}</td>
                      <td style={{ maxWidth: 280 }}>{c.client_name || '—'}</td>
                      <td className="num">{vnd(c.contract_value)}</td>
                      <td className="num">{vnd(c.paid_value)}</td>
                      <td className="num">{vnd(c.remaining_value)}</td>
                      <td className="num">{vnd(c.invoiced_value)}</td>
                      <td className="num">{vnd(c.due_now_value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {arSheets.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ fontSize: 12 }}>{t('pay.sec_sheet')}</label>
              <select value={arSheet} onChange={e => setArSheet(e.target.value)} style={{ padding: 6 }}>
                <option value="">{t('pay.all_rows')}{arLines.length} {t('pay.unit_rows')}, {t('pay.unit_showing')} 100) —</option>
                {arSheets.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {arLinesShown.length > 0 && (
            <div className="data-table" style={{ marginTop: 8 }}>
              <div className="data-table-body">
                <table>
                  <thead>
                    <tr>
                      <th>{th("Loại")}</th>
                      <th>{th("Hạng mục")}</th>
                      <th>{th("Số HĐ/chứng từ")}</th>
                      <th>{th("Ngày")}</th>
                      <th className="num">{th("Giá trị (VND)")}</th>
                      <th>{th("Ghi chú")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {arLinesShown.map(l => (
                      <tr key={l.id}>
                        <td><span className="badge" style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)' }}>{l.kind}</span></td>
                        <td style={{ maxWidth: 320 }}>{l.label || '—'}</td>
                        <td><code>{l.ref_no || '—'}</code></td>
                        <td>{(l.ref_date || '').slice(0, 10) || '—'}</td>
                        <td className="num">{vnd(l.amount)}</td>
                        <td style={{ fontSize: 11 }}>{l.note || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Contracts + Invoices + Payment Requests */}
      {loading ? <div className="empty">{t('pay.busy_loading')}</div> :
       contracts.length === 0 ? <div className="empty">{t('pay.empty_contracts')}</div> :
       filteredEntries.length === 0 ? <div className="empty">{t('pay.empty_filtered')}</div> :
       visibleContracts.map(c => (
        <div key={c.id} className="section">
          <div className="section-title">
            <span>📄 {c.contract_no} — {c.contract_name}</span>
            <span style={{ fontSize: 12, color: 'var(--c-text-2)' }}>{((c.total_value || 0) / 1e9).toFixed(2)} tỷ · {c.signed_date || '—'}</span>
          </div>
          <div className="data-table">
            <div className="data-table-body">
              <table>
                <thead>
                  <tr>
                    <th>{th("Hóa đơn")}</th>
                    <th>{th("Ngày")}</th>
                    <th className="num">{th("Giá trị (VND)")}</th>
                    <th className="num">{th("VAT")}</th>
                    <th>{th("Yêu cầu thanh toán")}</th>
                    <th className="num">{th("Giá trị")}</th>
                    <th className="num">{th("Retention")}</th>
                    <th>{th("Hạn thanh toán")}</th>
                    <th>{th("Trạng thái")}</th>
                    <th>{th("Thao tác")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(c.visibleInvoices || []).map(inv => {
                    const reqs = (paymentRequests[inv.id] || []).filter((request) => pagedRequestIds.has(request.id));
                    return reqs.length > 0 ? reqs.map((req, i) => (
                      // `key` phải có tiền tố: `invoices.id` và `payment_requests.id`
                      // là hai chuỗi **độc lập**, mà cả hai nhánh đều đổ vào cùng một
                      // `<tbody>`. Đo được chúng trùng nhau trong dữ liệu demo, và
                      // React khi thấy `key` trùng thì giữ element thứ nhất trong map
                      // và **dùng lại nó cho element thứ hai** ⇒ dòng yêu cầu thanh
                      // toán hiện số hoá đơn và số tiền của hoá đơn khác, ngay cạnh
                      // nút Duyệt/Từ chối. Xem `scripts/check-table-headers.mjs` bên
                      // cạnh cho quy ước key.
                      <tr key={`req-${req.id}`}>
                        {i === 0 && (
                          <>
                            <td rowSpan={reqs.length}><code>{inv.invoice_no}</code></td>
                            <td rowSpan={reqs.length}>{inv.invoice_date || '—'}</td>
                            <td rowSpan={reqs.length} className="num">{vnd(inv.amount)}</td>
                            <td rowSpan={reqs.length} className="num">{vnd(inv.vat_amount)}</td>
                          </>
                        )}
                        <td><code>{req.request_no}</code></td>
                        <td className="num">{vnd(req.amount)}</td>
                        <td className="num" style={{ color: 'var(--c-behind)' }}>{vnd(req.retention_amount)}</td>
                        <td>{req.due_date || '—'}</td>
                        <td><span className={`badge workflow-${req.status || 'PENDING'}`}>{statusLabels()[req.status] || req.status || statusLabels().PENDING}</span></td>
                        <td>
                        {['PENDING', 'SUBMITTED'].includes(req.status) && canManageRequest && (
                          <div className="row-actions">
                            <button className="btn btn-sm" onClick={() => decideRequest(req, 'APPROVED')} disabled={deciding === req.id}>{t('pay.act_approve')}</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => decideRequest(req, 'REJECTED')} disabled={deciding === req.id}>{t('pay.act_reject')}</button>
                          </div>
                        )}
                        {req.status === 'APPROVED' && canPay && (
                          <button className="btn btn-sm" onClick={() => openPay(req)} disabled={paying === req.id}>
                            {paying === req.id ? t('pay.busy_working') : t('pay.act_pay')}
                          </button>
                        )}
                        {req.status === 'PAID' && req.retention_status === 'PENDING' && (
                          <div><span className="badge workflow-PENDING">{t('g.retention')}</span>{canPay && <button className="btn btn-secondary btn-sm" style={{ marginLeft: 6 }} onClick={() => releaseRetention(req)} disabled={releasing === req.id}>{releasing === req.id ? t('pay.busy_releasing') : t('g.release')}</button>}</div>
                        )}
                        {req.retention_status === 'RELEASED' && <span className="badge workflow-APPROVED">{t('pay.sec_retention')}</span>}
                        </td>
                      </tr>
                    )) : (
                      <tr key={`inv-${inv.id}`}>
                        <td><code>{inv.invoice_no}</code></td>
                        <td>{inv.invoice_date || '—'}</td>
                        <td className="num">{vnd(inv.amount)}</td>
                        <td className="num">{vnd(inv.vat_amount)}</td>
                        <td colSpan={5} style={{ color: 'var(--c-text-2)', fontSize: 11 }}>{t('pay.empty_requests')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
       ))
      }
      {!loading && filteredEntries.length > 0 && <TablePagination page={safeRequestPage} pageCount={requestPageCount} total={filteredEntries.length} pageSize={requestPageSize} onPageChange={setRequestPage} onPageSizeChange={(size) => { setRequestPageSize(size); setRequestPage(1); }} unitKey="unit.row" />}

      <div className="section">
        <div className="section-title">{t('pay.sec_ledger')}</div>
        {lastPayment && (
          <div className="gate-banner" style={{ marginBottom: 8 }}>{t('pay.st_just_written')}<a href={`#payment-${lastPayment.id}`}>#{lastPayment.id}</a> · {vnd(lastPayment.paid_amount)} VND
          </div>
        )}
        <div className="data-table"><div className="data-table-body"><table>
          <thead><tr><th>{th("#")}</th><th>{th("Hợp đồng")}</th><th>{th("Hóa đơn")}</th><th className="num">{th("Đã chi")}</th><th>{th("Ngày chi")}</th><th>{th("Phương thức")}</th><th>{th("Retention giữ")}</th><th className="num">{th("Retention đã release")}</th></tr></thead>
          <tbody>
            {visiblePayments.map((p) => (
              <tr key={p.id} id={`payment-${p.id}`}>
                <td><a href={`#payment-${p.id}`}>#{p.id}</a></td>
                <td><code>{p.contract_no || '—'}</code></td>
                <td>{p.invoice_no || '—'}</td>
                <td className="num">{vnd(p.paid_amount)}</td>
                <td>{String(p.paid_at || '').slice(0, 10) || '—'}</td>
                <td>{p.paid_method || '—'}</td>
                <td className="num">{vnd(p.retention_held)}</td>
                <td className="num">{vnd(p.retention_released_amount)}</td>
              </tr>
            ))}
            {!payments.length && <tr><td colSpan={8} style={{ color: 'var(--c-text-2)' }}>{t('pay.empty_ledger')}</td></tr>}
          </tbody>
        </table></div></div>
        {!loading && payments.length > 0 && <TablePagination page={safeLedgerPage} pageCount={ledgerPageCount} total={payments.length} pageSize={ledgerPageSize} onPageChange={setLedgerPage} onPageSizeChange={(size) => { setLedgerPageSize(size); setLedgerPage(1); }} unitKey="unit.payment" />}
      </div>

      {payForm && (
        <Modal onClose={() => !paying && setPayForm(null)} maxWidth={520}>
          <h3>{t('g.pay_now')} {payForm.request.request_no}</h3>
          <div className="breakdown" style={{ margin: '10px 0 14px' }}>
            <div className="row"><span className="k">{t('pay.lbl_due')}</span><span className="v">{vnd(payForm.request.amount)} VND</span></div>
            <div className="row"><span className="k">{t('g.retention')}</span><span className="v">{vnd(payForm.request.retention_amount)} VND</span></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label>{t('pay.lbl_pay_amount')}<input type="number" value={payForm.paid_amount} readOnly title={t('pay.note_one_instalment')} /></label>
            <label>{t('pay.lbl_paid_date')}<input type="date" value={payForm.paid_date} onChange={(e) => setPayForm({ ...payForm, paid_date: e.target.value })} /></label>
            <label>{t('pay.st_retention_held')}<input type="number" min="0" max={payForm.request.retention_amount || 0} value={payForm.retention_held} onChange={(e) => setPayForm({ ...payForm, retention_held: e.target.value })} /></label>
            <label>{t('pay.lbl_vat_paid')}<input type="number" min="0" value={payForm.vat_paid} onChange={(e) => setPayForm({ ...payForm, vat_paid: e.target.value })} /></label>
            <label>{t('pay.lbl_method')}<select value={payForm.paid_method} onChange={(e) => setPayForm({ ...payForm, paid_method: e.target.value })}><option value="BANK_TRANSFER">{t('pay.sec_transfers')}</option><option value="CASH">{t('pay.pay_cash')}</option><option value="CARD">{t('pay.pay_card')}</option></select></label>
            <label>{t('pay.lbl_note')}<input value={payForm.notes} onChange={(e) => setPayForm({ ...payForm, notes: e.target.value })} /></label>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setPayForm(null)} disabled={!!paying}>{t('pay.btn_cancel')}</button>
            <button className="btn" onClick={confirmPay} disabled={!!paying}>{paying ? t('pay.busy_writing') : t('pay.btn_review_pay')}</button>
          </div>
        </Modal>
      )}

      <p className="meta" style={{ marginTop: 12, fontSize: 11 }}>
        {t('pay.note_retention')}
      </p>

      {canERP && selectedProject && (
        <ErpPanel projectId={selectedProject} profiles={profiles} setProfiles={setProfiles}
          pushProfile={pushProfile} setPushProfile={setPushProfile} pushLog={pushLog} setPushLog={setPushLog}
          vendorSugs={vendorSugs} setVendorSugs={setVendorSugs} erpBusy={erpBusy} setErpBusy={setErpBusy} />
      )}

      {/* Add milestone modal */}      {showAddModal && (
        <Modal onClose={() => !addBusy && setShowAddModal(false)} maxWidth={520}>
          <h3>{t('pay.add_pr_milestone')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Contract *</div>
              <select value={addForm.contract_id} onChange={e => setAddForm({...addForm, contract_id: e.target.value, invoice_id: ''})} style={{ width: '100%', padding: 6 }}>
                <option value="">{t('pay.pick_contract')}</option>
                {contracts.map(c => <option key={c.id} value={c.id}>{c.contract_no} - {c.contract_name}</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Invoice *</div>
              <select value={addForm.invoice_id} onChange={e => setAddForm({...addForm, invoice_id: e.target.value})} style={{ width: '100%', padding: 6 }} disabled={!addForm.contract_id}>
                <option value="">{t('pay.pick_invoice')}</option>
                {availableInvoices.map(inv => <option key={inv.id} value={inv.id}>{inv.invoice_no} ({inv.invoice_date})</option>)}
              </select>
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Request No *</div>
              <input value={addForm.request_no} onChange={e => setAddForm({...addForm, request_no: e.target.value})} style={{ width: '100%', padding: 6 }} placeholder="REQ-2026-XXX" />
            </label>
            <label>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Amount (VND) *</div>
              <input type="number" value={addForm.amount} onChange={e => setAddForm({...addForm, amount: e.target.value})} style={{ width: '100%', padding: 6 }} />
            </label>
            <label>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('g.retention')}</div>
              <input type="number" value={addForm.retention_amount} onChange={e => setAddForm({...addForm, retention_amount: e.target.value})} style={{ width: '100%', padding: 6 }} />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>{t('pay.due_date')}</div>
              <input type="date" value={addForm.due_date} onChange={e => setAddForm({...addForm, due_date: e.target.value})} style={{ width: '100%', padding: 6 }} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setShowAddModal(false)} disabled={addBusy}>{t('pay.btn_cancel')}</button>
            <button className="btn" onClick={doAdd} disabled={addBusy}>{addBusy ? '...' : t('pay.btn_create')}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ERP round-trip panel (v0.9.0): export CSV, vendor import suggestions,
// SFTP push per profile + push log. Shown only with 'erp-export' (Enterprise).
function ErpPanel({ projectId, profiles, setProfiles, pushProfile, setPushProfile, pushLog, setPushLog, vendorSugs, setVendorSugs, erpBusy, setErpBusy }) {
  // PHẢI khai báo ở đây. Trước đó `confirm` không có trong phạm vi component nên
  // rơi về `window.confirm` của trình duyệt — hộp thoại native hiện
  // `[object Object]`, `await` trên boolean vẫn chạy tiếp, nên **không lỗi nào được
  // báo**: build xanh, lint xanh (vì `confirm` là global hợp lệ), và người dùng thấy
  // một hộp thoại rác thay vì hộp xác nhận có tiêu đề và nút bấm.
  const confirm = useConfirm();
  const authH = () => ({ Authorization: `Bearer ${getToken()}` });

  useEffect(() => {
    request('/erp/profiles')
      .then(d => { if (Array.isArray(d)) { setProfiles(d); if (d[0] && !pushProfile) setPushProfile(String(d[0].id)); } })
      .catch(() => {});
    request('/erp/push-log')
      .then(d => { if (Array.isArray(d)) setPushLog(d); })
      .catch(() => {});
  }, [projectId]); // eslint-disable-line

  async function downloadCsv() {
    try {
      const r = await fetch(`/api/export/ap-ledger.csv?project_id=${projectId}`, { headers: authH() });
      if (!r.ok) throw new Error(t('pay.err_export'));
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ap-ledger-${projectId}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast.error(t('pay.err_generic') + e.message); }
  }

  async function importVendors(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErpBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const r = await fetch('/api/erp/vendors/import', { method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: fd }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      setVendorSugs(r);
    } catch (err) { toast.error(t('pay.err_import') + err.message); } finally { setErpBusy(false); e.target.value = ''; }
  }

  async function confirmVendor(s) {
    if (!s.match) return;
    const ok = await confirm({
      title: `Gán MST ${s.tax_id}?`,
      message: `Mã số thuế sẽ được gán cho nhà cung cấp "${s.match.vendor_name}".`,
      confirmText: t('pay.btn_assign'), confirmStyle: 'danger',
    });
    if (!ok) return;
    try {
      const r = await request('/erp/vendors/confirm', {
        method: 'POST', body: { vendor_id: s.match.vendor_id, tax_id: s.tax_id },
      });
      if (r.error) throw new Error(r.error);
      toast.success(`Đã gán MST cho ${r.name}`);
      setVendorSugs(v => ({ ...v, suggestions: (v?.suggestions || []).filter(x => x !== s) }));
    } catch (e) { toast.error(t('pay.err_confirm') + e.message); }
  }

  async function pushNow() {
    if (!pushProfile) { toast.error(t('pay.err_no_sftp')); return; }
    setErpBusy(true);
    try {
      const r = await request('/jobs/erp-push', {
        method: 'POST', body: { profile_id: Number(pushProfile), project_id: Number(projectId) },
      });
      if (r.error) throw new Error(r.error);
      toast.success(`Đã đẩy ${r.rows} dòng → ${r.remote_file}${r.mocked ? ' (mock)' : ''}`);
      const log = await request('/erp/push-log');
      if (Array.isArray(log)) setPushLog(log);
    } catch (e) { toast.error(t('pay.err_push') + e.message); } finally { setErpBusy(false); }
  }

  return (
    <div className="section" style={{ marginTop: 16 }}>
      <div className="section-title"><span>🔗 ERP round-trip</span></div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <button className="btn btn-secondary" onClick={downloadCsv}><ICON.download size={12} />{t('pay.btn_export_ap')}</button>
        <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
          <ICON.upload size={12} />{t('pay.btn_import_vendor')}<input type="file" accept=".csv" hidden onChange={importVendors} />
        </label>
        <select value={pushProfile} onChange={e => setPushProfile(e.target.value)} style={{ padding: 6 }}>
          <option value="">— profile SFTP —</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name} → {p.sftp_user}@{p.sftp_host}</option>)}
        </select>
        <button className="btn btn-secondary" onClick={pushNow} disabled={erpBusy || !pushProfile}>{t('pay.btn_sftp')}</button>
      </div>
      {vendorSugs && (
        <div className="data-table" style={{ marginBottom: 8 }}><div className="data-table-body"><table>
          <thead><tr><th>{th("NCC trong file")}</th><th>{th("MST")}</th><th>{th("Khớp trong hệ thống")}</th><th></th></tr></thead>
          <tbody>
            {vendorSugs.suggestions.map((s, i) => (
              <tr key={i}>
                <td>{s.name}</td>
                <td><code>{s.tax_id || '—'}</code></td>
                <td style={{ fontSize: 12 }}>{s.match ? `${s.match.vendor_name} (${s.match.similarity})` : <span style={{ color: 'var(--c-text-2)' }}>{t('pay.ar_unmatched')}</span>}</td>
                <td>{s.match && s.tax_id ? <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => confirmVendor(s)}>{t('pay.sec_confirm_tax')}</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
      {pushLog.length > 0 && (
        <div className="data-table"><div className="data-table-body"><table>
          <thead><tr><th>{th("Thời gian")}</th><th>{th("Hồ sơ")}</th><th>{th("Tệp")}</th><th className="num">{th("Dung lượng")}</th><th>{th("Trạng thái")}</th></tr></thead>
          <tbody>
            {pushLog.slice(0, 5).map(l => (
              <tr key={l.id}>
                <td style={{ fontSize: 11 }}>{(l.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                <td>{l.profile_name || `#${l.profile_id}`}</td>
                <td style={{ fontSize: 11, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.remote_file || '—'}</td>
                <td className="num">{l.bytes}</td>
                <td><span className={`badge workflow-${l.status === 'ok' ? 'APPROVED' : 'REJECTED'}`}>{l.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
    </div>
  );
}
