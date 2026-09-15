// Toast/Snackbar - góc dưới trái, 2 loại success/error, tự ẩn 3s, click tắt sớm
// Dùng: import { toast } from '../components/Toast.jsx'
//       toast.success('Saved'); toast.error('Failed: ' + e.message)
import { useEffect, useState, useCallback } from 'react';

let listeners = new Set();
let counter = 0;

function emit(toast) {
  listeners.forEach(fn => fn(toast));
}

export const toast = {
  success: (message) => emit({ id: ++counter, type: 'success', message }),
  error: (message) => emit({ id: ++counter, type: 'error', message }),
  info: (message) => emit({ id: ++counter, type: 'info', message }),
};

function ToastItem({ item, onClose }) {
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setExiting(true);
      setTimeout(() => onClose(item.id), 200);
    }, 3000);
    return () => clearTimeout(t);
  }, [item.id, onClose]);

  const colors = {
    success: { bg: '#16a34a', icon: '✓' },
    error: { bg: '#dc2626', icon: '✕' },
    info: { bg: '#2563eb', icon: 'ⓘ' },
  };
  const c = colors[item.type] || colors.info;

  return (
    <div className={`toast toast-${item.type} ${exiting ? 'toast-exit' : ''}`} role="status" onClick={() => { setExiting(true); setTimeout(() => onClose(item.id), 200); }}>
      <span className="toast-icon" style={{ background: c.bg }}>{c.icon}</span>
      <span className="toast-msg">{item.message}</span>
      <button className="toast-close" onClick={(e) => { e.stopPropagation(); setExiting(true); setTimeout(() => onClose(item.id), 200); }} aria-label="Close">×</button>
    </div>
  );
}

export default function ToastContainer() {
  const [items, setItems] = useState([]);
  const onClose = useCallback((id) => setItems(arr => arr.filter(x => x.id !== id)), []);
  useEffect(() => {
    const fn = (t) => setItems(arr => [...arr, t]);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  if (items.length === 0) return null;
  return (
    <div className="toast-container">
      {items.map(it => <ToastItem key={it.id} item={it} onClose={onClose} />)}
    </div>
  );
}
