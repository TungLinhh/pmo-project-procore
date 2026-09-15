// Payment page (Mục 6.4) — contract → invoice → payment_request → payment.
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { projects, getToken, preferDemoProject } from '../api/index.js';
import { ICON } from '../icons.jsx';
import PieChart from '../components/PieChart.jsx';
import PieTooltip from '../components/PieTooltip.jsx';
import { toast } from '../components/Toast.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';

const STATUS_COLORS = {
  PENDING: 'var(--c-draft)',
  APPROVED: 'var(--c-submitted)',
  REJECTED: 'var(--c-behind)',
  PAID: 'var(--c-on-track)',
};

export default function Payment() {
  const [params] = useSearchParams();
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(params.get('project'));
  const [contracts, setContracts] = useState([]);
  const [invoices, setInvoices] = useState({});  // contractId -> [invoices]
  const [paymentRequests, setPaymentRequests] = useState({});  // invoiceId -> [requests]
  const [arContracts, setArContracts] = useState([]);  // phải thu từ CĐT
  const [arLines, setArLines] = useState([]);
  const [arSheet, setArSheet] = useState('');
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ contract_id: '', invoice_id: '', request_no: '', amount: '', retention_amount: 0, due_date: '' });
  const [addBusy, setAddBusy] = useState(false);

  useEffect(() => {
    projects.list().then(list => {
      setAllProjects(list);
      if (!selectedProject) setSelectedProject(preferDemoProject(list));
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    // 3 bulk requests (was N+1 fan-out: 77 contracts → hundreds of sequential
    // fetches that left the tab stuck on Loading). Group client-side below.
    const authH = { Authorization: `Bearer ${getToken()}` };
    Promise.all([
      fetch(`/api/projects/${selectedProject}/contracts`, { headers: authH }).then(r => r.json()).catch(() => []),
      fetch(`/api/projects/${selectedProject}/invoices?limit=1000`, { headers: authH }).then(r => r.json()).catch(() => []),
      fetch(`/api/projects/${selectedProject}/payment-requests?limit=1000`, { headers: authH }).then(r => r.json()).catch(() => []),
    ]).then(async ([cs, invList, prList]) => {
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
        // AR (phải thu từ CĐT) — separate tables, never mixed with AP chain
        const [arcs, lines] = await Promise.all([
          fetch(`/api/projects/${selectedProject}/ar-contracts`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).catch(() => []),
          fetch(`/api/projects/${selectedProject}/ar-lines`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json()).catch(() => []),
        ]);
        setArContracts(Array.isArray(arcs) ? arcs : []);
        setArLines(Array.isArray(lines) ? lines : []);
        setArSheet('');
        setLoading(false);
      } catch (e) {
        toast.error('Lỗi tải payment: ' + e.message);
        setLoading(false);
      }
      });
  }, [selectedProject]);

  // KPI — amounts arrive as NUMERIC strings from PG; coerce (string + would concatenate).
  const num = (v) => Number(v) || 0;
  const allRequests = Object.values(paymentRequests).flat();
  const totalAmount = allRequests.reduce((s, r) => s + num(r.amount), 0);
  const totalRetention = allRequests.reduce((s, r) => s + num(r.retention_amount), 0);
  const paid = allRequests.filter(r => r.status === 'APPROVED' || r.status === 'PAID').length;
  const overdue = allRequests.filter(r => r.due_date && new Date(r.due_date) < new Date() && r.status !== 'APPROVED' && r.status !== 'PAID').length;

  const byStatus = {};
  allRequests.forEach(r => { byStatus[r.status || 'PENDING'] = (byStatus[r.status || 'PENDING'] || 0) + 1; });
  const pieData = Object.entries(byStatus).map(([label, value]) => ({
    label, value, color: STATUS_COLORS[label] || 'var(--c-draft)',
    breakdown: [{ k: 'Count', v: value }, { k: 'Tỉ lệ', v: allRequests.length > 0 ? `${Math.round(value / allRequests.length * 100)}%` : '0%' }],
  }));

  async function doAdd() {
    if (!addForm.contract_id || !addForm.invoice_id || !addForm.request_no || !addForm.amount) {
      toast.error('Vui lòng điền đủ: contract, invoice, request_no, amount');
      return;
    }
    setAddBusy(true);
    try {
      const r = await fetch(`/api/invoices/${addForm.invoice_id}/payment-requests`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_no: addForm.request_no,
          request_date: new Date().toISOString().slice(0, 10),
          amount: Number(addForm.amount),
          retention_amount: Number(addForm.retention_amount) || 0,
          due_date: addForm.due_date || null,
        })
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      toast.success('Đã tạo payment request: ' + addForm.request_no);
      setShowAddModal(false);
      setAddForm({ contract_id: '', invoice_id: '', request_no: '', amount: '', retention_amount: 0, due_date: '' });
      // Reload
      const list = await fetch(`/api/invoices/${addForm.invoice_id}/payment-requests`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json());
      setPaymentRequests({ ...paymentRequests, [addForm.invoice_id]: list });
    } catch (e) {
      toast.error('Lỗi: ' + e.message);
    } finally { setAddBusy(false); }
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
          <h1>Payment</h1>
          <div className="meta">{contracts.length} contracts · {allRequests.length} payment requests · {totalFmt(totalAmount)} tỷ VND</div>
        </div>
        <div className="page-header-right">
          <button className="btn" onClick={() => setShowAddModal(true)}><ICON.plus size={13} />Add milestone</button>
        </div>
      </div>

      <div className="filter-bar">
        <label>Project</label>
        <ProjectPicker value={selectedProject} onChange={setSelectedProject} placeholder="Chọn dự án..." />
      </div>

      <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi-card">
          <div className="label">Total amount</div>
          <div className="value">{totalFmt(totalAmount)} tỷ</div>
          <div className="sub">Tổng {allRequests.length} payment requests</div>
        </div>
        <div className="kpi-card on-track">
          <div className="label">Approved</div>
          <div className="value">{paid}</div>
          <div className="sub">{totalAmount > 0 ? Math.round(paid / allRequests.length * 100) : 0}% số request</div>
        </div>
        <div className="kpi-card critical">
          <div className="label">Overdue</div>
          <div className="value">{overdue}</div>
          <div className="sub">Đã quá hạn thanh toán</div>
        </div>
        <div className="kpi-card watch" onMouseEnter={() => setHovered('status')} onMouseLeave={() => setHovered(null)} style={{ position: 'relative' }}>
          <div className="label">By status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {pieData.length > 0 ? (
              <div className="pie-wrap">
                <PieChart data={pieData} size={64} thickness={14} centerText={`${paid}`} centerSub="paid" />
                {hovered === 'status' && <PieTooltip data={pieData} />}
              </div>
            ) : <div style={{ color: 'var(--c-text-3)' }}>—</div>}
          </div>
        </div>
      </div>

      {/* AR — phải thu từ CĐT (ingest file A_B as payment_ar) */}
      {!loading && (arContracts.length > 0 || arLines.length > 0) && (
        <div className="section">
          <div className="section-title">
            <span>🧾 Phải thu từ CĐT (AR)</span>
            <span style={{ fontSize: 12, color: 'var(--c-text-2)' }}>
              HĐ {totalFmt(arSum('contract_value'))} tỷ · đã TT {totalFmt(arSum('paid_value'))} tỷ · còn lại {totalFmt(arSum('remaining_value'))} tỷ
            </span>
          </div>
          <div className="data-table">
            <div className="data-table-body">
              <table>
                <thead>
                  <tr>
                    <th>Dự án</th>
                    <th>Khách hàng</th>
                    <th className="num">Giá trị HĐ</th>
                    <th className="num">Đã TU/TT</th>
                    <th className="num">Còn lại HĐ</th>
                    <th className="num">HĐ đã xuất</th>
                    <th className="num">Đủ ĐK TT ngay</th>
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
              <label style={{ fontSize: 12 }}>Chi tiết sheet</label>
              <select value={arSheet} onChange={e => setArSheet(e.target.value)} style={{ padding: 6 }}>
                <option value="">— tất cả ({arLines.length} dòng, hiện 100) —</option>
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
                      <th>Loại</th>
                      <th>Hạng mục</th>
                      <th>Số HĐ/chứng từ</th>
                      <th>Ngày</th>
                      <th className="num">Giá trị (VND)</th>
                      <th>Ghi chú</th>
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
      {loading ? <div className="empty">Loading...</div> :
       contracts.length === 0 ? <div className="empty">Chưa có contract. <a href="/hq/master-data?r=contracts">Upload Excel Contracts</a>.</div> :
       contracts.map(c => (
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
                    <th>Invoice</th>
                    <th>Date</th>
                    <th className="num">Amount (VND)</th>
                    <th className="num">VAT</th>
                    <th>Payment Request</th>
                    <th className="num">Amount</th>
                    <th className="num">Retention (5%)</th>
                    <th>Due date</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoices[c.id] || []).map(inv => {
                    const reqs = paymentRequests[inv.id] || [];
                    return reqs.length > 0 ? reqs.map((req, i) => (
                      <tr key={req.id}>
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
                        <td><span className={`badge workflow-${req.status || 'PENDING'}`}>{req.status || 'PENDING'}</span></td>
                      </tr>
                    )) : (
                      <tr key={inv.id}>
                        <td><code>{inv.invoice_no}</code></td>
                        <td>{inv.invoice_date || '—'}</td>
                        <td className="num">{vnd(inv.amount)}</td>
                        <td className="num">{vnd(inv.vat_amount)}</td>
                        <td colSpan={4} style={{ color: 'var(--c-text-2)', fontSize: 11 }}>Chưa có payment request</td>
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

      <p className="empty" style={{ marginTop: 16, fontSize: 11 }}>
        Chưa có: retention release workflow, multi-level approver.
      </p>

      {/* Add milestone modal */}
      {showAddModal && (
        <div className="modal-backdrop" onClick={() => !addBusy && setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>Add Payment Request (Milestone)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }}>
              <label style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Contract *</div>
                <select value={addForm.contract_id} onChange={e => setAddForm({...addForm, contract_id: e.target.value, invoice_id: ''})} style={{ width: '100%', padding: 6 }}>
                  <option value="">-- Chọn contract --</option>
                  {contracts.map(c => <option key={c.id} value={c.id}>{c.contract_no} - {c.contract_name}</option>)}
                </select>
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Invoice *</div>
                <select value={addForm.invoice_id} onChange={e => setAddForm({...addForm, invoice_id: e.target.value})} style={{ width: '100%', padding: 6 }} disabled={!addForm.contract_id}>
                  <option value="">-- Chọn invoice --</option>
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
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Retention</div>
                <input type="number" value={addForm.retention_amount} onChange={e => setAddForm({...addForm, retention_amount: e.target.value})} style={{ width: '100%', padding: 6 }} />
              </label>
              <label style={{ gridColumn: 'span 2' }}>
                <div style={{ fontSize: 11, color: 'var(--c-text-2)' }}>Due date</div>
                <input type="date" value={addForm.due_date} onChange={e => setAddForm({...addForm, due_date: e.target.value})} style={{ width: '100%', padding: 6 }} />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowAddModal(false)} disabled={addBusy}>Hủy</button>
              <button className="btn" onClick={doAdd} disabled={addBusy}>{addBusy ? '...' : 'Tạo'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
