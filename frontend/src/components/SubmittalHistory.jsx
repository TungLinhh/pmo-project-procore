// SubmittalHistory — Modal hiển thị lịch sử version của một material submittal
// Lấy từ audit log (resource_type = material_submittal)

import { useState, useEffect } from 'react';
import { audit, materialSubmittals } from '../api/index.js';

export default function SubmittalHistory({ submittalId, onClose }) {
  const [history, setHistory] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      materialSubmittals.history(submittalId),
      fetch(`/api/material-submittals/${submittalId}`).then(r => r.json()),
    ]).then(([hist, cur]) => {
      setHistory(hist);
      setCurrent(cur);
      setLoading(false);
    }).catch(e => {
      console.error(e);
      setLoading(false);
    });
  }, [submittalId]);

  if (loading) return <div className="modal-bg"><div className="modal">Đang tải...</div></div>;

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <h3>Lịch sử Submittal #{submittalId}</h3>
        {current && (
          <div className="current-state">
            <div><strong>Code:</strong> {current.submittal_code}</div>
            <div><strong>Status:</strong> {current.status}</div>
            <div><strong>SLA:</strong> {current.sla_days}d · <strong>TVGS:</strong> {current.supervisor_approval_days}d</div>
            <div><strong>SLA deadline:</strong> {current.sla_deadline || '—'}</div>
            <div><strong>TVGS deadline:</strong> {current.supervisor_deadline || '—'}</div>
            <div><strong>Revision:</strong> v{current.revision_number || 0}</div>
          </div>
        )}
        <h4>Audit Trail ({history.length} entries)</h4>
        <ul className="history-list">
          {history.map(h => (
            <li key={h.id} className={`history-item action-${h.action?.toLowerCase()}`}>
              <div className="history-row">
                <span className={`badge ${h.action?.toLowerCase()}`}>{h.action}</span>
                <span className="history-date">{new Date(h.created_at).toLocaleString('vi-VN')}</span>
                <span className="history-user">{h.user_name || '—'}</span>
              </div>
              {h.note && <div className="history-note">{h.note}</div>}
              {h.field_changes?.length > 0 && (
                <details className="history-diff">
                  <summary>Field changes ({h.field_changes.length})</summary>
                  <ul>
                    {h.field_changes.map((fc, i) => (
                      <li key={i}>
                        <code>{fc.field}</code>: {String(fc.from || '∅')} → {String(fc.to || '∅')}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
        <button onClick={onClose} className="btn-secondary">Đóng</button>
      </div>
    </div>
  );
}
