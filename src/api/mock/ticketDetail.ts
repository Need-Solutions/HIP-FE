import { ApiError } from '../client';
import { mockAdmin } from './admin';
import { mockAudit } from './audit';
import { mockFinance } from './finance';
import { mockPeople } from './people';
import { auditLabel } from '@/lib/audit';
import type { AdminTicketDetail } from '../endpoints';

// Mock admin ticket detail (TKT-020). Built from the other mock endpoints, called one after another (each keeps its
// own state), the way the backend would join tickets, payments, check-ins and the audit log.

export async function mockTicketDetail(code: string): Promise<AdminTicketDetail | null> {
  const found = mockPeople.search(code).tickets.find((t) => t.code.toUpperCase() === code.toUpperCase());
  if (!found) return null;
  const p = mockAdmin.participants(found.eventId);
  const row = p.rows.find((r) => r.ticketCode === found.code);
  if (!row) throw new ApiError(404, 'Ticket not found.');
  let payment;
  try {
    payment = mockFinance.transactions({ from: '2000-01-01', to: '2100-12-31', status: 'all', q: found.code, all: true }).items.find((r) => r.ticketCode === found.code);
  } catch {
    payment = undefined; // no permission to see transactions: the page shows the ticket without payment details
  }
  let audit: ReturnType<typeof mockAudit.list>['items'] = [];
  try {
    audit = mockAudit.list({ q: found.code, page: 1, all: true }).items.filter((e) => e.recordId === found.code);
  } catch {
    audit = []; // no audit-log permission
  }
  const hiker = mockPeople.search(row.holderName).hikers.find((h) => h.name === row.holderName && (!row.email || h.email === row.email));

  const history: AdminTicketDetail['history'] = [];
  const issuedAt = payment?.createdAt ?? p.event.startsAt;
  history.push({ at: issuedAt, label: payment && payment.ticketKobo > 0 ? 'Payment verified, ticket issued' : 'Ticket issued', by: payment ? `Paystack · ${payment.reference}` : undefined });
  if (payment?.refund) {
    history.push({ at: payment.refund.requestedAt, label: 'Refund requested', detail: payment.refund.reason });
    if (payment.refund.decision && payment.refund.decidedAt) history.push({ at: payment.refund.decidedAt, label: payment.refund.decision === 'approved' ? 'Refund approved' : 'Refund declined', by: payment.refund.decidedBy, detail: payment.refund.note });
  }
  if (row.checkIn) history.push({ at: row.checkIn.at, label: row.checkIn.method === 'manual' ? 'Checked in manually' : row.checkIn.method === 'qr_offline' ? 'Checked in (QR, offline)' : 'Checked in (QR)', by: [row.checkIn.staffName, row.checkIn.gate].filter(Boolean).join(' · ') });
  for (const e of audit) {
    if (e.action.startsWith('refund.')) continue; // already shown from the payment record
    history.push({ at: e.createdAt, label: auditLabel(e.action), by: e.actorName, detail: [e.details, e.reason && `Reason: “${e.reason}”`].filter(Boolean).join(' · ') });
  }
  history.sort((a, b) => a.at.localeCompare(b.at));

  const status: AdminTicketDetail['status'] =
    row.ticketStatus === 'refunded' ? 'refunded' : row.ticketStatus === 'cancelled' ? 'cancelled' : payment?.status === 'refund_requested' ? 'refund_requested' : row.checkIn ? 'checked_in' : 'confirmed';
  return {
    code: found.code,
    status,
    event: { id: p.event.id, title: p.event.title, startsAt: p.event.startsAt, status: p.event.status },
    ticketTypeName: row.ticketTypeName,
    holder: { name: row.holderName, email: row.email, phone: row.phone, isGuest: row.isGuest, hikerId: hiker?.id },
    payment,
    checkIn: row.checkIn,
    issue: row.issue,
    history,
  };
}
