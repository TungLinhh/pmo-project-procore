// Realtime stream (Wave D3): GET /api/stream (SSE) + POST /api/stream/ticket.
//
// Auth is a short-lived SINGLE-USE ticket, not the access token. EventSource
// cannot set an Authorization header, and the previous `?token=` handshake put
// the long-lived access token in the query string where it leaked into access
// logs, proxy logs, browser history and Referer headers. The ticket lives 45s,
// is burned on first use (auth_revoked_jti, so single-use holds across
// instances) and is rejected everywhere else by its `stream` audience.
//
// Mount: /api/stream (before the SPA fallback!). Heartbeat 25s, no buffering.
import { Router } from 'express';
import { consumeStreamTicket, issueStreamTicket, requireAuth, requireRole, STREAM_TICKET_TTL_SEC } from '../lib/auth.js';
import { subscribe, subscriberCount } from '../lib/events.js';

const router = Router({ mergeParams: true });

// Mint a ticket. Header-authenticated like every other /api route, so the
// access token never leaves the Authorization header.
router.post('/ticket', requireAuth, (req, res) => {
  res.json({ ticket: issueStreamTicket(req.user), expires_in: STREAM_TICKET_TTL_SEC });
});

router.get('/', async (req, res) => {
  let user;
  try {
    user = await consumeStreamTicket(req.query.ticket);
  } catch {
    // P0-3: DB/pool failure during handshake must be 401 JSON, never a hang
    // (Express 4 would leave an async throw unhandled pre-writeHead).
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!user) {
    return res.status(401).json({
      error: 'Stream ticket không hợp lệ hoặc đã dùng.',
      hint: 'Lấy vé mới: POST /api/stream/ticket (Authorization: Bearer <access token>).',
    });
  }
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
  // client reconnects and re-handshakes with a fresh ticket.
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
router.get('/status', requireAuth, requireRole('admin', 'ceo'), (req, res) => {
  res.json({ subscribers: subscriberCount() });
});

export default router;
