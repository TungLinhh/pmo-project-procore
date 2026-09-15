// Permission middleware - block based on role + module + action
// (matrix: lib/permissions.js PERMISSION_MATRIX, the single source of truth).
import { getDb } from '../db/index.js';
import { getPermissions, FULL_ACCESS_ROLES, canAccess } from './permissions.js';

// Map route patterns to module names. FIRST match wins — keep specific patterns
// above generic ones. Every /api/* route must match SOMETHING: unmatched
// authenticated requests are DENIED (fail-closed, Phase A). Public entries
// (/api/health, /api/auth/*, /api/me*) are exempted in the middleware below.
const ROUTE_MODULE_MAP = [
  // Project creation + zone creation live in wizard.js (registered AFTER the
  // projects router, but the router's middleware still gates them on the way
  // through). Preserve the old behavior: any authenticated role may create
  // (creator becomes sole member — least-privilege still holds).
  { method: 'POST', pattern: /^\/api\/projects\/?$/, module: 'schedule', action: 'write' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/zones/, module: 'schedule', action: 'write' },
  // Projects scaffold (membership gate in project-access.js is primary;
  // role gate here mirrors schedule read so all member roles pass).
  { method: 'GET', pattern: /^\/api\/projects\/\d+$/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/zones/, module: 'schedule', action: 'read' },
  { method: 'PATCH', pattern: /^\/api\/projects\/\d+$/, module: 'master_data', action: 'write' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/(close|revoke-close)/, module: 'master_data', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/members/, module: 'schedule', action: 'read' },
  { method: 'POST|DELETE', pattern: /^\/api\/projects\/\d+\/members/, module: 'directive', action: 'write' },
  // P1 schedule + OTD + baselines
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/construction-schedule/, module: 'schedule', action: 'read' },
  { method: 'POST|PUT|PATCH', pattern: /^\/api\/projects\/\d+\/construction-schedule/, module: 'schedule', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/otd/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/schedule-baselines/, module: 'schedule', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/schedule-baselines/, module: 'schedule', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/schedule-links/, module: 'schedule', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/schedule-links/, module: 'schedule', action: 'write' },
  { method: 'DELETE', pattern: /^\/api\/schedule-links\/\d+/, module: 'schedule', action: 'write' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/schedule-compress/, module: 'schedule', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/schedule-scenarios/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/schedule-scenarios\//, module: 'schedule', action: 'read' },
  { method: 'POST', pattern: /^\/api\/schedule-scenarios\//, module: 'schedule', action: 'write' },
  { method: 'GET', pattern: /^\/api\/holidays/, module: 'schedule', action: 'read' },
  { method: 'POST|DELETE', pattern: /^\/api\/holidays/, module: 'schedule', action: 'write' },
  { method: 'GET|PUT|POST', pattern: /^\/api\/ai\/(config|usage|test)/, module: 'master_data', action: 'read' },
  { method: 'GET|POST', pattern: /^\/api\/ai\/(ask|drafts|backfill)/, module: 'schedule', action: 'read' },
  // P2 shop (project-scoped list + direct CRUD/approve/history)
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/shop-drawings/, module: 'shop', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/shop-drawings/, module: 'shop', action: 'write' },
  { method: 'GET', pattern: /^\/api\/shop-drawings/, module: 'shop', action: 'read' },
  { method: 'POST', pattern: /^\/api\/shop-drawings$/, module: 'shop', action: 'write' },
  { method: 'PATCH', pattern: /^\/api\/shop-drawings\/\d+/, module: 'shop', action: 'write' },
  { method: 'POST', pattern: /^\/api\/shop-drawings\/\d+\/(transition|approve-level)/, module: 'shop', action: 'approve' },
  // P3 materials + submittals (submit/approve/reject are writes, not matrix-approve)
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/materials/, module: 'material', action: 'read' },
  { method: 'POST', pattern: /^\/api\/materials/, module: 'material', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/material-submittals\//, module: 'material', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/material-breakdown/, module: 'material', action: 'read' },
  { method: 'GET', pattern: /^\/api\/material-submittals/, module: 'material', action: 'read' },
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
  { method: 'PUT', pattern: /^\/api\/payment-requests/, module: 'payment', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/payments/, module: 'payment', action: 'read' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/ar-(contracts|lines)/, module: 'payment', action: 'read' },
  // Field: daily reports + manpower + photos
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/daily-reports/, module: 'daily_report', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/daily-reports/, module: 'daily_report', action: 'write' },
  { method: 'GET', pattern: /^\/api\/daily-reports\//, module: 'daily_report', action: 'read' },
  { method: 'POST', pattern: /^\/api\/daily-reports\/\d+\/(manpower|photos)/, module: 'daily_report', action: 'write' },
  { method: 'GET', pattern: /^\/api\/manpower\/rollup/, module: 'daily_report', action: 'read' },
  // Issues + directives
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/issues/, module: 'issue', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/issues/, module: 'issue', action: 'write' },
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
  { method: 'GET', pattern: /^\/api\/jobs\//, module: 'approval', action: 'read' },
  { method: 'POST', pattern: /^\/api\/jobs\//, module: 'approval', action: 'write' },
  { method: 'GET', pattern: /^\/api\/master-data\//, module: 'master_data', action: 'read' },
  { method: 'POST', pattern: /^\/api\/master-data\//, module: 'master_data', action: 'write' },
  { method: 'GET', pattern: /^\/api\/business-process\//, module: 'master_data', action: 'read' },
  { method: 'GET', pattern: /^\/api\/kpi/, module: 'kpi', action: 'read' },
  { method: 'POST|PUT', pattern: /^\/api\/kpi/, module: 'kpi', action: 'write' },
  { method: 'GET', pattern: /^\/api\/projects\/\d+\/kpi-targets/, module: 'kpi', action: 'read' },
  { method: 'POST', pattern: /^\/api\/projects\/\d+\/kpi-targets/, module: 'kpi', action: 'write' },
  // Upload pipeline + review queue
  { method: 'POST', pattern: /^\/api\/upload/, module: 'file_upload', action: 'write' },
  { method: 'GET', pattern: /^\/api\/upload/, module: 'file_upload', action: 'read' },
  // Cross-cutting reads every role needs (list-level gate only)
  { method: 'GET|POST', pattern: /^\/api\/notifications/, module: 'directive', action: 'read' },
  { method: 'GET', pattern: /^\/api\/dashboard/, module: 'schedule', action: 'read' },
  { method: 'GET', pattern: /^\/api\/sync\//, module: 'daily_report', action: 'read' },
  { method: 'POST', pattern: /^\/api\/sync\//, module: 'daily_report', action: 'write' },
];

export async function permissionMiddleware(req, res, next) {
  // NOTE: inside mounted routers req.path is STRIPPED of the mount prefix
  // (e.g. '/1/schedule' instead of '/api/projects/1/schedule'), while the
  // ROUTE_MODULE_MAP patterns expect full paths — always match baseUrl+path.
  const fullPath = `${req.baseUrl || ''}${req.path || ''}`;
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
      // Extract project_id from path
      const projectMatch = fullPath.match(/\/api\/projects\/(\d+)/);
      const projectId = projectMatch ? Number(projectMatch[1]) : null;
      const allowed = await canAccess(role, m.module, m.action, projectId, req.session.user_id);
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
          error: `Forbidden: role '${role}' cannot ${m.action} ${m.module}${projectId ? ` in project ${projectId}` : ''}`,
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
