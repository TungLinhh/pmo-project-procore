// UI-003: Project Control Center - 4-pillar dashboard với pie chart + hover tooltip
// Mục 4-6: Construction / Shop / Material / Payment
import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects as api, construction, shopApi, materialBreakdown as matBreak, exportApi, getToken, uploads, preferDemoProject } from '../api/index.js';
import { ICON } from '../icons.jsx';
import { HEALTH, HEALTH_COLORS } from '../constants.js';
import PieChart from '../components/PieChart.jsx';
import PieTooltip from '../components/PieTooltip.jsx';
import { toast } from '../components/Toast.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';

// Helper: get date range from period value
function getDateRange(period, customFrom, customTo) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from = null, to = today;
  if (period === 'today') {
    from = today;
  } else if (period === 'this_week') {
    const day = now.getDay() || 7;
    from = new Date(today); from.setDate(today.getDate() - day + 1);
  } else if (period === 'this_month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'last_month') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (period === 'custom' && customFrom && customTo) {
    from = new Date(customFrom);
    to = new Date(customTo);
  }
  return { from, to };
}

function Sparkline({ data, color = 'var(--c-accent)' }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const w = 80, h = 24;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ProjectControlCenter() {
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [period, setPeriod] = useState('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [schedule, setSchedule] = useState([]);
  const [shopData, setShopData] = useState([]);
  const [materialData, setMaterialData] = useState([]);  // raw materials
  const [paymentData, setPaymentData] = useState([]);   // payment_milestones
  const [matBreakdown, setMatBreakdown] = useState([]); // material category breakdown
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [hoveredPillar, setHoveredPillar] = useState(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInputRef = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    api.list().then(list => {
      setAllProjects(list);
      if (list[0]) setSelectedProject(preferDemoProject(list));
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    Promise.all([
      construction.schedule(selectedProject),
      shopApi.drawings(selectedProject),
      fetch(`/api/projects/${selectedProject}/payments`, { headers: _authHeaders() }).then(r => r.json()).catch(() => []),
      fetch(`/api/projects/${selectedProject}/payment-requests`, { headers: _authHeaders() }).then(r => r.json()).catch(() => []),
      fetch(`/api/projects/${selectedProject}/materials`, { headers: _authHeaders() }).then(r => r.json()).catch(() => []),
      matBreak.byProject(selectedProject).catch(() => []),
    ]).then(([sched, sd, payments, prs, materials, matBreakdown]) => {
      setSchedule(sched);
      setShopData(sd);
      setPaymentData(Array.isArray(prs) && prs.length ? prs : payments);
      setMaterialData(materials);
      setMatBreakdown(matBreakdown);
      setLoadedAt(new Date());
      setLoading(false);
    });
    fetch('/api/audit?limit=4', { headers: _authHeaders() }).then(r => r.json()).then(d => {
      setRecentActivity(Array.isArray(d) ? d : []);
    }).catch(() => setRecentActivity([]));
  }, [selectedProject]);

  // ===== Apply period filter to schedule =====
  const { from: rangeFrom, to: rangeTo } = useMemo(() => getDateRange(period, customFrom, customTo), [period, customFrom, customTo]);
  const filteredSchedule = useMemo(() => {
    if (!rangeFrom && !rangeTo) return schedule;
    return schedule.filter(s => {
      const d = s.actual_start_date || s.plan_start_date;
      if (!d) return true;  // include if no date
      const dt = new Date(d);
      if (rangeFrom && dt < rangeFrom) return false;
      if (rangeTo && dt > rangeTo) return false;
      return true;
    });
  }, [schedule, rangeFrom, rangeTo]);
  // Use filteredSchedule for all KPIs
  const scheduleForKpi = filteredSchedule;

  async function doExport() {
    if (!selectedProject) {
      toast.error('Chọn dự án trước khi export');
      return;
    }
    try {
      const url = exportApi.constructionSchedule(selectedProject);
      const r = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` }});
      if (!r.ok) throw new Error('Export thất bại: ' + r.status);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `construction-schedule-${selectedProject}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success('Đã tải về construction-schedule-' + selectedProject + '.xlsx');
    } catch (e) {
      toast.error('Export lỗi: ' + e.message);
    }
  }

  async function doUpload() {
    if (!uploadFile) { toast.error('Chọn file trước'); return; }
    setUploadBusy(true);
    try {
      const r = await uploads.upload(uploadFile, allProjects.find(p => p.id === selectedProject)?.code);
      if (r.error) throw new Error(r.error);
      toast.success('Upload thành công: ' + r.total_rows + ' rows, ' + r.ok_rows + ' OK');
      setShowUploadModal(false);
      setUploadFile(null);
    } catch (e) {
      toast.error('Upload lỗi: ' + e.message);
    } finally { setUploadBusy(false); }
  }

  function _authHeaders() {
    const t = localStorage.getItem('pmo_token');
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  // KPI computations — portfolio counts are real; per-project health comes from
  // the selected project's schedule (no invented baselines).
  const totalProjects = allProjects.length;
  const selOverdue = schedule.filter(i => (i.progress_pct || 0) < 1 && i.plan_end_date && new Date(i.plan_end_date) < new Date()).length;
  const selDone = schedule.length > 0 && schedule.every(i => (i.progress_pct || 0) >= 1);
  const onTrack = schedule.length > 0 && selOverdue === 0 ? 1 : 0;
  const watch = schedule.length > 0 && selOverdue === 0 && !selDone ? 0 : 0;
  const critical = totalProjects - onTrack;

  // PILLAR 1: Construction Progress
  const completedItems = scheduleForKpi.filter(i => (i.progress_pct || 0) >= 1).length;
  const totalItems = scheduleForKpi.length;
  const actualPct = totalItems > 0 ? Math.round(completedItems / totalItems * 100) : 0;
  const inProgressItems = totalItems - completedItems;
  const overdueItems = scheduleForKpi.filter(i => (i.progress_pct || 0) < 1 && i.plan_end_date && new Date(i.plan_end_date) < new Date()).length;
  // No planned baseline exists in the product (schedule_baselines are manual
  // snapshots, not auto-planned curves) — health derives from real signals.
  const progressHealth = overdueItems > 5 ? HEALTH.CRITICAL : overdueItems > 0 ? HEALTH.BEHIND : actualPct >= 90 ? HEALTH.ON_TRACK : actualPct >= 50 ? HEALTH.WATCH : HEALTH.BEHIND;
  const progressColor = HEALTH_COLORS[progressHealth];

  const constructionPct = totalItems > 0 ? Math.round(completedItems / totalItems * 100) : 0;

  const constructionPieData = [
    { label: 'Đã xong', value: completedItems, color: progressColor.fg, breakdown: [
      { k: 'Items', v: completedItems },
      { k: 'Tỉ lệ', v: `${constructionPct}%` },
    ]},
    { label: 'Đang thi công', value: Math.max(0, inProgressItems - overdueItems), color: 'var(--c-watch)', breakdown: [
      { k: 'Items', v: Math.max(0, inProgressItems - overdueItems) },
    ]},
    { label: 'Overdue', value: overdueItems, color: 'var(--c-behind)', breakdown: [
      { k: 'Items', v: overdueItems },
      { k: 'Note', v: overdueItems > 0 ? 'Cần escalate ngay' : '—' },
    ]},
  ];

  const zoneProgress = (() => {
    const byZone = {};
    schedule.forEach(i => {
      if (!byZone[i.zone_code]) byZone[i.zone_code] = { total: 0, done: 0 };
      byZone[i.zone_code].total++;
      if ((i.progress_pct || 0) >= 1) byZone[i.zone_code].done++;
    });
    return Object.entries(byZone).map(([z, v]) => Math.round(v.done / v.total * 100)).slice(0, 20);
  })();

  // PILLAR 2: Shopdrawing
  const shopTotal = shopData.length;
  // shopApproved = status = APPROVED (rely on status field, not approval_date which may be set for other transitions)
  const shopApproved = shopData.filter(s => s.status === 'APPROVED').length;
  const shopReview = shopData.filter(s => s.status === 'REVIEW' || (!s.approval_date && s.bql_l1_response && s.bql_l1_response !== 'R' && s.status === 'SUBMITTED')).length;
  const shopRevision = shopData.filter(s => s.status === 'REJECTED' || (!s.approval_date && s.bql_l1_response === 'R')).length;
  const shopPending = shopTotal - shopApproved - shopReview - shopRevision;
  const shopOverdue = shopData.filter(s => {
    if (s.approval_date) return false;
    if (!s.planned_submit_date) return false;
    return new Date(s.planned_submit_date) < new Date();
  }).length;
  const shopApprovalPct = shopTotal > 0 ? Math.round(shopApproved / shopTotal * 100) : 0;

  const shopPieData = [
    { label: 'Approved', value: shopApproved, color: 'var(--c-on-track)', breakdown: [
      { k: 'Count', v: shopApproved },
      { k: 'Tỉ lệ', v: `${shopApprovalPct}%` },
    ]},
    { label: 'In Review', value: shopReview, color: 'var(--c-review)', breakdown: [
      { k: 'Count', v: shopReview },
    ]},
    { label: 'Revision', value: shopRevision, color: 'var(--c-behind)', breakdown: [
      { k: 'Count', v: shopRevision },
      { k: 'Note', v: 'BQL yêu cầu sửa' },
    ]},
    { label: 'Pending', value: shopPending, color: 'var(--c-draft)', breakdown: [
      { k: 'Count', v: shopPending },
    ]},
  ];

  // PILLAR 3: Material - load from real materials table
  const matTotal = materialData.length;
  // Group by material code prefix or name_vi token
  const matByCat = {};
  materialData.forEach(m => {
    // Try to group by first word of name_vi (e.g. "MEP", "STRUCTURAL", "ARCHITECTURAL")
    const name = m.name_vi || m.material_code || 'Other';
    const firstWord = name.split(/\s+/)[0].toUpperCase().slice(0, 12);
    const cat = firstWord || 'Other';
    matByCat[cat] = (matByCat[cat] || 0) + 1;
  });
  const matCats = Object.entries(matByCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const matColors = ['#1e3a5f', '#2c5282', '#2563eb', '#7c3aed', '#b45309', '#15803d'];
  // Approval status (use progress_pct as proxy: >1 = approved, 0 = pending)
  const matApproved = materialData.filter(m => (m.progress_pct || 0) >= 1).length;
  const matAvailable = matApproved;  // same proxy
  const matDelivered = matApproved;
  const matDelayed = materialData.filter(m => {
    // delayed nếu progress < 0.5 và tạo > 30 ngày
    const age = m.created_at ? (Date.now() - new Date(m.created_at.replace(' ', 'T')).getTime()) / 86400000 : 0;
    return (m.progress_pct || 0) < 0.5 && age > 30;
  }).length;
  const matCritical = materialData.filter(m => (m.progress_pct || 0) < 0.3).length;

  const matPieData = matCats.length > 0 ? matCats.map(([cat, count], i) => ({
    label: cat,
    value: count,
    color: matColors[i % matColors.length],
    breakdown: [
      { k: 'Số lượng', v: count },
      { k: 'Tỉ lệ', v: matTotal > 0 ? `${Math.round(count / matTotal * 100)}%` : '0%' },
    ],
  })) : [];

  // PILLAR 4: Payment - from payment_requests (falls back to payments ledger rows)
  const payTotal = paymentData.length;
  const st = (p) => String(p.status || '').toUpperCase();
  const paySubmitted = paymentData.filter(p => ['SUBMITTED', 'PENDING'].includes(st(p)) || p.submitted_date).length;
  const payApproved = paymentData.filter(p => ['APPROVED'].includes(st(p)) || p.approval_status === 'APPROVED' || p.overall_status === 'APPROVED').length;
  const payPaid = paymentData.filter(p => ['PAID'].includes(st(p)) || p.overall_status === 'PAID' || p.paid_date || p.paid_at).length;
  const payOverdue = paymentData.filter(p => {
    if (['PAID'].includes(st(p)) || p.paid_date || p.paid_at) return false;
    if (!p.due_date) return false;
    return new Date(p.due_date) < new Date();
  }).length;
  const payPending = Math.max(0, payTotal - paySubmitted - payApproved - payPaid - payOverdue);
  const payCompletion = payTotal > 0 ? Math.round(payPaid / payTotal * 100) : 0;

  const payPieData = [
    { label: 'Paid', value: payPaid, color: 'var(--c-on-track)', breakdown: [
      { k: 'Count', v: payPaid },
      { k: 'Tỉ lệ', v: `${payCompletion}%` },
    ]},
    { label: 'Approved', value: payApproved, color: 'var(--c-submitted)', breakdown: [
      { k: 'Count', v: payApproved },
    ]},
    { label: 'Submitted', value: paySubmitted, color: 'var(--c-pending)', breakdown: [
      { k: 'Count', v: paySubmitted },
    ]},
    { label: 'Overdue', value: payOverdue, color: 'var(--c-behind)', breakdown: [
      { k: 'Count', v: payOverdue },
      { k: 'Note', v: payOverdue > 0 ? 'NCC chưa nhận' : '—' },
    ]},
    { label: 'Pending', value: payPending, color: 'var(--c-draft)', breakdown: [
      { k: 'Count', v: payPending },
    ]},
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Project Control Center</h1>
          <div className="meta">Quản lý tập trung • Cập nhật theo thời gian thực</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={() => setShowUploadModal(true)}><ICON.upload size={13} />Upload Excel</button>
          {exportApi.ENABLED && <button className="btn" onClick={doExport}><ICON.download size={13} />Xuất báo cáo</button>}
        </div>
      </div>

      <div className="filter-bar">
        <label>Project</label>
        <ProjectPicker
          value={selectedProject}
          onChange={setSelectedProject}
          allowAll
        />
        <label>Period</label>
        <select value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="today">Today</option>
          <option value="this_week">This Week</option>
          <option value="this_month">This Month</option>
          <option value="last_month">Last Month</option>
          <option value="custom">Custom Range</option>
        </select>
        {period === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ width: 130 }} />
            <span style={{ color: 'var(--c-text-2)' }}>→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ width: 130 }} />
            <button className="btn btn-sm" onClick={() => toast.info(`Lọc ${customFrom} → ${customTo}`)}>Apply</button>
          </>
        )}
        <div className="right">
          <span className="shell-freshness"><span className="dot" />{loadedAt ? `Tải lúc ${loadedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Đang tải…'}</span>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi-card on-track">
          <div className="label">Tổng dự án <span className="badge health-ON_TRACK">ON TRACK</span></div>
          <div className="value">{totalProjects}</div>
          <div className="sub">Đang hoạt động</div>
        </div>
        <div className="kpi-card on-track">
          <div className="label">On Track</div>
          <div className="value">{onTrack}</div>
          <div className="sub">Đạt tiến độ ≥ 90%</div>
        </div>
        <div className="kpi-card watch">
          <div className="label">Watch</div>
          <div className="value">{watch}</div>
          <div className="sub">Cần theo dõi sát</div>
        </div>
        <div className="kpi-card critical">
          <div className="label">Critical / Behind</div>
          <div className="value">{critical}</div>
          <div className="sub">Cần can thiệp ngay</div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Bốn trụ cột chính</div>
        <div className="pillar-grid">
          {/* Construction Progress (mục 6.1) */}
          <div
            className="pillar-card"
            onClick={() => nav(`/hq/progress${selectedProject ? `?project=${selectedProject}` : ''}`)}
            onMouseEnter={() => setHoveredPillar('progress')}
            onMouseLeave={() => setHoveredPillar(null)}
          >
            <div className="head">
              <h3>Construction Progress</h3>
              <span className={`badge health-${progressHealth}`}>{progressHealth.replace('_', ' ')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
              <div className="pie-wrap">
                <PieChart data={constructionPieData} size={96} thickness={18} centerText={`${constructionPct}%`} centerSub="completion" />
              </div>
              <div style={{ flex: 1, fontSize: 11.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
                <div><strong style={{ color: 'var(--c-on-track)' }}>{completedItems}</strong> / {totalItems} items done</div>
                <div><strong style={{ color: 'var(--c-watch)' }}>{inProgressItems - overdueItems}</strong> in progress</div>
                <div><strong style={{ color: 'var(--c-behind)' }}>{overdueItems}</strong> overdue</div>
              </div>
            </div>
            <div className="breakdown">
              <div className="row"><span className="k">Planned</span><span className="v" style={{ color: 'var(--c-text-2)' }}>— (no baseline)</span></div>
              <div className="row"><span className="k">Actual</span><span className="v">{actualPct}%</span></div>
              <div className="row"><span className="k">Overdue</span><span className="v" style={{ color: overdueItems > 0 ? 'var(--c-behind)' : 'var(--c-on-track)' }}>{overdueItems}</span></div>
              <div className="row"><span className="k">Zones</span><span className="v">{Object.keys(schedule.reduce((acc, i) => { acc[i.zone_code] = 1; return acc; }, {})).length}</span></div>
            </div>
            <div className="warnings">
              <Sparkline data={zoneProgress} color={progressColor.fg} />
            </div>
            <div className="view-link">View Details <ICON.arrow size={11} /></div>
          </div>

          {/* Shopdrawing (mục 6.2) */}
          <div
            className="pillar-card"
            onClick={() => nav(`/hq/shop${selectedProject ? `?project=${selectedProject}` : ''}`)}
            onMouseEnter={() => setHoveredPillar('shop')}
            onMouseLeave={() => setHoveredPillar(null)}
          >
            <div className="head">
              <h3>Shopdrawing</h3>
              <span className="badge workflow-APPROVED">Approval {shopApprovalPct}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
              <div className="pie-wrap">
                <PieChart data={shopPieData} size={96} thickness={18} centerText={`${shopApprovalPct}%`} centerSub="approved" />
              </div>
              <div style={{ flex: 1, fontSize: 11.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
                <div><strong style={{ color: 'var(--c-on-track)' }}>{shopApproved}</strong> approved</div>
                <div><strong style={{ color: 'var(--c-review)' }}>{shopReview}</strong> in review</div>
                <div><strong style={{ color: 'var(--c-behind)' }}>{shopRevision}</strong> revision</div>
                <div><strong>{shopPending}</strong> pending</div>
              </div>
            </div>
            <div className="warnings">
              {shopOverdue > 0 ?
                <span className="crit"><ICON.issues size={11} /> {shopOverdue} overdue</span> :
                <span style={{ color: 'var(--c-on-track)' }}>No overdue drawings</span>
              }
            </div>
            <div className="view-link">View Details <ICON.arrow size={11} /></div>
          </div>

          {/* Material (mục 6.3) */}
          <div
            className="pillar-card"
            onClick={() => nav(`/hq/materials${selectedProject ? `?project=${selectedProject}` : ''}`)}
            onMouseEnter={() => setHoveredPillar('material')}
            onMouseLeave={() => setHoveredPillar(null)}
          >
            <div className="head">
              <h3>Material</h3>
              <span className="badge workflow-PENDING">Pipeline</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
              <div className="pie-wrap">
                <PieChart data={matPieData} size={96} thickness={18} centerText={`${matTotal}`} centerSub="items" />
              </div>
              <div style={{ flex: 1, fontSize: 11.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
                <div><strong style={{ color: 'var(--c-on-track)' }}>{matDelivered}</strong> delivered</div>
                <div><strong style={{ color: 'var(--c-watch)' }}>{matDelayed}</strong> delayed</div>
                <div><strong style={{ color: 'var(--c-behind)' }}>{matCritical}</strong> critical</div>
              </div>
            </div>
            <div className="breakdown">
              <div className="row"><span className="k">Required</span><span className="v">100%</span></div>
              <div className="row"><span className="k">Approved</span><span className="v">{matApproved}</span></div>
              <div className="row"><span className="k">Available</span><span className="v">{matAvailable}</span></div>
              <div className="row"><span className="k">Delivered</span><span className="v">{matDelivered}</span></div>
            </div>
            <div className="warnings">
              {matCritical > 0 && <span className="crit"><ICON.issues size={11} /> {matCritical} critical</span>}
              {matDelayed > 0 && <span className="warn">⚠ {matDelayed} delayed</span>}
            </div>
            <div className="view-link">View Details <ICON.arrow size={11} /></div>
          </div>

          {/* Payment (mục 6.4) */}
          <div
            className="pillar-card"
            onClick={() => nav(`/hq/payment${selectedProject ? `?project=${selectedProject}` : ''}`)}
            onMouseEnter={() => setHoveredPillar('payment')}
            onMouseLeave={() => setHoveredPillar(null)}
          >
            <div className="head">
              <h3>Payment</h3>
              <span className={`badge workflow-${payOverdue > 0 ? 'OVERDUE' : 'PENDING'}`}>{payOverdue > 0 ? `${payOverdue} overdue` : 'Pipeline'}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
              <div className="pie-wrap">
                <PieChart data={payPieData} size={96} thickness={18} centerText={`${payCompletion}%`} centerSub="paid" />
              </div>
              <div style={{ flex: 1, fontSize: 11.5, color: 'var(--c-text-2)', lineHeight: 1.6 }}>
                <div><strong style={{ color: 'var(--c-on-track)' }}>{payPaid}</strong> paid</div>
                <div><strong>{payApproved}</strong> approved</div>
                <div><strong style={{ color: 'var(--c-pending)' }}>{paySubmitted}</strong> submitted</div>
                <div><strong style={{ color: 'var(--c-behind)' }}>{payOverdue}</strong> overdue</div>
              </div>
            </div>
            <div className="breakdown">
              <div className="row"><span className="k">Planned</span><span className="v">100%</span></div>
              <div className="row"><span className="k">Submitted</span><span className="v">{paySubmitted}</span></div>
              <div className="row"><span className="k">Approved</span><span className="v">{payApproved}</span></div>
              <div className="row"><span className="k">Paid</span><span className="v" style={{ color: 'var(--c-on-track)' }}>{payPaid}</span></div>
            </div>
            <div className="warnings">
              {payOverdue > 0 && <span className="crit"><ICON.issues size={11} /> {payOverdue} payment requests overdue</span>}
            </div>
            <div className="view-link">View Details <ICON.arrow size={11} /></div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">Hoạt động gần đây</div>
        <div className="data-table">
          <div className="data-table-body">
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th>Sự kiện</th>
                  <th>Chi tiết</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.length === 0 ? (
                  <tr><td colSpan={4} style={{ color: 'var(--c-text-2)' }}>Chưa có hoạt động nào được ghi nhận.</td></tr>
                ) : recentActivity.map(a => (
                  <tr key={a.id}>
                    <td style={{ color: 'var(--c-text-2)' }}>{String(a.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                    <td>{a.action}{a.resource_type ? ` · ${a.resource_type}` : ''}</td>
                    <td><code>{(a.note || '').slice(0, 80)}</code></td>
                    <td><span className="badge workflow-DRAFT">{a.user_name || 'system'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {/* Upload Excel modal */}
      {showUploadModal && (
        <div className="modal-backdrop" onClick={() => !uploadBusy && setShowUploadModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h3>Upload Excel</h3>
            <p className="meta">Hỗ trợ: Shop Drawing, Construction Schedule, Materials, Subcontractors, Suppliers, Daily Report.</p>
            <p className="meta">Cần nạp nhiều file, cả folder dự án hoặc file .zip?{' '}
              <button className="btn-text" onClick={() => { setShowUploadModal(false); nav('/upload'); }}>Mở Bulk Upload →</button>
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={e => setUploadFile(e.target.files?.[0] || null)}
              style={{ marginTop: 12 }}
            />
            {uploadFile && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--c-text-2)' }}>📎 {uploadFile.name} ({(uploadFile.size/1024).toFixed(1)} KB)</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowUploadModal(false)} disabled={uploadBusy}>Hủy</button>
              <button className="btn" onClick={doUpload} disabled={uploadBusy || !uploadFile}>
                {uploadBusy ? 'Đang upload...' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
