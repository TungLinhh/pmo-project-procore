// Toast/Snackbar - góc dưới trái, 2 loại success/error, tự ẩn 3s, click tắt sớm
// Dùng: import { toast } from '../components/Toast.jsx'
//       toast.success('Saved'); toast.error('Failed: ' + e.message)
import { useEffect, useState, useCallback, useRef } from 'react';
import { t } from '../i18n/index.js';

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

// Unhandled promise rejections used to vanish into the console. A data-loading
// call that nobody `.catch`es therefore looked exactly like "there is no data
// yet" — the most misleading failure mode in a dashboard, because the numbers on
// screen stay plausible. Surfacing them makes the difference visible.
//
// Deduped per message: a page can fire several loads at once, and a background
// poll can repeat the same failure every 30s, so an undeduped toast would bury
// the screen in identical cards.
const recentlyShown = new Map();
const DEDUPE_WINDOW_MS = 30000;

export function reportUnhandled(message) {
  const now = Date.now();
  const last = recentlyShown.get(message) || 0;
  if (now - last < DEDUPE_WINDOW_MS) return;
  recentlyShown.set(message, now);
  toast.error(message);
}

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    // The browser's own network errors are English and vague. Translate the ones
    // users actually hit; anything else keeps its own text, which is usually a
    // server-authored Vietnamese message we care more about preserving.
    const raw = reason?.response?.error || reason?.message || '';
    let text;
    if (/Failed to fetch|NetworkError|Load failed|ERR_CONNECTION/i.test(raw)) {
      text = t('toast.offline_title');
    } else if (raw) {
      text = String(raw);
    } else {
      text = t('toast.action_incomplete');
    }
    reportUnhandled(text.slice(0, 160));
  });
}

function ToastItem({ item, onClose }) {
  const [exiting, setExiting] = useState(false);
  // P2-11: stacked timeouts — every click/exit scheduled its own orphan
  // setTimeout(onClose). All timers live in one ref, cleared on unmount, and
  // scheduleClose() is idempotent so rapid clicks can't queue duplicate closes.
  const timers = useRef([]);
  const closed = useRef(false);
  const scheduleClose = useCallback((delay) => {
    if (closed.current) return;
    closed.current = true;
    setExiting(true);
    timers.current.push(setTimeout(() => onClose(item.id), delay));
  }, [item.id, onClose]);
  useEffect(() => {
    timers.current.push(setTimeout(() => scheduleClose(200), 3000));
    const stash = timers.current;
    return () => stash.forEach(clearTimeout);
  }, [scheduleClose]);

  const colors = {
    success: { bg: '#16a34a', icon: '✓' },
    error: { bg: '#dc2626', icon: '✕' },
    info: { bg: '#2563eb', icon: 'ⓘ' },
  };
  const c = colors[item.type] || colors.info;

  return (
    <div className={`toast toast-${item.type} ${exiting ? 'toast-exit' : ''}`} role="status" onClick={() => scheduleClose(200)}>
      <span className="toast-icon" style={{ background: c.bg }}>{c.icon}</span>
      <span className="toast-msg">{item.message}</span>
      <button className="toast-close" onClick={(e) => { e.stopPropagation(); scheduleClose(200); }} aria-label="Close">×</button>
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
