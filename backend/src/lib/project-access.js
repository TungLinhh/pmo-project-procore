// Project access control (Phase 2). HBG-only today, multi-tenant seam ready.
//
// requireProjectAccess({ idParam }): for routes with a project id param.
//   - 404 when the project is missing OR belongs to another tenant (same code,
//     so tenant existence never leaks).
//   - passes for admin / CEO (is_ceo) without membership.
//   - otherwise requires a project_members row.
// requireResourceProject({ table, idParam, via }): for nested single-id routes.
//   table holds project_id directly, or via { table, from } one hop
//   (e.g. invoices → contracts → project).
import { getDb } from '../db/index.js';

// `client` là TUỲ CHỌN và rất quan trọng.
//
// Khi không truyền, hàm dùng connection từ pool. Khi gọi **bên trong** một
// `withAudit`/`withClientTx` thì phải truyền `client` của transaction vào, vì:
//
//  1. **Chết pool.** `PG_POOL_MAX` mặc định 10 và `connectionTimeoutMillis` 10 000.
//     Mỗi request giữ một client cho transaction rồi lại xin client thứ hai để
//     chạy câu kiểm tra. Đủ 10 request `POST /api/sync/resolve` chạy song song thì
//     cả 10 đang giữ transaction **và** cả 10 đều chờ connection thứ hai ⇒ không
//     request nào giải phóng được ⇒ treo tới hết 10 giây rồi lỗi. Đây là kiểu chết
//     pool kinh điển và chạm được từ tablet hiện trường trên mạng yếu.
//  2. **Đọc ngoài transaction.** Cột bảo mật được đọc từ snapshot *ngoài*
//     transaction, nên việc thu hồi quyền thành viên giữa `BEGIN` và câu lệnh này
//     không được nhìn thấy.
//
// Hàm nhận cả hai kiểu executor: `client` thô của `pg` (`client.query(sql, params)`)
// hoặc `DbWrapper` (`prepare().getAsync()`). Các call site ngoài transaction giữ
// nguyên hành vi cũ vì không truyền gì.
export async function checkProjectAccess(user, projectId, client = null) {
  const run = client
    ? async (sql, params) => client.query(sql, params).then((r) => r.rows[0])
    : null;
  const one = async (sql, params) => {
    if (run) return run(sql, params);
    return getDb().prepare(sql).getAsync(...params);
  };
  const project = await one('SELECT id, tenant_id, pm_user_id FROM projects WHERE id = $1', [projectId]);
  if (!project || project.tenant_id !== user.tenant_id) return false;
  if (user.role === 'admin' || user.is_ceo) return true;
  if (user.role === 'pm' && project.pm_user_id != null && Number(project.pm_user_id) === Number(user.id)) return true;
  const member = await one('SELECT 1 AS ok FROM project_members WHERE project_id = $1 AND user_id = $2', [project.id, user.id]);
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
      req.resourceProjectId = Number(projectId);
      const allowed = await checkProjectAccess(req.user, Number(projectId));
      if (!allowed) return res.status(404).json({ error: 'Not found' });
      next();
    } catch {
      return res.status(404).json({ error: 'Not found' });
    }
  };
}
