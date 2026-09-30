// Pillar registry (NFR mở rộng: thêm trụ cột không rewrite display).
// Thứ tự SRS Mục 5 (L1→L4) giữ nguyên; pillar mới append sau với optional=true.
// UI render card QA từ summary.qa (data-driven) thay vì hardcode 4 trụ cột.
import { getDb } from '../db/index.js';

export const PILLARS = [
  { key: 'shop', layer: 'L1', label_vi: 'Shopdrawing' },
  { key: 'material', layer: 'L2', label_vi: 'Vật tư' },
  { key: 'manpower', layer: 'L3', label_vi: 'Thi công' },
  { key: 'payment', layer: 'L4', label_vi: 'Thanh toán' },
  { key: 'qa', layer: 'L5', label_vi: 'QA/QC', optional: true },
];

export const QA_TRANSITIONS = {
  OPEN: ['PASSED', 'FAILED'],
  FAILED: ['OPEN', 'PASSED'],
  PASSED: ['OPEN'],
};

export function checkQaTransition(from, to) {
  const next = QA_TRANSITIONS[from] || [];
  return next.includes(to)
    ? { ok: true }
    : { ok: false, error: `Illegal QA transition ${from} → ${to} (allowed: ${next.join('|') || 'none'})` };
}

export async function getQaSummary(projectId) {
  const db = getDb();
  const rows = await db.prepare(
    `SELECT status, COUNT(*) AS c FROM qa_inspections WHERE project_id = ? GROUP BY status`
  ).allAsync(projectId);
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.c)]));
  const open = by.OPEN || 0, passed = by.PASSED || 0, failed = by.FAILED || 0;
  return { total: open + passed + failed, open, passed, failed };
}
