// AI Assistant (v0.7.0 §3): semantic Q&A with citations + drafts inbox.
// Enterprise-only ('ai-assistant'): backend 403s below Enterprise; the shell
// hides the nav link, this screen shows an upgrade note if reached directly.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { request, getUser } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { ICON } from '../icons.jsx';
import { t } from '../i18n/index.js';
import ProjectPicker from '../components/ProjectPicker.jsx';
import { AiGuide, SampleChips, GuideTips, GuideRules, ParsePreview } from '../components/AiGuide.jsx';
import {
  parseProgressPreview, askSamples, askTips,
  progressSamples, progressRules, progressTips, draftTips,
} from './ai-guidance.js';

function safePayload(value) {
  if (value && typeof value === 'object') return value;
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
}

function Citation({ c, nav }) {
  const label = `#${c.resource_type}:${c.resource_id}`;
  const projectQuery = c.project_id ? `?project=${c.project_id}` : '';
  const target = {
    issue: `/hq/issues/item?item=${c.resource_id}`,
    construction_schedule_item: `/hq/progress${projectQuery}`,
    schedule_item: `/hq/progress${projectQuery}`,
    shop_drawing: `/hq/shop${projectQuery}`,
    material: `/hq/materials${projectQuery}`,
    material_submittal: `/hq/materials${projectQuery}`,
    ar_line: `/hq/payment${projectQuery}`,
    payment_request: `/hq/payment${projectQuery}`,
    payment: `/hq/payment${projectQuery}`,
    directive: `/hq/issues${projectQuery}`,
    work_item: `/hq/progress${projectQuery}`,
    daily_note: `/field/daily-report${projectQuery}`,
    daily_report: `/field/daily-report${projectQuery}`,
  }[c.resource_type];
  if (target) {
    return <button className="badge" style={{ cursor: 'pointer', margin: '0 4px 4px 0' }} onClick={() => nav(target)} title={t('ai.btn_sources')}>{label}</button>;
  }
  return <span className="badge" style={{ margin: '0 4px 4px 0' }} title={c.project_id ? `project ${c.project_id}` : ''}>{label}</span>;
}

export default function Assistant() {
  const nav = useNavigate();
  const confirm = useConfirm();
  const [tab, setTab] = useState('ask'); // ask | drafts
  const [allowed, setAllowed] = useState(null); // null=loading, false=plan gate
  const [question, setQuestion] = useState('');
  const [projectId, setProjectId] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [draftFilter, setDraftFilter] = useState('pending');
  const [deciding, setDeciding] = useState(null);
  const [progressText, setProgressText] = useState('');
  const [progressProposal, setProgressProposal] = useState(null);
  const [progressRows, setProgressRows] = useState([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressBusy, setProgressBusy] = useState(false);

  useEffect(() => {
    request('/me/entitlements')
      .then((j) => setAllowed(Array.isArray(j?.features) && j.features.includes('ai-assistant')))
      .catch(() => setAllowed(false));
  }, []);

  const viewer = getUser() || {};
  const canApplyProgress = viewer.is_ceo || ['ceo', 'admin'].includes(String(viewer.role || '').toLowerCase());

  async function loadProgressProposals() {
    if (!projectId) { setProgressRows([]); setProgressLoading(false); return; }
    setProgressLoading(true);
    try {
      const rows = await request(`/ai/progress-proposals?project_id=${projectId}&status=pending`);
      setProgressRows(Array.isArray(rows) ? rows : []);
    } catch (e) { toast.error(t('ai.err_proposals') + e.message); }
    finally { setProgressLoading(false); }
  }

  useEffect(() => { if (allowed && tab === 'progress') loadProgressProposals(); }, [allowed, tab, projectId]); // eslint-disable-line

  async function createProgressProposal() {
    if (!projectId || !progressText.trim()) return;
    setProgressBusy(true);
    try {
      const idempotencyKey = globalThis.crypto?.randomUUID?.() || `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const result = await request('/ai/progress-proposals', {
        method: 'POST', body: { project_id: Number(projectId), text: progressText.trim(), idempotency_key: idempotencyKey },
      });
      if (result.error) throw new Error(result.error);
      setProgressProposal(result.proposal);
      setProgressText('');
      await loadProgressProposals();
      toast.success(result.replayed ? t('ai.progress_replayed') : t('ai.progress_created'));
    } catch (e) { toast.error(t('ai.progress_err_create') + e.message); }
    finally { setProgressBusy(false); }
  }

  async function applyProgressProposal(id) {
    const approved = await confirm({
      title: t('ai.c_apply_title'),
      message: t('ai.c_apply_msg'),
      confirmText: t('ai.c_apply_btn'), confirmStyle: 'danger',
    });
    if (!approved) return;
    setProgressBusy(true);
    try {
      const result = await request(`/ai/progress-proposals/${id}/apply`, { method: 'POST' });
      if (result.error) throw new Error(result.error);
      setProgressProposal(result.proposal || null);
      await loadProgressProposals();
      toast.success(t('ai.progress_applied'));
    } catch (e) { toast.error(t('ai.progress_err_apply') + e.message); }
    finally { setProgressBusy(false); }
  }

  async function rollbackProgressProposal(id) {
    const approved = await confirm({
      title: t('ai.c_rollback_title'),
      message: t('ai.c_rollback_msg'),
      confirmText: 'Rollback', confirmStyle: 'danger',
    });
    if (!approved) return;
    setProgressBusy(true);
    try {
      const result = await request(`/ai/progress-proposals/${id}/rollback`, { method: 'POST' });
      if (result.error) throw new Error(result.error);
      setProgressProposal(result.proposal || null);
      await loadProgressProposals();
      toast.success(t('ai.progress_rolled_back'));
    } catch (e) { toast.error(t('ai.progress_err_rollback') + e.message); }
    finally { setProgressBusy(false); }
  }

  async function loadDrafts(status = draftFilter) {
    try {
      const r = await request(`/ai/drafts?status=${status}`);
      setDrafts(Array.isArray(r) ? r : []);
    } catch (e) { toast.error(t('ai.err_drafts') + e.message); }
  }
  useEffect(() => { if (allowed && tab === 'drafts') loadDrafts(); }, [allowed, tab]); // eslint-disable-line

  async function ask() {
    if (!question.trim()) return;
    setBusy(true);
    setAnswer(null);
    try {
      const r = await request('/ai/ask', {
        method: 'POST', body: { question: question.trim(), project_id: projectId || undefined },
      });
      if (r.error) {
        // Model nghen nhung da tim thay nguon: hien citations + loi de bam Hoi lai.
        if ((r.citations || []).length) setAnswer({ answer: '', error: r.error, citations: r.citations });
        throw new Error(r.error);
      }
      setAnswer(r);
    } catch (e) { toast.error(t('ai.err_ask') + e.message); } finally { setBusy(false); }
  }

  async function decide(id, how) {
    // U6: approve gửi thông báo ra ngoài — bắt xác nhận, chống click nhầm.
    const ok = await confirm({
      title: how === 'approve' ? t('ai.c_approve_title') : t('ai.c_dismiss_title'),
      message: how === 'approve'
        ? t('ai.c_approve_msg')
        : t('ai.c_dismiss_msg'),
      confirmText: how === 'approve' ? t('ai.approve_btn') : t('ai.dismiss_btn'),
      confirmStyle: how === 'approve' ? 'danger' : 'primary',
    });
    if (!ok) return;
    setDeciding(id);
    try {
      const r = await request(`/ai/drafts/${id}/${how}`, { method: 'POST' });
      if (r.error) throw new Error(r.error);
      toast.success(how === 'approve' ? t('ai.approved_toast') : t('ai.dismissed_toast'));
      loadDrafts();
    } catch (e) { toast.error(t('ai.err_generic') + e.message); }
    finally { setDeciding(null); }
  }

  if (allowed === false) {
    return <div><div className="page-header"><h1>{t('ai.h1')}</h1></div>
      <div className="empty">{t('ai.enterprise_only')}</div></div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t('ai.h1')}</h1>
          <div className="meta">{t('ai.page_meta')}</div>
        </div>
      </div>
      <div className="filter-bar">
        <button className={tab === 'ask' ? 'btn' : 'btn btn-secondary'} onClick={() => setTab('ask')}>
          <ICON.search size={13} />{t('ai.tab_ask2')}</button>
        <button className={tab === 'drafts' ? 'btn' : 'btn btn-secondary'} onClick={() => setTab('drafts')}>
          <ICON.bell size={13} />{t('ai.tab_proposals')}</button>
        <button className={tab === 'progress' ? 'btn' : 'btn btn-secondary'} onClick={() => setTab('progress')}>
          <ICON.edit size={13} />{t('ai.tab_progress2')}</button>
      </div>

      {tab === 'ask' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <ProjectPicker value={projectId} onChange={setProjectId} placeholder={t('ai.scope_all_ph')} allowAll />
            <input value={question} onChange={e => setQuestion(e.target.value)} placeholder={t('ai.ph_submittal')}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
              style={{ flex: 1, minWidth: 240, padding: 8 }} />
            <button className="btn" onClick={ask} disabled={busy || !question.trim()}>
              <ICON.search size={12} />{busy ? t('ai.busy_thinking') : t('ai.btn_ask')}
            </button>
          </div>
          <AiGuide title={t('aiguide.tab_ask')}>
            <SampleChips samples={askSamples()} onPick={setQuestion} />
            <GuideTips items={askTips()} />
          </AiGuide>
          {answer && (
            <div className="section">
              {answer.error && <div className="login-error" style={{ marginBottom: 8 }}>{answer.error} <button className="btn-text" onClick={ask} disabled={busy}>{t('ai.ask_again')}</button></div>}
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{answer.answer}</div>
              <div>
                {(answer.citations || []).map((c, i) => <Citation key={i} c={c} nav={nav} />)}
              </div>
              {answer.provider && (
                <div className="meta" style={{ marginTop: 8 }}>{answer.provider}/{answer.model} · {answer.route_status || 'primary'}{answer.fallback ? ' (fallback)' : ''}{answer.latency_ms != null ? ` · ${answer.latency_ms}ms` : ''}</div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'progress' && (
        <div>
          <div className="section" style={{ marginBottom: 8 }}>
            <div className="section-title">{t('ai.progress_title')}</div>
            <div className="meta" style={{ marginBottom: 8 }}>{t('ai.progress_hint_full')}</div>
            <div style={{ marginBottom: 8 }}>
              <ProjectPicker value={projectId} onChange={setProjectId} placeholder={t('ai.pick_project_ph')} />
            </div>
            <textarea
              value={progressText}
              onChange={(e) => setProgressText(e.target.value)}
              placeholder={t('ai.ph_progress')}
              rows={4}
              style={{ width: '100%', boxSizing: 'border-box', padding: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button className="btn" onClick={createProgressProposal} disabled={progressBusy || !projectId || !progressText.trim()}>
                <ICON.edit size={12} />{progressBusy ? t('ai.busy_creating') : t('ai.progress_create')}
              </button>
              {!projectId && <span className="meta">{t('ai.pick_project')}</span>}
            </div>
            {progressText.trim() && <ParsePreview preview={parseProgressPreview(progressText)} projectChosen={Boolean(projectId)} />}
            <AiGuide title={t('aiguide.tab_progress')}>
              <SampleChips samples={progressSamples()} onPick={setProgressText} note={t('ai.hint_click_sample')} />
              <GuideRules rules={progressRules()} />
              <GuideTips items={progressTips()} />
            </AiGuide>
          </div>
          {progressProposal && (() => {
            const p = safePayload(progressProposal.payload);
            const before = p.before || {};
            const after = p.after || {};
            return <div className="section" style={{ marginBottom: 8 }}>
              <div className="section-title">{progressProposal.title}</div>
              <div className="meta">{p.lifecycle || progressProposal.status} · {p.target?.code || t('ai.progress_unnamed')}</div>
              <div style={{ fontSize: 13, margin: '6px 0' }}>{progressProposal.body}</div>
              {p.missing_fields?.length > 0 && <div className="login-error">Còn thiếu: {p.missing_fields.join(', ')}</div>}
              {p.lifecycle === 'proposed' && <div className="meta">{t('ai.progress_diff', { now: before.progress_percent ?? '—', next: after.progress_percent ?? '—' })}</div>}
              <div style={{ marginTop: 6 }}>
                {(p.citations || []).map((c, i) => <Citation key={`${c.resource_type}-${c.resource_id}-${i}`} c={c} nav={nav} />)}
              </div>
              {progressProposal.status === 'pending' && p.lifecycle === 'proposed' && canApplyProgress && (
                <button className="btn" style={{ marginTop: 8 }} disabled={progressBusy} onClick={() => applyProgressProposal(progressProposal.id)}>
                  <ICON.check size={12} />{t('ai.act_apply_progress')}</button>
              )}
              {progressProposal.status === 'approved' && p.lifecycle === 'applied' && canApplyProgress && (
                <button className="btn btn-secondary" style={{ marginTop: 8 }} disabled={progressBusy} onClick={() => rollbackProgressProposal(progressProposal.id)}>
                  <ICON.back size={12} />Rollback
                </button>
              )}
              {progressProposal.status === 'pending' && p.lifecycle === 'proposed' && !canApplyProgress && (
                <div className="meta" style={{ marginTop: 8 }}>{t('ai.progress_admin_gate')}</div>
              )}
            </div>;
          })()}
          <div className="section">
            <div className="section-title">{t('ai.progress_pending_title')}</div>
            {progressLoading ? <div className="empty loading-state"><span className="spinner" />{t('ai.busy_loading_proposals')}</div> :
              !projectId ? <div className="empty">{t('ai.pick_project')}</div> :
              progressRows.length === 0 ? <div className="empty">{t('ai.progress_empty')}</div> : progressRows.map((row) => {
              const p = safePayload(row.payload);
              return <button key={row.id} className="section" style={{ display: 'block', width: '100%', textAlign: 'left', marginBottom: 6 }} onClick={() => setProgressProposal(row)}>
                <strong>{row.title}</strong><span className="meta" style={{ display: 'block' }}>{p.lifecycle || row.status} · {p.target?.code || t('ai.unknown')}</span>
              </button>;
            })}
          </div>
        </div>
      )}

      {tab === 'drafts' && (
        <div>
          <div className="filter-bar">
            {['pending', 'approved', 'dismissed'].map(s => (
              <button key={s} className={draftFilter === s ? 'btn' : 'btn btn-secondary'}
                onClick={() => { setDraftFilter(s); loadDrafts(s); }}>{s}</button>
            ))}
          </div>
          <AiGuide title={t('aiguide.tab_drafts')}>
            <GuideTips items={draftTips()} />
          </AiGuide>
          {drafts.length === 0 ? <div className="empty">{t('ai.empty_drafts')}</div> :
            drafts.map(d => {
              const bodyGist = String(d.body || '').replace(/\s+/g, ' ').trim();
              const short = bodyGist.length > 200 ? bodyGist.slice(0, 200) + '…' : bodyGist;
              return (
              <div key={d.id} className="section" style={{ marginBottom: 8 }}>
                <div className="section-title"><span>{d.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--c-text-2)' }}>{d.kind} · {d.project_code || ''} · {(d.created_at || '').slice(0, 10)}</span>
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>{short}</div>
                {bodyGist.length > 200 && (
                  <details style={{ fontSize: 12, marginBottom: 8 }}>
                    <summary style={{ cursor: 'pointer', color: 'var(--c-primary)' }}>{t('ai.progress_view_full')}</summary>
                    <div style={{ whiteSpace: 'pre-wrap', marginTop: 4 }}>{d.body}</div>
                  </details>
                )}
                {d.kind === 'schedule_replan' && (() => {
                  let p = null;
                  try { p = typeof d.payload === 'string' ? JSON.parse(d.payload) : d.payload; } catch { p = null; }
                  if (!p) return null;
                  return (
                    <div style={{ fontSize: 12, color: 'var(--c-text-2)', marginBottom: 8 }}>
                      Scenario #{p.scenario_id} · {p.feasible ? `khả thi −${p.days_saved}d (${p.before_days}d→${p.after_days}d, xong ${p.calendar_end})` : `không khả thi (xong dự kiến ${p.calendar_end})`} · mục tiêu {p.target_end_date}
                      {(p.bottleneck || []).length > 0 && <> · nút thắt: {(p.bottleneck || []).map(b => `${b.locked ? '🔒 ' : ''}${b.name || '#' + b.id}`).join(', ')}</>}
                      {(p.auto_excluded || []).length > 0 && <div style={{ marginTop: 2 }}>{t('ai.toast_auto_excluded')}{(p.auto_excluded || []).map(c => c.name || `#${c.id}`).join(', ')}</div>}
                      <div className="meta">{t('ai.draft_replan_note')}</div>
                    </div>
                  );
                })()}
                {d.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" disabled={deciding === d.id} onClick={() => decide(d.id, 'approve')}><ICON.check size={12} />{t('ai.act_approve_send2')}</button>
                    <button className="btn btn-secondary" disabled={deciding === d.id} onClick={() => decide(d.id, 'dismiss')}><ICON.x size={12} />{t('ai.dismiss_btn')}</button>
                  </div>
                )}
              </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
