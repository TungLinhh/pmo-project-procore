// In-process event bus + SSE fan-out (Wave D3). Single Node today: a Map is
// correct. Documented seam for multi-backend day: replace publish() with
// Redis pub/sub, subscribers stay identical.
// Events (v1, only these three): notification.created, approval.decided,
// compression.applied. Everything else stays polled.
const subs = new Map(); // userId -> Set<res>

export function subscribe(userId, res) {
  if (!subs.has(userId)) subs.set(userId, new Set());
  subs.get(userId).add(res);
  return () => {
    const s = subs.get(userId);
    if (s) { s.delete(res); if (!s.size) subs.delete(userId); }
  };
}

export function subscriberCount() {
  let n = 0;
  for (const s of subs.values()) n += s.size;
  return n;
}

// Decision fan-out (Wave D3): approval/compression outcomes go to tenant
// admins + CEO (governance audience — submitters aren't tracked in schema).
// Synchronous + best-effort: deterministic for tests, invisible on failure.
export async function emitDecision(db, tenantId, { kind, id, label, decision, projectId }) {
  try {
    const admins = await db.prepare(
      `SELECT id FROM users WHERE tenant_id = ? AND (role = 'admin' OR is_ceo)`
    ).allAsync(tenantId);
    const type = kind === 'compression' ? 'compression.applied' : 'approval.decided';
    for (const a of admins) {
      publish(a.id, { type, kind, id, label, decision, project_id: projectId ?? null });
    }
  } catch {}
}

// Best-effort push (never throws into business logic): dead sockets pruned.
export function publish(userId, event) {
  const s = subs.get(userId);
  if (!s || !s.size) return 0;
  const line = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  let sent = 0;
  for (const res of [...s]) {
    try {
      res.write(line);
      sent++;
    } catch {
      s.delete(res);
    }
  }
  if (!s.size) subs.delete(userId);
  return sent;
}
