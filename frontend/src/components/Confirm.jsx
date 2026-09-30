// Confirm modal - dùng chung cho Approve/Reject/...
// Cách dùng:
//   const confirm = useConfirm();
//   const ok = await confirm({ title: '...', message: '...', confirmText: 'Duyệt' });
//   if (!ok) return;
import { createContext, useContext, useState, useRef, useCallback } from 'react';
import Modal from './Modal.jsx';
import { t } from '../i18n/index.js';

const Ctx = createContext(null);

export function useConfirm() {
  return useContext(Ctx);
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, confirmText, cancelText, confirmStyle, resolve }
  const resolverRef = useRef(null);
  const cancelRef = useRef(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        title: opts.title || t('cf.default_title'),
        message: opts.message || t('cf.default_message'),
        confirmText: opts.confirmText || t('cf.default_title'),
        cancelText: opts.cancelText || t('cf.default_cancel'),
        confirmStyle: opts.confirmStyle || 'primary',  // primary | danger
      });
    });
  }, []);

  function close(result) {
    if (resolverRef.current) resolverRef.current(result);
    resolverRef.current = null;
    setState(null);
  }

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {state && (
        // Focus khởi đầu rơi vào Hủy: một lần Enter phản xạ không bao giờ chạy
        // hành động không hoàn tác được. Modal lo phần còn lại (Escape, trap
        // Tab, trả focus về nút đã mở).
        <Modal
          onClose={() => close(false)}
          maxWidth={420}
          labelledBy="confirm-title"
          describedBy="confirm-message"
          initialFocusRef={cancelRef}
        >
          <h3 id="confirm-title" style={{ marginTop: 0 }}>{state.title}</h3>
          <p id="confirm-message" style={{ color: 'var(--c-text-2)', marginBottom: 16, fontSize: 13 }}>{state.message}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button ref={cancelRef} className="btn btn-secondary" onClick={() => close(false)}>
              {state.cancelText}
            </button>
            <button
              className="btn"
              style={state.confirmStyle === 'danger' ? { background: 'var(--c-critical)', color: 'var(--c-text-inverse)' } : {}}
              onClick={() => close(true)}
            >
              {state.confirmText}
            </button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  );
}
