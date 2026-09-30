// PillarControlPanel — lớp điều khiển kịch bản GĐ2 (SRS Mục 4.2 + Mục 5/L5).
// Lớp nổi (overlay): chỉ hiển thị khi kích hoạt. Mô phỏng CTL-03→06 trước–sau,
// không tự ghi đè baseline; nút "Áp dụng" cần checkbox xác nhận
// (human-in-the-loop, SRS 4.2.3). Enterprise flag 'pillar-sim'.
import { useEffect, useState } from 'react';
import { request, getUser } from '../api/index.js';
import { toast } from './Toast.jsx';
import { useConfirm } from './Confirm.jsx';
import { t, th, useLang } from '../i18n/index.js';

function typeList() {
  return [
  { id: 'CTL-01', label: t('pctl.extend'), fields: [{ k: 'extend_days', label: t('pctl.o_days_extension'), def: 14, min: 1, max: 365, int: true }] },
  { id: 'CTL-02', label: t('pctl.compress'), fields: [
    { k: 'cut_days', label: t('pctl.o_days_to_cut'), def: 7, min: 1, max: 365, int: true },
    { k: 'priority_item_ids', label: t('pctl.f_work_item_hint'), def: [], array: true, optional: true },
    { k: 'cost_per_head_day', label: t('pctl.f_cost_per_md'), def: '', min: 0, max: 100000000, optional: true },
  ] },
  { id: 'CTL-03', label: t('pctl.warn_material_late'), fields: [{ k: 'delay_days', label: t('pctl.o_late_days'), def: 7, min: 1, max: 365, int: true }] },
  { id: 'CTL-04', label: t('pctl.o_slow_client'), fields: [{ k: 'late_days', label: t('pctl.o_days_delayed'), def: 14, min: 1, max: 365, int: true }] },
  { id: 'CTL-05', label: t('pctl.f_equip_pct'), fields: [{ k: 'delta_pct', label: t('pctl.o_pct_change'), def: 20, min: -99, max: 300, notZero: true }] },
  { id: 'CTL-06', label: t('pctl.warn_drawing_returned'), fields: [{ k: 'rounds', label: t('pctl.o_redo_rounds'), def: 1, min: 1, max: 10, int: true }, { k: 'days_per_round', label: t('pctl.o_days_per_round'), def: 5, min: 1, max: 90, int: true }] },
];
}

// Hàm, không phải hằng: `typeList()` tính nhãn `t()` lúc gọi, nên `FIELD_RULES` cũng
// phải dựng lại khi ngôn ngữ đổi — nếu để là hằng thì nó giữ nhãn của lần tải đầu.
function fieldRules() {
  const out = {};
  for (const type of typeList()) for (const f of type.fields) out[f.k] = f;
  return out;
}

function validateVals(vals) {
  for (const [k, raw] of Object.entries(vals)) {
    const r = fieldRules()[k];
    if (!r) continue;
    if (r.array) {
      if (!Array.isArray(raw) || (!r.optional && raw.length === 0)) return `Chọn ${r.label}`;
      continue;
    }
    if (raw === '' || raw == null) {
      if (r.optional) continue;
      return `Nhập ${r.label}`;
    }
    const v = Number(raw);
    if (!Number.isFinite(v)) return `${r.label} phải là số`;
    if (r.int && !Number.isInteger(v)) return `${r.label} phải là số nguyên`;
    if (v < r.min || v > r.max) return `${r.label} trong ${r.min}..${r.max}`;
    if (r.notZero && v === 0) return `${r.label} phải khác 0`;
  }
  return null;
}

const fmtVal = (v) => {
  if (v == null) return '—';
  if (typeof v === 'number') return v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
};

// Tên hiển thị tiếng Việt cho các chỉ số before/after (fallback: key gốc).
function metricLabels() {
  return {
  completion: t('pctl.f_milestone'), open_items: t('pctl.f_work_incomplete'),
  manpower_rate: t('pctl.f_productivity'), outstanding: t('pctl.o_payable_total'),
  payment_slip_days: t('pctl.o_late_pay'), manpower_idle_heads_days: t('pctl.f_idle_md'),
  next_procurement_start: t('pctl.f_next_po'), proposed_advance: t('pctl.f_advance'),
  procurement_slip_days: t('pctl.o_late_po'), remaining_days: t('pctl.o_days_saved'),
  material_need_shift_days: t('pctl.f_mat_date'), completion_shift_days: t('pctl.f_milestone_date'),
  headcount_change_pct: t('pctl.f_labour_pct2'), rework_days: t('pctl.o_redo_days'),
  affected_items: t('pctl.f_work_affected'), downstream_gates: 'Gate downstream',
  required_extra_pct: t('pctl.f_labour_pct'), extra_head_days: t('pctl.f_mandays_add'),
  estimated_cost_vnd: t('pctl.f_cost_est'),
  unready_drawings: t('pctl.warn_drawing'), pending_materials: t('pctl.warn_material'),
  priority_item_ids: t('pctl.f_work_item'),
  cash_in_total: t('pctl.o_collected'), cash_due_now: t('pctl.o_due'), cash_remaining: t('pctl.o_receivable'),
  advance_capacity: t('pctl.o_advance_capacity'), advance_coverage_pct: t('pctl.o_payable_cover'),
};
}
const metricLabel = (k) => metricLabels()[k] || k;

const asObj = (v) => {
  if (v && typeof v === 'object') return v;
  try { const parsed = JSON.parse(v || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
};

function RiskBadge({ risk }) {
  const cls = risk === 'HIGH' ? 'workflow-OVERDUE' : risk === 'MED' ? 'workflow-PENDING' : 'workflow-APPROVED';
  return <span className={`badge ${cls}`}>{risk || '—'}</span>;
}

export default function PillarControlPanel({ projectId, projectCode, onApplied }) {
  useLang(); // re-render table headers on VI/EN toggle
  const confirm = useConfirm();
  const [canSim, setCanSim] = useState(false);
  const [scenarios, setScenarios] = useState([]);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [type, setType] = useState('CTL-01');
  const [vals, setVals] = useState({ extend_days: 14 });
  const [preview, setPreview] = useState(null);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const viewer = getUser() || {};
  const viewerRole = viewer.is_ceo ? 'CEO' : String(viewer.role || '').toUpperCase();
  // SRS Table 9: PM/PMO decide "trong thẩm quyền" — the server measures the
  // impact caps. The client only hides the button for roles that can never
  // decide; a PM/PMO still sees it and gets the server's reason if it is refused.
  const canDecide = ['ADMIN', 'CEO', 'PM', 'PMO'].includes(viewerRole);
  const [authorityNote, setAuthorityNote] = useState(null);

  useEffect(() => {
    setPreview(null); setUnderstood(false); setScenarios([]); setScheduleItems([]);
    if (!projectId) return;
    request('/me/entitlements')
      .then((j) => setCanSim(Array.isArray(j?.features) && j.features.includes('pillar-sim')))
      .catch(() => setCanSim(false));
    refresh();
    request(`/projects/${projectId}/construction-schedule?limit=2000`)
      .then((rows) => setScheduleItems(Array.isArray(rows) ? rows.filter((item) => !(Number(item.progress_pct) >= 1 || item.status === 'DONE')) : []))
      .catch(() => setScheduleItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function refresh() {
    if (!projectId) return;
    try {
      const d = await request(`/projects/${projectId}/pillar-scenarios`);
      setScenarios(Array.isArray(d) ? d : []);
    } catch { setScenarios([]); }
  }

  function pickType(id) {
    setType(id);
    const def = {};
    for (const f of typeList().find((t) => t.id === id).fields) def[f.k] = f.def;
    setVals(def);
    setPreview(null); setUnderstood(false);
  }

  async function runSimulate() {
    const params = {};
    for (const [k, v] of Object.entries(vals)) params[k] = Array.isArray(v) ? v.map(Number) : Number(v);
    setBusy(true);
    try {
      const r = await request(`/projects/${projectId}/pillar-scenarios/simulate`, {
        method: 'POST', body: { type, params },
      });
      if (r.error) throw new Error(r.error);
      setPreview(r);
      setUnderstood(false);
      toast.success(`Mô phỏng ${type} xong — rủi ro ${asObj(r.result).risk}`);
      refresh();
    } catch (e) { toast.error(t('pctl.err_simulate') + e.message); } finally { setBusy(false); }
  }

  async function applyScenario(id) {
    const ok = await confirm({
      title: t('pctl.apply_new_baseline'),
      message: `Ghi đè ngày kế hoạch của project ${projectCode || projectId} theo scenario #${id}? Hành động ghi log và có thể rollback.`,
      confirmText: t('pctl.apply'), confirmStyle: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setAuthorityNote(null);
    try {
      const r = await request(`/pillar-scenarios/${id}/apply`, { method: 'POST' });
      if (r.error) throw new Error(r.error);
      toast.success(`Đã apply scenario #${id} (${r.changed ?? 0} hạng mục)`);
      setPreview(null); setUnderstood(false);
      refresh();
      if (onApplied) onApplied();
    } catch (e) {
      // A refusal inside the caller's authority is not a crash: show exactly
      // which limit was exceeded and who can sign it.
      if (/thẩm quyền|CEO\/Admin/.test(e.message)) setAuthorityNote(e.message);
      toast.error(t('pctl.err_apply') + e.message);
    } finally { setBusy(false); }
  }

  async function rollbackScenario(id) {
    const ok = await confirm({
      title: t('pctl.rollback'),
      message: `Khôi phục ngày kế hoạch gốc của project ${projectCode || projectId} cho scenario #${id}?`,
      confirmText: 'Rollback', confirmStyle: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await request(`/pillar-scenarios/${id}/rollback`, { method: 'POST' });
      if (r.error) throw new Error(r.error);
      toast.success(`Đã rollback scenario #${id} (${r.restored ?? 0} hạng mục)`);
      refresh();
      if (onApplied) onApplied();
    } catch (e) { toast.error(t('pctl.err_rollback') + e.message); } finally { setBusy(false); }
  }

  if (!projectId || !canSim) return null;
  const fields = typeList().find((t) => t.id === type).fields;
  const res = preview ? asObj(preview.result) : null;
  const inputErr = validateVals(vals);
  const cmpRows = res ? Object.keys({ ...(res.before || {}), ...(res.after || {}) }).map((k) => ({ k, b: res.before?.[k], a: res.after?.[k] })) : [];

  return (
    <div className="section" style={{ marginTop: 4 }}>
      <div className="section-title">{t('pctl.title')}</div>
      <div className="pillar-card" style={{ cursor: 'default' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end', marginBottom: 10 }}>
          <label style={{ fontSize: 12 }}>{t('pctl.scenario')}<select value={type} onChange={(e) => pickType(e.target.value)} style={{ marginLeft: 6 }}>
              {typeList().map((t) => <option key={t.id} value={t.id}>{t.id} — {t.label}</option>)}
            </select>
          </label>
          {fields.map((f) => (
            <label key={f.k} style={{ fontSize: 12 }}>{f.label}
              {f.array ? (
                <select multiple value={vals[f.k] || []} onChange={(e) => setVals((v) => ({ ...v, [f.k]: Array.from(e.target.selectedOptions, (o) => o.value) }))} style={{ minWidth: 220, minHeight: 62, marginLeft: 6 }}>
                  {scheduleItems.map((item) => <option key={item.id} value={item.id}>{item.name_vi || `#${item.id}`}</option>)}
                </select>
              ) : (
                <input type="number" min={f.min} max={f.max} step={f.int ? 1 : 'any'} value={vals[f.k] ?? ''} onChange={(e) => setVals((v) => ({ ...v, [f.k]: e.target.value }))} style={{ width: 90, marginLeft: 6 }} />
              )}
            </label>
          ))}
          <button className="btn btn-sm" onClick={runSimulate} disabled={busy || !!inputErr} title={inputErr || t('pctl.run')}>{t('pctl.simulate')}</button>
          {inputErr && <span style={{ fontSize: 11.5, color: 'var(--c-behind)' }}>{inputErr}</span>}
        </div>

        {res && (
          <div style={{ marginBottom: 10 }}>
            <div className="data-table"><div className="data-table-body"><table>
              <thead><tr><th>{th("Chỉ số")}</th><th>{th("Trước")}</th><th>{th("Sau")}</th></tr></thead>
              <tbody>
                {cmpRows.map((r) => (
                  <tr key={r.k}><td>{metricLabel(r.k)}</td><td>{fmtVal(r.b)}</td><td><strong>{fmtVal(r.a)}</strong></td></tr>
                ))}
                <tr><td>{t('pctl.sec_risk')}</td><td colSpan={2}><RiskBadge risk={res.risk} /></td></tr>
              </tbody>
            </table></div></div>
            <div className="breakdown" style={{ gridTemplateColumns: '1fr', marginTop: 8 }}>
              {(res.notes_vi || []).map((n, i) => <div className="row" key={i}><span className="k">›</span><span className="v" style={{ fontWeight: 400, textAlign: 'left' }}>{n}</span></div>)}
              <div className="row">
                {canDecide ? (<span className="k"><label><input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />{t('pctl.agree')}</label></span>) : (<span className="k">{t('pctl.f_decision')}</span>)}
                {canDecide ? (<span className="v"><button className="btn btn-sm" disabled={busy || !understood} onClick={() => applyScenario(preview.id)}>{t('pctl.apply_baseline')}</button></span>) : (<span className="v">{t('pctl.role_gate')}</span>)}
              </div>
              {authorityNote && (
                <div className="row" role="status">
                  <span className="k">ⓘ</span>
                  <span className="v" style={{ fontWeight: 400, textAlign: 'left', color: 'var(--c-watch)' }}>{authorityNote}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="data-table"><div className="data-table-body"><table>
          <thead><tr><th>{th("#")}</th><th>{th("Loại")}</th><th>{th("Trạng thái")}</th><th>{th("Rủi ro")}</th><th>{th("Tạo")}</th><th></th></tr></thead>
          <tbody>
            {scenarios.map((s) => {
              const r = asObj(s.result);
              return (
                <tr key={s.id}>
                  <td>{s.id}</td>
                  <td>{s.type}</td>
                  <td><span className="badge">{s.status}</span></td>
                  <td><RiskBadge risk={r.risk} /></td>
                  <td style={{ fontSize: 11 }}>{String(s.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {canDecide && s.status !== 'APPLIED' && <button className="btn btn-sm" disabled={busy} onClick={() => applyScenario(s.id)}>{t('g.apply')}</button>}
                    {canDecide && s.status === 'APPLIED' && <button className="btn btn-sm" disabled={busy} onClick={() => rollbackScenario(s.id)}>{t('g.rollback')}</button>}
                  </td>
                </tr>
              );
            })}
            {!scenarios.length && <tr><td colSpan={6} style={{ color: 'var(--c-text-3)', fontSize: 12 }}>{t('pctl.no_scenario')}</td></tr>}
          </tbody>
        </table></div></div>
      </div>
    </div>
  );
}
