// ERP push is project-scoped (P0-2).
// /api/jobs/erp-push has no /projects/:id segment, so permissionMiddleware
// resolved projectId=null and canAccess() returned true for any role holding
// `payment write` — an ACCOUNTING user assigned to project A could upload the
// AP ledger (contract nos, invoice amounts, vendor tax ids) of project B.
// The route now calls checkProjectAccess and pushFastPRs takes a projectId.
import { api, loginAs, auth, J, psql, ok, summary } from './lib.mjs';
import { cleanupProjectsOnExit } from './lib-cleanup.mjs';

const stamp = Date.now();
let profileId = null;
let otherProject = null;


// Dọn dự án thử nghiệm nếu bài dừng giữa chừng — xem `lib-cleanup.mjs`.
cleanupProjectsOnExit(['ERPSCOPE-%'], { label: 'erp-push-scope' });
try {
  const admin = await loginAs('admin@hbg.com');
  const accounting = await loginAs('accounting@hbg.com');
  ok(!!admin && !!accounting, 'admin + accounting login');

  // Project the accounting user is NOT a member of.
  const mk = await api('/api/projects', { method: 'POST', ...J(admin, { code: `ERPSCOPE-${stamp}`, name_vi: 'ERP scope' }) });
  otherProject = mk.data?.id ?? null;
  ok(!!otherProject, `throwaway project ${otherProject}`);

  const prof = await api('/api/erp/profiles', {
    method: 'POST', ...J(admin, {
      name: `SCOPE-${stamp}`, connector: 'fast', secret_env: 'TEST_FAST_SECRET',
      config: { base_url: 'http://127.0.0.1:1/stub', app_id: 'scope' },
    }),
  });
  profileId = prof.data?.id ?? null;
  ok(!!profileId, `fast profile ${profileId}`);

  // Positive control: the accounting user keeps access to their own project.
  // The stub URL is dead on purpose, so the request must get past the access
  // check and fail at the transport layer — never 404.
  const own = await api('/api/jobs/erp-push', { method: 'POST', ...J(accounting, { profile_id: profileId, project_id: 1 }) });
  ok(own.status !== 404, `assigned project is not blocked by the access check (got ${own.status})`);

  // Negative: a project they are not a member of is a 404, and nothing is sent.
  const before = psql(`SELECT count(*) FROM erp_push_log WHERE profile_id = ${profileId}`);
  const cross = await api('/api/jobs/erp-push', { method: 'POST', ...J(accounting, { profile_id: profileId, project_id: otherProject }) });
  ok(cross.status === 404, `cross-project push blocked with 404 (got ${cross.status})`);
  const after = psql(`SELECT count(*) FROM erp_push_log WHERE profile_id = ${profileId}`);
  ok(before === after, `no push log row written for the blocked request (${before} -> ${after})`);
} catch (e) {
  ok(false, e.message);
} finally {
  if (profileId) psql(`DELETE FROM erp_push_log WHERE profile_id = ${profileId}`);
  if (profileId) psql(`DELETE FROM erp_profiles WHERE id = ${profileId}`);
  if (otherProject) {
    psql(`DELETE FROM audit_log WHERE context->>'project_id' = '${otherProject}'`);
    psql(`DELETE FROM project_members WHERE project_id = ${otherProject}`);
    psql(`DELETE FROM projects WHERE id = ${otherProject}`);
  }
  summary();
}
