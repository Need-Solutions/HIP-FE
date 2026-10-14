import type { MyTicket } from '@/types/domain';

// Refund policy from Figma "Hiker / My tickets" (TKT-021):
//   "Full refund up to 72 hours before the hike. 50% after that. No refunds once check-in opens."
// The backend applies the same rules and decides the real amount; this only drives the UI.

export const REFUND_POLICY = 'Full refund up to 72 hours before the hike. 50% after that. No refunds once check-in opens.';

export const FULL_REFUND_HOURS = 72;
/**
 * Assumed: check-in opens 2 hours before the start time. Replace with the event's own setting once
 * "Admin / Check-in settings" is built.
 */
export const CHECKIN_OPENS_HOURS_BEFORE = 2;

const HOUR = 3_600_000;

export interface RefundQuote {
  percent: 100 | 50 | 0;
  amountKobo: number;
  /** When the current band ends (full → half, or half → none). */
  until?: Date;
}

/** What a refund request would return right now, from the ticket price (the Paystack fee isn't refunded). */
export function refundQuote(startsAt: string, pricePaidKobo: number, now = Date.now()): RefundQuote {
  const start = new Date(startsAt).getTime();
  const fullUntil = start - FULL_REFUND_HOURS * HOUR;
  const checkInOpens = start - CHECKIN_OPENS_HOURS_BEFORE * HOUR;
  if (now < fullUntil) return { percent: 100, amountKobo: pricePaidKobo, until: new Date(fullUntil) };
  if (now < checkInOpens) return { percent: 50, amountKobo: Math.round(pricePaidKobo / 2), until: new Date(checkInOpens) };
  return { percent: 0, amountKobo: 0 };
}

/** Whether "Request refund" is offered. Free tickets have nothing to refund; only the buyer can ask. */
export function canRequestRefund(t: MyTicket, now = Date.now()): boolean {
  return (
    t.status === 'confirmed' &&
    t.boughtByMe &&
    !t.refund &&
    t.pricePaidKobo > 0 &&
    t.eventStatus !== 'cancelled' &&
    refundQuote(t.event.startsAt, t.pricePaidKobo, now).percent > 0
  );
}
