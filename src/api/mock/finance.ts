import { ApiError } from '../client';
import { mockEvents, mockRefunds, mockStaff, mockTicketTypes, mockTickets } from './data';
import { serverTickets } from './checkin';
import { peopleState } from './people';
import { pushAudit, update, type MockState } from './store';
import { paystackFeeKobo } from '@/lib/fees';
import { lagosDayBoundary } from '@/lib/format';
import { can } from '@/lib/permissions';
import { refundQuote } from '@/lib/refunds';
import type { TransactionRow, TransactionsPage, TransactionsQuery } from '../endpoints';

// Mock payments (Admin / Transactions & refunds). One row per paid ticket, plus orders that never became tickets
// (pending, failed). Rules the backend must keep:
//   - Pending and failed payments are never counted as sales (ANA-028).
//   - A ticket exists only after Paystack confirms the payment (TKT-010); refunds follow lib/refunds.ts.
//   - Refund decisions need a reason and go to the audit log.

const PAGE_SIZE = 10;
const hash = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 11).toString(36).toUpperCase();
const viewer = (s: MockState) => s.sessionUser ?? mockStaff[0];

/** Seeds a few refund requests and the payments that never became tickets (Figma's pending and failed rows). */
function seed(s: MockState) {
  const st = peopleState(s);
  if (st.otherPayments.length || Object.keys(st.refundRequests).length) return;
  const now = Date.now();
  const erin = mockEvents.find((e) => e.id === 'evt_2');
  if (erin) {
    const reasons = ['Can no longer travel that weekend', 'Booked the wrong date', 'Injured ankle, doctor’s advice'];
    serverTickets(s, erin.id)
      .filter((t) => t.priceKobo > 0 && t.status === 'confirmed' && !mockTickets.some((m) => m.code === t.code))
      .slice(0, 3)
      .forEach((t, i) => {
        const requestedAt = new Date(now - (i + 1) * 9 * 3_600_000).toISOString();
        st.refundRequests[t.code] = { amountKobo: refundQuote(erin.startsAt, t.priceKobo, new Date(requestedAt).getTime()).amountKobo, requestedAt, reason: reasons[i] };
      });
  }
  st.otherPayments.push(
    { reference: 'PSK_8811870', buyerName: 'Ife Martins', buyerEmail: 'ife.m@example.com', eventId: 'evt_2', ticketKobo: 2_250_000, status: 'pending', createdAt: new Date(now - 40 * 60_000).toISOString() },
    { reference: 'PSK_8810219', buyerName: 'Musa Bello', buyerEmail: 'musa.b@example.com', eventId: 'evt_1', ticketKobo: 1_000_000, status: 'failed', createdAt: '2026-10-01T09:44:00Z' },
    { reference: 'PSK_8809514', buyerName: 'Grace Obi', buyerEmail: 'grace.obi@example.com', eventId: 'evt_4', ticketKobo: 4_500_000, status: 'failed', createdAt: '2026-10-09T17:12:00Z' },
  );
}

function allRows(s: MockState): TransactionRow[] {
  seed(s);
  const st = peopleState(s);
  const rows: TransactionRow[] = [];
  const realTickets = [...mockTickets, ...s.tickets];
  for (const e of mockEvents) {
    if (e.status === 'draft') continue;
    for (const t of serverTickets(s, e.id)) {
      if (t.priceKobo <= 0) continue;
      const real = realTickets.find((x) => x.code === t.code);
      const fee = paystackFeeKobo(t.priceKobo);
      const accountRefund = real ? s.account?.refunds[real.id] : undefined;
      const seededRefund = real ? mockRefunds[real.id] : undefined;
      const approved = st.refunded[t.code];
      const request = st.refundRequests[t.code];
      let refund: TransactionRow['refund'];
      let status: TransactionRow['status'] = 'successful';
      if (t.status === 'refunded') {
        status = 'refunded';
        refund = approved
          ? { amountKobo: approved.amountKobo, requestedAt: request?.requestedAt ?? accountRefund?.requestedAt ?? approved.at, reason: request?.reason ?? accountRefund?.reason, decision: 'approved', decidedAt: approved.at, decidedBy: approved.by, note: approved.reason }
          : seededRefund
            ? { amountKobo: seededRefund.amountKobo, requestedAt: seededRefund.requestedAt, reason: seededRefund.reason, decision: 'approved', decidedAt: seededRefund.processedAt }
            : { amountKobo: t.priceKobo, requestedAt: t.statusChangedAt ?? t.issuedAt, decision: 'approved', decidedAt: t.statusChangedAt };
      } else if (t.status === 'cancelled') {
        continue;
      } else if (accountRefund?.status === 'requested' || (request && !request.decision)) {
        status = 'refund_requested';
        refund = accountRefund?.status === 'requested'
          ? { amountKobo: accountRefund.amountKobo, requestedAt: accountRefund.requestedAt, reason: accountRefund.reason }
          : { amountKobo: request!.amountKobo, requestedAt: request!.requestedAt, reason: request!.reason };
      } else if (accountRefund?.status === 'declined' || request?.decision === 'declined') {
        refund = request?.decision
          ? { amountKobo: request.amountKobo, requestedAt: request.requestedAt, reason: request.reason, decision: 'declined', decidedAt: request.decidedAt, decidedBy: request.decidedBy, note: request.note }
          : { amountKobo: accountRefund!.amountKobo, requestedAt: accountRefund!.requestedAt, reason: accountRefund!.reason, decision: 'declined', decidedAt: accountRefund!.processedAt };
      }
      rows.push({
        reference: real?.paymentId ?? `PSK_${hash(t.code)}`,
        ticketCode: t.code,
        buyerName: t.holderName,
        buyerEmail: t.email,
        eventId: e.id,
        eventTitle: e.title,
        ticketKobo: t.priceKobo,
        feeKobo: fee,
        amountKobo: t.priceKobo + fee,
        status,
        createdAt: t.issuedAt,
        refund,
      });
    }
  }
  // Orders waiting for payment (checkout started, Paystack not confirmed) and seeded pending/failed payments.
  for (const c of Object.values(s.checkouts)) {
    if (c.status !== 'pending' || c.paystackConfirmed) continue;
    const e = mockEvents.find((x) => x.id === c.request.eventId);
    rows.push({ reference: c.reference, buyerName: c.request.buyer.fullName, buyerEmail: c.request.buyer.email, eventId: c.request.eventId, eventTitle: e?.title ?? '', ticketKobo: c.request.items.reduce((n, i) => n + (mockTicketTypes.find((t) => t.id === i.ticketTypeId)?.priceKobo ?? 0) * i.quantity, 0), feeKobo: 0, amountKobo: c.amountKobo, status: 'pending', createdAt: s.holds[c.request.holdId]?.expiresAt ?? new Date().toISOString() });
  }
  for (const o of st.otherPayments) {
    rows.push({ reference: o.reference, buyerName: o.buyerName, buyerEmail: o.buyerEmail, eventId: o.eventId, eventTitle: mockEvents.find((e) => e.id === o.eventId)?.title ?? '', ticketKobo: o.ticketKobo, feeKobo: 0, amountKobo: o.ticketKobo + paystackFeeKobo(o.ticketKobo), status: o.status, createdAt: o.createdAt });
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const succeeded = (r: TransactionRow) => r.status === 'successful' || r.status === 'refund_requested' || r.status === 'refunded';

export const mockFinance = {
  transactions: (q: TransactionsQuery): TransactionsPage =>
    update((s) => {
      if (!can(viewer(s), 'sell_refund_tickets')) throw new ApiError(403, 'You don’t have access to transactions.');
      const rows = allRows(s);
      const from = new Date(lagosDayBoundary(q.from, 'start')).getTime();
      const to = new Date(lagosDayBoundary(q.to, 'end')).getTime();
      const span = to - from + 1;
      const inRange = (r: TransactionRow, a: number, b: number) => {
        const t = new Date(r.createdAt).getTime();
        return t >= a && t <= b;
      };
      const term = (q.q ?? '').trim().toLowerCase();
      const period = rows.filter((r) => inRange(r, from, to));
      const matches = period
        .filter((r) => q.status === 'all' || r.status === q.status)
        .filter((r) => !term || r.reference.toLowerCase().includes(term) || (r.ticketCode ?? '').toLowerCase().includes(term) || r.buyerName.toLowerCase().includes(term));
      // Totals follow the period and search, never counting pending or failed payments (ANA-028).
      const counted = matches.filter(succeeded);
      const gross = counted.reduce((n, r) => n + r.amountKobo, 0);
      const refunds = matches.filter((r) => r.status === 'refunded');
      const refundsKobo = refunds.reduce((n, r) => n + (r.refund?.amountKobo ?? 0), 0);
      const fees = counted.reduce((n, r) => n + r.feeKobo, 0);
      const previous = rows
        .filter((r) => inRange(r, from - span, from - 1) && succeeded(r))
        .filter((r) => q.status === 'all' || r.status === q.status)
        .reduce((n, r) => n + r.amountKobo, 0);
      const page = Math.max(1, q.page ?? 1);
      return {
        items: q.all ? matches : matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
        total: matches.length,
        page,
        pageSize: q.all ? matches.length : PAGE_SIZE,
        summary: {
          grossKobo: gross,
          previousGrossKobo: previous,
          refundsKobo,
          refundCount: refunds.length,
          feesKobo: fees,
          netKobo: gross - refundsKobo - fees,
          pendingCount: matches.filter((r) => r.status === 'pending').length,
          failedCount: matches.filter((r) => r.status === 'failed').length,
          refundRequests: rows.filter((r) => r.status === 'refund_requested').length,
        },
      };
    }),

  /** Refund requests waiting for a decision (Overview "Review refunds"). */
  pendingRefundCount: (s: MockState) => allRows(s).filter((r) => r.status === 'refund_requested').length,

  reviewRefund: (reference: string, decision: 'approve' | 'decline', reason: string): TransactionRow =>
    update((s) => {
      const actor = viewer(s);
      if (!can(actor, 'sell_refund_tickets')) throw new ApiError(403, 'You can’t review refunds.');
      if (reason.trim().length < 10) throw new ApiError(422, 'Give a reason of at least 10 characters.');
      const row = allRows(s).find((r) => r.reference === reference && r.status === 'refund_requested');
      if (!row || !row.ticketCode || !row.refund) throw new ApiError(409, 'This refund has already been decided.');
      const st = peopleState(s);
      const at = new Date().toISOString();
      const real = [...mockTickets, ...s.tickets].find((t) => t.code === row.ticketCode);
      const accountRefund = real ? s.account?.refunds[real.id] : undefined;
      if (decision === 'approve') {
        st.refunded[row.ticketCode] = { amountKobo: row.refund.amountKobo, at, by: actor.fullName, reason: reason.trim() };
        if (accountRefund) Object.assign(accountRefund, { status: 'refunded', processedAt: at });
      } else {
        if (accountRefund) Object.assign(accountRefund, { status: 'declined', processedAt: at });
        const req = st.refundRequests[row.ticketCode];
        if (req) Object.assign(req, { decision: 'declined', decidedAt: at, decidedBy: actor.fullName, note: reason.trim() });
      }
      pushAudit(s, {
        action: decision === 'approve' ? 'refund.approved' : 'refund.declined',
        recordType: 'payment',
        recordId: reference,
        details: `Refund ${decision === 'approve' ? 'approved' : 'declined'} ₦${(row.refund.amountKobo / 100).toLocaleString('en-NG')} · ${row.buyerName} · ${row.ticketCode}`,
        reason: reason.trim(),
      });
      return allRows(s).find((r) => r.reference === reference)!;
    }),
};
