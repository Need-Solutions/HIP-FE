import type { BadgeTone } from '@/components/ui';
import type { MyTicket, TicketStatus } from '@/types/domain';

export const ticketStatus: Record<TicketStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Pending payment', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  checked_in: { label: 'Checked in', tone: 'blue' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  refunded: { label: 'Refunded', tone: 'gray' },
  expired: { label: 'Expired', tone: 'gray' },
};

/** Only these tickets get a scannable QR. A pending ticket never does: payment isn't verified yet (TKT-010). */
export const hasUsableQr = (status: TicketStatus) => status === 'confirmed' || status === 'checked_in';

export type TicketTab = 'upcoming' | 'past' | 'cancelled';

/**
 * My tickets tabs (TKT-016). Cancelled holds cancelled and refunded tickets and tickets for cancelled hikes.
 * A hike moves to Past 12 hours after it starts (so it stays handy on the day); a pending refund request
 * stays in Upcoming.
 */
export function ticketTab(t: MyTicket, now = Date.now()): TicketTab {
  if (t.status === 'cancelled' || t.status === 'refunded' || t.eventStatus === 'cancelled') return 'cancelled';
  if (new Date(t.event.startsAt).getTime() < now - 12 * 3_600_000 || t.eventStatus === 'completed') return 'past';
  return 'upcoming';
}
