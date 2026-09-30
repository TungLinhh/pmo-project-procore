// Vận hành & Hiệu năng — SRS NFR task 9 (dashboard <3s / 20 dự án) + các tác
// vụ nền sắp xếp theo nhóm gọn gàng (TVGS / AI SLA / Backup), thay vì nằm
// rải rác. Mọi nút "Chạy ngay" đều do server giữ chuẩn role (admin/ceo) —
/// 403 hiện toast, không tự ẩn nút để UI đơn giản.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken, getUser, request, dashboard, ops, projects as projectsApi } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { t, th, useLang } from '../i18n/index.js';

const LIMIT_MS = 3000;

// Every "Chạy ngay" endpoint below is `requireRole('admin','ceo')`. CEO is
// role='pmo' + is_ceo (there is no 'ceo' role value), so test both.
const me = getUser() || {};
const canRunJobs = me.role === 'admin' || !!me.is_ceo;

async function timed(path) {
  const t0 = performance.now();
  const r = await fetch('/api' + path, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  await r.text();
  return { path, status: r.status, ms: Math.round(performance.now() - t0), cache: r.headers.get('X-Cache') };
}

const fmtMs = (ms) => (ms == null ? '—' : `${ms} ms`);
const verdict = (t) => (t.status === 200 && t.ms < LIMIT_MS ? 'pass' : 'fail');

function formatResult(status) {
  const result = status?.last_result ?? status?.lastResult;
  if (result == null) return null;
  if (typeof result === 'string') return result;
  if (typeof result !== 'object') return String(result);
  const parts = [];
  if (result.escalated_count != null) parts.push(`${result.escalated_count} lượt chuyển cấp`);
  if (result.drafted_count != null) parts.push(`${result.drafted_count} bản nháp`);
  if (result.drafts_created != null) parts.push(`${result.drafts_created} bản nháp`);
  if (result.error) parts.push(`Lỗi: ${result.error}`);
  if (result.status) parts.push(String(result.status));
  return parts.length ? parts.join(' · ') : t('ops.ran');
}

const detailText = (value) => {
  if (value == null || value === '' || value === 'null' || value === 'undefined') return '—';
  if (typeof value !== 'object') return String(value);
  return JSON.stringify(value, (_key, nested) => nested == null ? '—' : nested) || '—';
};

function JobCard({ title, cadence, desc, status, resultText, busy, onRun, noRun }) {
  return (
    <div className="pillar-card" style={{ cursor: 'default' }}>
      <div className="head">
        <h3>{title}</h3>
        <span className="badge workflow-PENDING">{cadence}</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--c-text-2)', lineHeight: 1.6, marginBottom: 8 }}>{desc}</div>
      <div className="breakdown">
        <div className="row"><span className="k">{t('ops.lbl_last_run')}</span><span className="v">{detailText(status?.last_run ?? status?.lastRun)}</span></div>
        <div className="row"><span className="k">{t('ops.result')}</span><span className="v">{resultText || '—'}</span></div>
      </div>
      {!noRun && (
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-sm" onClick={onRun} disabled={busy}>{busy ? t('ops.running') : t('ops.run_now')}</button>
        </div>
      )}
    </div>
  );
}

export default function Ops() {
  useLang(); // re-render table headers on VI/EN toggle
  const nav = useNavigate();
  const [projectCount, setProjectCount] = useState(null);
  const [firstPid, setFirstPid] = useState(null);
  const [measuring, setMeasuring] = useState(false);
  const [measuredAt, setMeasuredAt] = useState(null);
  const [samples, setSamples] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [portfolioNote, setPortfolioNote] = useState('');
  const [tvgs, setTvgs] = useState(null);
  const [sla, setSla] = useState(null);
  const [digest, setDigest] = useState(null);
  const [retention, setRetention] = useState(null);
  const [busy, setBusy] = useState({});
  const [readiness, setReadiness] = useState(null);
  const [readinessError, setReadinessError] = useState('');

  useEffect(() => {
    projectsApi.list().then((list) => {
      const arr = Array.isArray(list) ? list : [];
      setProjectCount(arr.length);
      if (arr[0]) setFirstPid(arr[0].id);
    }).catch(() => setProjectCount(null));
    ops.tvgsStatus().then(setTvgs).catch(() => setTvgs(null));
    ops.slaStatus().then(setSla).catch(() => setSla(null));
    // Both are admin/ceo endpoints like the other two; a non-privileged viewer
    // simply gets null and the card shows "—", which is honest.
    ops.digestStatus().then((d) => setDigest(d && typeof d === 'object' ? d : null)).catch(() => setDigest(null));
    ops.retentionStatus().then((d) => setRetention(d && typeof d === 'object' ? d : null)).catch(() => setRetention(null));
    request('/admin/production-readiness')
      .then((body) => { setReadiness(body); setReadinessError(''); })
      .catch((e) => { setReadiness(null); setReadinessError(e.message); });
    dashboard.portfolio().then((rows) => {
      setPortfolio(Array.isArray(rows) ? rows : []);
      setPortfolioNote('');
    }).catch((e) => {
      setPortfolio(null);
      setPortfolioNote(e?.status === 403 ? t('ops.no_portfolio_right') : t('ops.err_rollup') + (e.message || e));
    });
  }, []);

  async function measure() {
    if (!firstPid) { toast.error(t('ops.no_project')); return; }
    setMeasuring(true);
    try {
      const targets = [
        '/dashboard',
        '/dashboard/portfolio-kpi',
        `/projects/${firstPid}/control-summary`,
        `/projects/${firstPid}/pillar-gates`,
        `/projects/${firstPid}/s-curves`,
        `/projects/${firstPid}/health`,
        `/projects/${firstPid}/manpower-loading`,
      ];
      const out = [];
      for (const p of targets) {
        try { out.push(await timed(p)); }
        catch (e) { out.push({ path: p, status: 0, ms: null, cache: null, error: String(e.message || e) }); }
      }
      setSamples(out);
      setMeasuredAt(new Date());
      const worst = Math.max(...out.map((r) => r.ms || 0));
      if (out.every((t) => verdict(t) === 'pass')) toast.success(`Đạt NFR: max ${worst} ms < ${LIMIT_MS} ms`);
      else toast.error(`Chưa đạt: max ${worst} ms (ngưỡng ${LIMIT_MS} ms)`);
    } finally { setMeasuring(false); }
  }

  async function runJob(kind, fn) {
    setBusy((b) => ({ ...b, [kind]: true }));
    try {
      const r = await fn();
      toast.success(t('ops.ran_done'));
      // Re-read the job's own status so "Lần cuối" is the server's timestamp,
      // not a locally invented one. The SLA card used to set its result from a
      // payload with no timestamp, so its "Lần cuối" stayed "—" until a reload.
      if (kind === 'tvgs') ops.tvgsStatus().then(setTvgs).catch(() => {});
      if (kind === 'sla') ops.slaStatus().then(setSla).catch(() => {});
      if (kind === 'digest') ops.digestStatus().then((d) => setDigest(d && typeof d === 'object' ? d : null)).catch(() => {});
      if (kind === 'retention') ops.retentionStatus().then((d) => setRetention(d && typeof d === 'object' ? d : null)).catch(() => {});
      return r;
    } catch (e) { toast.error(t('ops.err_run') + (e.message || e)); }
    finally { setBusy((b) => ({ ...b, [kind]: false })); }
  }

  const maxMs = samples.length ? Math.max(...samples.map((r) => r.ms || 0)) : null;
  const tvgsResult = formatResult(tvgs);
  const slaResult = formatResult(sla);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('ops.title')}</h1>
          <div className="meta">{t('ops.nfr_desc')}</div>
        </div>
        <div className="page-header-right">
          <button className="btn" onClick={measure} disabled={measuring || !firstPid}>
            {measuring ? t('ops.measuring') : t('ops.measure_now')}
          </button>
        </div>
      </div>

      <div className="kpi-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="kpi-card on-track">
          <div className="label">{t('ops.nfr_threshold')}</div>
          <div className="value">&lt;3s</div>
          <div className="sub">{t('ops.portfolio_20')}</div>
        </div>
        <div className="kpi-card">
          <div className="label">{t('ops.your_projects')}</div>
          <div className="value">{projectCount ?? '…'}</div>
          <div className="sub">GET /api/projects</div>
        </div>
        <div className={`kpi-card ${maxMs == null ? '' : maxMs < LIMIT_MS ? 'on-track' : 'critical'}`}>
          <div className="label">{t('ops.last_measure')}</div>
          <div className="value" style={{ fontSize: 20 }}>{maxMs == null ? '—' : `${maxMs} ms`}</div>
          <div className="sub">{measuredAt ? measuredAt.toLocaleTimeString('vi-VN') : t('ops.never_measured_short')}</div>
        </div>
        <div className="kpi-card watch">
          <div className="label">{t('ops.lbl_bundled')}</div>
          <div className="value">10 → 1</div>
          <div className="sub">{t('ops.control_summary')}</div>
        </div>
      </div>

      <div className="section">
        <div className="section-title">{t('ops.release_check')}</div>
        {readinessError ? (
          <div className="meta">{t('ops.err_checklist')}{readinessError}</div>
        ) : readiness ? (
          <div className={`gate-banner ${readiness.ready ? 'feedback' : ''}`}>
            <strong>{readiness.ready ? t('ops.release_ok') : t('ops.release_not_ok')}</strong>
            {t('ops.readiness_counts', { passed: readiness.summary.passed, failed: readiness.summary.failed, warnings: readiness.summary.warnings })}
          </div>
        ) : <div className="meta">{t('ops.checking_env')}</div>}
        {readiness?.checks && <div className="data-table" style={{ marginTop: 8 }}><div className="data-table-body"><table>
          <thead><tr><th>{th("Kiểm tra")}</th><th>{th("Kết quả")}</th><th>{th("Chi tiết")}</th></tr></thead>
          <tbody>{readiness.checks.map((check) => <tr key={check.id}>
            <td>{check.label}</td>
            <td><span className={`badge ${check.ok ? 'workflow-APPROVED' : 'workflow-REJECTED'}`}>{check.ok ? t('ops.pass_lower') : t('ops.lbl_error')}</span></td>
            <td>{detailText(check.detail)}</td>
          </tr>)}</tbody>
        </table></div></div>}
      </div>

      <div className="section">
        <div className="section-title">{t('ops.measure_detail')}</div>
        <div className="data-table"><div className="data-table-body"><table>
          <thead><tr><th>{th("Đường dẫn API")}</th><th className="num">{th("HTTP")}</th><th className="num">{th("Thời gian")}</th><th>{th("Cache")}</th><th>{th("Kết quả")}</th></tr></thead>
          <tbody>
            {/* Tham số callback ĐỪNG đặt tên là `t`: nó che hàm `t()` dịch của
                i18n, và `t('…')` bên trong sẽ gọi lên object mẫu đo →
                `TypeError: t is not a function`. Bảng này render ngay khi bấm
                `Đo ngay` nên lỗi lộ ra gần như chắc chắn. */}
            {samples.map((sample) => (
              <tr key={sample.path}>
                <td><code>GET {sample.path}</code></td>
                <td className="num">{sample.status || '—'}</td>
                <td className="num">{fmtMs(sample.ms)}</td>
                <td>{sample.cache ? <span className="badge workflow-DRAFT">{sample.cache}</span> : '—'}</td>
                <td>
                  {sample.ms == null ? <span style={{ color: 'var(--c-text-3)' }}>{sample.error || t('ops.not_measured')}</span>
                    : verdict(sample) === 'pass'
                      ? <span className="badge health-ON_TRACK">{t('ops.pass')}</span>
                      : <span className="badge health-CRITICAL">{t('ops.fail')}</span>}
                </td>
              </tr>
            ))}
            {!samples.length && <tr><td colSpan={5} style={{ color: 'var(--c-text-3)', fontSize: 12 }}>{t('ops.never_measured')}</td></tr>}
          </tbody>
        </table></div></div>
      </div>

      <div className="section">
        <div className="section-title">{t('ops.portfolio')}</div>
        {portfolioNote && <div className="meta" style={{ marginBottom: 8 }}>{portfolioNote}</div>}
        {portfolio && (
          <div className="data-table"><div className="data-table-body"><table>
            <thead><tr><th>{th("Dự án")}</th><th className="num">{th("Sức khỏe")}</th><th className="num">{th("Shop duyệt")}</th><th className="num">{th("MSB chờ")}</th><th className="num">{th("Vật tư quá hạn")}</th><th className="num">{th("Nhân lực hôm nay")}</th><th className="num">{th("Issues mở / nặng")}</th></tr></thead>
            <tbody>
              {portfolio.map((row) => (
                <tr key={row.project.id}>
                  <td><strong>{row.project.code}</strong> <span style={{ color: 'var(--c-text-2)' }}>{row.project.name_vi}</span></td>
                  <td className="num"><span className={`badge health-${(row.health?.overall || 'unknown').toUpperCase()}`}>{row.health?.overall || t('ops.no_data')}</span></td>
                  <td className="num">{row.shop_drawings.approved}/{row.shop_drawings.total}</td>
                  <td className="num">{row.submittals.pending}</td>
                  <td className="num" style={{ color: row.materials.overdue > 0 ? 'var(--c-behind)' : undefined }}>{row.materials.overdue}</td>
                  <td className="num">{row.manpower_today}</td>
                  <td className="num">{row.issues.open} / {row.issues.high}</td>
                </tr>
              ))}
              {!portfolio.length && <tr><td colSpan={7} style={{ color: 'var(--c-text-3)', fontSize: 12 }}>{t('ops.no_active')}</td></tr>}
            </tbody>
          </table></div></div>
        )}
      </div>

      <div className="section">
        <div className="section-title">{t('ops.bg_jobs')}</div>
        <div className="pillar-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          <JobCard
            title={t('ops.job_tvgs')} cadence={t('ops.every_hour')}
            desc={t('ops.job_tvgs_note')}
            status={tvgs} resultText={tvgsResult}
            busy={busy.tvgs} noRun={!canRunJobs} onRun={() => runJob('tvgs', ops.tvgsRun)}
          />
          <JobCard
            title={t('ops.job_ai_sla')} cadence={t('ops.every_hour')}
            desc={t('ops.job_ai_sla_note')}
            status={sla} resultText={slaResult}
            busy={busy.sla} noRun={!canRunJobs} onRun={() => runJob('sla', ops.slaRun)}
          />
          <JobCard
            title={t('ops.job_digest')} cadence={t('ops.daily')}
            desc={t('ops.job_digest_note')}
            status={digest} resultText={null}
            busy={busy.digest} noRun={!canRunJobs} onRun={() => runJob('digest', ops.digestRun)}
          />
          <JobCard
            title={t('ops.job_retention')} cadence="00:xx"
            desc={t('ops.job_retention_note')}
            status={retention} resultText={null}
            busy={busy.retention} noRun={!canRunJobs} onRun={() => runJob('retention', ops.retentionRun)}
          />
          <JobCard
            title={t('ops.job_reindex')} cadence={t('ops.manual')}
            desc={t('ops.job_reindex_note')}
            status={null} resultText={null}
            busy={busy.backfill} noRun={!canRunJobs} onRun={() => runJob('backfill', ops.aiBackfill)}
          />
          <JobCard
            title={t('ops.job_backup')} cadence="02:00"
            desc={t('ops.job_backup_note')}
            status={null} resultText={null} noRun
          />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="btn btn-secondary" onClick={() => nav('/hq/backups')}>{t('ops.open_backup')}</button>
          <button className="btn btn-secondary" onClick={() => nav('/hq/health-config')}>{t('ops.open_health')}</button>
        </div>
      </div>
    </div>
  );
}
