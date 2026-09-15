// Constants per spec mục 35: Global Status Language
// These are the ONLY allowed status names. Don't add others.

export const HEALTH = {
  ON_TRACK: 'ON TRACK',
  WATCH: 'WATCH',
  BEHIND: 'BEHIND',
  CRITICAL: 'CRITICAL',
};

export const WORKFLOW = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
  REVIEW: 'REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  OVERDUE: 'OVERDUE',
  CLOSED: 'CLOSED',
};

export const MASTER = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  MERGED: 'MERGED',
};

// Roles (mục 36)
export const ROLES = {
  CEO: 'CEO',
  PM: 'PM',
  PMO: 'PMO',
  SITE: 'SITE',
  PROCUREMENT: 'PROCUREMENT',
  ACCOUNTING: 'ACCOUNTING',
  DATA_ADMIN: 'DATA_ADMIN',
  EDITOR: 'EDITOR',
  VIEWER: 'VIEWER',
};

// Health colors (mục 42 - exception first)
export const HEALTH_COLORS = {
  [HEALTH.ON_TRACK]: { bg: '#e6f4ea', fg: '#1e8e3e', icon: '✓' },
  [HEALTH.WATCH]: { bg: '#fff8e1', fg: '#b06000', icon: '⚠' },
  [HEALTH.BEHIND]: { bg: '#fce8e6', fg: '#c5221f', icon: '⚠' },
  [HEALTH.CRITICAL]: { bg: '#fce8e6', fg: '#c5221f', icon: '🔴' },
};

export const WORKFLOW_COLORS = {
  [WORKFLOW.DRAFT]: { bg: '#f0f0f0', fg: '#5f6368' },
  [WORKFLOW.PENDING]: { bg: '#fff8e1', fg: '#b06000' },
  [WORKFLOW.SUBMITTED]: { bg: '#e8f0fe', fg: '#1a73e8' },
  [WORKFLOW.REVIEW]: { bg: '#f3e8fd', fg: '#7b1fa2' },
  [WORKFLOW.APPROVED]: { bg: '#e6f4ea', fg: '#1e8e3e' },
  [WORKFLOW.REJECTED]: { bg: '#fce8e6', fg: '#c5221f' },
  [WORKFLOW.OVERDUE]: { bg: '#fce8e6', fg: '#c5221f' },
  [WORKFLOW.CLOSED]: { bg: '#e0e0e0', fg: '#5f6368' },
};

export function healthOf(project) {
  // MVP: simple heuristic based on progress vs plan
  if (!project.progress_pct && project.progress_pct !== 0) return HEALTH.ON_TRACK;
  if (project.progress_pct >= 90) return HEALTH.ON_TRACK;
  if (project.progress_pct >= 70) return HEALTH.WATCH;
  if (project.progress_pct >= 50) return HEALTH.BEHIND;
  return HEALTH.CRITICAL;
}
