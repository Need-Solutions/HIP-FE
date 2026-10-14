import { attendanceRate } from './metrics';
import { TIME_ZONE, formatDate, formatTime } from './format';
import { toCsv } from './csv';
import type { CheckInMethod, HikeOutcome, HistoryEntry } from '@/types/domain';

// Hiking-history numbers for the dashboard and the history page. Everything counts check-ins only
// (SRS 2.4 rules 5 and 11, HIS-004): bookings without a check-in are "missed", refunds are left out of the
// attendance rate. Keep the screens and the CSV export on these helpers so they always agree.

export const outcomeLabel: Record<HikeOutcome, string> = { attended: 'Attended', missed: 'Missed', refunded: 'Refunded' };

export const methodLabel: Record<CheckInMethod, string> = { qr: 'QR scan', qr_offline: 'QR (offline)', manual: 'Manual' };

const attended = (entries: HistoryEntry[]) => entries.filter((e) => e.outcome === 'attended');
const byDate = (a: HistoryEntry, b: HistoryEntry) => a.event.startsAt.localeCompare(b.event.startsAt);

export interface HistorySummary {
  hikesAttended: number;
  /** Attended + missed. Refunded bookings aren't eligible, so they're not counted (SRS 3.7.7). */
  eligibleBookings: number;
  /** null when nothing was eligible, shown as "—". */
  attendanceRate: number | null;
  firstHike: HistoryEntry | null;
  longestTrail: HistoryEntry | null;
  distanceKm: number;
}

export function historySummary(entries: HistoryEntry[]): HistorySummary {
  const hikes = attended(entries).sort(byDate);
  const eligible = entries.filter((e) => e.outcome !== 'refunded').length;
  const withDistance = hikes.filter((e) => e.event.distanceKm);
  return {
    hikesAttended: hikes.length,
    eligibleBookings: eligible,
    attendanceRate: attendanceRate(hikes.length, eligible),
    firstHike: hikes[0] ?? null,
    longestTrail: withDistance.reduce<HistoryEntry | null>((best, e) => (!best || e.event.distanceKm! > best.event.distanceKm! ? e : best), null),
    distanceKm: hikes.reduce((km, e) => km + (e.event.distanceKm ?? 0), 0),
  };
}

/** "2026-10" for an ISO date, in Abuja time. */
const monthKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit' }).format(new Date(iso));

/** Check-ins per month for the last `months` months, oldest first (Figma "Your activity"). */
export function checkInsPerMonth(entries: HistoryEntry[], months = 8, now = new Date()): { key: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of attended(entries)) {
    const key = monthKey(e.checkIn?.at ?? e.event.startsAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [y, m] = monthKey(now.toISOString()).split('-').map(Number);
  return Array.from({ length: months }, (_, i) => {
    // Mid-month at noon UTC, so the Abuja offset can't push it into a neighbouring month.
    const d = new Date(Date.UTC(y, m - 1 - (months - 1 - i), 15, 12));
    const key = monthKey(d.toISOString());
    return { key, label: formatDate(d.toISOString(), { month: 'short' }), count: counts.get(key) ?? 0 };
  });
}

/** Years that have bookings, newest first, for the year filter. */
export const historyYears = (entries: HistoryEntry[]) =>
  [...new Set(entries.map((e) => Number(formatDate(e.event.startsAt, { year: 'numeric' }))))].sort((a, b) => b - a);

export const inYear = (e: HistoryEntry, year: number) => Number(formatDate(e.event.startsAt, { year: 'numeric' })) === year;

export const checkInLabel = (e: HistoryEntry) => (e.checkIn ? `${formatTime(e.checkIn.at)} · ${methodLabel[e.checkIn.method]}` : '—');

/** CSV of the rows on screen (same columns as the table). */
export function historyCsv(entries: HistoryEntry[]): string {
  const rows = [
    ['Hike', 'Date', 'Ticket', 'Ticket ID', 'Check-in', 'Status'],
    ...entries.map((e) => [
      e.event.title,
      formatDate(e.event.startsAt, { day: 'numeric', month: 'short', year: 'numeric' }),
      e.ticketTypeName,
      e.ticketCode,
      e.checkIn ? `${formatDate(e.checkIn.at, { day: 'numeric', month: 'short', year: 'numeric' })} ${checkInLabel(e)}` : '',
      outcomeLabel[e.outcome],
    ]),
  ];
  return toCsv(rows);
}
