// Analytics definitions from SRS 3.7.7. Keep the UI and CSV exports on these helpers
// so dashboard numbers and exports always match (ANA-033).

/** Returns null when the denominator is 0, so the UI can show "—" instead of a misleading 0%. */
export function percent(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
}

export const attendanceRate = (checkedIn: number, eligibleConfirmed: number) => percent(checkedIn, eligibleConfirmed);
export const noShowRate = (checkedIn: number, eligibleConfirmed: number) =>
  percent(eligibleConfirmed - checkedIn, eligibleConfirmed);
export const growth = (current: number, previous: number) => percent(current - previous, previous);
export const ctr = (clicks: number, impressions: number) => percent(clicks, impressions);

export function formatPercent(value: number | null, digits = 1) {
  return value === null ? '—' : `${value.toFixed(digits)}%`;
}

/** Returning hikers ÷ unique hikers in the period (Admin / Analytics "Repeat rate"). */
export const repeatRate = (returning: number, unique: number) => percent(returning, unique);

/** Part ÷ whole as a percentage, e.g. first-time hikers as a share of unique hikers. */
export const share = (part: number, whole: number) => percent(part, whole);

/** Difference between two rates in percentage points (e.g. no-show rate vs the previous period); null if either is. */
export function pointChange(current: number | null, previous: number | null): number | null {
  return current === null || previous === null ? null : current - previous;
}

/** "+1.2 pt" / "-1.1 pt" / "—". */
export function formatPoints(value: number | null, digits = 1) {
  return value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(digits)} pt`;
}

/** "+12.2%" / "-3.0%" / "—" for growth figures. */
export function formatSignedPercent(value: number | null, digits = 1) {
  return value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(digits)}%`;
}
