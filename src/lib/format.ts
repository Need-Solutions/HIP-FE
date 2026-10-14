// All timestamps are stored in UTC and displayed in the group's time zone (SRS 2.4 rule 12).
// Abuja uses this IANA identifier for Nigeria's West Africa Time (UTC+1).
export const TIME_ZONE = 'Africa/Lagos';
export const TIME_ZONE_LABEL = 'Abuja (WAT)';

export function formatNaira(kobo: number): string {
  if (kobo === 0) return 'Free';
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(kobo / 100);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  // Figma style: "Sat 3 Oct 2026" and "Sep". Newer en-GB data gives "Sat, 3 Oct 2026" and "Sept".
  return new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, ...opts })
    .format(new Date(iso))
    .replace(/,/g, '')
    .replace(/\bSept\b/, 'Sep');
}

export function formatTime(iso: string) {
  // en-US gives "6:00 AM" (en-GB gives "6:00 am"); Figma uses the uppercase form.
  return new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso));
}

/**
 * Start (or end) of a calendar day in Abuja, as a UTC ISO string. `day` is "YYYY-MM-DD" from a date input.
 * Abuja is UTC+1 all year (no daylight saving), so a fixed offset is safe.
 */
export function lagosDayBoundary(day: string, edge: 'start' | 'end'): string {
  const time = edge === 'start' ? '00:00:00.000' : '23:59:59.999';
  return new Date(`${day}T${time}+01:00`).toISOString();
}

/** Today's date in Abuja as "YYYY-MM-DD", optionally shifted by whole days. */
export function lagosToday(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date()); // en-CA gives YYYY-MM-DD
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function formatDateLong(iso: string) {
  return formatDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** "Adaeze Okafor" → "AO" (avatars). */
export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** "₦1.86M", "₦922K", "₦3,500" for tight admin tables and stat cards. Full amounts elsewhere use formatNaira. */
export function formatNairaCompact(kobo: number): string {
  const naira = kobo / 100;
  const abs = Math.abs(naira);
  if (abs >= 1_000_000) return `${naira < 0 ? '-' : ''}₦${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (abs >= 10_000) return `${naira < 0 ? '-' : ''}₦${Math.round(abs / 1000)}K`;
  return `${naira < 0 ? '-' : ''}₦${new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 }).format(abs)}`;
}
