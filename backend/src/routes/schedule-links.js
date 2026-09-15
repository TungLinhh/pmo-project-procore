// Schedule dependency links (v0.6.0 Phase 0): FS/SS/FF graph over
// construction_schedule_items. CPM + compression (later phases) read this.
// Mount: /api (project-scoped reads/writes + direct delete).

import { Router } from 'express';
import { requireAuth, requireRole } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { requireProjectAccess } from '../lib/project-access.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { validateNewLink, LINK_TYPES } from '../lib/cpm.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);
router.use('/projects/:id', requireProjectAccess());

async function loadGraph(projectId) {
  const db = getDb();
  const [items, links] = await Promise.all([
    db.prepare('SELECT id FROM construction_schedule_items WHERE project_id = ?').allAsync(projectId),
    db.prepare('SELECT id, predecessor_id, successor_id, link_type, lag_days FROM schedule_links WHERE project_id = ? ORDER BY id').allAsync(projectId),
  ]);
  return { items, links };
}

// GET /api/projects/:id/schedule-links — full link list with item names.
router.get('/projects/:id/schedule-links', async (req, res) => {
  const db = getDb();
  res.json(await db.prepare(
    `SELECT l.*, p.name_vi AS pred_name, s.name_vi AS succ_name
     FROM schedule_links l
     JOIN construction_schedule_items p ON p.id = l.predecessor_id
     JOIN construction_schedule_items s ON s.id = l.successor_id
     WHERE l.project_id = ? ORDER BY l.id`
  ).allAsync(req.params.id));
});

// POST /api/projects/:id/schedule-links {predecessor_id, successor_id, link_type?, lag_days?}
router.post('/projects/:id/schedule-links', requireRole('admin', 'ceo', 'pm'), async (req, res) => {
  const db = getDb();
  const { predecessor_id, successor_id, link_type = 'FS', lag_days = 0 } = req.body || {};
  const pred = Number(predecessor_id);
  const succ = Number(successor_id);
  if (!Number.isInteger(pred) || !Number.isInteger(succ)) {
    return res.status(400).json({ error: 'predecessor_id and successor_id must be integers' });
  }
  if (pred === succ) return res.status(422).json({ error: 'self-link forbidden' });
  // Both ends must live in THIS project (no cross-project edges, no tenant leak).
  const ends = await db.prepare(
    'SELECT id FROM construction_schedule_items WHERE project_id = ? AND id IN (?, ?)'
  ).allAsync(req.params.id, pred, succ);
  if (ends.length !== 2) return res.status(404).json({ error: 'Both items must exist in this project' });
  const { items, links } = await loadGraph(req.params.id);
  const v = validateNewLink(items, links, pred, succ, link_type, lag_days);
  if (!v.ok) return res.status(422).json({ error: v.error, cycle: v.cycle || undefined });
  try {
    const row = await withAudit(req, {
      action: 'CREATE', resourceType: 'schedule_link', resourceId: 0,
      context: { project_id: Number(req.params.id) },
      after: { predecessor_id: pred, successor_id: succ, link_type, lag_days },
      note: `Link ${pred} -${link_type}+${lag_days}→ ${succ}`,
    }, async (client) => {
      const r = await client.query(
        `INSERT INTO schedule_links (project_id, predecessor_id, successor_id, link_type, lag_days, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.id, pred, succ, link_type, lag_days, req.user.id]
      );
      return r.rows[0];
    });
    res.status(201).json(row);
  } catch (e) {
    if (String(e.message).includes('schedule_links_pred_succ_uq')) {
      return res.status(409).json({ error: 'duplicate link' });
    }
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/schedule-links/:id
router.delete('/schedule-links/:id', requireRole('admin', 'ceo', 'pm'), async (req, res) => {
  const db = getDb();
  const old = await db.prepare('SELECT * FROM schedule_links WHERE id = ?').getAsync(req.params.id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const allowed = await (await import('../lib/project-access.js')).checkProjectAccess(req.user, old.project_id);
  if (!allowed) return res.status(404).json({ error: 'Not found' });
  try {
    await withAudit(req, {
      action: 'DELETE', resourceType: 'schedule_link', resourceId: Number(req.params.id),
      context: { project_id: old.project_id },
      before: old, after: null,
      note: `Xóa link ${old.predecessor_id}→${old.successor_id}`,
    }, async (client) => {
      await client.query('DELETE FROM schedule_links WHERE id = $1', [req.params.id]);
      return { ok: true };
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/projects/:id/schedule-links/auto-chain {confirm?: boolean}
// Bootstrap cold graphs: per zone, order by (plan_start_date, ordinal) and
// propose FS lag-0 chains. Preview by default; {confirm:true} writes.
// DONE/locked items are SKIPPED as chain middles (they're anchors, not flow)
// but remain valid endpoints when dates prove adjacency — kept simple: skip
// items with progress_pct >= 1 entirely, report them as skipped.
router.post('/projects/:id/schedule-links/auto-chain', requireRole('admin', 'ceo', 'pm'), async (req, res) => {
  const db = getDb();
  const { confirm = false } = req.body || {};
  const items = await db.prepare(
    `SELECT id, zone_id, ordinal, plan_start_date, plan_end_date, progress_pct, status, name_vi
     FROM construction_schedule_items WHERE project_id = ? ORDER BY zone_id, plan_start_date NULLS LAST, ordinal NULLS LAST, id`
  ).allAsync(req.params.id);
  const { links } = await loadGraph(req.params.id);
  const existing = new Set(links.map((l) => `${l.predecessor_id}→${l.successor_id}`));
  const byZone = new Map();
  for (const it of items) {
    if (!byZone.has(it.zone_id)) byZone.set(it.zone_id, []);
    byZone.get(it.zone_id).push(it);
  }
  const proposed = [];
  const skipped = [];
  for (const [, arr] of byZone) {
    const flow = arr.filter((it) => (it.progress_pct ?? 0) < 1 && it.status !== 'DONE');
    skipped.push(...arr.filter((it) => !flow.includes(it)).map((it) => ({ id: it.id, name: it.name_vi, reason: 'locked (DONE/progress=1)' })));
    for (let k = 0; k + 1 < flow.length; k++) {
      const a = flow[k], b = flow[k + 1];
      if (existing.has(`${a.id}→${b.id}`)) continue;
      const v = validateNewLink(items, [...links, ...proposed.map((p) => ({ predecessor_id: p.predecessor_id, successor_id: p.successor_id, link_type: 'FS', lag_days: 0 }))], a.id, b.id, 'FS', 0);
      if (v.ok) proposed.push({ predecessor_id: a.id, successor_id: b.id, link_type: 'FS', lag_days: 0, zone_id: a.zone_id });
      else skipped.push({ id: b.id, name: b.name_vi, reason: v.error });
    }
  }
  if (!confirm) return res.json({ proposed, skipped, confirm_required: true });
  let created = 0;
  await withAudit(req, {
    action: 'AUTO_CHAIN', resourceType: 'schedule_link', resourceId: Number(req.params.id),
    context: { project_id: Number(req.params.id) },
    after: { created: proposed.length, skipped: skipped.length },
    note: `Auto-chain: ${proposed.length} links, ${skipped.length} skipped`,
  }, async (client) => {
    for (const p of proposed) {
      await client.query(
        `INSERT INTO schedule_links (project_id, predecessor_id, successor_id, link_type, lag_days, created_by)
         VALUES ($1, $2, $3, 'FS', 0, $4) ON CONFLICT DO NOTHING`,
        [req.params.id, p.predecessor_id, p.successor_id, req.user.id]
      );
      created++;
    }
    return { created };
  });
  res.status(201).json({ created, skipped });
});

export default router;
export { LINK_TYPES };
