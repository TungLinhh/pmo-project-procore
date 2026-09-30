// Apply authority for Control Layer scenarios (SRS Table 9 conflict).
//
// SRS Table 9 grants PM/PMO the right to apply a baseline "trong thẩm quyền"
// (within their authority). The first implementation narrowed that to CEO/Admin
// only, which contradicts the SRS and pushes every simulated scenario up the
// chain. This module makes "authority" measurable instead of role-shaped:
// a PM/PMO may apply when the scenario's impact stays inside configured caps,
// and anything larger must be signed by CEO/Admin.
//
// Caps (env-tunable, deliberately conservative defaults):
//   PILLAR_APPLY_MAX_SHIFT_DAYS      absolute schedule shift, days      (14)
//   PILLAR_APPLY_MAX_COST_VND        estimated cost, VND              (500,000,000)
//   PILLAR_APPLY_MAX_AFFECTED_ITEMS  affected schedule items            (20)
//   PILLAR_APPLY_AUTHORITY           'off' disables the scoped path entirely
//
// CEO/Admin and the project PM are always allowed for PMO-owned projects;
// a PM may only act on a project they own (projects.pm_user_id). Every
// decision is returned with a human-readable reason so the UI can explain
// exactly which limit blocks an apply and who to escalate to.

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function authorityCaps(env = process.env) {
  return {
    enabled: String(env.PILLAR_APPLY_AUTHORITY || 'on').toLowerCase() !== 'off',
    maxShiftDays: num(env.PILLAR_APPLY_MAX_SHIFT_DAYS) ?? 14,
    maxCostVnd: num(env.PILLAR_APPLY_MAX_COST_VND) ?? 500_000_000,
    maxAffectedItems: num(env.PILLAR_APPLY_MAX_AFFECTED_ITEMS) ?? 20,
  };
}

const VND = new Intl.NumberFormat('vi-VN');

export function scenarioImpact(type, params, result) {
  const p = (params && typeof params === 'object') ? params : {};
  const r = (result && typeof result === 'object') ? result : {};
  const pick = (...keys) => {
    for (const key of keys) {
      const value = num(p[key] ?? r[key]);
      if (value != null) return value;
    }
    return null;
  };
  const shiftDays = pick('extend_days', 'cut_days', 'delay_days', 'headcount_change_pct', 'max_shift_days', 'schedule_shift_days');
  const costVnd = pick('estimated_cost_vnd', 'extra_cost_vnd', 'cost_vnd');
  const affectedItems = pick('affected_count', 'affected_items_count', 'item_count');
  return { shiftDays, costVnd, affectedItems };
}

export function evaluateApplyAuthority(user, project, scenario, env = process.env) {
  const caps = authorityCaps(env);
  const role = String(user?.role || '').toLowerCase();
  const isPrivileged = role === 'admin' || !!user?.is_ceo;
  const impact = scenarioImpact(scenario?.type, scenario?.params, scenario?.result);

  if (isPrivileged) {
    return { allowed: true, basis: 'privileged', caps, impact, reason: 'CEO/Admin ký quyết định cuối' };
  }
  if (!caps.enabled) {
    return {
      allowed: false, basis: 'authority_disabled', caps, impact,
      reason: 'Apply ngoài thẩm quyền đang tắt (PILLAR_APPLY_AUTHORITY=off) — cần CEO/Admin',
    };
  }
  if (role !== 'pm' && role !== 'pmo') {
    return {
      allowed: false, basis: 'role', caps, impact,
      reason: `Role '${role || 'unknown'}' không được apply kịch bản điều khiển`,
    };
  }
  // PM acts only on their own project; PMO acts on projects they are assigned to
  // (membership is already proven by requireProjectAccess before we get here).
  if (role === 'pm' && Number(project?.pm_user_id) !== Number(user?.id)) {
    return {
      allowed: false, basis: 'ownership', caps, impact,
      reason: 'PM chỉ apply được trên dự án mình phụ trách',
    };
  }

  const exceeded = [];
  if (impact.shiftDays != null && Math.abs(impact.shiftDays) > caps.maxShiftDays) {
    exceeded.push(`dời lịch ${Math.abs(impact.shiftDays)} ngày > ${caps.maxShiftDays} ngày`);
  }
  if (impact.costVnd != null && impact.costVnd > caps.maxCostVnd) {
    exceeded.push(`chi phí ước tính ${VND.format(impact.costVnd)} > ${VND.format(caps.maxCostVnd)}`);
  }
  if (impact.affectedItems != null && impact.affectedItems > caps.maxAffectedItems) {
    exceeded.push(`${impact.affectedItems} hạng mục bị ảnh hưởng > ${caps.maxAffectedItems}`);
  }
  if (exceeded.length) {
    return {
      allowed: false, basis: 'cap_exceeded', caps, impact, exceeded,
      reason: `Vượt thẩm quyền: ${exceeded.join('; ')} — cần CEO/Admin ký`,
    };
  }
  const basisLabel = role === 'pm' ? 'PM dự án' : 'PMO được giao';
  return {
    allowed: true, basis: 'within_authority', caps, impact,
    reason: `${basisLabel} trong thẩm quyền (dời lịch ≤ ${caps.maxShiftDays} ngày, chi phí ≤ ${VND.format(caps.maxCostVnd)} VND)`,
  };
}
