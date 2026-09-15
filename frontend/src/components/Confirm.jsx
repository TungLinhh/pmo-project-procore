// Confirm modal - dùng chung cho Approve/Reject/...
// Cách dùng:
//   const confirm = useConfirm();
//   const ok = await confirm({ title: '...', message: '...', confirmText: 'Duyệt' });
//   if (!ok) return;
import { createContext, useContext, useState, useRef, useCallback } from 'react';

const Ctx = createContext(null);

export function useConfirm() {
  return useContext(Ctx);
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, confirmText, cancelText, confirmStyle, resolve }
  const resolverRef = useRef(null);

  const confirm = useCallback((opts) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        title: opts.title || 'Xác nhận',
        message: opts.message || 'Bạn có chắc chắn?',
        confirmText: opts.confirmText || 'Xác nhận',
        cancelText: opts.cancelText || 'Hủy',
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
        <div className="modal-backdrop" onClick={() => close(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ marginTop: 0 }}>{state.title}</h3>
            <p style={{ color: 'var(--c-text-2)', marginBottom: 16, fontSize: 13 }}>{state.message}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => close(false)}>
                {state.cancelText}
              </button>
              <button
                className="btn"
                style={state.confirmStyle === 'danger' ? { background: 'var(--c-critical)', color: '#fff' } : {}}
                onClick={() => close(true)}
                autoFocus
              >
                {state.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
