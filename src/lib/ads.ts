import type { BadgeTone } from '@/components/ui';
import type { AdPlacement, AdStatus } from '@/types/domain';
import { formatDate } from './format';

// Shared wording for ads: placement names, status badges and schedule text (Admin / Ads, Create ad, Ad performance).

export const PLACEMENT_LABEL: Record<AdPlacement, string> = {
  homepage_banner: 'Homepage banner',
  event_page: 'Event page',
};

/** Where each placement shows, as in Figma "Where it shows". */
export const PLACEMENT_WHERE: Record<AdPlacement, string> = {
  homepage_banner: 'Homepage, below “Upcoming hikes”.',
  event_page: 'Every event page, beside the event details (hidden on phones below the details).',
};

export const AD_STATUS: Record<AdStatus, { label: string; tone: BadgeTone }> = {
  active: { label: 'Active', tone: 'green' },
  scheduled: { label: 'Scheduled', tone: 'blue' },
  pending_approval: { label: 'Pending approval', tone: 'amber' },
  paused: { label: 'Paused', tone: 'gray' },
  completed: { label: 'Completed', tone: 'gray' },
  draft: { label: 'Draft', tone: 'gray' },
  rejected: { label: 'Rejected', tone: 'red' },
};

const dm = (iso: string) => formatDate(iso, { day: 'numeric', month: 'short' });

/** "1 – 31 Oct", "10 Oct – 10 Nov" (Figma schedule column). */
export function scheduleRange(startsAt: string, endsAt: string, withYear = false) {
  const opts: Intl.DateTimeFormatOptions = withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' };
  const sameMonth = formatDate(startsAt, { month: 'short', year: 'numeric' }) === formatDate(endsAt, { month: 'short', year: 'numeric' });
  if (sameMonth) return `${formatDate(startsAt, { day: 'numeric' })} – ${formatDate(endsAt, opts)}`;
  return `${formatDate(startsAt, { day: 'numeric', month: 'short' })} – ${formatDate(endsAt, opts)}`;
}

/** Schedule column text for a campaign in the list. */
export function scheduleText(ad: { status: AdStatus; startsAt: string; endsAt: string; pausedAt?: string; endedEarly?: { at: string } }) {
  if (ad.status === 'paused' && ad.pausedAt) return `Paused ${dm(ad.pausedAt)}`;
  if (ad.endedEarly) return `Ended ${dm(ad.endedEarly.at)}`;
  if (ad.status === 'pending_approval' || ad.status === 'draft') return `Starts ${dm(ad.startsAt)}`;
  return scheduleRange(ad.startsAt, ad.endsAt);
}

/** "outdoorhub.example/hip" from a full URL. */
export function shortUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.host.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`;
  } catch {
    return url;
  }
}

/** The device an ad was seen on, for the per-placement split. Matches the md breakpoint the layouts use. */
export const viewerDevice = (): 'desktop' | 'mobile' => (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches ? 'desktop' : 'mobile');

/** A Abuja calendar day as the UTC instant it starts / the last minute it ends (ad schedules are whole days). */
export const lagosStartIso = (ymd: string) => new Date(`${ymd}T00:00:00+01:00`).toISOString();
export const lagosEndIso = (ymd: string) => new Date(`${ymd}T23:59:00+01:00`).toISOString();

export type AdPeriod = 'campaign' | 'last_7' | 'last_30' | 'this_month' | 'last_month' | 'custom';
export const AD_PERIODS: { value: AdPeriod; label: string }[] = [
  { value: 'campaign', label: 'Whole campaign' },
  { value: 'last_7', label: 'Last 7 days' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom', label: 'Custom dates' },
];

/** Abuja dates for an ad-performance period; undefined means the campaign's whole run (the server clips any range). */
export function adPeriodRange(period: AdPeriod, custom: { from?: string; to?: string }, today: string): { from: string; to: string } | undefined {
  const shift = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const [y, m] = today.split('-').map(Number);
  const month = (offset: number) => [new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 10), new Date(Date.UTC(y, m + offset, 0)).toISOString().slice(0, 10)] as const;
  switch (period) {
    case 'last_7':
      return { from: shift(today, -6), to: today };
    case 'last_30':
      return { from: shift(today, -29), to: today };
    case 'this_month':
      return { from: month(0)[0], to: today };
    case 'last_month':
      return { from: month(-1)[0], to: month(-1)[1] };
    case 'custom':
      return custom.from && custom.to && custom.from <= custom.to ? { from: custom.from, to: custom.to } : undefined;
    default:
      return undefined;
  }
}
