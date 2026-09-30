// Field offline outbox (Wave 2 B2): localStorage queue + background flush.
import { t } from '../i18n/index.js';
// Same shape the server enqueue endpoint validates — shape errors are programmed
// out (validated before storing), network/5xx retry with backoff, 4xx marks dead.
// Photos are NOT queued here (online-only with retry — localStorage fits text).
const KEY = 'pmo_outbox_v1';
const DEVKEY = 'pmo_device_id';

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `c-${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

export function deviceId() {
  let id = null;
  try {
    id = localStorage.getItem(DEVKEY);
    if (!id) { id = uid(); localStorage.setItem(DEVKEY, id); }
  } catch { id = 'unknown-device'; }
  return id;
}

export function loadOutbox() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

// Swallowing a localStorage quota error loses the queue with no trace: the
// in-memory copy dies with this function and /field/sync then reports "all
// synced" while the entries are gone. Surface it instead.
let lastSaveError = null;
function saveOutbox(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    lastSaveError = null;
  } catch (e) {
    lastSaveError = e;
    console.error(t('obbox.save_failed'), e);
  }
  try { window.dispatchEvent(new Event('pmo:outbox')); } catch { /* non-browser */ }
}

export const outboxLastSaveError = () => lastSaveError;

// enqueue(entry {resource_type, server_record_id, resource_json}, getToken):
// stores + tries an immediate flush when online. Returns the stored item.
//
// getToken is NOT optional in practice. Calling flush() with no token sent an
// empty Authorization header, the server answered 401, and because 401 is
// neither 429 nor >=500 the item was marked `dead` on the very first save —
// i.e. exactly the flaky-network case this queue exists for destroyed the
// user's work immediately, with no retry path.
export function enqueue(entry, getToken) {
  const items = loadOutbox();
  const item = {
    client_id: uid(),
    device_id: deviceId(),
    client_timestamp: new Date().toISOString(),
    status: 'queued', // queued | sending | dead
    attempts: 0,
    last_error: null,
    ...entry,
  };
  items.push(item);
  saveOutbox(items);
  if (navigator.onLine) flush(getToken).catch(() => {});
  return item;
}

// flush(getToken): push every queued item to /api/sync/enqueue.
// 2xx → dropped from outbox (server owns it now). 429/5xx/network → stays queued
// with backoff count. Other 4xx → dead (shape the server rejects; retry is futile).
export async function flush(getToken) {
  const token = typeof getToken === 'function' ? getToken() : getToken;
  let items = loadOutbox();
  const pending = items.filter((i) => i.status === 'queued' || i.status === 'sending');
  const results = [];
  for (const it of pending) {
    it.status = 'sending';
    it.attempts += 1;
    saveOutbox(items);
    try {
      const r = await fetch('/api/sync/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          client_id: it.client_id,
          resource_type: it.resource_type,
          server_record_id: it.server_record_id ?? null,
          resource_json: it.resource_json,
          client_timestamp: it.client_timestamp,
          device_id: it.device_id,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (r.ok) {
        items = items.filter((x) => x.client_id !== it.client_id);
        saveOutbox(items);
        results.push({ client_id: it.client_id, ok: true, deduped: !!body.deduped });
      } else if (r.status === 401 || r.status === 429 || r.status >= 500) {
        // 401 is retryable: the access token expired (default TTL 24h) and the
        // fix is a refreshed token, not discarding the user's entry. Treating
        // it as terminal threw away field work over a clock.
        it.status = 'queued';
        it.last_error = body.error || `HTTP ${r.status}`;
        saveOutbox(items);
        results.push({ client_id: it.client_id, ok: false, retry: true });
      } else {
        it.status = 'dead';
        it.last_error = body.error || `HTTP ${r.status}`;
        saveOutbox(items);
        results.push({ client_id: it.client_id, ok: false, retry: false });
      }
    } catch (e) {
      it.status = 'queued'; // network down — backoff via attempts, flushed on reconnect
      it.last_error = String(e.message || e).slice(0, 120);
      saveOutbox(items);
      results.push({ client_id: it.client_id, ok: false, retry: true });
      break; // offline: stop draining, wait for the next online event
    }
  }
  return results;
}

export function outboxStats() {
  const items = loadOutbox();
  return {
    queued: items.filter((i) => i.status === 'queued' || i.status === 'sending').length,
    dead: items.filter((i) => i.status === 'dead').length,
  };
}

export function clearDead() {
  saveOutbox(loadOutbox().filter((i) => i.status !== 'dead'));
}

// Auto-flush on reconnect (registered once by field shells).
let wired = false;
export function wireAutoFlush(getToken) {
  if (wired) return;
  wired = true;
  window.addEventListener('online', () => flush(getToken).catch(() => {}));
}
