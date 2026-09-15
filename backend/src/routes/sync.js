// Sync routes — offline queue resolve (last-write-wins + CLIENT apply).
// Resolve is ownership-checked: own queue items, or admin/CEO.
//   winner=SERVER → keep server record, mark RESOLVED (unchanged behavior).
//   winner=CLIENT → apply resource_json onto server_record_id (allowlisted
//     types/fields only, lib/sync-apply.js) + audit SYNC_APPLY, same tx.

import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { checkProjectAccess } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { resolveConflict } from '../lib/validation.js';
import { checkTransition } from '../lib/transitions.js';
import { applyClientPayload } from '../lib/sync-apply.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

function canResolve(req, item) {
  if (item.user_id === req.user.id) return true;
  return req.user.role === 'admin' || !!req.user.is_ceo;
}

router.get('/queue', async (req, res) => {
  const db = getDb();
  const rows = await db.prepare(`
    SELECT * FROM offline_sync_queue
    WHERE user_id = ? AND status = 'PENDING'
    ORDER BY created_at ASC LIMIT 100
  `).allAsync(req.user.id);
  res.json(rows);
});

router.post('/resolve', async (req, res) => {
  const db = getDb();
  const { queue_id, winner } = req.body || {};
  if (!queue_id || !['SERVER', 'CLIENT'].includes(winner)) {
    return res.status(400).json({ error: 'queue_id and winner=SERVER|CLIENT required' });
  }
  const item = await db.prepare('SELECT * FROM offline_sync_queue WHERE id = ?').getAsync(queue_id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  if (!canResolve(req, item)) return res.status(403).json({ error: 'Only the queue owner (or admin/CEO) can resolve' });
  const t = checkTransition('sync_item', item.status, 'RESOLVED');
  if (!t.ok) return res.status(422).json({ error: t.error });
  // Last-write-wins advisory: client_timestamp vs server receipt (synced_at || created_at).
  // Explicit `winner` decides and is recorded; timestamp comparison is returned for transparency.
  const comparison = resolveConflict(item.client_timestamp, item.synced_at || item.created_at);
  const conflictResolution = winner === 'CLIENT' ? 'CLIENT_NEWER' : 'SERVER_NEWER';
  try {
    if (winner === 'CLIENT') {
      const applied = await withAudit(req, {
        action: 'SYNC_APPLY', resourceType: item.resource_type, resourceId: item.server_record_id,
        context: { queue_id, winner, comparison: comparison.winner },
        defer: true, // before/after come from the apply result, same tx
        note: `Apply offline client payload (queue #${queue_id})`,
      }, async (client) => {
        const { before, after } = await applyClientPayload(client, async (record) => {
          // Queue rows carry no project — resolve it from the server record.
          const projectId = record.project_id ?? null;
          if (projectId && !(await checkProjectAccess(req.user, projectId))) {
            throw { status: 404, message: 'Not found' };
          }
        }, item);
        await client.query(
          `UPDATE offline_sync_queue SET status = 'RESOLVED', conflict_resolution = $1, superseded_at = now() WHERE id = $2`,
          [conflictResolution, queue_id]
        );
        return { value: after, before, after };
      });
      return res.json({ ok: true, winner, comparison, conflict_resolution: conflictResolution, applied });
    }
    if (winner === 'SERVER' && item.server_record_id) {
      await withAudit(req, {
        action: 'SYNC_RESOLVE', resourceType: item.resource_type, resourceId: item.server_record_id,
        context: { queue_id, winner, comparison: comparison.winner },
        before: item.resource_json,
        after: item.resource_json,
        note: `Resolve sync conflict (winner=SERVER) for queue #${queue_id}`,
      }, async (client) => {
        await client.query(`UPDATE offline_sync_queue SET status = 'RESOLVED', conflict_resolution = $1, superseded_at = now() WHERE id = $2`, [conflictResolution, queue_id]);
        return { ok: true };
      });
    } else {
      await db.prepare(`UPDATE offline_sync_queue SET status = 'RESOLVED', conflict_resolution = ?, superseded_at = now() WHERE id = ?`).runAsync(conflictResolution, queue_id);
    }
    res.json({ ok: true, winner, comparison, conflict_resolution: conflictResolution });
  } catch (e) {
    if (e && typeof e.status === 'number') return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

export default router;
