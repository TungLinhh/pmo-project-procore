// CompressPanel — schedule dependency links + CPM compression (v0.6.0).
// Links/auto-chain: schedule write (PM+). Preview/apply/rollback: Enterprise
// only ('schedule-compress' flag) — hidden below Enterprise, backend 403s anyway.
import { useEffect, useState } from 'react';
import { getUser, request } from '../api/index.js';
import { toast } from './Toast.jsx';
import { ICON } from '../icons.jsx';
import { useConfirm } from './Confirm.jsx';
import { t, th, useLang } from '../i18n/index.js';

// AI proposal bodies can be long — show a 2-line gist, full text in <details>.
const gist = (s, n = 220) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};

export default function CompressPanel({ projectId, onApplied }) {
  useLang(); // re-render table headers on VI/EN toggle
  const confirm = useConfirm();
  const [canCompress, setCanCompress] = useState(false);
  const [links, setLinks] = useState([]);
  const [linkCount, setLinkCount] = useState(null);
  // Manual link create form (P1: POST existed server-side, no UI).
  const [newPred, setNewPred] = useState('');
  const [newSucc, setNewSucc] = useState('');
  const [newType, setNewType] = useState('FS');
  const [newLag, setNewLag] = useState(0);
  // Compression scenarios (P1: list + rollback existed server-side only).
  const [scenarios, setScenarios] = useState([]);
  const [target, setTarget] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [understood, setUnderstood] = useState(false);
  // Suspensions (site shutdown spans) + excluded summary-row ids, sent as policy.
  const [gaps, setGaps] = useState([]);
  const [gapFrom, setGapFrom] = useState('');
  const [gapTo, setGapTo] = useState('');
  const [excluded, setExcluded] = useState([]);
  // Deadline (projects.end_date): CEO/PM/PMO propose → AI auto-proposes timeline.
  const [deadline, setDeadline] = useState('');
  const [deadlineInput, setDeadlineInput] = useState('');
  const [replan, setReplan] = useState(null);
  // Scenario management (admin/CEO): rename + retarget + delete.
  const me = getUser() || {};
  const canManage = me.role === 'admin' || !!me.is_ceo;
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editTarget, setEditTarget] = useState('');
  const [showAllItems, setShowAllItems] = useState(false);

  useEffect(() => {
    setPreview(null);
    setUnderstood(false);
    setGaps([]);
    setExcluded([]);
    if (!projectId) return;
    request('/me/entitlements')
      .then(j => setCanCompress(Array.isArray(j?.features) && j.features.includes('schedule-compress')))
      .catch(() => setCanCompress(false));
    request(`/projects/${projectId}/schedule-links`)
      .then(d => { setLinks(Array.isArray(d) ? d : []); setLinkCount(Array.isArray(d) ? d.length : null); })
      .catch(() => { setLinks([]); setLinkCount(null); });
    // Current deadline (projects.end_date) for the propose box.
    request('/projects')
      .then(list => {
        const p = (Array.isArray(list) ? list : []).find(x => String(x.id) === String(projectId));
        const ed = (p?.end_date || '').slice(0, 10);
        setDeadline(ed); setDeadlineInput(ed); setReplan(null);
      }).catch(() => {});
  }, [projectId]);

  async function refreshScenarios() {
    if (!projectId) return;
    try {
      const d = await request(`/projects/${projectId}/schedule-scenarios`);
      setScenarios(Array.isArray(d) ? d : []);
    } catch { setScenarios([]); }
  }

  useEffect(() => { refreshScenarios(); }, [projectId, canCompress]);

  async function autoChain() {
    setBusy(true);
    try {
      const p = await request(`/projects/${projectId}/schedule-links/auto-chain`, { method: 'POST', body: {} });
      if (p.error) throw new Error(p.error);
      if (!p.proposed?.length) { toast.success(t('cmp.no_new_links')); return; }
      const okChain = await confirm({
        title: t('cmp.auto_chain_full'),
        message: `Tạo ${p.proposed.length} liên kết FS theo thứ tự zone?${p.skipped?.length ? ` (${p.skipped.length} items khóa sẽ bỏ qua)` : ''}`,
        confirmText: t('cmp.create_links'), confirmStyle: 'primary',
      });
      if (!okChain) return;
      const w = await request(`/projects/${projectId}/schedule-links/auto-chain`, { method: 'POST', body: { confirm: true } });
      if (w.error) throw new Error(w.error);
      toast.success(`Đã tạo ${w.created} links`);
      setLinkCount((n) => (n ?? 0) + w.created);
    } catch (e) { toast.error(t('cmp.err_auto_chain') + e.message); } finally { setBusy(false); }
  }

  async function saveDeadline() {
    if (!deadlineInput || !/^\d{4}-\d{2}-\d{2}$/.test(deadlineInput)) { toast.error(t('cmp.deadline_format')); return; }
    setBusy(true);
    try {
      const r = await request(`/projects/${projectId}`, {
        method: 'PATCH', body: { end_date: deadlineInput },
      });
      if (r.error) throw new Error(r.error);
      setDeadline((r.end_date || deadlineInput).slice(0, 10));
      setReplan(r.replan || null);
      if (r.replan?.skipped) {
        toast.success(t('cmp.deadline_changed_no_ai') + (r.replan.reason || 'n/a') + ')');
      } else if (r.replan?.scenario) {
        toast.success(`Đã đổi deadline → AI đề xuất scenario #${r.replan.scenario.id} (${r.replan.out?.feasible ? `khả thi −${r.replan.out.days_saved}d` : t('cmp.not_feasible')})`);
        setTarget(deadlineInput); // prefill compression target with the new deadline
        setPreview({ scenario_id: r.replan.scenario.id, ...r.replan.out });
        setUnderstood(false);
        setShowAllItems(false);
        refreshScenarios();
      } else {
        toast.success(t('cmp.deadline_changed'));
      }
      onApplied?.();
    } catch (e) { toast.error(t('cmp.err_deadline') + e.message); } finally { setBusy(false); }
  }

  async function runPreview(extraPolicy = {}) {
    if (!target) { toast.error(t('cmp.pick_target_first')); return; }
    setBusy(true);
    try {
      const r = await request(`/projects/${projectId}/schedule-compress/preview`, {
        method: 'POST', body: { target_end_date: target, policy: { suspensions: gaps, exclude_ids: excluded, ...extraPolicy } },
      });
      if (r.error) throw new Error(r.error);
      setPreview(r);
      setUnderstood(false);
      setShowAllItems(false);
      if (Array.isArray(r.excluded_ids)) setExcluded(r.excluded_ids);
    } catch (e) { toast.error(t('cmp.err_preview') + e.message); } finally { setBusy(false); }
  }

  async function excludeAndPreview() {
    const ids = (preview?.summary_candidates || []).map(c => c.id);
    if (!ids.length) return;
    setExcluded(ids);
    await runPreview({ exclude_ids: ids });
  }

  async function applyScenario() {
    if (!preview || !understood) return;
    const okApply = await confirm({
      title: t('cmp.apply_compress'),
      message: `Ghi đè ngày kế hoạch của ${preview.per_item?.length || 0} items (tiết kiệm ${preview.days_saved} ngày)? Chỉ CEO/Admin được duyệt. Rollback khả dụng sau khi áp dụng.`,
      confirmText: t('cmp.apply'), confirmStyle: 'primary',
    });
    if (!okApply) return;
    setBusy(true);
    try {
      const r = await request(`/schedule-scenarios/${preview.scenario_id}/apply`, { method: 'POST' });
      if (r.error) throw new Error(r.error);
      toast.success(`Đã nén −${r.days_saved} ngày (${r.changed} items)`);
      setPreview(null);
      refreshScenarios();
      onApplied?.();
    } catch (e) { toast.error(t('cmp.err_apply') + e.message); } finally { setBusy(false); }
  }

  async function createLink() {
    const pred = Number(newPred);
    const succ = Number(newSucc);
    if (!Number.isInteger(pred) || !Number.isInteger(succ)) { toast.error(t('cmp.f_predecessor')); return; }
    setBusy(true);
    try {
      const r = await request(`/projects/${projectId}/schedule-links`, {
        method: 'POST', body: { predecessor_id: pred, successor_id: succ, link_type: newType, lag_days: Number(newLag) || 0 },
      });
      if (r.error) throw new Error(r.error);
      toast.success(`Đã tạo link #${r.id} (${pred} -${newType}→ ${succ})`);
      setNewPred(''); setNewSucc(''); setNewLag(0);
      const d = await request(`/projects/${projectId}/schedule-links`);
      setLinks(Array.isArray(d) ? d : []); setLinkCount(Array.isArray(d) ? d.length : null);
    } catch (e) { toast.error(t('cmp.err_create_link') + e.message); } finally { setBusy(false); }
  }

  async function deleteLink(id) {
    const ok = await confirm({ title: t('cmp.btn_delete_link'), message: `Xóa liên kết #${id}?`, confirmText: t('cmp.btn_delete'), confirmStyle: 'danger' });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await request(`/schedule-links/${id}`, { method: 'DELETE' });
      if (r.error) throw new Error(r.error);
      toast.success(`Đã xóa link #${id}`);
      setLinks(ls => ls.filter(l => l.id !== id));
      setLinkCount(n => (n ?? 1) - 1);
    } catch (e) { toast.error(t('cmp.err_delete_link') + e.message); } finally { setBusy(false); }
  }

  async function rollbackScenario(id) {
    const ok = await confirm({
      title: t('cmp.rollback_compress'),
      message: `Khôi phục ngày kế hoạch gốc cho scenario #${id}?`,
      confirmText: 'Rollback', confirmStyle: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await request(`/schedule-scenarios/${id}/rollback`, { method: 'POST' });
      if (r.error) throw new Error(r.error);
      toast.success(`Đã rollback scenario #${id} (${r.restored} items)`);
      refreshScenarios();
      onApplied?.();
    } catch (e) { toast.error(t('cmp.err_rollback') + e.message); } finally { setBusy(false); }
  }

  function startEdit(s) {
    setEditingId(s.id);
    setEditName(s.name || '');
    setEditTarget((s.target_end_date || '').slice(0, 10));
  }

  async function saveEdit(id) {
    if (!editName.trim() && !editTarget) { setEditingId(null); return; }
    setBusy(true);
    try {
      const body = {};
      if (editName.trim()) body.name = editName.trim();
      if (editTarget && /^\d{4}-\d{2}-\d{2}$/.test(editTarget)) body.target_end_date = editTarget;
      if (!Object.keys(body).length) { toast.error(t('cmp.new_name_hint')); return; }
      const r = await request(`/schedule-scenarios/${id}`, { method: 'PATCH', body });
      if (r.error) throw new Error(r.error);
      toast.success(body.target_end_date ? `Đã tính lại scenario #${id} → ${body.target_end_date} (${r.result?.feasible ? t('cmp.feasible_lower') : t('cmp.not_feasible')})` : `Đã đổi tên scenario #${id}`);
      setEditingId(null);
      refreshScenarios();
      onApplied?.();
    } catch (e) { toast.error(t('cmp.err_scenario') + e.message); } finally { setBusy(false); }
  }

  async function deleteScenario(id) {
    const ok = await confirm({
      title: t('cmp.delete_scenario'),
      message: `Xóa scenario #${id}? Chỉ xóa được bản nháp (DRAFT); đề xuất AI liên quan sẽ tự đóng.`,
      confirmText: t('cmp.btn_delete'), confirmStyle: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await request(`/schedule-scenarios/${id}`, { method: 'DELETE' });
      if (r.error) throw new Error(r.error);
      toast.success(`Đã xóa scenario #${id}`);
      refreshScenarios();
      onApplied?.();
    } catch (e) { toast.error(t('cmp.err_delete') + e.message); } finally { setBusy(false); }
  }

  if (!projectId) return null;
  return (
    <div className="section" style={{ marginTop: 16 }}>
      <div className="section-title">
        <span><ICON.progress size={13} />{t('cmp.tab_link2')}</span>
        <span style={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          {linkCount === null ? '' : `${linkCount} links`}
        </span>
      </div>
      {/* Deadline propose (CEO/PM/PMO): PATCH end_date → AI auto-proposes scenario+draft. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <label style={{ fontSize: 12 }}>{deadline ? t('cmp.deadline_current', { d: deadline }) : t('cmp.deadline_plain')}</label>
        <input type="date" value={deadlineInput} onChange={e => setDeadlineInput(e.target.value)} style={{ padding: 6 }} />
        <button className="btn btn-secondary" onClick={saveDeadline} disabled={busy || !deadlineInput || deadlineInput === deadline}>{t('cmp.tab_deadline2')}</button>
      </div>
      {replan && !replan.skipped && replan.draft && (
        <div className="empty" style={{ marginBottom: 8, textAlign: 'left' }}>
          <div style={{ fontSize: 13 }}>
            <strong>{t('cmp.ai_scenario')}{replan.scenario?.id})</strong>
            {' — '}{replan.out?.feasible ? `khả thi −${replan.out.days_saved}d` : t('cmp.not_feasible')}
            {(replan.autoExcluded?.length > 0) && (
              <span style={{ color: 'var(--c-text-2)' }}>{t('cmp.suffix_auto_excluded')}{replan.autoExcluded.length} dòng tổng hợp ({replan.autoExcluded.map(c => c.name).join(', ')})</span>
            )}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{gist(replan.draft.body)}</div>
          <details style={{ fontSize: 12, marginTop: 4 }}>
            <summary style={{ cursor: 'pointer', color: 'var(--c-primary)' }}>{t('cmp.view_full_ai')}</summary>
            <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{replan.draft.body}</div>
          </details>
          <div style={{ fontSize: 11, color: 'var(--c-text-2)', marginTop: 4 }}>{t('cmp.ceo_gate')}</div>
        </div>
      )}
      {replan?.skipped && (
        <div className="empty" style={{ marginBottom: 8 }}>{t('cmp.deadline_no_ai')}{replan.reason || 'n/a'}</div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <button className="btn btn-secondary" onClick={autoChain} disabled={busy}>
          <ICON.bp size={12} />{t('cmp.auto_chain')}</button>
        {!canCompress && (
          <span style={{ fontSize: 12, color: 'var(--c-text-2)' }}>{t('cmp.enterprise_only')}</span>
        )}
      </div>
      {/* Manual links (P1): create + delete — server shipped in v0.6.0, UI only auto-chain. */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <input value={newPred} onChange={e => setNewPred(e.target.value)} placeholder="pred_id" inputMode="numeric" style={{ width: 80, padding: 6 }} />
        <select value={newType} onChange={e => setNewType(e.target.value)} style={{ padding: 6 }}>
          <option value="FS">FS</option>
          <option value="SS">SS</option>
          <option value="FF">FF</option>
        </select>
        <input value={newSucc} onChange={e => setNewSucc(e.target.value)} placeholder="succ_id" inputMode="numeric" style={{ width: 80, padding: 6 }} />
        <input value={newLag} onChange={e => setNewLag(e.target.value)} placeholder="lag" inputMode="numeric" title="lag_days" style={{ width: 56, padding: 6 }} />
        <button className="btn btn-secondary" onClick={createLink} disabled={busy}>+ Link</button>
      </div>
      {links.length > 0 && (
        <div className="data-table" style={{ marginBottom: 12 }}><div className="data-table-body"><table>
          <thead><tr><th>{th("ID")}</th><th>{th("Trước")}</th><th>{th("Loại")}</th><th>{th("Sau")}</th><th>{th("Độ trễ")}</th><th></th></tr></thead>
          <tbody>
            {links.slice(0, 50).map(l => (
              <tr key={l.id}>
                <td><code>{l.id}</code></td>
                <td style={{ fontSize: 12 }}>{l.pred_name || `#${l.predecessor_id}`}</td>
                <td><code>{l.link_type}</code></td>
                <td style={{ fontSize: 12 }}>{l.succ_name || `#${l.successor_id}`}</td>
                <td className="num">{l.lag_days ?? 0}</td>
                <td><button className="btn btn-secondary btn-sm" onClick={() => deleteLink(l.id)} disabled={busy} title={t('cmp.btn_delete_link')}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
      {canCompress && (
        <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: 12 }}>{t('cmp.target_before')}</label>
          <input type="date" value={target} onChange={e => setTarget(e.target.value)} style={{ padding: 6 }} />
          <button className="btn btn-secondary" onClick={() => runPreview()} disabled={busy || !target}>
            <ICON.eye size={12} />{t('cmp.preview')}</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontSize: 12 }}>{t('cmp.break_from_to')}</label>
          <input type="date" value={gapFrom} onChange={e => setGapFrom(e.target.value)} style={{ padding: 6 }} />
          <input type="date" value={gapTo} onChange={e => setGapTo(e.target.value)} style={{ padding: 6 }} />
          <button className="btn btn-secondary" disabled={busy || !gapFrom || !gapTo || gapFrom > gapTo}
            onClick={() => { setGaps(g => [...g, { from: gapFrom, to: gapTo }]); setGapFrom(''); setGapTo(''); }}>{t('cmp.add')}</button>
          {gaps.map((g, i) => (
            <span key={i} className="badge" style={{ fontSize: 11 }}>
              {g.from}→{g.to}
              <button onClick={() => setGaps(gaps.filter((_, j) => j !== i))} style={{ marginLeft: 4, cursor: 'pointer', border: 0, background: 'transparent' }} title={t('cmp.btn_delete')}>×</button>
            </span>
          ))}
          {excluded.length > 0 && (
            <span className="badge" style={{ fontSize: 11 }}>
              Loại {excluded.length} dòng tổng hợp
              <button onClick={() => { setExcluded([]); }} style={{ marginLeft: 4, cursor: 'pointer', border: 0, background: 'transparent' }} title={t('cmp.btn_drop_exclusion')}>×</button>
            </span>
          )}
        </div>
        </>
      )}
      {canCompress && preview && (
        <div>
          {(preview.holidays_applied?.length > 0 || preview.suspensions_applied?.length > 0) && (
            <div style={{ fontSize: 12, color: 'var(--c-text-2)', marginBottom: 8 }}>
              Lịch nghỉ áp dụng: {[...(preview.holidays_applied || []), ...(preview.suspensions_applied || []).map(g => `${g.from}→${g.to}`)].join(', ')}
            </div>
          )}
          {(preview.summary_candidates?.length > 0) && (
            <div className="empty" style={{ marginBottom: 8 }}>
              Phát hiện {preview.summary_candidates.length} dòng tổng hợp ({preview.summary_candidates.map(c => c.name).join(', ')}) — nên loại khỏi tính toán.
              <button className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={excludeAndPreview} disabled={busy}>{t('cmp.tab_exclude2')}</button>
            </div>
          )}
          <div className="stat-strip" style={{ marginBottom: 8 }}>
            <div className="stat"><div className="label">{t('cmp.before')}</div><div className="value">{preview.before_days}d</div></div>
            <div className="stat"><div className="label">{t('g.sau')}</div><div className="value" style={{ color: 'var(--c-on-track)' }}>{preview.after_days}d</div></div>
            <div className="stat"><div className="label">{t('cmp.st_saving')}</div><div className="value">−{preview.days_saved}d</div></div>
            <div className="stat"><div className="label">{t('cmp.st_done_est')}</div><div className="value">{(preview.calendar_end || '').slice(0, 10)}</div></div>
            <div className="stat"><div className="label">{t('cmp.feasible')}</div><div className="value">{preview.feasible ? '✓' : '✗'}</div></div>
          </div>
          {!preview.feasible ? (
            <div className="empty">
              {t('cmp.cannot_reach', { target })}{(preview.bottleneck || []).some(b => b.locked) ? t('cmp.locked_suffix') : ''}: {(preview.bottleneck || []).map(b => `${b.locked ? '🔒 ' : ''}${b.name || `#${b.id}`}`).join(', ') || '—'}
            </div>
          ) : (
            <>
              <div className="data-table"><div className="data-table-body"><table>
                <thead><tr><th>{th("Hạng mục")}</th><th className="num">{th("Cũ (ngày)")}</th><th className="num">{th("Mới")}</th><th>{th("Bắt đầu mới")}</th><th>{th("Kết thúc mới")}</th><th>{th("Khoá")}</th></tr></thead>
                <tbody>
                  {(showAllItems ? preview.per_item : preview.per_item.slice(0, 8)).map(p => (
                    <tr key={p.id}>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || `#${p.id}`}</td>
                      <td className="num">{p.old_dur}</td>
                      <td className="num">{p.new_dur}{p.at_floor ? t('cmp.floor_suffix') : ''}</td>
                      <td style={{ fontSize: 12 }}>{(p.new_start || '').slice(0, 10)}</td>
                      <td style={{ fontSize: 12 }}>{(p.new_end || '').slice(0, 10)}</td>
                      <td>{p.was_critical ? <span className="badge workflow-REVIEW">KEY</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div></div>
              {(preview.per_item?.length > 8) && (
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => setShowAllItems(v => !v)}>
                  {showAllItems ? `Thu gọn (hiện 8/${preview.per_item.length})` : `Xem tất cả ${preview.per_item.length} items`}
                </button>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)} />{t('cmp.agree_overwrite')}</label>
                <button className="btn" onClick={applyScenario} disabled={busy || !understood}>
                  <ICON.check size={12} />Áp dụng (−{preview.days_saved}d)
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {/* Scenarios: admin/CEO quản lý toàn bộ (đổi tên, tính lại mục tiêu, xóa nháp) + rollback. */}
      {canCompress && scenarios.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="section-title" style={{ fontSize: 12 }}>{t('cmp.scenarios_title', { n: scenarios.length })}</div>
          <div className="data-table"><div className="data-table-body"><table>
            <thead><tr><th>{th("ID")}</th><th>{th("Tên")}</th><th>{th("Mục tiêu")}</th><th>{th("Trạng thái")}</th><th>{th("Tạo lúc")}</th><th></th></tr></thead>
            <tbody>
              {scenarios.map(s => (
                <tr key={s.id}>
                  <td><code>{s.id}</code></td>
                  <td style={{ fontSize: 12 }}>
                    {editingId === s.id ? (
                      <input value={editName} onChange={e => setEditName(e.target.value)} style={{ width: 160, padding: 4 }} placeholder={t('cmp.lbl_new_name')} />
                    ) : (s.name || '—')}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {editingId === s.id ? (
                      <input type="date" value={editTarget} onChange={e => setEditTarget(e.target.value)} style={{ padding: 4 }} title={t('cmp.lbl_new_target')} />
                    ) : (s.target_end_date || '').slice(0, 10)}
                  </td>
                  <td><span className="badge">{s.status}</span></td>
                  <td style={{ fontSize: 12 }}>{(s.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {editingId === s.id ? (<>
                      <button className="btn btn-secondary btn-sm" onClick={() => saveEdit(s.id)} disabled={busy}>{t('cmp.save')}</button>{' '}
                      <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)} disabled={busy}>{t('cmp.btn_cancel2')}</button>
                    </>) : (<>
                      {s.status === 'APPLIED' && (
                        <><button className="btn btn-secondary btn-sm" onClick={() => rollbackScenario(s.id)} disabled={busy}>{t('g.rollback')}</button>{' '}</>
                      )}
                      {canManage && s.status !== 'APPLIED' && (
                        <><button className="btn btn-secondary btn-sm" onClick={() => startEdit(s)} disabled={busy} title={t('cmp.btn_recalc')}>{t('cmp.btn_edit')}</button>{' '}</>
                      )}
                      {canManage && s.status === 'DRAFT' && (
                        <button className="btn btn-secondary btn-sm" onClick={() => deleteScenario(s.id)} disabled={busy} title={t('cmp.btn_delete_draft')}>{t('cmp.btn_delete')}</button>
                      )}
                    </>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div></div>
        </div>
      )}
    </div>
  );
}
