// Permission middleware - block based on role + module + action
// (matrix: lib/permissions.js PERMISSION_MATRIX, the single source of truth).
import { getDb } from '../db/index.js';
import { getPermissions, FULL_ACCESS_ROLES, canAccess } from './permissions.js';

// Map route patterns to module names. FIRST match wins — keep specific patterns
// above generic ones. Every /api/* route must match SOMETHING: unmatched
// authenticated requests are DENIED (fail-closed, Phase A). Public entries
// (/api/health, /api/auth/*, /api/me*) are exempted in the middleware below.
const ROUTE_MODULE_MAP = [
  // Project and zone creation live in wizard.js. The route-level role gate is
  // authoritative; the matrix remains a second fail-closed boundary.
  // Kịch bản lịch (nén/rút ngày) thuộc **Control Layer**, không phải nhập liệu
  // `schedule`: `PERMISSION_MATRIX` ghi rõ CEO "Ghi: Chỉ Directive" (schedule
  // `write: false`) nhưng lại có `control: { apply: 'all' }`. Trước đây route này rơi
  // vào mẫu generic ⇒ bị đoán là `schedule`/`write` ⇒ **CEO luôn 403**, kể cả khi
  // route-level `requireRole('admin','ceo')` đã cho phép — tức guard ở route là mã chết
  // và người dùng nhận 403 với thông điệp trái ngược với thiết kế.
  // Đo 2026-09-28: `deadline-replan.mjs` — "ceo apply changes 3 (got 403
  // Forbidden: role 'CEO' cannot write schedule)".
  // Mọi thao tác **ghi** lên kịch bản lịch đều là Control Layer: apply, rollback,
  // retarget, rename, delete. Trước đây chỉ `apply|rollback` được đưa sang `control`,
  // còn lại rơi vào mẫu generic ⇒ CEO 403 (đo 2026-09-28: "bad retarget → 400 (got
  // 403)", "ceo rename → 200 (got 403)").
  { method: 'POST', pattern: /^\/api\/schedule-scenarios\/\d+\/(apply|rollback|retarget)/, module: 'control', action: 'apply' },
  { method: 'PATCH', pattern: /^\/api\/schedule-scenarios\/\d+/, module: 'control', action: 'apply' },
  { method: 'DELETE', pattern: /^\/api\/schedule-scenarios\/\d+/, module: 'control', action: 'apply' },
  { method: 'GET', pattern: /^\/api\/schedule-scenarios/, module: 'control', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/?$/, module: 'schedule', action: 'write' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/zones/, module: 'schedule', action: 'write' },
  // Projects scaffold (membership gate in project-access.js is primary;
  // role gate here mirrors schedule read so all member roles pass).
  { method: 'GET', pattern: /^\/api\/projects\/\d+$/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/zones/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/area-hierarchy/, module: 'schedule', action: 'read' },
  { method: 'PATCH', pattern: /^\/api\/projects\/\d+$/, module: 'master_data', action: 'write' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/(close|revoke-close)/, module: 'control', action: 'apply' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/members/, module: 'schedule', action: 'read' },
  { method: 'POST|DELETE', pattern: /^\/api\/projects\/\d+\/members/, module: 'directive', action: 'write' },
  // P1 schedule + OTD + baselines
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/work-items/, module: 'work_item', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/work-items/, module: 'work_item', action: 'write' },
  { method: 'GET', pattern: /^\/api\/work-items\/\d+\/links/, module: 'work_item', action: 'read' },
  { method: 'POST', pattern: /^\/api\/work-items\/\d+\/links/, module: 'work_item', action: 'write' },
  { method: 'PATCH', pattern: /^\/api\/work-items\/\d+/, module: 'work_item', action: 'write' },
  { method: 'GET', pattern: /^\/api\/work-items\/\d+\/productivity/, module: 'work_item', action: 'read' },
  { method: 'POST', pattern: /^\/api\/work-items\/\d+\/productivity/, module: 'work_item', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/productivity/, module: 'work_item', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/construction-schedule/, module: 'schedule', action: 'read' },
  { method: 'POST|PUT|PATCH', pattern: /^\/api\/projects\/\d+\/construction-schedule/, module: 'schedule', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/otd/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/schedule-baselines/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/s-curves/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/control-summary/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/health(-thresholds)?/, module: 'schedule', action: 'read' },
  { method: 'PUT', pattern: /^\/api\/projects\/\d+\/health-thresholds/, module: 'control', action: 'write' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/schedule-baselines/, module: 'control', action: 'apply' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/schedule-links/, module: 'schedule', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/schedule-links/, module: 'schedule', action: 'write' },
  { method: 'DELETE', pattern: /^\/api\/schedule-links\/\d+/, module: 'schedule', action: 'write' },
  // Deadline replan split: preview PROPOSES (draft only) → schedule read so
  // PM (own) + PMO (all) pass; apply/rollback APPROVE (overwrite dates) →
  // schedule write so only CEO/Admin (+PM own, blocked later by requireRole) pass.
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/schedule-compress\/preview/, module: 'schedule', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/schedule-compress/, module: 'schedule', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/schedule-scenarios/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/schedule-scenarios\//, module: 'schedule', action: 'read' },
  { method: 'POST', pattern: /^\/api\/schedule-scenarios\//, module: 'schedule', action: 'write' },
  // Scenario management (retarget/rename/delete) overwrites plans: approve-level.
  { method: 'PATCH|DELETE', pattern: /^\/api\/schedule-scenarios\/\d+/, module: 'schedule', action: 'write' },
  { method: 'GET', pattern: /^\/api\/holidays/, module: 'schedule', action: 'read' },
  { method: 'POST|DELETE', pattern: /^\/api\/holidays/, module: 'schedule', action: 'write' },
  { method: 'GET|PUT|POST', pattern: /^\/api\/ai\/(config|usage|test)/, module: 'master_data', action: 'read' },
  { method: 'GET|POST', pattern: /^\/api\/ai\/(ask|drafts|backfill)/, module: 'schedule', action: 'read' },
  { method: 'POST', pattern: /^\/api\/ai\/progress-proposals\/\d+\/(apply|rollback)$/, module: 'control', action: 'apply' },
  { method: 'GET|POST', pattern: /^\/api\/ai\/progress-proposals(?:\/|$)/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/bim-models/, module: 'file_upload', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/bim\/models/, module: 'file_upload', action: 'write' },
  { method: 'GET|POST', pattern: /^\/api\/bim\/models\//, module: 'file_upload', action: 'read' },
  { method: 'GET', pattern: /^\/api\/export\/project-report\.xlsx/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/export\//, module: 'payment', action: 'read' },
  { method: 'GET|POST|DELETE', pattern: /^\/api\/erp\//, module: 'payment', action: 'read' },
  { method: 'GET', pattern: /^\/api\/jobs\/erp-push/, module: 'payment', action: 'read' },
  { method: 'POST', pattern: /^\/api\/jobs\/erp-push/, module: 'payment', action: 'write' },
  // P2 shop (project-scoped list + direct CRUD/approve/history)
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/shop-drawings/, module: 'shop', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/shop-drawings/, module: 'shop', action: 'write' },
  { method: 'GET', pattern: /^\/api\/shop-drawings/, module: 'shop', action: 'read' },
  { method: 'POST', pattern: /^\/api\/shop-drawings$/, module: 'shop', action: 'write' },
  { method: 'PATCH', pattern: /^\/api\/shop-drawings\/\d+/, module: 'shop', action: 'write' },
  { method: 'POST', pattern: /^\/api\/shop-drawings\/\d+\/as-built/, module: 'shop', action: 'write' },
  { method: 'POST', pattern: /^\/api\/shop-drawings\/\d+\/(transition|approve-level)/, module: 'shop', action: 'approve' },
  // P3 materials + submittals (submit/approve/reject are writes, not matrix-approve)
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/materials/, module: 'material', action: 'read' },
  { method: 'POST', pattern: /^\/api\/materials/, module: 'material', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/material-submittals(\/|$)/, module: 'material', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/material-breakdown/, module: 'material', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/pillar-gates/, module: 'schedule', action: 'read' },
  { method: 'PUT', pattern: /^\/api\/projects\/\d+\/pillar-gates/, module: 'control', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/pillar-scenarios/, module: 'control', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/pillar-scenarios\/simulate/, module: 'control', action: 'read' },
  { method: 'POST', pattern: /^\/api\/pillar-scenarios\/\d+\/(apply|rollback)/, module: 'control', action: 'apply' },
  { method: 'GET', pattern: /^\/api\/material-submittals/, module: 'material', action: 'read' },
  { method: 'POST', pattern: /^\/api\/material-submittals\/\d+\/(approve|reject)/, module: 'material', action: 'approve' },
  { method: 'POST', pattern: /^\/api\/material-submittals\/\d+\/reopen/, module: 'material', action: 'write' },
  { method: 'PATCH', pattern: /^\/api\/material-submittals\/\d+\/physical-sample/, module: 'material', action: 'write' },
  { method: 'POST', pattern: /^\/api\/material-submittals/, module: 'material', action: 'write' },
  // P4 payment chain (contracts/invoices/requests/payments + AR views)
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/contracts/, module: 'contract', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/contracts/, module: 'contract', action: 'write' },
  { method: 'GET', pattern: /^\/api\/contracts\/\d+\/invoices/, module: 'invoice', action: 'read' },
  { method: 'POST', pattern: /^\/api\/contracts\/\d+\/invoices/, module: 'invoice', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/invoices/, module: 'invoice', action: 'read' },
  { method: 'GET', pattern: /^\/api\/invoices\/\d+\/payment-requests/, module: 'payment', action: 'read' },
  { method: 'POST', pattern: /^\/api\/invoices\/\d+\/payment-requests/, module: 'payment', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/payment-requests/, module: 'payment', action: 'read' },
  { method: 'GET', pattern: /^\/api\/payment-requests/, module: 'payment', action: 'read' },
  { method: 'POST', pattern: /^\/api\/payment-requests/, module: 'payment', action: 'write' },
  { method: 'PUT', pattern: /^\/api\/payment-requests/, module: 'payment', action: 'approve' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/payments/, module: 'payment', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/ar-(contracts|lines)/, module: 'payment', action: 'read' },
  // Field: daily reports + manpower + photos
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/daily-reports/, module: 'daily_report', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/manpower/, module: 'daily_report', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/manpower-(plan|loading)/, module: 'daily_report', action: 'read' },
  { method: 'PUT', pattern: /^\/api\/projects\/\d+\/manpower-plan/, module: 'master_data', action: 'write' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/daily-reports/, module: 'daily_report', action: 'write' },
  { method: 'GET', pattern: /^\/api\/daily-reports\//, module: 'daily_report', action: 'read' },
  { method: 'POST', pattern: /^\/api\/daily-reports\/\d+\/(manpower|photos)/, module: 'daily_report', action: 'write' },
  { method: 'GET', pattern: /^\/api\/manpower\/rollup/, module: 'daily_report', action: 'read' },
  // Issues + directives
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/issues/, module: 'issue', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/issues/, module: 'issue', action: 'write' },
  // QA/QC inspections (trụ cột mở rộng — RBAC theo module issue).
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/qa-inspections/, module: 'issue', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/qa-inspections/, module: 'issue', action: 'write' },
  { method: 'PATCH', pattern: /^\/api\/qa-inspections\//, module: 'issue', action: 'write' },
  { method: 'GET', pattern: /^\/api\/issues/, module: 'issue', action: 'read' },
  { method: 'POST', pattern: /^\/api\/issues/, module: 'issue', action: 'write' },
  { method: 'GET', pattern: /^\/api\/directives/, module: 'directive', action: 'read' },
  { method: 'POST', pattern: /^\/api\/directives/, module: 'directive', action: 'write' },
  // Governance: chains / audit / admin / jobs / kpi / master-data / business-process
  { method: 'GET', pattern: /^\/api\/approval-chains/, module: 'approval', action: 'read' },
  { method: 'POST|DELETE', pattern: /^\/api\/approval-chains/, module: 'approval', action: 'write' },
  { method: 'GET', pattern: /^\/api\/approval/, module: 'approval', action: 'read' },
  { method: 'POST', pattern: /^\/api\/approval/, module: 'approval', action: 'approve' },
  { method: 'GET', pattern: /^\/api\/audit/, module: 'audit', action: 'read' },
  { method: 'GET|PATCH', pattern: /^\/api\/admin\//, module: 'audit', action: 'read' },
  { method: 'POST', pattern: /^\/api\/admin\/backups\/run/, module: 'audit', action: 'read' },
  { method: 'GET', pattern: /^\/api\/jobs\/attention/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/jobs\//, module: 'approval', action: 'read' },
  { method: 'POST', pattern: /^\/api\/jobs\//, module: 'approval', action: 'write' },
  { method: 'GET', pattern: /^\/api\/master-data\//, module: 'master_data', action: 'read' },
  { method: 'POST|PATCH', pattern: /^\/api\/master-data\//, module: 'master_data', action: 'write' },
  { method: 'GET', pattern: /^\/api\/business-process\//, module: 'master_data', action: 'read' },
  { method: 'GET', pattern: /^\/api\/kpi/, module: 'kpi', action: 'read' },
  { method: 'POST|PUT', pattern: /^\/api\/kpi/, module: 'kpi', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/kpi-targets/, module: 'kpi', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/kpi-targets/, module: 'kpi', action: 'write' },
  { method: 'PUT', pattern: /^\/api\/kpi-targets\/\d+/, module: 'kpi', action: 'write' },
  // Upload pipeline + review queue
  { method: 'POST', pattern: /^\/api\/uploads(?:\/|$)/, module: 'file_upload', action: 'write' },
  { method: 'GET', pattern: /^\/api\/uploads(?:\/|$)/, module: 'file_upload', action: 'read' },
  { method: 'POST', pattern: /^\/api\/upload/, module: 'file_upload', action: 'write' },
  { method: 'GET', pattern: /^\/api\/upload/, module: 'file_upload', action: 'read' },
  // Cross-cutting reads every role needs (list-level gate only)
  { method: 'GET|POST', pattern: /^\/api\/notifications/, module: 'directive', action: 'read' },
  { method: 'GET', pattern: /^\/api\/dashboard/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/sync\//, module: 'daily_report', action: 'read' },
  { method: 'POST', pattern: /^\/api\/sync\/(?!resolve)/, module: 'daily_report', action: 'write' },
  // /sync/resolve is governance, not field reporting. The route's own
  // canResolve (owner of the item | admin | CEO) is the intended gate; mapping
  // it to daily_report.write silently blocked CEO before that check ran, so the
  // UI showed a button that always answered 403. Excluding it here restores
  // the route's rule and grants nobody who was not already allowed.
  { method: 'POST', pattern: /^\/api\/sync\/resolve/, module: 'directive', action: 'read' },
];

export async function permissionMiddleware(req, res, next) {
  // NOTE: inside mounted routers req.path is STRIPPED of the mount prefix
  // (e.g. '/1/schedule' instead of '/api/projects/1/schedule'), while the
  // ROUTE_MODULE_MAP patterns expect full paths — always match baseUrl+path.
  // Trailing slash normalized: a router-mounted '/' becomes '/api/projects/'
  // which must match the same rules as '/api/projects'.
  const fullPath = `${req.baseUrl || ''}${req.path || ''}`.replace(/\/+$/, '') || '/';
  // Skip non-API and public/self-service endpoints (never role-gated).
  if (!fullPath.startsWith('/api/')) return next();
  if (fullPath === '/api/health' || fullPath.startsWith('/api/auth/') || fullPath.startsWith('/api/me')) return next();

  // Skip GET /api/projects (list) - everyone can see
  if (req.method === 'GET' && fullPath === '/api/projects') return next();

  if (!req.session || !req.session.user_id) return next();  // requireAuth should have caught

  // Canonical role resolution: DB role upper-cased; 'CEO' comes from the
  // is_ceo flag (there is no 'ceo' role value); 'admin' bypasses everything.
  const db = getDb();
  const u = await db.prepare('SELECT role, is_ceo FROM users WHERE id = ?').getAsync(req.session.user_id).catch(() => null);
  if (!u) return res.status(401).json({ error: 'Unauthorized' });
  const role = u.role === 'admin' ? 'ADMIN' : (u.is_ceo ? 'CEO' : String(u.role || 'PMO').toUpperCase());
  if (FULL_ACCESS_ROLES.includes(role)) return next();

  // Find matching route
  for (const m of ROUTE_MODULE_MAP) {
    if (req.method.match(new RegExp(`^(${m.method})$`)) && m.pattern.test(fullPath)) {
      // Deadline-only PATCH (start_date/end_date) is a schedule PROPOSE, not a
      // master-data edit: gate on schedule read so PM (own) + PMO (all) pass.
      // Any other field on the same endpoint keeps the master_data write gate.
      let module = m.module;
      let action = m.action;
      if (req.method === 'PATCH' && /^\/api\/projects\/\d+$/.test(fullPath) && req.body && typeof req.body === 'object') {
        const keys = Object.keys(req.body);
        if (keys.length && keys.every((k) => k === 'start_date' || k === 'end_date')) {
          module = 'schedule';
          action = 'read';
        }
      }
      // Dependency-link management (create/delete/auto-chain) is proposal-level
      // work PMO must do to build timelines: gate on schedule read (PM own,
      // PMO all; the route's own membership check still 404s outsiders).
      // Approve-side writes (scenario apply/rollback) stay on schedule write.
      if ((req.method === 'POST' && /^\/api\/projects\/\d+\/schedule-links/.test(fullPath)) ||
          (req.method === 'DELETE' && /^\/api\/schedule-links\/\d+/.test(fullPath))) {
        module = 'schedule';
        action = 'read';
      }
      // Extract project_id from path
      const projectMatch = fullPath.match(/\/api\/projects\/(\d+)/);
      const projectId = projectMatch ? Number(projectMatch[1]) : (req.resourceProjectId || null);
      const allowed = await canAccess(role, module, action, projectId, req.session.user_id);
      if (!allowed) {
        // Never leak project existence: when the caller cannot even see the
        // project (cross-tenant or non-member), answer 404; module-level
        // denials for visible projects stay 403.
        if (projectId) {
          const { checkProjectAccess } = await import('./project-access.js');
          const visible = await checkProjectAccess(req.user, projectId).catch(() => false);
          if (!visible) return res.status(404).json({ error: 'Not found' });
        }
        return res.status(403).json({
          error: `Forbidden: role '${role}' cannot ${action} ${module}${projectId ? ` in project ${projectId}` : ''}`,
        });
      }
      return next();
    }
  }
  // Fail-closed (Phase A): every /api/* route must match ROUTE_MODULE_MAP.
  // Unmapped endpoints used to be allowed by default — that silently skipped
  // role checks (e.g. POST /api/materials was never gated). 404-vs-403 rule
  // still applies: invisible projects answer 404 so existence never leaks.
  const projectMatchFallback = fullPath.match(/\/api\/projects\/(\d+)/);
  const projectIdFallback = projectMatchFallback ? Number(projectMatchFallback[1]) : null;
  if (projectIdFallback && req.user) {
    const { checkProjectAccess } = await import('./project-access.js');
    const visible = await checkProjectAccess(req.user, projectIdFallback).catch(() => false);
    if (!visible) return res.status(404).json({ error: 'Not found' });
  }
  return res.status(403).json({ error: `Forbidden: no permission rule for ${req.method} ${fullPath}` });
}
