// Project access control (Phase 2). HBG-only today, multi-tenant seam ready.
//
// requireProjectAccess({ idParam }): for routes with a project id param.
//   - 404 when the project is missing OR belongs to another tenant (same code,
//     so tenant existence never leaks).
//   - passes for admin / CEO (is_ceo) without membership (HBG ops seam).
//   - otherwise requires a project_members row.
// requireResourceProject({ table, idParam, via }): for nested single-id routes.
//   table holds project_id directly, or via { table, from } one hop
//   (e.g. invoices → contracts → project).
import { getDb } from '../db/index.js';

export async function checkProjectAccess(user, projectId) {
  const db = getDb();
  const project = await db.prepare('SELECT id, tenant_id FROM projects WHERE id = ?').getAsync(projectId);
  if (!project || project.tenant_id !== user.tenant_id) return false;
  if (user.role === 'admin' || user.is_ceo) return true;
  const member = await db.prepare('SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?').getAsync(project.id, user.id);
  return !!member;
}

export function requireProjectAccess({ idParam = 'id' } = {}) {
  return async (req, res, next) => {
    try {
      const projectId = Number(req.params?.[idParam]);
      if (!projectId) return res.status(400).json({ error: 'project id required' });
      const allowed = await checkProjectAccess(req.user, projectId);
      if (!allowed) return res.status(404).json({ error: 'Project not found' });
      next();
    } catch {
      return res.status(404).json({ error: 'Project not found' });
    }
  };
}

// requireResourceProject({ table, idParam, via }): for nested single-id routes.
//   table holds project_id directly, or via hops resolve it:
//   via: { table, from } or array of hops, e.g. payment_requests → invoices →
//   contracts: [{ table: 'invoices', from: 'invoice_id' }, { table: 'contracts', from: 'contract_id' }].
export function requireResourceProject({ table, idParam = 'id', via = null } = {}) {
  return async (req, res, next) => {
    try {
      const db = getDb();
      const rid = Number(req.params?.[idParam]);
      if (!rid) return next(); // let the route validate
      let projectId = null;
      if (!via) {
        const row = await db.prepare(`SELECT project_id FROM ${table} WHERE id = ?`).getAsync(rid);
        projectId = row?.project_id ?? null;
      } else {
        const hops = Array.isArray(via) ? via : [via];
        let curTable = table;
        let curId = rid;
        for (const hop of hops) {
          const row = await db.prepare(`SELECT ${hop.from} AS pid FROM ${curTable} WHERE id = ?`).getAsync(curId);
          if (row?.pid == null) { curId = null; break; }
          curId = row.pid;
          curTable = hop.table;
        }
        if (curId != null) {
          const leaf = await db.prepare(`SELECT project_id FROM ${curTable} WHERE id = ?`).getAsync(curId);
          projectId = leaf?.project_id ?? null;
        }
      }
      if (projectId == null) return next(); // unscoped row — route handles it
      const allowed = await checkProjectAccess(req.user, Number(projectId));
      if (!allowed) return res.status(404).json({ error: 'Not found' });
      next();
    } catch {
      return res.status(404).json({ error: 'Not found' });
    }
  };
}
