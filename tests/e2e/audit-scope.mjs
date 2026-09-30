// Audit read is project-scoped (P0-3 / G10).
// Before: GET /api/audit had no project segment, so canAccess() short-circuited
// to true and SITE/PROCUREMENT/ACCOUNTING read the whole tenant's before/after
// snapshots. Now only admin/CEO are tenant-wide; everyone else sees the rows of
// projects they are a member of (or own as PM).
import { api, loginAs, auth, J, psql, ok, summary } from './lib.mjs';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

const stamp = Date.now();
const codeA = `AUD-A-${stamp}`;
const codeB = `AUD-B-${stamp}`;
let A = null;
let B = null;


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['AUD-IA-%', 'AUD-IB-%'], { label: 'audit-scope' });
try {
  const admin = await loginAs('admin@hbg.com');
  const site = await loginAs('site@hbg.com');
  ok(!!admin && !!site, 'admin + site login');

  const mk = await api('/api/projects', { method: 'POST', ...J(admin, { code: codeA, name_vi: 'Audit A' }) });
  A = mk.data?.id ?? null;
  const mk2 = await api('/api/projects', { method: 'POST', ...J(admin, { code: codeB, name_vi: 'Audit B' }) });
  B = mk2.data?.id ?? null;
  ok(!!A && !!B, `two throwaway projects (${A}, ${B})`);

  // Assign the site user to A only.
  const siteId = Number(psql("SELECT id FROM users WHERE email='site@hbg.com' LIMIT 1"));
  const add = await api(`/api/projects/${A}/members`, { method: 'POST', ...J(admin, { user_id: siteId, role: 'site' }) });
  ok(add.status === 200 || add.status === 201, `site user added to project A (${add.status})`);

  // One auditable action in each project, so each writes a project-scoped row.
  const issA = await api('/api/issues', { method: 'POST', ...J(admin, { project_id: A, code: `AUD-IA-${stamp}`, title: 'audit scope A', description: 'x' }) });
  const issB = await api('/api/issues', { method: 'POST', ...J(admin, { project_id: B, code: `AUD-IB-${stamp}`, title: 'audit scope B', description: 'x' }) });
  ok(issA.status < 300 && issB.status < 300, `issue created in both projects (${issA.status}/${issB.status})`);

  // Site user: project A rows visible, project B rows invisible.
  const seen = await api('/api/audit?limit=500', { headers: auth(site) });
  ok(seen.status === 200, `site reads audit (${seen.status})`);
  const rows = Array.isArray(seen.data) ? seen.data : [];
  const pids = new Set(rows.map((r) => String(r.context?.project_id ?? '')));
  ok(pids.has(String(A)), 'site sees audit rows of its own project');
  ok(!pids.has(String(B)), 'site cannot see audit rows of another project');
  ok(!rows.some((r) => String(r.context?.project_id ?? '') === ''), 'tenant-level audit rows stay with admin/CEO');

  const other = await api(`/api/audit?project_id=${B}&limit=50`, { headers: auth(site) });
  ok(other.status === 200 && (other.data || []).length === 0, 'site filtering by another project returns nothing');

  // Admin stays tenant-wide.
  const adminRows = await api('/api/audit?limit=500', { headers: auth(admin) });
  const adminPids = new Set((adminRows.data || []).map((r) => String(r.context?.project_id ?? '')));
  ok(adminRows.status === 200 && adminPids.has(String(A)) && adminPids.has(String(B)), 'admin still sees both projects');
  ok((adminRows.data || []).some((r) => r.context?.project_id == null), 'admin still sees tenant-level rows');

  // A PM who owns exactly one project sees that project only.
  const pm = await loginAs('pm@hbg.com');
  const pmRows = await api('/api/audit?limit=500', { headers: auth(pm) });
  const pmPids = new Set((pmRows.data || []).map((r) => String(r.context?.project_id ?? '')));
  ok(pmRows.status === 200, `pm reads audit (${pmRows.status})`);
  ok(!pmPids.has(String(B)), 'pm does not see an unassigned project audit');
} catch (e) {
  ok(false, e.message);
} finally {
  for (const id of [A, B]) {
    if (!id) continue;
    psql(`DELETE FROM audit_log WHERE context->>'project_id' = '${id}'`);
    psql(`DELETE FROM issues WHERE project_id = ${id}`);
    psql(`DELETE FROM project_members WHERE project_id = ${id}`);
    psql(`DELETE FROM projects WHERE id = ${id}`);
  }
  summary();
}
