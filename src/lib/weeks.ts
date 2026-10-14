import { TIME_ZONE, formatDate } from './format';

// Calendar weeks in Abuja time (Monday to Sunday), for the admin overview. Abuja is UTC+1 all year, so a fixed
// offset is safe (see lagosDayBoundary in format.ts).

const DAY = 86_400_000;
const LAGOS_OFFSET = 3_600_000;

/** Monday 00:00 Abuja of the week containing `at`, as a Date (UTC instant). `weeksBack` moves to earlier weeks. */
export function weekStart(at = new Date(), weeksBack = 0): Date {
  const local = new Date(at.getTime() + LAGOS_OFFSET);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  const midnightLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - daysSinceMonday * DAY;
  return new Date(midnightLocal - LAGOS_OFFSET - weeksBack * 7 * DAY);
}

export const weekEnd = (start: Date) => new Date(start.getTime() + 7 * DAY - 1);

export const inWeek = (iso: string, start: Date) => {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t <= weekEnd(start).getTime();
};

/** ISO 8601 week number ("W42"), computed on the Abuja calendar date. */
export function isoWeekLabel(start: Date): string {
  const local = new Date(start.getTime() + LAGOS_OFFSET);
  const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 3); // Thursday decides the week's year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - yearStart.getTime()) / DAY - 3 + ((yearStart.getUTCDay() + 6) % 7)) / 7);
  return `W${week}`;
}

/** "12–18 Oct 2026" (or "28 Sep – 4 Oct 2026" across months). */
export function weekRangeLabel(start: Date): string {
  const end = new Date(start.getTime() + 6 * DAY);
  const opts = { timeZone: TIME_ZONE } as const;
  const sameMonth = formatDate(start.toISOString(), { ...opts, month: 'short' }) === formatDate(end.toISOString(), { ...opts, month: 'short' });
  const from = formatDate(start.toISOString(), sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  return `${from}${sameMonth ? '–' : ' – '}${formatDate(end.toISOString(), { day: 'numeric', month: 'short', year: 'numeric' })}`;
}
