import { ApiError } from '../client';
import { mockEvents, mockStaff, mockTicketTypes, mockTickets } from './data';
import { orderTotals } from '@/lib/fees';
import { bytesToBase64Url, encodeTicketQr } from '@/lib/ticketQr';
import type { CheckoutRequest, CheckoutResponse, CheckoutStatus, SeatHold } from '../endpoints';
import type { MockCheckinState } from './checkin';
import type { Branding, NotificationSettings } from '../endpoints';
import type { MockAdsState } from './ads';
import type { StaffRole } from '@/lib/permissions';
import type { AuditLogEntry, HikeEvent, NotificationPrefs, PendingContactChange, RefundInfo, Ticket, TicketDetails, TicketType, User } from '@/types/domain';

// A tiny fake backend for login, seat holds, checkout and tickets. State lives in sessionStorage so a refresh
// mid-checkout behaves like the real server. Only the mock branches in api/endpoints.ts and the Paystack
// webhook stand-in in features/checkout/paystack.ts call this. Delete it when the backend exists.

const STORAGE_KEY = 'hip.mock.v1';
const HOLD_MS = 10 * 60_000;
/** Polls that still see "pending" after Paystack reports success, to mimic webhook latency. */
const WEBHOOK_LAG_POLLS = 1;

export interface MockCheckout {
  id: string;
  reference: string;
  request: CheckoutRequest;
  userId: string | null;
  amountKobo: number;
  paystackConfirmed: boolean;
  pollsSinceConfirm: number;
  status: 'pending' | 'paid' | 'failed';
  ticketCodes: string[];
}

export interface MockState {
  sessionUser: User | null;
  holds: Record<string, { expiresAt: string }>;
  checkouts: Record<string, MockCheckout>;
  tickets: Ticket[];
  /** Used by api/mock/auth.ts. */
  auth?: MockAuthState;
  /** Used by api/mock/account.ts. */
  account?: MockAccountState;
  /** Used by api/mock/checkin.ts. */
  checkin?: MockCheckinState;
  /** Events and ticket types created or edited in the admin (merged into mockEvents by api/mock/data.ts). */
  adminEvents?: { events: HikeEvent[]; ticketTypes: TicketType[] };
  /** Phase 7a admin state (api/mock/people.ts, finance.ts, staff.ts). */
  people?: MockPeopleState;
  /** Admin / Branding (phase 7b). */
  branding?: Branding;
  /** Admin / Ads and the public ad slots (api/mock/ads.ts). */
  ads?: MockAdsState;
  /** Admin / Notifications (api/mock/notifications.ts). */
  notifications?: NotificationSettings;
  /** Audit log (ATT-018, ADM-*): newest last. */
  audit?: AuditLogEntry[];
}

export interface MockPeopleState {
  seeded: boolean;
  /** Suspended accounts by hiker id. */
  suspended: Record<string, { reason: string; at: string; by: string }>;
  /** Refunds approved in Admin / Transactions, by ticket code. */
  refunded: Record<string, { amountKobo: number; at: string; by: string; reason: string }>;
  /** Refund requests on generated tickets (Adaeze's live in account.refunds), by ticket code. */
  refundRequests: Record<string, { amountKobo: number; requestedAt: string; reason: string; decision?: 'declined'; decidedAt?: string; decidedBy?: string; note?: string }>;
  /** Extra payments that never became tickets: pending and failed. */
  otherPayments: { reference: string; buyerName: string; buyerEmail?: string; eventId: string; ticketKobo: number; status: 'pending' | 'failed'; createdAt: string }[];
  invites: { id: string; name: string; email: string; role: StaffRole; invitedAt: string; invitedBy: string }[];
  staffSeeded?: boolean;
  staffMeta: Record<string, { lastActiveAt?: string; twoFactorAt?: string | null }>;
  pendingTotp?: { userId: string; secret: string };
}

/** Adds an audit log entry for the signed-in staff member (or Kunle, the sample admin, in dev). */
export function pushAudit(s: MockState, entry: Omit<AuditLogEntry, 'id' | 'createdAt' | 'actorUserId' | 'actorName'> & { at?: string }) {
  const actor = s.sessionUser ?? mockStaff[0];
  const { at, ...rest } = entry;
  (s.audit ??= []).push({ id: `aud_${crypto.randomUUID().slice(0, 8)}`, createdAt: at ?? new Date().toISOString(), actorUserId: actor.id, actorName: actor.fullName, ...rest });
}

export interface MockAccountState {
  /** Sample pending order created once per session. */
  seeded: boolean;
  /** Refund requests made in this session, by ticket id. */
  refunds: Record<string, RefundInfo>;
  profiles: Record<string, MockProfile>;
}

export interface MockProfile {
  dateOfBirth?: string;
  emergencyContact?: { name: string; phone: string };
  photoUrl?: string;
  notifications: NotificationPrefs;
  pendingContacts: (PendingContactChange & { attempts: number })[];
}

export interface MockAuthState {
  failures: Record<string, { count: number; lockedUntil?: string }>;
  users: { user: User; password: string }[];
  verifications: Record<string, { userId: string; channel: 'email' | 'phone'; attempts: number; guestTickets: number }>;
  staffChallenges: Record<string, string>;
}

function load(): MockState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    // Storage blocked (private mode): fall through to a fresh state.
  }
  return { sessionUser: null, holds: {}, checkouts: {}, tickets: [] };
}

/** Runs fn against the state and saves it, even when fn throws (failed logins must still count). */
export function update<T>(fn: (s: MockState) => T): T {
  const state = load();
  try {
    return fn(state);
  } finally {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore: the mock just won't survive a refresh.
    }
  }
}

const shortId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const randomChars = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
/** Random 64 bytes shaped like a P-256 signature. Replaced with a mock-key signature on the way out (api/endpoints.ts). */
export const fakeSignature = () => bytesToBase64Url(crypto.getRandomValues(new Uint8Array(64)));

// --- Session (stands in for the backend's session cookie) ---

export const mockSession = {
  user: (): User | null => load().sessionUser,
  signIn: (user: User): User => update((s) => ((s.sessionUser = user), user)),
  logout: () => update((s) => void (s.sessionUser = null)),
};

// --- Tickets ---

export const allTickets = (): Ticket[] => [...mockTickets, ...load().tickets];

export function toDetails(t: Ticket): TicketDetails | null {
  const e = mockEvents.find((x) => x.id === t.eventId);
  if (!e) return null;
  const { id, slug, title, startsAt, durationLabel, meetingPoint, location, coverImageUrl } = e;
  return {
    ...t,
    ticketTypeName: mockTicketTypes.find((x) => x.id === t.ticketTypeId)?.name ?? 'Ticket',
    event: { id, slug, title, startsAt, durationLabel, meetingPoint, location, coverImageUrl },
  };
}

// --- Checkout ---

export function createHold(): SeatHold {
  const holdId = shortId('hold');
  const expiresAt = new Date(Date.now() + HOLD_MS).toISOString();
  update((s) => void (s.holds[holdId] = { expiresAt }));
  return { holdId, expiresAt };
}

export function startCheckout(req: CheckoutRequest): CheckoutResponse {
  return update((s) => {
    const hold = s.holds[req.holdId];
    if (!hold || new Date(hold.expiresAt).getTime() < Date.now()) throw new ApiError(410, 'Your seat hold has expired. Please start again.');
    const expected = req.items.flatMap((i) => Array<string>(i.quantity).fill(i.ticketTypeId));
    if (req.attendees.length !== expected.length || req.attendees.some((a, n) => a.ticketTypeId !== expected[n] || !a.fullName.trim())) {
      throw new ApiError(400, 'Each ticket needs an attendee name.');
    }
    const subtotal = req.items.reduce((sum, i) => sum + (mockTicketTypes.find((t) => t.id === i.ticketTypeId)?.priceKobo ?? 0) * i.quantity, 0);
    const { totalKobo } = orderTotals(subtotal);
    const checkout: MockCheckout = {
      id: shortId('chk'),
      reference: `PSK_${randomChars(8)}`,
      request: req,
      userId: s.sessionUser?.id ?? null,
      amountKobo: totalKobo,
      // Free orders need no payment, so the server confirms them straight away.
      paystackConfirmed: totalKobo === 0,
      pollsSinceConfirm: totalKobo === 0 ? WEBHOOK_LAG_POLLS : 0,
      status: 'pending',
      ticketCodes: [],
    };
    s.checkouts[checkout.id] = checkout;
    return {
      checkoutId: checkout.id,
      reference: checkout.reference,
      paystackAccessCode: totalKobo > 0 ? `mock_access_${checkout.id}` : undefined,
      amountKobo: totalKobo,
    };
  });
}

/** Stand-in for Paystack's charge.success webhook reaching the backend. */
export function confirmPaystackPayment(reference: string) {
  update((s) => {
    const c = Object.values(s.checkouts).find((x) => x.reference === reference);
    if (c) c.paystackConfirmed = true;
  });
}

export function checkoutStatus(checkoutId: string): CheckoutStatus {
  return update((s) => {
    const c = s.checkouts[checkoutId];
    if (!c) throw new ApiError(404, 'Checkout not found');
    if (c.status === 'pending' && c.paystackConfirmed) {
      if (c.pollsSinceConfirm < WEBHOOK_LAG_POLLS) c.pollsSinceConfirm += 1;
      else issueTickets(s, c);
    }
    const tickets = c.ticketCodes.map((code) => s.tickets.find((t) => t.code === code)).filter((t): t is Ticket => !!t);
    return {
      status: c.status,
      reference: c.reference,
      amountKobo: c.amountKobo,
      isGuest: !c.userId,
      buyer: c.request.buyer,
      accountCreated: !c.userId && !!c.request.createAccount && c.status === 'paid',
      tickets: tickets.map(toDetails).filter((t): t is TicketDetails => !!t),
    };
  });
}

const sameContact = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

function issueTickets(s: MockState, c: MockCheckout) {
  const { request: req } = c;
  for (const attendee of req.attendees) {
    const code = `HIP-${randomChars(4)}-${randomChars(4)}`;
    // Only the buyer's own ticket joins their account here. Other attendees' tickets are linked by the backend
    // when their email/phone matches an account (now or when they sign up later).
    const isBuyer = sameContact(attendee.email, req.buyer.email) || sameContact(attendee.phone, req.buyer.phone);
    const holderUserId = isBuyer && c.userId ? c.userId : undefined;
    s.tickets.push({
      id: shortId('tkt'),
      code,
      eventId: req.eventId,
      ticketTypeId: attendee.ticketTypeId,
      holderUserId,
      holder: { fullName: attendee.fullName, email: attendee.email, phone: attendee.phone },
      isGuest: !holderUserId,
      paymentId: c.reference,
      qrToken: encodeTicketQr({ code, eventId: req.eventId, signature: fakeSignature() }),
      status: 'confirmed',
      issuedAt: new Date().toISOString(),
    });
    c.ticketCodes.push(code);
  }
  c.status = 'paid';
}
