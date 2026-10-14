import { describe, expect, it } from 'vitest';
import { canRequestRefund, refundQuote } from './refunds';
import type { MyTicket } from '@/types/domain';

// Business rule 10: full refund up to 72 hours before, 50% after, nothing once check-in opens (2 hours before).

const HOUR = 3_600_000;
const start = '2026-10-17T05:00:00Z';
const at = (hoursBefore: number) => Date.parse(start) - hoursBefore * HOUR;

describe('refundQuote', () => {
  it('refunds in full more than 72 hours before', () => expect(refundQuote(start, 1_500_000, at(73))).toMatchObject({ percent: 100, amountKobo: 1_500_000 }));
  it('refunds half from 72 hours before', () => expect(refundQuote(start, 1_500_000, at(72))).toMatchObject({ percent: 50, amountKobo: 750_000 }));
  it('refunds half until check-in opens', () => expect(refundQuote(start, 1_500_000, at(2.01)).percent).toBe(50));
  it('refunds nothing once check-in opens', () => expect(refundQuote(start, 1_500_000, at(2))).toEqual({ percent: 0, amountKobo: 0 }));
  it('says when the full band ends', () => expect(refundQuote(start, 100, at(100)).until?.getTime()).toBe(at(72)));
});

describe('canRequestRefund', () => {
  const ticket = (over: Partial<MyTicket> = {}) =>
    ({ status: 'confirmed', boughtByMe: true, pricePaidKobo: 1_500_000, eventStatus: 'published', event: { startsAt: start }, ...over }) as MyTicket;
  it('lets the buyer ask before check-in opens', () => expect(canRequestRefund(ticket(), at(10))).toBe(true));
  it('only the buyer can ask', () => expect(canRequestRefund(ticket({ boughtByMe: false }), at(10))).toBe(false));
  it('not once a refund exists', () => expect(canRequestRefund(ticket({ refund: { status: 'requested', amountKobo: 1, requestedAt: start } }), at(10))).toBe(false));
  it('not after check-in opens', () => expect(canRequestRefund(ticket(), at(1))).toBe(false));
  it('not for free tickets', () => expect(canRequestRefund(ticket({ pricePaidKobo: 0 }), at(10))).toBe(false));
});
