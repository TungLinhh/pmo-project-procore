// UI-003: Project Control Center - 4-pillar dashboard với pie chart + hover tooltip
// Mục 4-6: Construction / Shop / Material / Payment
import { useEffect, useState, useMemo, useRef } from 'react';
import { progressFraction, isComplete, isOverdue } from '../utils/progress.js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { projects as api, construction, shopApi, materialBreakdown as matBreak, exportApi, getToken, getUser, request, uploads, preferDemoProject, qa } from '../api/index.js';
import { ICON } from '../icons.jsx';
import { HEALTH, HEALTH_COLORS } from '../constants.js';
import PieChart from '../components/PieChart.jsx';
import PillarControlPanel from '../components/PillarControlPanel.jsx';
import { toast } from '../components/Toast.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';
import { getLang, t, th, useLang } from '../i18n/index.js';
import Modal from '../components/Modal.jsx';

// Helper: get date range from period value
function getDateRange(period, customFrom, customTo) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from = null, to = today;
  if (period === 'all') {
    from = null;
    to = null;
  } else if (period === 'today') {
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

// SRS FR-1.7: mini S-curve KH (xám đứt) vs TT (màu) lũy kế. Ẩn khi <2 điểm.
function SCurveMini({ curve, color = 'var(--c-accent)', title }) {
  const p = curve?.planned, a = curve?.actual;
  if (!p?.values?.length && !a?.values?.length) return null;
  const labels = [...new Set([...(p?.labels || []), ...(a?.labels || [])])].sort();
  if (labels.length < 2) return null;
  const at = (s) => {
    let v = 0;
    const m = new Map((s?.labels || []).map((l, i) => [l, s.values[i]]));
    return labels.map((l) => { if (m.has(l)) v = m.get(l); return v; });
  };
  const ps = at(p), as = at(a);
  const max = Math.max(...ps, ...as, 1);
  const w = 220, h = 40;
  const line = (vals) => vals.map((v, i) => `${(i / (labels.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(' ');
  return (
    <div className="s-curve-mini" title={title || `S-curve ${labels[0]} → ${labels[labels.length - 1]}`}>
      <svg width="100%" height="36" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-label={title || t('cc.scurve')}>
        <polyline points={line(ps)} fill="none" stroke="var(--c-text-3)" strokeWidth="1.5" strokeDasharray="4 3" />
        <polyline points={line(as)} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="s-curve-legend">
        <span><span style={{ color: 'var(--c-text-3)' }}>┄</span>{t('cc.legend_planned_short')}</span>
        <span><span style={{ color }}>─</span>{t('cc.legend_actual')}</span>
      </div>
    </div>
  );
}

async function fetchJson(url) {
  return request(String(url).replace(/^\/api(?=\/)/, ''));
}

export default function ProjectControlCenter() {
  useLang(); // re-render table headers on VI/EN toggle
  const [allProjects, setAllProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [period, setPeriod] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [schedule, setSchedule] = useState([]);
  const [shopData, setShopData] = useState([]);
  const [materialData, setMaterialData] = useState([]);  // raw materials
  const [paymentData, setPaymentData] = useState([]);   // payment_milestones
  const [, setMatBreakdown] = useState([]); // material category breakdown
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loadedAt, setLoadedAt] = useState(null);
  const [loadInfo, setLoadInfo] = useState('');
  const [recentActivity, setRecentActivity] = useState([]);
  // SRS Mục 2.5 + 5: gate liên thông 4 trụ cột (lớp chờ điều kiện).
  const [gateInfo, setGateInfo] = useState(null);
  // SRS FR-1.7: S-curve KH vs TT từng trụ cột.
  const [sCurves, setSCurves] = useState(null);
  // SRS FR-1.6: đèn sức khỏe theo ngưỡng cấu hình được (thay logic cứng).
  const [healthInfo, setHealthInfo] = useState(null);
  const [qaInfo, setQaInfo] = useState(null);
  // SRS Mục 5/L5: lớp điều khiển chỉ hiển thị khi kích hoạt.
  const [showControl, setShowControl] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInputRef = useRef(null);
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const viewer = getUser() || {};
  const viewerRole = viewer.is_ceo ? 'CEO' : String(viewer.role || '').toUpperCase();
  const canControl = viewerRole === 'ADMIN' || viewerRole === 'CEO' || viewerRole === 'PM' || viewerRole === 'PMO';
  const canBulkUpload = viewerRole === 'ADMIN' || viewerRole === 'PM';

  useEffect(() => {
    // P2-10: unguarded await — network failure was an unhandled rejection.
    api.list().then(list => {
      const arr = Array.isArray(list) ? list : [];
      setAllProjects(arr);
      // Honour ?project=<id> so a deep link (or a pillar card that already
      // carries the project) opens that project instead of silently falling
      // back to the demo default.
      const wanted = Number(params.get('project'));
      const target = wanted && arr.some((p) => p.id === wanted) ? wanted : null;
      if (target) setSelectedProject(target);
      else if (arr[0]) setSelectedProject(preferDemoProject(arr));
    }).catch(() => {
      setAllProjects([]);
      setLoading(false);
      setLoadError(t('cc.projects_load_fail'));
    });
  }, []);

  // Keep the URL in step with the picker so refresh / share keeps the project.
  useEffect(() => {
    if (!selectedProject) return;
    if (Number(params.get('project')) === selectedProject) return;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('project', String(selectedProject));
      return next;
    }, { replace: true });
  }, [selectedProject]);

  useEffect(() => {
    let live = true;
    setSchedule([]); setShopData([]); setMaterialData([]); setPaymentData([]);
    setMatBreakdown([]); setGateInfo(null); setSCurves(null); setHealthInfo(null); setQaInfo(null);
    if (!selectedProject) {
      setLoading(false);
      setLoadError('');
      return () => { live = false; };
    }
    setLoading(true);
    setLoadError('');
    const t0 = performance.now();
    const done = (mode) => {
      if (!live) return;
      const at = new Date();
      setLoadedAt(at);
      setLoadInfo(mode);
      setLoading(false);
      try { window.dispatchEvent(new CustomEvent('pmo:data-loaded', { detail: { at: at.toISOString() } })); } catch {}
    };
    const applySummary = (sum, mode) => {
      if (!live) return;
      setSchedule(Array.isArray(sum.schedule) ? sum.schedule : []);
      setShopData(Array.isArray(sum.shop) ? sum.shop : []);
      const prs = Array.isArray(sum.payment_requests) ? sum.payment_requests : [];
      const pays = Array.isArray(sum.payments) ? sum.payments : [];
      setPaymentData(prs.length ? prs : pays);
      setMaterialData(Array.isArray(sum.materials) ? sum.materials : []);
      setMatBreakdown(Array.isArray(sum.material_breakdown) ? sum.material_breakdown : []);
      setGateInfo(sum.gates?.layers ? sum.gates : null);
      setSCurves(sum.curves?.shop ? sum.curves : null);
      setHealthInfo(sum.health?.signals ? sum.health : null);
      setQaInfo(sum.qa || null);
      done(mode);
    };
    (async () => {
      try {
        const sum = await api.controlSummary(selectedProject);
        if (!sum || !Array.isArray(sum.schedule)) throw new Error(t('cc.bad_summary'));
        applySummary(sum, `1 request gộp (${Math.round(performance.now() - t0)} ms)`);
      } catch {
        try {
          const [sched, sd, payments, prs, materials, breakdown, gates, curves, health, qaRows] = await Promise.all([
            construction.schedule(selectedProject),
            shopApi.drawings(selectedProject),
            fetchJson(`/api/projects/${selectedProject}/payments`),
            fetchJson(`/api/projects/${selectedProject}/payment-requests?limit=500`),
            fetchJson(`/api/projects/${selectedProject}/materials?limit=500`),
            matBreak.byProject(selectedProject),
            api.pillarGates(selectedProject),
            api.sCurves(selectedProject),
            api.health(selectedProject),
            qa.list(selectedProject),
          ]);
          applySummary({
            schedule: sched, shop: sd, payments, payment_requests: prs,
            materials, material_breakdown: breakdown, gates, curves, health,
            qa: {
              total: qaRows.length,
              open: qaRows.filter((row) => row.status === 'OPEN').length,
              failed: qaRows.filter((row) => row.status === 'FAILED').length,
              passed: qaRows.filter((row) => row.status === 'PASSED').length,
            },
          }, `9 request lẻ (${Math.round(performance.now() - t0)} ms)`);
        } catch (fallbackError) {
          if (!live) return;
          setLoadError(`Không tải đủ dữ liệu Control Center: ${fallbackError.message || fallbackError}`);
          setLoading(false);
        }
      }
      try {
        // Phải khoá theo dự án đang xem. Trước đây gọi `/api/audit?limit=4` không
        // lọc, nên với admin/CEO đó là 4 dòng **toàn tenant** (và với người khác là
        // mọi dự án của họ) — nhưng chúng hiện ngay dưới tiêu đề dự án, nên khi đang
        // xem `BTE-WP4-HBC` người dùng thấy dòng của dự án khác và không có cách nào
        // phân biệt. `/api/audit` đã hỗ trợ `project_id` (`routes/audit.js:39`) từ
        // trước — chỉ là không ai truyền.
        const activity = await fetchJson(`/api/audit?limit=4${selectedProject ? `&project_id=${selectedProject}` : ''}`);
        if (live) setRecentActivity(Array.isArray(activity) ? activity : []);
      } catch {
        if (live) setRecentActivity([]);
      }
    })();
    return () => { live = false; };
  }, [selectedProject, reloadTick]);

  useEffect(() => {
    if (!selectedProject) return undefined;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') setReloadTick((tick) => tick + 1);
    };
    const timer = window.setInterval(refreshWhenVisible, 60_000);
    window.addEventListener('focus', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
    };
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
      toast.error(t('cc.pick_project_export'));
      return;
    }
    try {
      const url = exportApi.projectReport(selectedProject);
      const r = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` }});
      if (!r.ok) throw new Error(t('cc.export_fail') + r.status);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const safeCode = String(selProject?.code || selectedProject).replace(/[^A-Za-z0-9-_]/g, '_');
      a.download = `bao-cao-${safeCode}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
      toast.success(t('cc.report_loaded'));
    } catch (e) {
      toast.error(t('cc.err_export') + e.message);
    }
  }

  async function doPrintReport() {
    if (!selectedProject) { toast.error(t('cc.pick_project_first')); return; }
    const popup = window.open('about:blank', '_blank');
    // Nội dung cửa sổ in ghi bằng `document.write` nên không đi qua React — dịch
    // thủ công ở đây, và `t()` lấy theo ngôn ngữ đang chọn.
    if (popup) popup.document.write(`<p style="font:14px sans-serif;padding:24px">${t('cc.preparing_report')}</p>`);
    try {
      const r = await fetch(exportApi.projectPrintReport(selectedProject, getLang(), true), {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${r.status}`);
      }
      const url = URL.createObjectURL(await r.blob());
      if (popup) {
        popup.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = `bao-cao-${selectedProject}.html`;
        a.click();
        URL.revokeObjectURL(url);
        toast.error(t('cc.print_fallback'));
      }
    } catch (e) {
      if (popup) popup.close();
      toast.error(t('cc.print_blocked') + e.message);
    }
  }

  async function doUpload() {
    if (!uploadFile) { toast.error(t('cc.pick_file_first')); return; }
    setUploadBusy(true);
    try {
      const r = await uploads.upload(uploadFile, allProjects.find(p => p.id === selectedProject)?.code);
      if (r.error) throw new Error(r.error);
      // Without a project the endpoint stages instead of ingesting and returns
      // neither counter, so the toast used to read "undefined dòng".
      toast.success(r.staged_only
        ? `Đã nạp file — chọn loại tài liệu ở màn Tải lên để ghi vào dữ liệu`
        : `Tải lên thành công: ${r.total_rows} dòng, ${r.ok_rows} dòng hợp lệ`);
      setShowUploadModal(false);
      setUploadFile(null);
    } catch (e) {
      toast.error(t('cc.err_upload') + e.message);
    } finally { setUploadBusy(false); }
  }

  // KPI computations — portfolio counts are real; per-project health comes from
  // the selected project's schedule (no invented baselines).
  // KPI strip: số liệu thật của DỰ ÁN ĐANG XEM (trừ thẻ tổng dự án).
  const totalProjects = allProjects.length;

  // PILLAR 1: Construction Progress
  const isOverdueItem = (i) => isOverdue(i);
  const selOverdue = schedule.filter(isOverdueItem).length;

  const completedItems = scheduleForKpi.filter(i => progressFraction(i.progress_pct) >= 1).length;
  const totalItems = scheduleForKpi.length;
  const actualPct = totalItems > 0
    ? Math.round(scheduleForKpi.reduce((sum, item) => sum + progressFraction(item.progress_pct), 0) / totalItems * 100)
    : null;
  const inProgressItems = totalItems - completedItems;
  const overdueItems = scheduleForKpi.filter(isOverdueItem).length;
  // Health is server-owned. Do not derive a second status from client counts.
  const levelToHealth = (lv) => (lv === 'green' ? HEALTH.ON_TRACK : lv === 'yellow' ? HEALTH.WATCH : lv === 'red' ? HEALTH.CRITICAL : HEALTH.WATCH);
  const progressHealth = healthInfo?.signals?.manpower?.level
    ? levelToHealth(healthInfo.signals.manpower.level)
    : null;
  const overallHealth = healthInfo?.overall ? levelToHealth(healthInfo.overall) : null;
  const progressColor = HEALTH_COLORS[progressHealth] || { fg: 'var(--c-text-3)' };

  const constructionPct = actualPct;
  const formatPct = (value) => value == null ? '—' : `${value}%`;

  const constructionPieData = [
    { label: t('cc.done'), value: completedItems, color: progressColor.fg, breakdown: [
      { k: t('cc.work_item'), v: completedItems },
      { k: t('cc.lbl_ratio'), v: formatPct(constructionPct) },
    ]},
    { label: t('cc.in_progress'), value: Math.max(0, inProgressItems - overdueItems), color: 'var(--c-watch)', breakdown: [
      { k: t('cc.work_item'), v: Math.max(0, inProgressItems - overdueItems) },
    ]},
    { label: t('cc.overdue'), value: overdueItems, color: 'var(--c-behind)', breakdown: [
      { k: t('cc.work_item'), v: overdueItems },
      { k: t('cc.lbl_note'), v: overdueItems > 0 ? t('cc.btn_escalate') : '—' },
    ]},
  ];

  const zoneProgress = (() => {
    const byZone = {};
    schedule.forEach(i => {
      if (!byZone[i.zone_code]) byZone[i.zone_code] = { total: 0, done: 0 };
      byZone[i.zone_code].total++;
      if (isComplete(i)) byZone[i.zone_code].done++;
    });
    return Object.entries(byZone).map(([, v]) => Math.round(v.done / v.total * 100)).slice(0, 20);
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
  const shopApprovalPct = shopTotal > 0 ? Math.round(shopApproved / shopTotal * 100) : null;

  const shopPieData = [
    { label: t('cc.approved'), value: shopApproved, color: 'var(--c-on-track)', breakdown: [
      { k: t('cc.count'), v: shopApproved },
      { k: t('cc.lbl_ratio'), v: formatPct(shopApprovalPct) },
    ]},
    { label: t('cc.review'), value: shopReview, color: 'var(--c-review)', breakdown: [
      { k: t('cc.count'), v: shopReview },
    ]},
    { label: t('cc.revision'), value: shopRevision, color: 'var(--c-behind)', breakdown: [
      { k: t('cc.count'), v: shopRevision },
      { k: t('cc.lbl_note'), v: t('cc.bql_revision') },
    ]},
    { label: t('cc.lbl_waiting'), value: shopPending, color: 'var(--c-draft)', breakdown: [
      { k: t('cc.count'), v: shopPending },
    ]},
  ];

  // PILLAR 3: Material - load from real materials table
  const matTotal = materialData.length;
  // Group by material code prefix or name_vi token
  const matByCat = {};
  materialData.forEach(m => {
    // Try to group by first word of name_vi (e.g. "MEP", "STRUCTURAL", "ARCHITECTURAL")
    const name = m.name_vi || m.material_code || t('g.other');
    const firstWord = name.split(/\s+/)[0].toUpperCase().slice(0, 12);
    const cat = firstWord || t('g.other');
    matByCat[cat] = (matByCat[cat] || 0) + 1;
  });
  const matCats = Object.entries(matByCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const matColors = ['#1e3a5f', '#2c5282', '#2563eb', '#7c3aed', '#b45309', '#15803d'];
  const referenceTime = loadedAt?.getTime() || 0;
  const matStatus = (material) => String(material.procurement_status || 'REQUESTED').toUpperCase();
  const matComplete = materialData.filter(m => ['DELIVERED', 'ACCEPTED'].includes(matStatus(m))).length;
  const matFollowUp = materialData.filter((material) => {
    const expected = material.expected_delivery_at ? new Date(`${material.expected_delivery_at}T00:00:00`) : null;
    return !['DELIVERED', 'ACCEPTED'].includes(matStatus(material))
      && expected && !Number.isNaN(expected.getTime()) && expected.getTime() < referenceTime;
  }).length;
  const matAtRisk = materialData.filter(m => ['REQUESTED', 'MSB_PREPARING', 'REJECTED'].includes(matStatus(m))).length;
  const matInTransit = materialData.filter(m => ['PO_ISSUED', 'PRODUCTION', 'IN_TRANSIT'].includes(matStatus(m))).length;
  const matWaiting = materialData.filter(m => ['REQUESTED', 'MSB_PREPARING', 'MSB_APPROVED'].includes(matStatus(m))).length;

  const matPieData = matCats.length > 0 ? matCats.map(([cat, count], i) => ({
    label: cat,
    value: count,
    color: matColors[i % matColors.length],
    breakdown: [
      { k: t('cc.count'), v: count },
      { k: t('cc.lbl_ratio'), v: matTotal > 0 ? `${Math.round(count / matTotal * 100)}%` : '0%' },
    ],
  })) : [];

  // PILLAR 4: Payment - from payment_requests (falls back to payments ledger rows)
  const payTotal = paymentData.length;
  const st = (p) => String(p.status || '').toUpperCase();
  const payPaid = paymentData.filter(p => st(p) === 'PAID' || p.overall_status === 'PAID' || p.paid_date || p.paid_at).length;
  const payApproved = paymentData.filter(p => !p.paid_date && !p.paid_at
    && (st(p) === 'APPROVED' || p.approval_status === 'APPROVED' || p.overall_status === 'APPROVED')).length;
  const payOverdue = paymentData.filter((payment) => {
    const status = st(payment);
    if (status === 'PAID' || payment.paid_date || payment.paid_at || status === 'APPROVED') return false;
    if (!payment.due_date) return false;
    return new Date(payment.due_date) < new Date();
  }).length;
  const paySubmitted = paymentData.filter((payment) => {
    const status = st(payment);
    if (status === 'PAID' || status === 'APPROVED' || payment.paid_date || payment.paid_at) return false;
    if (payment.due_date && new Date(payment.due_date) < new Date()) return false;
    return status === 'SUBMITTED' || Boolean(payment.submitted_date);
  }).length;
  const payPending = Math.max(0, payTotal - paySubmitted - payApproved - payPaid - payOverdue);
  const payCompletion = payTotal > 0 ? Math.round(payPaid / payTotal * 100) : null;

  const payPieData = [
    { label: t('cc.paid'), value: payPaid, color: 'var(--c-on-track)', breakdown: [
      { k: t('cc.count'), v: payPaid },
      { k: t('cc.lbl_ratio'), v: formatPct(payCompletion) },
    ]},
    { label: t('cc.approved'), value: payApproved, color: 'var(--c-submitted)', breakdown: [
      { k: t('cc.count'), v: payApproved },
    ]},
    { label: t('cc.sent'), value: paySubmitted, color: 'var(--c-pending)', breakdown: [
      { k: t('cc.count'), v: paySubmitted },
    ]},
    { label: t('cc.overdue'), value: payOverdue, color: 'var(--c-behind)', breakdown: [
      { k: t('cc.count'), v: payOverdue },
      { k: t('cc.lbl_note'), v: payOverdue > 0 ? t('cc.vendor_pending') : '—' },
    ]},
    { label: t('cc.lbl_waiting'), value: payPending, color: 'var(--c-draft)', breakdown: [
      { k: t('cc.count'), v: payPending },
    ]},
  ];

  // SRS Mục 5: lớp hiển thị dọc L1→L4 + gate "Chờ điều kiện".
  const layerOf = (pillar) => gateInfo?.layers?.find((l) => l.pillar === pillar) || null;
  const gateById = (id) => gateInfo?.gates?.find((g) => g.id === id) || null;
  const layerWaiting = (pillar) => layerOf(pillar)?.state === 'WAITING';
  // Compact "waiting" line: which gates block this pillar and their numbers.
  // The full reason_vi stays in the title attribute — the old inline text
  // ("G2: Mới 0% < ngưỡng 80% (Túc thời – 1 tuần)") was two lines of jargon
  // repeated for every card.
  const layerReason = (pillar) => {
    const l = layerOf(pillar);
    if (!l || l.state !== 'WAITING') return null;
    const blocked = (l.blocked_by || []).map((id) => gateById(id)).filter(Boolean);
    if (!blocked.length) return t('cc.await_condition');
    return `Chờ ${blocked.map((g) => `${g.id} ${Number(g.metric_value)}/${Number(g.threshold_pct)}%`).join(' · ')}`;
  };
  const layerReasonFull = (pillar) => {
    const l = layerOf(pillar);
    if (!l || l.state !== 'WAITING') return '';
    return (l.blocked_by || []).map((id) => gateById(id)).filter(Boolean)
      .map((g) => `${g.id}: ${g.reason_vi}`).join(' — ');
  };
  const gatesOpen = gateInfo?.gates?.filter((g) => g.state === 'OPEN').length ?? null;
  const gatesTotal = gateInfo?.gates?.length ?? null;
  const selProject = allProjects.find((p) => p.id === selectedProject) || null;
  const manpower7d = gateInfo?.metrics?.manpower_7d ?? null;

  return (
    <div className="control-center-page">
      <div className="page-header">
        <div>
          <h1>{t('cc.h1')}</h1>
          <div className="meta">{t('cc.subtitle')}</div>
        </div>
        <div className="page-header-right">
          {canControl && <button className="btn btn-secondary" onClick={() => setShowControl((v) => !v)}>{t('cc.btn_control_layer')}</button>}
          {canBulkUpload && <button className="btn btn-secondary" onClick={() => setShowUploadModal(true)}><ICON.upload size={13} />{t('cc.btn_excel')}</button>}
          <button className="btn btn-secondary" onClick={doPrintReport}>In / PDF</button>
          <button className="btn" onClick={doExport}><ICON.download size={13} />{t('cc.btn_export')}</button>
        </div>
      </div>

      <div className="filter-bar">
        <label>{t('cc.lbl_project')}</label>
        <ProjectPicker
          value={selectedProject}
          onChange={setSelectedProject}
        />
        <label title={t('cc.filter_period_title')}>{t('cc.lbl_period')}</label>
        <select value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="all">{t('cc.period_all')}</option>
          <option value="today">{t('cc.period_today')}</option>
          <option value="this_week">{t('cc.period_week')}</option>
          <option value="this_month">{t('cc.period_month')}</option>
          <option value="last_month">{t('cc.period_last_month')}</option>
          <option value="custom">{t('cc.period_custom')}</option>
        </select>
        {period === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ width: 130 }} />
            <span style={{ color: 'var(--c-text-2)' }}>→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ width: 130 }} />
            <button className="btn btn-sm" onClick={() => toast.info(`Lọc ${customFrom} → ${customTo}`)}>{t('cc.btn_apply')}</button>
          </>
        )}
        <div className="right">
          <span className="shell-freshness"><span className="dot" />{loadedAt ? `Tải lúc ${loadedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}${loadInfo ? ` · ${loadInfo}` : ''}` : t('cc.loading_dots')}</span>
        </div>
      </div>

      {canControl && showControl && (
        <PillarControlPanel projectId={selectedProject} projectCode={allProjects.find((p) => p.id === selectedProject)?.code} onApplied={() => setReloadTick((n) => n + 1)} />
      )}

      {/* Empty project: 0% vì chưa có dữ liệu, không phải vì tiến độ 0.
          Tránh ticket "số liệu sai" khi dự án mới tạo chưa upload. */}
      {!loading && selectedProject && !schedule.length && !shopData.length && !materialData.length && !paymentData.length && (
        <div className="section">
          <div className="empty" style={{ padding: '28px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{t('cc.empty_title')}</div>
            <div style={{ fontSize: 12.5, color: 'var(--c-text-2)', marginBottom: 12 }}>{t('cc.empty_help')}</div>
            {/* The header button is gated to admin/PM; this one was not, so a
                site/procurement user could open the write-immediately dialog. */}
            {canBulkUpload && <button className="btn" onClick={() => setShowUploadModal(true)}><ICON.upload size={13} />{t('cc.btn_excel_now')}</button>}
          </div>
        </div>
      )}

      {!loading && !selectedProject && !loadError && (
        <div className="section empty" style={{ padding: '28px 16px', textAlign: 'center' }}>
          <strong>{t('cc.empty_no_project')}</strong>
          <div style={{ marginTop: 6 }}>{t('cc.empty_pick_project')}</div>
        </div>
      )}

      <div className="kpi-strip">
        <div className="kpi-card on-track">
          <div className="label">{t('cc.empty_projects_assigned')}</div>
          <div className="value">{totalProjects}</div>
          <div className="sub">{t('cc.st_active')}</div>
        </div>
        <div className="kpi-card on-track">
          <div className="label">{t('cc.lbl_progress_viewing')}</div>
          <div className="value">{formatPct(actualPct)}</div>
          <div className="sub">{completedItems}/{totalItems} hạng mục hoàn thành</div>
        </div>
        <div className={`kpi-card ${selOverdue > 0 ? 'critical' : 'watch'}`}>
          <div className="label">{t('cc.lbl_overdue')}</div>
          <div className="value">{selOverdue}</div>
          <div className="sub">{t('cc.lbl_late_items')}</div>
        </div>
        <div className="kpi-card watch">
          <div className="label">{t('cc.lbl_manpower7')}</div>
          <div className="value">{manpower7d != null ? manpower7d : '…'}</div>
          <div className="sub">{t('cc.lbl_visits')}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">{t('cc.pillars_note')}</div>
        {/* Lớp 0 — Tổng quan dự án (SRS Mục 5): header dọc của stack */}
        <div className="layer-l0">
          <span className="layer-tag">{t('cc.layer0')}</span>
          <strong>{selProject ? selProject.code : '—'}</strong>
          <span className="meta">{selProject?.name_vi || t('cc.pick_project')}</span>
          <span className="right">
            {overallHealth && <span className={`badge health-${overallHealth}`} style={{ marginRight: 8 }}>{overallHealth.replace('_', ' ')}</span>}
            {gatesTotal != null ? `${gatesOpen}/${gatesTotal} cổng mở` : t('cc.loading_portal')}
          </span>
        </div>
        <div className="gate-strip">
          <span className="label">{t('cc.lbl_gate')}</span>
          {gateInfo?.gates?.map((g) => (
            <span
              key={g.id}
              className={`gate-pill ${g.state === 'OPEN' ? 'open' : g.state === 'DISABLED' ? 'off' : 'wait'}`}
              title={`${g.reason_vi || g.id}`}
            >
              {g.id} · {Number(g.metric_value)}/{Number(g.threshold_pct)}%
            </span>
          ))}
          {!gateInfo?.gates?.length && <span className="gate-pill off">{t('cc.loading_dots')}</span>}
        </div>
        {loading ? (
          <div className="pillar-grid" aria-label={t('cc.load_four_pillars')}>
            {[t('cc.pillar_shop'), t('cc.pillar_material'), t('cc.pillar_construction'), t('cc.pillar_payment')].map((label) => (
              <div className="pillar-card pillar-skeleton" key={label} aria-hidden="true">
                <strong>{label}</strong><span /><span /><span />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="empty gate-error">
            <strong>{t('cc.err_loading')}</strong>
            <div style={{ marginTop: 6 }}>{loadError}</div>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setReloadTick((n) => n + 1)}>{t('cc.btn_retry')}</button>
          </div>
        ) : (
        <div className="pillar-grid layer-stack">
          {/* Shopdrawing L1 (SRS Mục 2.1 + 5) */}
          <div
            className={`pillar-card${layerWaiting('shop') ? ' is-waiting' : ''}`}
            onClick={() => nav(`/hq/shop${selectedProject ? `?project=${selectedProject}` : ''}`)}
          >
            {layerWaiting('shop') && <div className="gate-banner" title={layerReasonFull('shop')}>{layerReason('shop')}</div>}
            <div className="head">
              <h3><span className="layer-tag">L1</span>{t('cc.pillar_shop')}</h3>
              <span className="badge workflow-APPROVED">{shopApprovalPct == null ? '—' : `${shopApprovalPct}% duyệt`}</span>
            </div>
            <div className="pillar-summary-row">
              <PieChart data={shopPieData} size={62} thickness={13} centerText={formatPct(shopApprovalPct)} centerSub={t('cc.suffix_approve')} />
              <div className="pillar-stats">
                <div><strong style={{ color: 'var(--c-on-track)' }}>{shopApproved}</strong>{t('cc.suffix_approved')}</div>
                <div><strong style={{ color: 'var(--c-review)' }}>{shopReview}</strong>{t('cc.suffix_review')}</div>
                <div><strong style={{ color: 'var(--c-behind)' }}>{shopRevision}</strong>{t('cc.suffix_revised')}</div>
                <div><strong>{shopPending}</strong>{t('cc.suffix_waiting')}</div>
              </div>
            </div>
            <div className="metric-grid">
              <div><span className="k">{t('cc.lbl_total_drawings')}</span><span className="v sm">{shopTotal}</span></div>
              <div><span className="k">{t('cc.lbl_late_submit')}</span><span className="v sm" style={{ color: shopOverdue > 0 ? 'var(--c-behind)' : 'var(--c-on-track)' }}>{shopOverdue}</span></div>
            </div>
            <div className="warnings">
              <SCurveMini curve={sCurves?.shop} title={t('sl.ph_scurve')} />
            </div>
            <div className="view-link">{t('cc.btn_detail')}<ICON.arrow size={11} /></div>
          </div>

          {/* Material L2 (SRS Mục 2.2 + 5) */}
          <div
            className={`pillar-card${layerWaiting('material') ? ' is-waiting' : ''}`}
            onClick={() => nav(`/hq/materials${selectedProject ? `?project=${selectedProject}` : ''}`)}
          >
            {layerWaiting('material') && <div className="gate-banner" title={layerReasonFull('material')}>{layerReason('material')}</div>}
            <div className="head">
              <h3><span className="layer-tag">L2</span>{t('cc.pillar_material')}</h3>
              <span className="badge workflow-PENDING">{matFollowUp > 0 ? `${matFollowUp} trễ` : 'OK'}</span>
            </div>
            <div className="pillar-summary-row">
              <PieChart data={matPieData} size={62} thickness={13} centerText={`${matTotal}`} centerSub={t('cc.suffix_unit_code')} />
              <div className="pillar-stats">
                <div><strong style={{ color: 'var(--c-on-track)' }}>{matComplete}</strong>{t('cc.suffix_received')}</div>
                <div><strong style={{ color: 'var(--c-watch)' }}>{matInTransit}</strong>{t('cc.suffix_late_deliver')}</div>
                <div><strong style={{ color: 'var(--c-behind)' }}>{matFollowUp}</strong>{t('cc.suffix_late_submit')}</div>
                <div><strong>{matWaiting}</strong>{t('cc.wait_msb_po')}</div>
              </div>
            </div>
            <div className="metric-grid">
              <div><span className="k">{t('cc.processing')}</span><span className="v sm">{matAtRisk}</span></div>
              <div><span className="k">{t('cc.lbl_feedback')}</span><span className="v sm" title={gateInfo?.feedback?.reason_vi || ''}>{gateInfo?.feedback?.state === 'WAITING' ? t('cc.g5_waiting') : '—'}</span></div>
            </div>
            <div className="warnings">
              <SCurveMini curve={sCurves?.material} title={t('cc.scurve_material')} />
            </div>
            <div className="view-link">{t('cc.btn_detail')}<ICON.arrow size={11} /></div>
          </div>

          {/* Construction + manpower L3 (SRS Mục 2.3 + 5) */}
          <div
            className={`pillar-card${layerWaiting('manpower') ? ' is-waiting' : ''}`}
            onClick={() => nav(`/hq/progress${selectedProject ? `?project=${selectedProject}` : ''}`)}
          >
            {layerWaiting('manpower') && <div className="gate-banner" title={layerReasonFull('manpower')}>{layerReason('manpower')}</div>}
            <div className="head">
              <h3><span className="layer-tag">L3</span>{t('cc.pillar_construction')}</h3>
              <span className={`badge ${progressHealth ? `health-${progressHealth}` : 'workflow-DRAFT'}`}>
                {progressHealth ? progressHealth.replace('_', ' ') : '—'}
              </span>
            </div>
            <div className="pillar-summary-row">
              <PieChart data={constructionPieData} size={62} thickness={13} centerText={formatPct(constructionPct)} centerSub="xong" />
              <div className="pillar-stats">
                <div><strong style={{ color: 'var(--c-on-track)' }}>{completedItems}</strong> xong / {totalItems}</div>
                <div><strong style={{ color: 'var(--c-watch)' }}>{Math.max(0, inProgressItems - overdueItems)}</strong>{t('cc.suffix_doing')}</div>
                <div><strong style={{ color: 'var(--c-behind)' }}>{overdueItems}</strong>{t('cc.suffix_overdue')}</div>
                <div><strong>{manpower7d ?? '—'}</strong>{t('cc.suffix_manpower7')}</div>
              </div>
            </div>
            <div className="metric-grid">
              <div><span className="k">{t('cc.lbl_last_plan')}</span><span className="v sm">{sCurves?.construction?.planned?.labels?.at(-1) || '—'}</span></div>
              <div><span className="k">{t('cc.lbl_zone')}</span><span className="v sm">{Object.keys(schedule.reduce((acc, i) => { acc[i.zone_code] = 1; return acc; }, {})).length}</span></div>
            </div>
            <div className="warnings">
              <SCurveMini curve={sCurves?.construction} title={t('cc.scurve_construction')} />
              {zoneProgress.length > 1 && (
                <span className="warn" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--c-text-3)' }} title={t('cc.lbl_progress_zone')}>
                  <Sparkline data={zoneProgress} color={progressColor.fg} />{t('cc.suffix_by_zone')}</span>
              )}
            </div>
            <div className="view-link">{t('cc.btn_detail')}<ICON.arrow size={11} /></div>
          </div>

          {/* Payment L4 (SRS Mục 2.4 + 5) */}
          <div
            className={`pillar-card${layerWaiting('payment') ? ' is-waiting' : ''}`}
            onClick={() => nav(`/hq/payment${selectedProject ? `?project=${selectedProject}` : ''}`)}
          >
            {layerWaiting('payment') && <div className="gate-banner" title={layerReasonFull('payment')}>{layerReason('payment')}</div>}
            <div className="head">
              <h3><span className="layer-tag">L4</span>{t('cc.pillar_payment')}</h3>
              <span className={`badge workflow-${payOverdue > 0 ? 'OVERDUE' : 'PENDING'}`}>{payOverdue > 0 ? t('cc.overdue_count', { n: payOverdue }) : 'OK'}</span>
            </div>
            <div className="pillar-summary-row">
              <PieChart data={payPieData} size={62} thickness={13} centerText={formatPct(payCompletion)} centerSub={t('cc.suffix_paid')} />
              <div className="pillar-stats">
                <div><strong style={{ color: 'var(--c-on-track)' }}>{payPaid}</strong>{t('cc.suffix_paid')}</div>
                <div><strong>{payApproved}</strong>{t('cc.suffix_approved')}</div>
                <div><strong style={{ color: 'var(--c-pending)' }}>{paySubmitted}</strong>{t('cc.suffix_submitted')}</div>
                <div><strong style={{ color: 'var(--c-behind)' }}>{payOverdue}</strong>{t('cc.suffix_overdue')}</div>
              </div>
            </div>
            <div className="metric-grid">
              <div><span className="k">{t('cc.lbl_total_docs')}</span><span className="v sm">{payTotal}</span></div>
              <div><span className="k">{t('cc.lbl_waiting')}</span><span className="v sm">{payPending}</span></div>
            </div>
            <div className="warnings">
              <SCurveMini curve={sCurves?.payment} title={t('cc.scurve_payment')} />
            </div>
            <div className="view-link">{t('cc.btn_detail')}<ICON.arrow size={11} /></div>
          </div>

          {/* Optional extension pillar. The four SRS core cards above are unchanged. */}
          <div className="pillar-card" onClick={() => nav(`/hq/qa?project=${selectedProject}`)}>
            <div className="head">
              <h3><span className="layer-tag">+</span> QA/QC</h3>
              <span className={`badge ${qaInfo?.failed ? 'workflow-REJECTED' : 'workflow-APPROVED'}`}>
                {qaInfo?.failed ? `${qaInfo.failed} không đạt` : t('cc.pillar_control')}
              </span>
            </div>
            <div className="metric-grid">
              <div><span className="k">{t('cc.st_open')}</span><span className="v sm">{qaInfo?.open ?? '—'}</span></div>
              <div><span className="k">{t('cc.st_meet')}</span><span className="v sm" style={{ color: 'var(--c-on-track)' }}>{qaInfo?.passed ?? '—'}</span></div>
              <div><span className="k">{t('cc.st_miss')}</span><span className="v sm" style={{ color: qaInfo?.failed ? 'var(--c-behind)' : undefined }}>{qaInfo?.failed ?? '—'}</span></div>
              <div><span className="k">{t('cc.lbl_total')}</span><span className="v sm">{qaInfo?.total ?? '—'}</span></div>
            </div>
            <div className="view-link">{t('cc.btn_open_acceptance')}<ICON.arrow size={11} /></div>
          </div>
        </div>
        )}
      </div>

      <div className="section">
        <div className="section-title">{t('cc.sec_recent')}</div>
        <div className="data-table">
          <div className="data-table-body">
            <table>
              <thead>
                <tr>
                  <th>{th("Thời gian")}</th>
                  <th>{th("Sự kiện")}</th>
                  <th>{th("Chi tiết")}</th>
                  <th>{th("Trạng thái")}</th>
                </tr>
              </thead>
              <tbody>
                {recentActivity.length === 0 ? (
                  <tr><td colSpan={4} style={{ color: 'var(--c-text-2)' }}>{t('cc.empty_no_activity')}</td></tr>
                ) : recentActivity.map(a => (
                  <tr key={a.id}>
                    <td style={{ color: 'var(--c-text-2)' }}>{String(a.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                    <td>{a.action}{a.resource_type ? ` · ${a.resource_type}` : ''}</td>
                    <td><code>{(a.note || '').slice(0, 80)}</code></td>
                    <td><span className="badge workflow-DRAFT">{a.user_name || t('cc.suffix_system')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {/* Upload Excel modal */}
      {showUploadModal && (
        <Modal onClose={() => !uploadBusy && setShowUploadModal(false)} maxWidth={480}>
          <h3>{t('cc.btn_excel')}</h3>
          <p className="meta">{t('cc.help_sources')}</p>
          <p className="meta">{t('cc.bulk_hint')}{' '}
            <button className="btn-text" onClick={() => { setShowUploadModal(false); nav('/upload'); }}>{t('cc.btn_open_bulk')}</button>
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
            <button className="btn btn-secondary" onClick={() => setShowUploadModal(false)} disabled={uploadBusy}>{t('cc.btn_cancel')}</button>
            <button className="btn" onClick={doUpload} disabled={uploadBusy || !uploadFile}>
              {uploadBusy ? t('cc.loading_dots3') : t('cc.upload')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
