// Master data — generic CRUD cho vendors, subcontractors, suppliers, workers, teams, cost_codes
// Cú pháp: GET /api/master-data/:resource trả về list, POST để tạo mới

import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { permissionMiddleware } from '../lib/permission-middleware.js';
import { getDb } from '../db/index.js';
import { withAudit } from '../lib/with-audit.js';
import { enc, dec } from '../lib/crypto.js';
import { errorBody } from '../lib/error-body.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(permissionMiddleware);

const TABLES = {
  vendors: 'vendors',
  subcontractors: 'subcontractors',
  suppliers: 'suppliers',
  workers: 'workers',
  teams: 'teams',
  cost_codes: 'cost_codes',
  resources: 'resources',
  business_processes: 'business_processes',
  'business-processes': 'business_processes',
  departments: 'departments',
};

// Explicit create columns per table. System-owned identity and timestamps are
// never accepted from a request body; this prevents sequence drift and tenant
// spoofing without relying on a permissive column-name regex.
const CREATABLE_COLUMNS = {
  vendors: ['code', 'name', 'tax_id', 'contact', 'category', 'status', 'legacy_code'],
  subcontractors: ['name', 'capability_summary', 'status', 'is_internal_team', 'source_sheet'],
  suppliers: ['name', 'system', 'category', 'contact', 'status', 'source_sheet', 'past_projects', 'location', 'price_rating', 'quality_rating', 'warranty_rating'],
  workers: ['code', 'full_name', 'team_id', 'phone', 'role', 'status', 'legacy_code'],
  teams: ['code', 'name', 'lead_worker_id', 'status', 'legacy_code'],
  cost_codes: ['code', 'name', 'category', 'unit', 'unit_price', 'status'],
  resources: ['code', 'name', 'type', 'status'],
  business_processes: ['code', 'name_vi', 'name_en'],
  departments: ['code', 'name_vi', 'parent_id'],
};

router.get('/:resource', async (req, res) => {
  const table = TABLES[req.params.resource];
  if (!table) return res.status(404).json({ error: `Unknown resource: ${req.params.resource}` });
  const db = getDb();
  // departments is tenant-scoped (chains resolve per tenant).
  if (table === 'departments') {
    return res.json(await db.prepare('SELECT * FROM departments WHERE tenant_id = ? ORDER BY id LIMIT 500').allAsync(req.user.tenant_id));
  }
  // vendors.contact / workers.phone ma hoa cot (task 10) — giai ma khi tra ve.
  const rows = await db.prepare(`SELECT * FROM ${table} ORDER BY id LIMIT 500`).allAsync();
  res.json(rows.map((r) => decodePii(table, r)));
});

// Cot PII ma hoa theo bang (ghi: encodePii truoc INSERT).
function encodePii(table, data) {
  const out = { ...data };
  if (table === 'vendors' && out.contact != null && out.contact !== '') out.contact = enc(out.contact);
  if (table === 'workers' && out.phone != null && out.phone !== '') out.phone = enc(out.phone);
  return out;
}

function decodePii(table, row) {
  if (table === 'vendors' && row.contact) return { ...row, contact: dec(row.contact) };
  if (table === 'workers' && row.phone) return { ...row, phone: dec(row.phone) };
  return row;
}

// ===== Lỗi do người gửi, không phải lỗi máy chủ =====
//
// Trước đây mọi lỗi trong `catch` đều thành 500. Nhưng lỗi phổ biến nhất ở màn
// này là người dùng gõ sai — gửi `status: 'PENDING'` trong khi cột là enum
// `master_status` chỉ có ACTIVE/INACTIVE/CLOSED/MERGED. Postgres ném `22P02`, ta
// trả 500, và người dùng thấy "Lỗi máy chủ" mà không có cách nào biết giá trị nào
// hợp lệ. Đây là lỗi có sẵn ở route tạo mới, không phải ở phần sửa.
//
// Sửa: ánh xạ mã lỗi Postgres sang HTTP đúng ngữ nghĩa, và **kèm luôn danh sách
// giá trị hợp lệ** để giao diện hiện được ngay.

let statusValuesCache = null;
async function statusValues() {
  if (statusValuesCache) return statusValuesCache;
  try {
    const rows = await getDb().prepare(
      `SELECT enumlabel FROM pg_enum
       JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
       WHERE typname = 'master_status' ORDER BY enumsortorder`,
    ).allAsync();
    statusValuesCache = rows.map((r) => r.enumlabel);
  } catch {
    // Enum có thể không tồn tại ở bản cũ — để null thay vì ném, để lỗi gốc hiện ra.
    statusValuesCache = null;
  }
  return statusValuesCache;
}

// Các mã lỗi Postgres sinh ra từ dữ liệu người gửi sai, không phải hỏng hệ thống.
const INPUT_ERRORS = {
  '22P02': [400, 'Giá trị không hợp lệ'],
  '22007': [400, 'Giá trị ngoài phạm vi cho phép'],
  '22003': [400, 'Giá trị ngoài phạm vi cho phép'],
  '23502': [400, 'Thiếu giá trị bắt buộc'],
  '23505': [409, 'Giá trị đã tồn tại'],
  '23514': [400, 'Giá trị không được phép'],
  '23503': [409, 'Dữ liệu đang được tham chiếu ở nơi khác'],
};

async function fail(res, e) {
  const mapped = INPUT_ERRORS[e.code];
  if (!mapped) {
    res.status(e.status || 500).json(errorBody(e));
    return;
  }
  const [status, message] = mapped;
  // `master_status` là enum và người gửi không thể đoán được giá trị hợp lệ, nên
  // trả kèm danh sách thay vì chỉ nói "sai". `detail` giữ nguyên chữ của Postgres
  // để khi tra còn thấy ràng buộc nào bắt.
  if (e.code === '22P02' && /master_status/.test(e.message || '')) {
    res.status(status).json({
      error: 'Giá trị trạng thái không hợp lệ.',
      allowed_status: await statusValues(),
      detail: e.message,
    });
    return;
  }
  res.status(status).json({ error: message, detail: e.message });
}

router.post('/:resource', async (req, res) => {
  const table = TABLES[req.params.resource];
  if (!table) return res.status(404).json({ error: `Unknown resource` });
  const db = getDb();
  const raw = { ...(req.body || {}), tenant_id: req.user.tenant_id };
  const data = encodePii(table, raw);
  const cols = Object.keys(data);
  if (!cols.length) return res.status(400).json({ error: 'Empty body' });
  // Resource-specific validation: required human columns per table.
  // (The old regex-only filter accepted any valid-looking column and 500'd
  // on unknown ones with no hint about what a resource actually needs.)
  const REQUIRED = {
    vendors: ['name'], subcontractors: ['name'], suppliers: ['name'],
    workers: ['full_name'], teams: ['name'], cost_codes: ['code'],
    resources: ['name'], business_processes: ['code'], departments: ['code', 'name_vi'],
  };
  const required = REQUIRED[table] || ['name'];
  const missing = required.filter(c => data[c] == null || String(data[c]).trim() === '');
  if (missing.length) return res.status(400).json({ error: `${table} requires: ${missing.join(', ')}` });
  const allowed = CREATABLE_COLUMNS[table] || [];
  const safe = ['tenant_id', ...allowed.filter((c) => cols.includes(c))];
  if (!safe.length) return res.status(400).json({ error: 'No creatable columns supplied' });
  // Nested departments (Wave D2): parent must live in this tenant.
  // No cycle check needed on CREATE — a brand-new row has no children, so it
  // cannot close a loop by construction. PATCH validates acyclicity.
  if (table === 'departments' && data.parent_id != null) {
    const parent = await db.prepare('SELECT id FROM departments WHERE id = ? AND tenant_id = ?').getAsync(data.parent_id, req.user.tenant_id);
    if (!parent) return res.status(404).json({ error: 'Parent department not found in this tenant' });
  }
  const placeholders = safe.map((_, i) => `$${i + 1}`).join(', ');
  try {
    const r = await withAudit(req, {
      action: 'CREATE', resourceType: table,
      context: {},
      after: data,
      note: `Tạo ${table}`,
    }, async (client) => {
      const ins = await client.query(
        `INSERT INTO ${table} (${safe.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        // pg doesn't serialize objects — stringify JSON columns (e.g. levels) explicitly.
        safe.map(c => (data[c] !== null && typeof data[c] === 'object' ? JSON.stringify(data[c]) : data[c]))
      );
      return ins.rows[0];
    });
    res.status(201).json(r);
  } catch (e) {
    await fail(res, e);
  }
});

// PATCH /api/master-data/departments/:id — rename / reparent (Wave D2).
// parent_id validated same-tenant + acyclic; null detaches to root.
router.patch('/departments/:id', async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const old = await db.prepare('SELECT * FROM departments WHERE id = ? AND tenant_id = ?').getAsync(id, req.user.tenant_id);
  if (!old) return res.status(404).json({ error: 'Not found' });
  const { code, name_vi, parent_id = undefined } = req.body || {};
  if (parent_id !== undefined) {
    const { validateDeptParent } = await import('../lib/approval.js');
    const v = await validateDeptParent(db, req.user.tenant_id, id, parent_id);
    if (!v.ok) return res.status(422).json({ error: v.error });
  }
  const patch = {};
  if (code !== undefined) patch.code = String(code);
  if (name_vi !== undefined) patch.name_vi = String(name_vi);
  if (parent_id !== undefined) patch.parent_id = parent_id;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });
  try {
    const result = await withAudit(req, {
      action: 'UPDATE', resourceType: 'departments', resourceId: id,
      before: { code: old.code, name_vi: old.name_vi, parent_id: old.parent_id },
      after: { ...old, ...patch },
      fieldChanges: Object.keys(patch).map((k) => ({ field: k, from: old[k], to: patch[k] })),
      note: `Sửa bộ phận ${old.code}`,
    }, async (client) => {
      const cols = Object.keys(patch);
      const r = await client.query(
        `UPDATE departments SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')} WHERE id = $${cols.length + 1} RETURNING *`,
        [...cols.map((c) => patch[c]), id]
      );
      return r.rows[0];
    });
    res.json(result);
  } catch (e) {
    await fail(res, e);
  }
});


// ===== Sửa danh mục =====
//
// `UPDATABLE_COLUMNS` = `CREATABLE_COLUMNS` trừ `code` và các khoá ngoại. Quyết
// định 2026-09-27: sửa theo allowlist sẵn có của backend, không mở rộng.
//
// Vì sao bỏ `code`: mã là khoá nghiệp vụ, ví dụ `TỔ-TC-01` được ghi vào
// `approval_chains` và báo cáo. Sửa nó âm thầm làm dữ liệu lịch sử không còn khớp
// với danh mục hiện tại. Ai cần đổi mã thì tạo mã mới.
//
// Vì sao bỏ khoá ngoại: `teams.lead_worker_id`, `workers.team_id`,
// `departments.parent_id` đều đã qua kiểm tra tham chiếu và chống vòng lặp ở các
// route chuyên biệt. Ghi từ form chung sẽ bỏ qua những kiểm tra đó.
const UNIQUE_KEY_COLUMNS = new Set(['code']);
const RELATION_COLUMNS = new Set(['lead_worker_id', 'team_id', 'parent_id']);

function updatableColumns(resource) {
  return (CREATABLE_COLUMNS[resource] || []).filter((c) => !UNIQUE_KEY_COLUMNS.has(c) && !RELATION_COLUMNS.has(c));
}

// Những bảng không có cột `status` thì không xoá mềm được — trả lỗi nói rõ thay vì
// im lặng bỏ qua yêu cầu và trả 200 (người dùng tưởng đã xoá xong).
function supportsSoftDelete(table) {
  return (CREATABLE_COLUMNS[table] || []).includes('status');
}

router.patch('/:resource/:id', async (req, res) => {
  const resource = req.params.resource;
  const table = TABLES[resource];
  if (!table) return res.status(404).json({ error: `Unknown resource: ${resource}` });
  const db = getDb();
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });

  const before = await db.prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`)
    .getAsync(id, req.user.tenant_id);
  if (!before) return res.status(404).json({ error: 'Not found' });

  const allowed = updatableColumns(resource);
  const raw = req.body || {};
  const rejected = Object.keys(raw).filter((k) => !allowed.includes(k));
  if (rejected.length) {
    return res.status(400).json({
      error: `Cột không được sửa: ${rejected.join(', ')}`,
      allowed,
    });
  }
  const patch = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === null) patch[k] = null;
    else if (typeof v === 'string') patch[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') patch[k] = v;
    else return res.status(400).json({ error: `Kiểu dữ liệu không hợp lệ cho ${k}` });
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nothing to update' });

  const encoded = encodePii(table, patch);
  const cols = Object.keys(encoded);

  // Nội suy tên cột an toàn: `cols` chỉ gồm cột đã đi qua `allowed` — allowlist là
  // hằng số viết tay trong file này, không phải dữ liệu người gửi.
  //
  // Placeholder phải là `$N`, KHÔNG phải `?`: `client` ở đây là client `pg` thô do
  // `withAudit` đưa vào, và việc đổi `?` → `$N` nằm trong `db.prepare()` — chỉ dùng
  // được ngoài transaction. Bản đầu dùng `?` ở đây nên Postgres nhận `?` làm toán
  // tử và báo `syntax error at or near "AND"`.
  const sets = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
  const whereId = `$${cols.length + 1}`;
  const whereTenant = `$${cols.length + 2}`;

  let result;
  try {
    result = await withAudit(req, {
      action: 'UPDATE', resourceType: table, resourceId: id,
      context: {},
      before: Object.fromEntries(cols.map((c) => [c, before[c] ?? null])),
      after: encoded,
      note: `Sửa ${table}#${id}`,
    }, async (client) => {
      const r = await client.query(
        `UPDATE ${table} SET ${sets} WHERE id = ${whereId} AND tenant_id = ${whereTenant} RETURNING *`,
        [...cols.map((c) => encoded[c]), id, req.user.tenant_id],
      );
      if (!r.rows[0]) throw new Error('Not found');
      return r.rows[0];
    });
  } catch (e) {
    return await fail(res, e);
  }
  res.json(decodePii(table, result));
});

// ===== Ẩn danh mục (xoá mềm) =====
//
// Quyết định 2026-09-27: xoá mềm, đặt `status = 'INACTIVE'`. Bản ghi còn nguyên nên
// hợp đồng / báo cáo ngày / vật tư đã tham chiếu vẫn tra cứu được — xoá cứng ở đây
// sẽ hỏng dữ liệu lịch sử theo kiểu không nhận ra ngay.
router.delete('/:resource/:id', async (req, res) => {
  const resource = req.params.resource;
  const table = TABLES[resource];
  if (!table) return res.status(404).json({ error: `Unknown resource: ${resource}` });
  if (!supportsSoftDelete(table)) {
    return res.status(409).json({
      error: `Danh mục "${resource}" không có cột trạng thái nên không ẩn được.`,
      hint: 'Bảng này không hỗ trợ xoá mềm — cần quyết định khác cho nó.',
    });
  }
  const db = getDb();
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });

  const before = await db.prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`)
    .getAsync(id, req.user.tenant_id);
  if (!before) return res.status(404).json({ error: 'Not found' });
  if (before.status === 'INACTIVE') {
    return res.status(200).json({ ...decodePii(table, before), already_inactive: true });
  }

  let result;
  try {
    result = await withAudit(req, {
      action: 'DEACTIVATE', resourceType: table, resourceId: id,
      context: {},
      before: { status: before.status ?? null },
      after: { status: 'INACTIVE' },
      note: `Ẩn ${table}#${id} (xoá mềm)`,
    }, async (client) => {
      const r = await client.query(
        `UPDATE ${table} SET status = 'INACTIVE' WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [id, req.user.tenant_id],
      );
      if (!r.rows[0]) throw new Error('Not found');
      return r.rows[0];
    });
  } catch (e) {
    return await fail(res, e);
  }
  res.json(decodePii(table, result));
});

// ===== Kích hoạt lại =====
// Ẩn nhầm thì bấm được để lấy về; không có bước này thì "xoá" là một chiều và mất
// luôn bản ghi dù nó vẫn nằm trong DB.
router.post('/:resource/:id/restore', async (req, res) => {
  const resource = req.params.resource;
  const table = TABLES[resource];
  if (!table) return res.status(404).json({ error: `Unknown resource: ${resource}` });
  if (!supportsSoftDelete(table)) {
    return res.status(409).json({ error: `Danh mục "${resource}" không có cột trạng thái.` });
  }
  const db = getDb();
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id must be integer' });
  const before = await db.prepare(`SELECT * FROM ${table} WHERE id = ? AND tenant_id = ?`)
    .getAsync(id, req.user.tenant_id);
  if (!before) return res.status(404).json({ error: 'Not found' });
  try {
    const r = await withAudit(req, {
      action: 'REACTIVATE', resourceType: table, resourceId: id,
      context: {},
      before: { status: before.status ?? null },
      after: { status: 'ACTIVE' },
      note: `Kích hoạt lại ${table}#${id}`,
    }, async (client) => {
      const out = await client.query(
        `UPDATE ${table} SET status = 'ACTIVE' WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [id, req.user.tenant_id],
      );
      if (!out.rows[0]) throw new Error('Not found');
      return out.rows[0];
    });
    res.json(decodePii(table, r));
  } catch (e) {
    await fail(res, e);
  }
});

export default router;
