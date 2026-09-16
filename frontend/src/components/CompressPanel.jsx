// CompressPanel — schedule dependency links + CPM compression (v0.6.0).
// Links/auto-chain: schedule write (PM+). Preview/apply/rollback: Enterprise
// only ('schedule-compress' flag) — hidden below Enterprise, backend 403s anyway.
import { useEffect, useState } from 'react';
import { getToken } from '../api/index.js';
import { toast } from './Toast.jsx';
import { ICON } from '../icons.jsx';
import { useConfirm } from './Confirm.jsx';

const authH = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

export default function CompressPanel({ projectId, onApplied }) {
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

  useEffect(() => {
    setPreview(null);
    setUnderstood(false);
    setGaps([]);
    setExcluded([]);
    if (!projectId) return;
    fetch('/api/me/entitlements', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(j => setCanCompress(Array.isArray(j?.features) && j.features.includes('schedule-compress')))
      .catch(() => setCanCompress(false));
    fetch(`/api/projects/${projectId}/schedule-links`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(d => { setLinks(Array.isArray(d) ? d : []); setLinkCount(Array.isArray(d) ? d.length : null); })
      .catch(() => { setLinks([]); setLinkCount(null); });
  }, [projectId]);

  async function refreshScenarios() {
    if (!projectId) return;
    try {
      const d = await fetch(`/api/projects/${projectId}/schedule-scenarios`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json());
      setScenarios(Array.isArray(d) ? d : []);
    } catch { setScenarios([]); }
  }

  useEffect(() => { refreshScenarios(); }, [projectId, canCompress]);

  async function autoChain() {
    setBusy(true);
    try {
      const p = await fetch(`/api/projects/${projectId}/schedule-links/auto-chain`, { method: 'POST', headers: authH(), body: JSON.stringify({}) }).then(r => r.json());
      if (p.error) throw new Error(p.error);
      if (!p.proposed?.length) { toast.success('Không có link mới (đã đủ hoặc items đã khóa)'); return; }
      const okChain = await confirm({
        title: 'Tự động chuỗi liên kết',
        message: `Tạo ${p.proposed.length} liên kết FS theo thứ tự zone?${p.skipped?.length ? ` (${p.skipped.length} items khóa sẽ bỏ qua)` : ''}`,
        confirmText: 'Tạo links', confirmStyle: 'primary',
      });
      if (!okChain) return;
      const w = await fetch(`/api/projects/${projectId}/schedule-links/auto-chain`, { method: 'POST', headers: authH(), body: JSON.stringify({ confirm: true }) }).then(r => r.json());
      if (w.error) throw new Error(w.error);
      toast.success(`Đã tạo ${w.created} links`);
      setLinkCount((n) => (n ?? 0) + w.created);
    } catch (e) { toast.error('Auto-chain thất bại: ' + e.message); } finally { setBusy(false); }
  }

  async function runPreview(extraPolicy = {}) {
    if (!target) { toast.error('Chọn ngày mục tiêu trước'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/schedule-compress/preview`, {
        method: 'POST', headers: authH(),
        body: JSON.stringify({ target_end_date: target, policy: { suspensions: gaps, exclude_ids: excluded, ...extraPolicy } }),
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      setPreview(r);
      setUnderstood(false);
      if (Array.isArray(r.excluded_ids)) setExcluded(r.excluded_ids);
    } catch (e) { toast.error('Preview thất bại: ' + e.message); } finally { setBusy(false); }
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
      title: 'Áp dụng nén tiến độ',
      message: `Ghi đè ngày kế hoạch của ${preview.per_item?.length || 0} items (tiết kiệm ${preview.days_saved} ngày)? Rollback khả dụng sau khi áp dụng.`,
      confirmText: 'Áp dụng', confirmStyle: 'primary',
    });
    if (!okApply) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/schedule-scenarios/${preview.scenario_id}/apply`, { method: 'POST', headers: authH() }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      toast.success(`Đã nén −${r.days_saved} ngày (${r.changed} items)`);
      setPreview(null);
      refreshScenarios();
      onApplied && onApplied();
    } catch (e) { toast.error('Apply thất bại: ' + e.message); } finally { setBusy(false); }
  }

  async function createLink() {
    const pred = Number(newPred);
    const succ = Number(newSucc);
    if (!Number.isInteger(pred) || !Number.isInteger(succ)) { toast.error('Nhập predecessor_id + successor_id (số)'); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/schedule-links`, {
        method: 'POST', headers: authH(),
        body: JSON.stringify({ predecessor_id: pred, successor_id: succ, link_type: newType, lag_days: Number(newLag) || 0 }),
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      toast.success(`Đã tạo link #${r.id} (${pred} -${newType}→ ${succ})`);
      setNewPred(''); setNewSucc(''); setNewLag(0);
      const d = await fetch(`/api/projects/${projectId}/schedule-links`, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => r.json());
      setLinks(Array.isArray(d) ? d : []); setLinkCount(Array.isArray(d) ? d.length : null);
    } catch (e) { toast.error('Tạo link thất bại: ' + e.message); } finally { setBusy(false); }
  }

  async function deleteLink(id) {
    const ok = await confirm({ title: 'Xóa link', message: `Xóa liên kết #${id}?`, confirmText: 'Xóa', confirmStyle: 'danger' });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/schedule-links/${id}`, { method: 'DELETE', headers: authH() }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      toast.success(`Đã xóa link #${id}`);
      setLinks(ls => ls.filter(l => l.id !== id));
      setLinkCount(n => (n ?? 1) - 1);
    } catch (e) { toast.error('Xóa link thất bại: ' + e.message); } finally { setBusy(false); }
  }

  async function rollbackScenario(id) {
    const ok = await confirm({
      title: 'Rollback nén tiến độ',
      message: `Khôi phục ngày kế hoạch gốc cho scenario #${id}?`,
      confirmText: 'Rollback', confirmStyle: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/schedule-scenarios/${id}/rollback`, { method: 'POST', headers: authH() }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      toast.success(`Đã rollback scenario #${id} (${r.restored} items)`);
      refreshScenarios();
      onApplied && onApplied();
    } catch (e) { toast.error('Rollback thất bại: ' + e.message); } finally { setBusy(false); }
  }

  if (!projectId) return null;
  return (
    <div className="section" style={{ marginTop: 16 }}>
      <div className="section-title">
        <span><ICON.progress size={13} /> Liên kết &amp; Nén tiến độ</span>
        <span style={{ fontSize: 12, color: 'var(--c-text-2)' }}>
          {linkCount === null ? '' : `${linkCount} links`}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <button className="btn btn-secondary" onClick={autoChain} disabled={busy}>
          <ICON.bp size={12} />Tự động chuỗi links
        </button>
        {!canCompress && (
          <span style={{ fontSize: 12, color: 'var(--c-text-2)' }}>Nén tiến độ tự động là tính năng Enterprise.</span>
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
          <thead><tr><th>ID</th><th>Predecessor</th><th>Type</th><th>Successor</th><th>Lag</th><th></th></tr></thead>
          <tbody>
            {links.slice(0, 50).map(l => (
              <tr key={l.id}>
                <td><code>{l.id}</code></td>
                <td style={{ fontSize: 12 }}>{l.pred_name || `#${l.predecessor_id}`}</td>
                <td><code>{l.link_type}</code></td>
                <td style={{ fontSize: 12 }}>{l.succ_name || `#${l.successor_id}`}</td>
                <td className="num">{l.lag_days ?? 0}</td>
                <td><button className="btn btn-secondary btn-sm" onClick={() => deleteLink(l.id)} disabled={busy} title="Xóa link">×</button></td>
              </tr>
            ))}
          </tbody>
        </table></div></div>
      )}
      {canCompress && (
        <>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
          <label style={{ fontSize: 12 }}>Mục tiêu xong trước</label>
          <input type="date" value={target} onChange={e => setTarget(e.target.value)} style={{ padding: 6 }} />
          <button className="btn btn-secondary" onClick={() => runPreview()} disabled={busy || !target}>
            <ICON.eye size={12} />Xem trước
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <label style={{ fontSize: 12 }}>Nghỉ thi công (từ → đến)</label>
          <input type="date" value={gapFrom} onChange={e => setGapFrom(e.target.value)} style={{ padding: 6 }} />
          <input type="date" value={gapTo} onChange={e => setGapTo(e.target.value)} style={{ padding: 6 }} />
          <button className="btn btn-secondary" disabled={busy || !gapFrom || !gapTo || gapFrom > gapTo}
            onClick={() => { setGaps(g => [...g, { from: gapFrom, to: gapTo }]); setGapFrom(''); setGapTo(''); }}>
            + Thêm
          </button>
          {gaps.map((g, i) => (
            <span key={i} className="badge" style={{ fontSize: 11 }}>
              {g.from}→{g.to}
              <button onClick={() => setGaps(gaps.filter((_, j) => j !== i))} style={{ marginLeft: 4, cursor: 'pointer', border: 0, background: 'transparent' }} title="Xóa">×</button>
            </span>
          ))}
          {excluded.length > 0 && (
            <span className="badge" style={{ fontSize: 11 }}>
              Loại {excluded.length} dòng tổng hợp
              <button onClick={() => { setExcluded([]); }} style={{ marginLeft: 4, cursor: 'pointer', border: 0, background: 'transparent' }} title="Bỏ loại trừ">×</button>
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
              <button className="btn btn-secondary" style={{ marginLeft: 8 }} onClick={excludeAndPreview} disabled={busy}>
                Loại trừ &amp; xem lại
              </button>
            </div>
          )}
          <div className="stat-strip" style={{ marginBottom: 8 }}>
            <div className="stat"><div className="label">Trước</div><div className="value">{preview.before_days}d</div></div>
            <div className="stat"><div className="label">Sau</div><div className="value" style={{ color: 'var(--c-on-track)' }}>{preview.after_days}d</div></div>
            <div className="stat"><div className="label">Tiết kiệm</div><div className="value">−{preview.days_saved}d</div></div>
            <div className="stat"><div className="label">Xong (dự kiến)</div><div className="value">{(preview.calendar_end || '').slice(0, 10)}</div></div>
            <div className="stat"><div className="label">Khả thi</div><div className="value">{preview.feasible ? '✓' : '✗'}</div></div>
          </div>
          {!preview.feasible ? (
            <div className="empty">
              Không thể đạt {target} — các items sau đã chạm sàn rút ngắn{(preview.bottleneck || []).some(b => b.locked) ? ' (🔒 = đã xong, không thể rút)' : ''}: {(preview.bottleneck || []).map(b => `${b.locked ? '🔒 ' : ''}${b.name || `#${b.id}`}`).join(', ') || '—'}
            </div>
          ) : (
            <>
              <div className="data-table"><div className="data-table-body"><table>
                <thead><tr><th>Item</th><th className="num">Cũ (ngày)</th><th className="num">Mới</th><th>Bắt đầu mới</th><th>Kết thúc mới</th><th>Key</th></tr></thead>
                <tbody>
                  {preview.per_item.map(p => (
                    <tr key={p.id}>
                      <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name || `#${p.id}`}</td>
                      <td className="num">{p.old_dur}</td>
                      <td className="num">{p.new_dur}{p.at_floor ? ' (sàn)' : ''}</td>
                      <td style={{ fontSize: 12 }}>{(p.new_start || '').slice(0, 10)}</td>
                      <td style={{ fontSize: 12 }}>{(p.new_end || '').slice(0, 10)}</td>
                      <td>{p.was_critical ? <span className="badge workflow-REVIEW">KEY</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div></div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)} />
                  Tôi hiểu ngày kế hoạch sẽ bị ghi đè
                </label>
                <button className="btn" onClick={applyScenario} disabled={busy || !understood}>
                  <ICON.check size={12} />Áp dụng (−{preview.days_saved}d)
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {/* Scenarios (P1): list + rollback — rollback existed server-side only. */}
      {canCompress && scenarios.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="section-title" style={{ fontSize: 12 }}>Kịch bản nén ({scenarios.length})</div>
          <div className="data-table"><div className="data-table-body"><table>
            <thead><tr><th>ID</th><th>Tên</th><th>Mục tiêu</th><th>Trạng thái</th><th>Tạo lúc</th><th></th></tr></thead>
            <tbody>
              {scenarios.map(s => (
                <tr key={s.id}>
                  <td><code>{s.id}</code></td>
                  <td style={{ fontSize: 12 }}>{s.name || '—'}</td>
                  <td style={{ fontSize: 12 }}>{(s.target_end_date || '').slice(0, 10)}</td>
                  <td><span className="badge">{s.status}</span></td>
                  <td style={{ fontSize: 12 }}>{(s.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td>{s.status === 'APPLIED' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => rollbackScenario(s.id)} disabled={busy}>Rollback</button>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table></div></div>
        </div>
      )}
    </div>
  );
}
