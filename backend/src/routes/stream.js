// Realtime stream (Wave D3): GET /api/stream (SSE, query-token auth).
// EventSource cannot set headers → ?token= validated by the same verifyAccess
// (short-lived accept: any valid access token; no new token type in v1).
// Mount: /api/stream (before the SPA fallback!). Heartbeat 25s, no buffering.
import { Router } from 'express';
import { verifyAccess } from '../lib/auth.js';
import { subscribe, subscriberCount } from '../lib/events.js';

const router = Router({ mergeParams: true });

router.get('/', async (req, res, next) => {
  let user;
  try {
    user = await verifyAccess(req.query.token);
  } catch (e) {
    // P0-3: DB/pool failure during handshake must be 401 JSON, never a hang
    // (Express 4 would leave an async throw unhandled pre-writeHead).
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: hello\ndata: {"user_id":${user.id}}\n\n`);
  const drop = subscribe(user.id, res);
  const beat = setInterval(() => {
    try { res.write(`:beat\n\n`); } catch {}
  }, 25000);
  // P1-8 dead peers: req.on('close') never fires for connections parked
  // behind proxies (Cloudflare tunnel), so vanished clients would pile up in
  // the subscriber map forever. Bound every stream to a 90s lifetime — the
  // client (EventSource) auto-reconnects transparently and re-handshakes.
  const reap = setTimeout(() => {
    try { res.end(); } catch {}
    drop();
  }, 90000);
  req.on('close', () => {
    clearInterval(beat);
    clearTimeout(reap);
    drop();
  });
});

// Debug surface (admin/CEO): who's listening right now.
router.get('/status', async (req, res) => {
  const { requireAuth, requireRole } = await import('../lib/auth.js');
  return requireAuth(req, res, () => requireRole('admin', 'ceo')(req, res, () => {
    res.json({ subscribers: subscriberCount() });
  }));
});

export default router;
