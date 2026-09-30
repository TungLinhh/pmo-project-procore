// HealthConfig — cấu hình điều khiển PMO: ngưỡng đèn (SRS FR-1.6) + gate liên
// trụ cột (SRS 3.1). Backend requireRole admin/ceo/pmo + audit. scope=project
// override riêng từng dự án; scope=tenant làm default cho mọi project.
import { useEffect, useState } from 'react';
import { projects as api } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';
import { t, th, useLang } from '../i18n/index.js';

function dirHint() {
  return {
  high_bad: t('hc.dir_higher_worse'),
  low_bad: t('hc.dir_lower_worse'),
};
}

function scopeLabel() {
  return { default: t('hc.lbl_default'), tenant: 'Tenant', project: t('hc.lbl_project') };
}

export default function HealthConfig() {
  useLang(); // re-render table headers on VI/EN toggle
  const [projectId, setProjectId] = useState(null);
  const [scope, setScope] = useState('project');
  const [rows, setRows] = useState([]);
  const [gates, setGates] = useState([]);
  const [gateScope, setGateScope] = useState('project');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.list().then((list) => {
      const arr = Array.isArray(list) ? list : [];
      const demo = arr.find((p) => p.code === 'BTE-WP4-HBC') || arr[0];
      if (demo) setProjectId(demo.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api.healthThresholds(projectId)
      .then((d) => setRows(Array.isArray(d) ? d.map((r) => ({ ...r })) : []))
      .catch((e) => toast.error(t('hc.err_load_threshold') + e.message));
    api.pillarGates(projectId)
      .then((d) => setGates(Array.isArray(d?.gates) ? d.gates.map((g) => ({ ...g })) : []))
      .catch((e) => toast.error(t('hc.err_load_gate') + e.message));
  }, [projectId]);

  const setVal = (metric, k, v) => setRows((rs) => rs.map((r) => (r.metric === metric ? { ...r, [k]: v } : r)));
  const setGate = (id, k, v) => setGates((gs) => gs.map((g) => (g.id === id ? { ...g, [k]: v } : g)));

  async function save() {
    const thresholds = [];
    for (const r of rows) {
      // Number('') is 0, so clearing a field passed validation and wrote a
      // threshold of 0 — which turns e.g. approval_pct=0 into "everything is
      // red" with no warning. Reject a blank explicitly.
      const yRaw = String(r.yellow_at ?? '').trim().replace(',', '.');
      const dRaw = String(r.red_at ?? '').trim().replace(',', '.');
      if (yRaw === '' || dRaw === '') { toast.error(`${r.metric}: nhập số cho cả 2 ngưỡng`); return; }
      const y = Number(yRaw), d = Number(dRaw);
      if (!Number.isFinite(y) || !Number.isFinite(d)) { toast.error(`${r.metric}: nhập số cho cả 2 ngưỡng`); return; }
      if (r.direction === 'high_bad' && y > d) { toast.error(`${r.metric}: high_bad cần vàng ≤ đỏ`); return; }
      if (r.direction === 'low_bad' && d > y) { toast.error(`${r.metric}: low_bad cần đỏ ≤ vàng`); return; }
      thresholds.push({ metric: r.metric, yellow_at: y, red_at: d });
    }
    setBusy(true);
    try {
      await api.saveThresholds(projectId, { scope, thresholds });
      toast.success(`Đã lưu ngưỡng (${scope === 'tenant' ? t('hc.scope_tenant_short') : t('hc.scope_project_short')})`);
      const d = await api.healthThresholds(projectId);
      setRows(Array.isArray(d) ? d : []);
    } catch (e) { toast.error(t('hc.err_save_threshold') + e.message); } finally { setBusy(false); }
  }

  async function saveGates() {
    const list = [];
    for (const g of gates) {
      const t = g.threshold_pct === '' || g.threshold_pct == null ? null : Number(g.threshold_pct);
      if (t != null && (!Number.isFinite(t) || t < 0 || t > 100)) { toast.error(`${g.id}: ngưỡng 0..100`); return; }
      list.push({ from: g.from, to: g.to, enabled: !!g.enabled, ...(t != null ? { threshold_pct: t } : {}) });
    }
    setBusy(true);
    try {
      await api.saveGates(projectId, { scope: gateScope, gates: list });
      toast.success(`Đã lưu gate (${gateScope === 'tenant' ? t('hc.scope_tenant_short') : t('hc.scope_project_short')})`);
      const d = await api.pillarGates(projectId);
      setGates(Array.isArray(d?.gates) ? d.gates : []);
    } catch (e) { toast.error(t('hc.err_save_gate') + e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('hc.h1')}</h1>
          <div className="meta">{t('hc.subtitle')}</div>
        </div>
      </div>
      <div className="filter-bar">
        <label>{t('hc.lbl_project')}</label>
        <ProjectPicker value={projectId} onChange={setProjectId} allowAll={false} />
        <label>{t('hc.lbl_scope')}<select value={scope} onChange={(e) => setScope(e.target.value)} style={{ marginLeft: 6 }}>
            <option value="project">{t('hc.scope_project')}</option>
            <option value="tenant">{t('hc.scope_tenant')}</option>
          </select>
        </label>
        <div className="right">
          <button className="btn btn-sm" onClick={save} disabled={busy || !projectId}>{t('hc.btn_save_threshold')}</button>
        </div>
      </div>
      <div className="section">
        <div className="data-table"><div className="data-table-body"><table>
          <thead><tr><th>{th("Chỉ số")}</th><th>{th("Ngữ nghĩa")}</th><th>{th("Vàng tại")}</th><th>{th("Đỏ tại")}</th><th>{th("Đang áp dụng")}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.metric}>
                <td><strong>{r.label_vi || r.metric}</strong><div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{r.metric}</div></td>
                <td style={{ fontSize: 12 }}>{dirHint()[r.direction] || r.direction}</td>
                <td><input type="number" step="any" value={r.yellow_at ?? ''} onChange={(e) => setVal(r.metric, 'yellow_at', e.target.value)} style={{ width: 90 }} /></td>
                <td><input type="number" step="any" value={r.red_at ?? ''} onChange={(e) => setVal(r.metric, 'red_at', e.target.value)} style={{ width: 90 }} /></td>
                <td><span className="badge">{scopeLabel()[r.scope] || r.scope}</span></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} style={{ color: 'var(--c-text-3)', fontSize: 12 }}>{t('hc.pick_project_first')}</td></tr>}
          </tbody>
        </table></div></div>
      </div>
      <div className="section">
        <div className="section-title">{t('hc.sec_gates')}</div>
        <div className="filter-bar">
          <label>{t('hc.lbl_scope')}<select value={gateScope} onChange={(e) => setGateScope(e.target.value)} style={{ marginLeft: 6 }}>
              <option value="project">{t('hc.scope_project')}</option>
              <option value="tenant">{t('hc.scope_tenant')}</option>
            </select>
          </label>
          <div className="right">
            <button className="btn btn-sm" onClick={saveGates} disabled={busy || !projectId}>{t('hc.btn_save_gate')}</button>
          </div>
        </div>
        <div className="data-table"><div className="data-table-body"><table>
          <thead><tr><th>{th("Cổng kiểm soát")}</th><th>{th("Điều kiện")}</th><th>{th("Mở")}</th><th>{th("Ngưỡng %")}</th><th>{th("Trạng thái")}</th><th>{th("Đang áp dụng")}</th></tr></thead>
          <tbody>
            {gates.map((g) => (
              <tr key={g.id}>
                <td><strong>{g.id}</strong><div style={{ fontSize: 11, color: 'var(--c-text-3)' }}>{g.from} → {g.to}</div></td>
                <td style={{ fontSize: 12 }}>{g.label_vi}</td>
                <td><input type="checkbox" checked={!!g.enabled} onChange={(e) => setGate(g.id, 'enabled', e.target.checked)} /></td>
                <td><input type="number" min={0} max={100} step="any" value={g.threshold_pct ?? ''} onChange={(e) => setGate(g.id, 'threshold_pct', e.target.value)} style={{ width: 80 }} /></td>
                <td><span className="badge">{g.state}</span></td>
                <td><span className="badge">{scopeLabel()[g.scope] || g.scope}</span></td>
              </tr>
            ))}
            {!gates.length && <tr><td colSpan={6} style={{ color: 'var(--c-text-3)', fontSize: 12 }}>{t('hc.pick_project_first_gate')}</td></tr>}
          </tbody>
        </table></div></div>
      </div>
    </div>
  );
}
