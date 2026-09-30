// Control Layer apply authority (SRS Table 9 conflict).
// SRS grants PM/PMO the right to apply a baseline "trong thẩm quyền"; the first
// implementation narrowed that to CEO/Admin only, contradicting the SRS.
// Authority is now measured (schedule shift / cost / affected items) and the
// caps come from env, so PMO/CEO can widen or close them without a code change.
import {
  authorityCaps, scenarioImpact, evaluateApplyAuthority,
} from '../../backend/src/lib/pillar-authority.js';
import { ok, summary } from './lib.mjs';

const ENV = {
  PILLAR_APPLY_AUTHORITY: 'on',
  PILLAR_APPLY_MAX_SHIFT_DAYS: '14',
  PILLAR_APPLY_MAX_COST_VND: '500000000',
  PILLAR_APPLY_MAX_AFFECTED_ITEMS: '20',
};

const ceo = { id: 1, role: 'pmo', is_ceo: true };
const admin = { id: 2, role: 'admin' };
const pmOwner = { id: 3, role: 'pm' };
const pmOther = { id: 4, role: 'pm' };
const pmo = { id: 5, role: 'pmo' };
const site = { id: 6, role: 'site' };
const project = { id: 1, pm_user_id: 3 };

try {
  // Caps come from env, with conservative defaults when unset.
  const caps = authorityCaps(ENV);
  ok(caps.enabled && caps.maxShiftDays === 14 && caps.maxCostVnd === 500000000 && caps.maxAffectedItems === 20,
    `caps read from env (${caps.maxShiftDays}d / ${caps.maxCostVnd}₫ / ${caps.maxAffectedItems} items)`);
  const dflt = authorityCaps({});
  ok(dflt.enabled && dflt.maxShiftDays === 14, 'defaults are conservative when env is unset');
  ok(authorityCaps({ PILLAR_APPLY_AUTHORITY: 'off' }).enabled === false, 'PILLAR_APPLY_AUTHORITY=off disables the scoped path');

  // Impact extraction understands both params and preview result shapes.
  const impact = scenarioImpact('CTL-01', { extend_days: 10 }, { estimated_cost_vnd: 120000000, affected_count: 4 });
  ok(impact.shiftDays === 10 && impact.costVnd === 120000000 && impact.affectedItems === 4,
    `impact read from params + result (${JSON.stringify(impact)})`);

  // CEO/Admin are never capped.
  ok(evaluateApplyAuthority(ceo, project, { type: 'CTL-01', params: { extend_days: 400 } }, ENV).allowed,
    'CEO may apply beyond the caps');
  ok(evaluateApplyAuthority(admin, project, { type: 'CTL-01', params: { extend_days: 400 } }, ENV).allowed,
    'Admin may apply beyond the caps');

  // PM inside the caps on their own project: allowed (this is the SRS right).
  const small = evaluateApplyAuthority(pmOwner, project, { type: 'CTL-01', params: { extend_days: 10 }, result: { estimated_cost_vnd: 100000000, affected_count: 5 } }, ENV);
  ok(small.allowed && small.basis === 'within_authority', `PM applies a small change on their project (${small.reason})`);

  // PM beyond a cap: refused with the exceeded dimension named.
  const big = evaluateApplyAuthority(pmOwner, project, { type: 'CTL-01', params: { extend_days: 90 } }, ENV);
  ok(!big.allowed && big.basis === 'cap_exceeded' && big.exceeded.length === 1,
    `PM refused above the shift cap with a reason (${big.reason})`);
  const pricey = evaluateApplyAuthority(pmOwner, project, { type: 'CTL-06', params: { estimated_cost_vnd: 900000000 } }, ENV);
  ok(!pricey.allowed && /chi phí/.test(pricey.reason), `PM refused above the cost cap (${pricey.reason})`);
  const wide = evaluateApplyAuthority(pmOwner, project, { type: 'CTL-02', params: { cut_days: 5, affected_count: 60 } }, ENV);
  ok(!wide.allowed && /hạng mục/.test(wide.reason), `PM refused above the affected-item cap (${wide.reason})`);

  // PM cannot act on a project they do not own.
  const foreign = evaluateApplyAuthority(pmOther, project, { type: 'CTL-01', params: { extend_days: 5 } }, ENV);
  ok(!foreign.allowed && foreign.basis === 'ownership', 'PM refused on a project they do not own');

  // PMO acts on assigned projects (membership proven by the route beforehand).
  ok(evaluateApplyAuthority(pmo, project, { type: 'CTL-01', params: { extend_days: 7 } }, ENV).allowed,
    'PMO may apply within the caps');

  // Never-decide roles.
  const s = evaluateApplyAuthority(site, project, { type: 'CTL-01', params: { extend_days: 1 } }, ENV);
  ok(!s.allowed && s.basis === 'role', `SITE refused (${s.reason})`);

  // Feature switch keeps the previous behaviour available.
  const off = evaluateApplyAuthority(pmOwner, project, { type: 'CTL-01', params: { extend_days: 1 } }, { ...ENV, PILLAR_APPLY_AUTHORITY: 'off' });
  ok(!off.allowed && off.basis === 'authority_disabled', 'authority switch off restores CEO/Admin-only');
  ok(evaluateApplyAuthority(ceo, project, { type: 'CTL-01', params: { extend_days: 1 } }, { ...ENV, PILLAR_APPLY_AUTHORITY: 'off' }).allowed,
    'CEO still allowed when the scoped path is off');
} catch (e) {
  ok(false, e.message);
} finally {
  summary();
}
