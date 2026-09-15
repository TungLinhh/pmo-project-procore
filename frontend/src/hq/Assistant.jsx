// AI Assistant (v0.7.0 §3): semantic Q&A with citations + drafts inbox.
// Enterprise-only ('ai-assistant'): backend 403s below Enterprise; the shell
// hides the nav link, this screen shows an upgrade note if reached directly.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken } from '../api/index.js';
import { toast } from '../components/Toast.jsx';
import { ICON } from '../icons.jsx';
import ProjectPicker from '../components/ProjectPicker.jsx';

const authH = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

function Citation({ c, nav }) {
  const label = `#${c.resource_type}:${c.resource_id}`;
  if (c.resource_type === 'issue') {
    return <button className="badge" style={{ cursor: 'pointer', margin: '0 4px 4px 0' }} onClick={() => nav(`/hq/issues/item?item=${c.resource_id}`)} title="Mở issue">{label}</button>;
  }
  return <span className="badge" style={{ margin: '0 4px 4px 0' }} title={c.project_id ? `project ${c.project_id}` : ''}>{label}</span>;
}

export default function Assistant() {
  const nav = useNavigate();
  const [tab, setTab] = useState('ask'); // ask | drafts
  const [allowed, setAllowed] = useState(null); // null=loading, false=plan gate
  const [question, setQuestion] = useState('');
  const [projectId, setProjectId] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [draftFilter, setDraftFilter] = useState('pending');

  useEffect(() => {
    fetch('/api/me/entitlements', { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(j => setAllowed(Array.isArray(j?.features) && j.features.includes('ai-assistant')))
      .catch(() => setAllowed(false));
  }, []);

  async function loadDrafts(status = draftFilter) {
    try {
      const r = await fetch(`/api/ai/drafts?status=${status}`, { headers: authH() }).then(r => r.json());
      setDrafts(Array.isArray(r) ? r : []);
    } catch (e) { toast.error('Lỗi tải drafts: ' + e.message); }
  }
  useEffect(() => { if (allowed && tab === 'drafts') loadDrafts(); }, [allowed, tab]); // eslint-disable-line

  async function ask() {
    if (!question.trim()) return;
    setBusy(true);
    setAnswer(null);
    try {
      const r = await fetch('/api/ai/ask', {
        method: 'POST', headers: authH(),
        body: JSON.stringify({ question: question.trim(), project_id: projectId || undefined }),
      }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      setAnswer(r);
    } catch (e) { toast.error('Hỏi thất bại: ' + e.message); } finally { setBusy(false); }
  }

  async function decide(id, how) {
    try {
      const r = await fetch(`/api/ai/drafts/${id}/${how}`, { method: 'POST', headers: authH() }).then(r => r.json());
      if (r.error) throw new Error(r.error);
      toast.success(how === 'approve' ? 'Đã duyệt & gửi thông báo' : 'Đã bỏ qua');
      loadDrafts();
    } catch (e) { toast.error('Thất bại: ' + e.message); }
  }

  if (allowed === false) {
    return <div><div className="page-header"><h1>Trợ lý AI</h1></div>
      <div className="empty">Tính năng AI là gói Enterprise. Liên hệ admin để nâng cấp.</div></div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Trợ lý AI</h1>
          <div className="meta">Hỏi đáp ngữ nghĩa trên dữ liệu dự án · trích dẫn bắt buộc</div>
        </div>
      </div>
      <div className="filter-bar">
        <button className={tab === 'ask' ? 'btn' : 'btn btn-secondary'} onClick={() => setTab('ask')}>
          <ICON.search size={13} />Hỏi đáp
        </button>
        <button className={tab === 'drafts' ? 'btn' : 'btn btn-secondary'} onClick={() => setTab('drafts')}>
          <ICON.bell size={13} />Đề xuất
        </button>
      </div>

      {tab === 'ask' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <ProjectPicker value={projectId} onChange={setProjectId} placeholder="Mọi dự án (giới hạn phạm vi...)" allowAll />
            <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="VD: submittal nào đang quá hạn TVGS?"
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
              style={{ flex: 1, minWidth: 240, padding: 8 }} />
            <button className="btn" onClick={ask} disabled={busy || !question.trim()}>
              <ICON.search size={12} />{busy ? 'Đang nghĩ...' : 'Hỏi'}
            </button>
          </div>
          {answer && (
            <div className="section">
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{answer.answer}</div>
              <div>
                {(answer.citations || []).map((c, i) => <Citation key={i} c={c} nav={nav} />)}
              </div>
              {answer.provider && (
                <div className="meta" style={{ marginTop: 8 }}>{answer.provider}/{answer.model}</div>
              )}
            </div>
          )}
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
          {drafts.length === 0 ? <div className="empty">Không có đề xuất nào.</div> :
            drafts.map(d => (
              <div key={d.id} className="section" style={{ marginBottom: 8 }}>
                <div className="section-title"><span>{d.title}</span>
                  <span style={{ fontSize: 12, color: 'var(--c-text-2)' }}>{d.kind} · {d.project_code || ''} · {(d.created_at || '').slice(0, 10)}</span>
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginBottom: 8 }}>{d.body}</div>
                {d.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" onClick={() => decide(d.id, 'approve')}><ICON.check size={12} />Duyệt &amp; gửi</button>
                    <button className="btn btn-secondary" onClick={() => decide(d.id, 'dismiss')}><ICON.x size={12} />Bỏ qua</button>
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
