// progress_pct is stored as a 0..1 fraction by the ingest pipeline, but a
// hand-edited or differently-sourced sheet can carry 0..100. Comparing the raw
// value against 1 then produced silently wrong numbers: an 85% row counted as
// "not done" (0.85 < 1) and, because 85 >= 1, also as "not overdue", so it fell
// into no bucket at all and the donut read zero.
//
// One normaliser, used by every screen, so two views of the same data cannot
// disagree.
export function progressFraction(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed > 1 ? parsed / 100 : parsed));
}

export const isComplete = (item) => progressFraction(item?.progress_pct) >= 1;

export const isOverdue = (item) => isComplete(item) === false
  && !!item?.plan_end_date
  && new Date(item.plan_end_date) < new Date();
