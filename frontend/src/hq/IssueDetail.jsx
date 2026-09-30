// UI-014 / UI-006: Issue Detail page
// Mục 6.5 - hiển thị issue + directives (CEO/PMO chỉ thị) + audit log + form gửi chỉ thị mới
import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { issues, directives, audit, getUser } from '../api/index.js';
import { ICON } from '../icons.jsx';
import { toast } from '../components/Toast.jsx';
import { relativeTimeVi } from '../utils/datetime.js';
import { t, th, useLang } from '../i18n/index.js';

const SEV_COLORS = {
  CRITICAL: { bg: 'var(--c-critical-bg)', fg: 'var(--c-critical)' },
  HIGH: { bg: 'var(--c-behind-bg)', fg: 'var(--c-behind)' },
  MEDIUM: { bg: 'var(--c-watch-bg)', fg: 'var(--c-watch)' },
  LOW: { bg: 'var(--c-surface-2)', fg: 'var(--c-text-2)' },
};

const STATUS_COLORS = {
  OPEN: { bg: 'var(--c-watch-bg)', fg: 'var(--c-watch)' },
  ACK: { bg: 'var(--c-primary-bg)', fg: 'var(--c-primary)' },
  IN_PROGRESS: { bg: 'var(--c-submitted-bg)', fg: 'var(--c-submitted)' },
  RESOLVED: { bg: 'var(--c-on-track-bg)', fg: 'var(--c-on-track)' },
  CLOSED: { bg: 'var(--c-closed-bg)', fg: 'var(--c-closed)' },
};

export default function IssueDetail() {
  useLang(); // re-render table headers on VI/EN toggle
  const [params] = useSearchParams();
  const itemId = params.get('item') || params.get('issue');
  const nav = useNavigate();
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [directiveText, setDirectiveText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recipients, setRecipients] = useState([]); // {id,name,role}
  const [notifyIds, setNotifyIds] = useState([]);
  const [directiveList, setDirectiveList] = useState([]);
  const [auditList, setAuditList] = useState([]);
  const user = getUser() || { full_name: 'CEO' };

  async function load() {
    if (!itemId) {
      setLoading(false);
      return;
    }
    try {
      const i = await issues.get(itemId);
      setIssue(i);
      if (i?.project_id) {
        Promise.all([
          directives.list({ project_id: i.project_id, issue_id: i.id }),
          audit.list({ project_id: i.project_id, resource_type: 'issue', resource_id: i.id, limit: 50 }),
        ]).then(([ds, as]) => {
          setDirectiveList(Array.isArray(ds) ? ds : []);
          setAuditList(Array.isArray(as) ? as : []);
        }).catch(() => {
          setDirectiveList([]);
          setAuditList([]);
        });
      }
    } catch {
      setIssue(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [itemId]);

  useEffect(() => {
    directives.recipients()
      .then(list => {
        const arr = Array.isArray(list) ? list : [];
        setRecipients(arr);
        // default tick: PM + PMO (server falls back to the same set when empty)
        setNotifyIds(arr.filter(u => ['pm', 'pmo'].includes(String(u.role || '').toLowerCase())).map(u => u.id));
      })
      .catch(() => {});
  }, []);

  async function sendDirective() {
    if (!directiveText.trim() || !issue) return;
    setSubmitting(true);
    try {
      await directives.create({
        project_id: issue.project_id,
        issue_id: issue.id,
        body: directiveText,
        notify_to_user_ids: notifyIds,
      });
      setDirectiveText('');
      toast.success(t('id.toast_sent'));
      await load();
    } catch (e) {
      toast.error(t('id.err_generic') + e.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!itemId) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1>{t('issdetail.h1')}</h1>
            <div className="meta">{t('id.empty_select')}</div>
          </div>
        </div>
        <div className="empty" style={{ padding: 60 }}>{t('id.empty_none')}<a href="#" onClick={e => { e.preventDefault(); nav('/hq/issues'); }}>{t('id.btn_view_list')}</a>
        </div>
      </div>
    );
  }

  if (loading) return <div className="empty">{t('g.loading')}</div>;
  if (!issue) return <div className="empty">Issue #{itemId} không tồn tại</div>;

  const sev = SEV_COLORS[issue.severity] || SEV_COLORS.MEDIUM;
  const stat = STATUS_COLORS[issue.status] || STATUS_COLORS.OPEN;

  return (
    <div className="issue-detail-page">
      <div className="page-header">
        <div>
          <h1>{issue.title}</h1>
          <div className="meta">{t('id.issue_meta', { id: issue.id, category: issue.category, when: relativeTimeVi(issue.created_at) })}</div>
        </div>
        <div className="page-header-right">
          <button className="btn btn-secondary" onClick={() => nav(-1)}>{t('id.btn_back_to_list')}</button>
        </div>
      </div>

      <div className="meta-row">
        <span className="badge" style={{ background: sev.bg, color: sev.fg }}>{issue.severity}</span>
        <span className="badge" style={{ background: stat.bg, color: stat.fg }}>{issue.status}</span>
        <span className="stat">Source: <code>{issue.source_resource || '—'}{issue.source_id ? `:${issue.source_id}` : ''}</code></span>
        <span className="stat">Project: <code>{issue.project_id}</code></span>
        {issue.due_date && <span className="stat">Due: <strong>{issue.due_date}</strong></span>}
      </div>

      {issue.body && (
        <div className="body">{issue.body}</div>
      )}

      {/* Directives (CEO/PMO chỉ thị) */}
      <div className="issue-section-title">
        <ICON.audit size={13} />{t('id.sec_directive')}<span className="badge" style={{ background: 'var(--c-primary-bg)', color: 'var(--c-primary)' }}>{directiveList.length}</span>
      </div>
      <div className="directive-list">
        {directiveList.length > 0 ? (
          directiveList.map(d => (
            <div key={d.id} className="directive-item">
              <div className="meta">
                <span><strong>{d.from_user_name || 'CEO'}</strong> · {relativeTimeVi(d.created_at)}</span>
                {d.notify_to_user_ids && d.notify_to_user_ids !== '[]' && <span>↪ Notify: {d.notify_to_user_ids}</span>}
              </div>
              <div className="body">{d.body}</div>
            </div>
          ))
        ) : (
          <div className="empty" style={{ padding: 16 }}>{t('id.empty_directive')}</div>
        )}
      </div>

      {/* Form gửi chỉ thị */}
      <div className="directive-form">
        <textarea
          placeholder={t('id.example_ph')}
          value={directiveText}
          onChange={e => setDirectiveText(e.target.value)}
        />
        {recipients.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, fontSize: 12 }}>
            <span style={{ color: 'var(--c-text-2)' }}>{t('id.lbl_send_to')}</span>
            {recipients.map(u => (
              <label key={u.id} style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={notifyIds.includes(u.id)}
                  onChange={e => setNotifyIds(e.target.checked ? [...notifyIds, u.id] : notifyIds.filter(id => id !== u.id))}
                />
                {u.name} <span style={{ color: 'var(--c-text-2)' }}>({u.role})</span>
              </label>
            ))}
          </div>
        )}
        <div className="form-meta">
          <span>{t('id.lbl_post_as')}<strong>{user.full_name}</strong> ({user.role || 'CEO'}).<br />{t('id.directive_note')}</span>
          <button
            className="btn"
            disabled={!directiveText.trim() || submitting}
            onClick={sendDirective}
            style={{ minWidth: 100 }}
          >
            {submitting ? t('id.busy_sending') : <><ICON.arrow size={12} />{t('id.btn_send')}</>}
          </button>
        </div>
      </div>

      {/* Audit log cho issue */}
      <div className="issue-section-title">
        <ICON.audit size={13} />
        Audit log
        <span className="badge" style={{ background: 'var(--c-surface-2)', color: 'var(--c-text-2)' }}>{auditList.length}</span>
      </div>
      <div className="data-table">
        <div className="data-table-body">
          {auditList.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>{th("Thời gian")}</th>
                  <th>{th("Người")}</th>
                  <th>{th("Hành động")}</th>
                  <th>{th("Ghi chú")}</th>
                </tr>
              </thead>
              <tbody>
                {auditList.map(a => (
                  <tr key={a.id}>
                    <td style={{ color: 'var(--c-text-2)', fontSize: 11.5 }}>{relativeTimeVi(a.created_at)}</td>
                    <td><code>{a.user_name || '—'}</code></td>
                    <td><span className={`badge ${a.action === 'DIRECTIVE' ? 'workflow-REVIEW' : 'workflow-DRAFT'}`}>{a.action}</span></td>
                    <td style={{ fontSize: 12 }}>{a.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty">{t('id.empty_audit')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
