// Single source of truth for status transitions (P3-5a).
// Every route that changes a status must go through checkTransition().
// Illegal jump → { ok:false, error } and the route answers 422.
// (Replaces the inline map in shop.js and the stale maps that lived in
// validation.js — those allowed states the workflow_status enum never had.)
export const TRANSITIONS = {
  shop_drawing: {
    DRAFT: ['SUBMITTED', 'REJECTED'],
    SUBMITTED: ['APPROVED', 'REJECTED'],
    REJECTED: ['SUBMITTED', 'DRAFT'],
    APPROVED: [],
  },
  payment_request: {
    DRAFT: ['PENDING', 'SUBMITTED'],
    PENDING: ['APPROVED', 'REJECTED'],
    SUBMITTED: ['APPROVED', 'REJECTED'],
    APPROVED: ['PAID'],
    REJECTED: ['DRAFT', 'PENDING'],
    PAID: [],
  },
  material_submittal: {
    DRAFT: ['SUBMITTED'],
    SUBMITTED: ['APPROVED', 'REJECTED'],
    REJECTED: ['DRAFT'],
    APPROVED: [],
  },
  project: {
    ACTIVE: ['CLOSED'],
    CLOSED: ['ACTIVE'],
  },
  sync_item: {
    PENDING: ['RESOLVED'],
    RESOLVED: [],
  },
};

export function checkTransition(resource, from, to) {
  const allowed = TRANSITIONS[resource]?.[from] || [];
  if (!allowed.includes(to)) {
    return { ok: false, error: `Invalid transition: ${from} → ${to} (${resource}). Allowed: ${allowed.join(', ') || 'none'}` };
  }
  return { ok: true };
}
