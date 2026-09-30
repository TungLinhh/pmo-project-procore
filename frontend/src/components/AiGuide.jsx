import { useState } from 'react';
import { t, useLang } from '../i18n/index.js';
import '../styles/ai-guide.css';

// Bảng hướng dẫn thu gọn. Mặc định đóng để không chen vào nội dung chính — người
// dùng lần đầu bấm vào, người đã biết thì không phải đọc lại mỗi lần.
export function AiGuide({ title, open: controlledOpen, onToggle, children }) {
  // useLang để dải hướng dẫn đổi theo nút [VI|EN] cùng phần còn lại của trang.
  useLang();
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen === undefined ? uncontrolled : controlledOpen;
  const setOpen = (next) => {
    setUncontrolled(next);
    onToggle?.(next);
  };

  return (
    <div className="ai-guide">
      <button
        type="button"
        className="ai-guide-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="ai-guide-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        {title || t('aiguide.hint')}
        {!open && <span className="ai-guide-hint">{t('aiguide.tap')}</span>}
      </button>
      {open && <div className="ai-guide-body">{children}</div>}
    </div>
  );
}

// Câu mẫu bấm được: điền thẳng vào ô nhập thay vì bắt người dùng gõ tay.
export function SampleChips({ samples, onPick, note }) {
  if (!samples?.length) return null;
  return (
    <div className="ai-guide-samples">
      <div className="ai-guide-label">
        {note || t('aiguide.pick')}
      </div>
      <div className="ai-guide-chips">
        {samples.map((s) => (
          <button
            key={s.text}
            type="button"
            className="ai-guide-chip"
            onClick={() => onPick(s.text)}
            title={s.text}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GuideTips({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="ai-guide-tips">
      {items.map((t, i) => (
        <li key={i}>
          {/* Câu trong dấu ** được in đậm; phần còn lại giữ nguyên. */}
          {renderEmphasis(t)}
        </li>
      ))}
    </ul>
  );
}

// Bảng quy tắc: cột "cần" / "viết thế nào".
export function GuideRules({ rules }) {
  if (!rules?.length) return null;
  return (
    <table className="ai-guide-rules">
      <thead>
        <tr><th>{t('guide.sec_info')}</th><th>{t('guide.sec_howto')}</th></tr>
      </thead>
      <tbody>
        {rules.map((r) => (
          <tr key={r.need}>
            <td className="need">{r.need}</td>
            <td>{renderEmphasis(r.how)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Cho người dùng thấy hệ thống đọc được gì TRƯỚC khi bấm nút. Đây là phần
// giá trị nhất: biến việc đoán mò thành phản hồi tức thì.
export function ParsePreview({ preview, projectChosen }) {
  const rows = [
    {
      label: t('aiguide.row_percent'),
      ok: preview.progressPercent != null,
      value: preview.progressPercent != null ? `${preview.progressPercent}%` : t('aiguide.not_read'),
    },
    {
      label: t('aiguide.row_code'),
      ok: Boolean(preview.codeHint),
      value: preview.codeHint
        ? `${preview.codeHint} (${preview.codeIsExplicit ? t('aiguide.explicit') : t('aiguide.guessed')})`
        : t('aiguide.not_read'),
    },
    {
      label: t('aiguide.row_date'),
      ok: Boolean(preview.reportDate),
      optional: true,
      value: preview.reportDate || t('aiguide.none_optional'),
    },
  ];
  const ready = preview.progressPercent != null && Boolean(preview.codeHint) && projectChosen;

  return (
    <div className={`ai-guide-parse${ready ? ' ready' : ''}`}>
      <div className="ai-guide-label">{t('aiguide.will_read')}</div>
      <ul>
        {rows.map((r) => (
          <li key={r.label} className={r.ok ? 'ok' : (r.optional ? 'opt' : 'miss')}>
            <span className="k">{r.label}</span>
            <span className="v">{r.value}</span>
          </li>
        ))}
      </ul>
      {!ready && (
        <div className="ai-guide-parse-note">
          { !projectChosen
            ? t('aiguide.pick_project')
            : t('aiguide.missing_required') }
        </div>
      )}
      {ready && <div className="ai-guide-parse-ok">{t('aiguide.enough')}</div>}
    </div>
  );
}

function renderEmphasis(text) {
  const parts = String(text).split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) => (i % 2 === 1 ? <strong key={i}>{p}</strong> : <span key={i}>{p}</span>));
}
