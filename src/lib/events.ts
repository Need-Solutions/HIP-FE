import type { BadgeTone } from '@/components/ui';
import type { Difficulty, HikeEvent, TicketType } from '@/types/domain';

// Shared event rules used by cards, listings and the event page.

export const difficultyTone: Record<Difficulty, BadgeTone> = { easy: 'green', moderate: 'amber', challenging: 'orange' };

/** Most tickets one order can hold (assumed; confirm with the SRS / backend). */
export const MAX_TICKETS_PER_ORDER = 10;

/** At or below this many spots, an open event counts as "Few spots left". */
export const FEW_SPOTS_THRESHOLD = 10;

export const spotsLeft = (e: HikeEvent) => Math.max(0, e.capacity - e.ticketsSold);

export const isPast = (e: HikeEvent, now = Date.now()) => e.status === 'completed' || new Date(e.startsAt).getTime() < now;

export function availability(e: HikeEvent): { label: string; tone: BadgeTone } {
  if (e.status === 'cancelled') return { label: 'Cancelled', tone: 'red' };
  if (e.status === 'completed') return { label: 'Completed', tone: 'gray' };
  const left = spotsLeft(e);
  if (left <= 0) return { label: 'Sold out', tone: 'red' };
  if (e.status === 'sales_closed') return { label: 'Sales closed', tone: 'gray' };
  if (left <= FEW_SPOTS_THRESHOLD) return { label: `Only ${left} left`, tone: 'orange' };
  return { label: `${left} spots left`, tone: 'green' };
}

/**
 * Why an event can't be bought, or null when it can (EVT-010, EVT-011, WEB-009).
 * The backend enforces the same rules; this only drives the UI.
 */
export function purchaseBlocker(e: HikeEvent, now = Date.now()): string | null {
  if (e.status === 'cancelled') return 'This hike has been cancelled.';
  if (e.status === 'completed' || isPast(e, now)) return 'This hike has already taken place.';
  if (e.status !== 'published') return 'Ticket sales for this hike are closed.';
  if (spotsLeft(e) <= 0) return 'This hike is sold out.';
  if (new Date(e.registrationDeadline).getTime() < now) return 'Registration for this hike has closed.';
  return null;
}

/** Tickets still available for a ticket type, or 0 when it can't be sold right now. */
export function ticketTypeRemaining(t: TicketType, now = Date.now()): number {
  if (t.status !== 'active') return 0;
  if (new Date(t.salesStart).getTime() > now || new Date(t.salesEnd).getTime() < now) return 0;
  return Math.max(0, t.quantityLimit - t.quantitySold);
}

/** Checkout selection, carried in the URL as `?items=tt_1:2,tt_2:1` so a refresh keeps it. */
export type TicketSelection = Record<string, number>;

export const encodeSelection = (s: TicketSelection) =>
  Object.entries(s)
    .filter(([, q]) => q > 0)
    .map(([id, q]) => `${id}:${q}`)
    .join(',');

export function decodeSelection(raw: string | null): TicketSelection {
  const out: TicketSelection = {};
  for (const part of (raw ?? '').split(',')) {
    const [id, q] = part.split(':');
    const n = Number(q);
    if (id && Number.isInteger(n) && n > 0) out[id] = n;
  }
  return out;
}
