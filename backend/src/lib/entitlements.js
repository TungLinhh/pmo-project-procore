// Plan entitlements — Small / Mid / Enterprise over the 4 pillars (P1-P4).
// Decided 2026-09-15: multi-tenant Procore-style, lean 4-pillar foundation,
// Payments (AP 4-step) included in Small; AR only Mid(read)/Enterprise(full).
// "Hide not delete": lower plans hide bloat UI + get 403 on gated APIs, code stays.
//
// Usage:
//   import { getEntitlements, requireFeature } from '../lib/entitlements.js';
//   router.get('/projects/:id/ar-contracts', requireFeature('ar-read'), handler);
//   router.get('/me/entitlements' ...) → { plan, features }
// Per-tenant overrides: tenants.feature_flags = { "+bulk-import": true, "-chains": false }.

import { getDb } from '../db/index.js';

export const PLANS = ['small', 'mid', 'enterprise'];

// Small = site essentials (1 project): P1 basic + P2 single-step + P3 basic +
// P4 AP-only + issues basic + daily/photos + workers-only + single-file import.
const SMALL = [
  'p1-basic',        // progress %, daily capture, OTD basic
  'p2-single',       // shop drawing single-step approve
  'p3-basic',        // material registry + simple submittal (overdue filter only)
  'p4-ap',           // contract→invoice→PR→payment (NO receivables)
  'issues-basic',    // issues list/create, no directives
  'daily', 'photos', 'manpower-workers',
  'single-import',   // one Excel file (no bulk zip/folder)
  'notifications',
];

// Mid = +control: SLA/TVGS filters, directives, OTD trend, AR read, portfolio read.
const MID_ADD = [
  'sla-filter',      // submittal SLA 7d / TVGS 3d filters + escalate view
  'directives',      // CEO/PMO directives on issues
  'otd-trend',       // OTD by_zone + 6-month trend
  'ar-read',         // receivables read-only
  'portfolio-read',  // cross-project dashboard read
];

// Enterprise = +governance: custom L1-L5 chains, full portfolio, audit export,
// bulk import, KPI targets, AR full (retention/VAT views).
const ENTERPRISE_ADD = [
  'chains',          // approval_chains write (L1-L5)
  'portfolio',       // portfolio-kpi full
  'audit-export',    // /api/audit/export CSV
  'bulk-import',     // zip/folder intake (200MB)
  'kpi-targets',     // KPI target editing UI
  'ar-full',         // AR full + retention/VAT
  'schedule-compress', // CPM compression preview/apply/rollback (v0.6.0)
  'ai-assistant',    // AI search + drafts + config (v0.7.0)
  'bim-library',     // BIM model library store-only v1 (v0.9.0)
  'erp-export',      // AP ledger export + vendor import + SFTP push (v0.9.0)
];

const PLAN_FEATURES = {
  small: new Set(SMALL),
  mid: new Set([...SMALL, ...MID_ADD]),
  enterprise: new Set([...SMALL, ...MID_ADD, ...ENTERPRISE_ADD]),
};

export function featuresForPlan(plan) {
  return new Set(PLAN_FEATURES[plan] || PLAN_FEATURES.enterprise);
}

function applyOverrides(features, flags) {
  if (!flags || typeof flags !== 'object') return features;
  const out = new Set(features);
  for (const [k, v] of Object.entries(flags)) {
    if (k.startsWith('+')) { if (v) out.add(k.slice(1)); }
    else if (k.startsWith('-')) { if (v) out.delete(k.slice(1)); }
  }
  return out;
}

export async function getEntitlements(tenantId) {
  const db = getDb();
  const t = await db.prepare('SELECT plan, feature_flags FROM tenants WHERE id = ?').getAsync(tenantId);
  const plan = PLANS.includes(t?.plan) ? t.plan : 'enterprise';
  const features = [...applyOverrides(featuresForPlan(plan), t?.feature_flags)].sort();
  return { plan, features };
}

export function hasFeature(entitlements, flag) {
  return Array.isArray(entitlements?.features) && entitlements.features.includes(flag);
}

// Gate an endpoint behind ANY of several flags (e.g. portfolio-read OR portfolio).
export function requireAnyFeature(...flags) {
  return async (req, res, next) => {
    try {
      const ent = await getEntitlements(req.user.tenant_id);
      if (!flags.some((f) => hasFeature(ent, f))) {
        return res.status(403).json({ error: `Plan '${ent.plan}' lacks any of: ${flags.join(', ')}` });
      }
      req.entitlements = ent;
      next();
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  };
}

// Gate an endpoint behind a plan flag. 403 (not 404): the resource exists, the
// PLAN lacks it — Procore-style upsell signal, distinct from tenant 404s.
export function requireFeature(flag) {
  return async (req, res, next) => {
    try {
      const ent = await getEntitlements(req.user.tenant_id);
      if (!hasFeature(ent, flag)) {
        return res.status(403).json({ error: `Plan '${ent.plan}' lacks feature '${flag}'` });
      }
      req.entitlements = ent;
      next();
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  };
}
