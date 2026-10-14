import { ApiError } from '../client';
import { mockCheckIns, mockEvents, mockProfileExtras, mockRefunds, mockTicketBuyers, mockTicketTypes, mockTickets, mockUser } from './data';
import { MOCK_CODE, auth, fail } from './auth';
import { toDetails, update, type MockAccountState, type MockCheckout, type MockProfile, type MockState } from './store';
import { orderTotals } from '@/lib/fees';
import { canRequestRefund, refundQuote } from '@/lib/refunds';
import { normalisePhone } from '@/lib/validation';
import type { CheckoutResponse, MyTicketsResponse, ProfileUpdate, RefundRequest, MyDataExport } from '../endpoints';
import type { HikerProfile, HistoryEntry, MyTicket, NotificationPrefs, PendingOrder, RefundInfo, Ticket, User } from '@/types/domain';

// Mock backend for the hiker area: my tickets, pending orders, refunds, history and profile.
// Rules the real API must keep:
//   - History and every count come from check-ins only; no check-in = missed, refunds are their own outcome (HIS-004, HIS-008).
//   - Refund amounts follow the policy in lib/refunds.ts, calculated on the server.
//   - A new email or phone only replaces the old one after its code is entered (AUTH-017).
//   - Ticket confirmations can't be turned off; promotions are opt-in (NOT-010).
// In dev the route guards are bypassed, so with nobody logged in these act as Adaeze (the sample hiker).

const HOUR = 3_600_000;
const RESEND_SECONDS = 60;
const CODE_ATTEMPTS = 5;

function account(s: MockState): MockAccountState {
  s.account ??= { seeded: false, refunds: {}, profiles: {} };
  if (!s.account.seeded) seedPendingOrder(s);
  return s.account;
}

const currentUser = (s: MockState): User => {
  const id = (s.sessionUser ?? mockUser).id;
  return auth(s).users.find((a) => a.user.id === id)?.user ?? s.sessionUser ?? mockUser;
};

/** Figma "Hiker / My tickets": an Gurara order waiting for payment, its hold ending in 14 minutes. */
function seedPendingOrder(s: MockState) {
  s.account!.seeded = true;
  const holdId = 'hold_seed_erin';
  s.holds[holdId] = { expiresAt: new Date(Date.now() + 14 * 60_000 + 30_000).toISOString() };
  const adaeze = { fullName: mockUser.fullName, email: mockUser.email, phone: mockUser.phone };
  const checkout: MockCheckout = {
    id: 'chk_seed_erin',
    reference: 'PSK_9MX24410',
    request: {
      holdId,
      eventId: 'evt_2',
      items: [{ ticketTypeId: 'tt_4', quantity: 1 }],
      buyer: adaeze,
      attendees: [{ ticketTypeId: 'tt_4', ...adaeze }],
      emergencyContact: { name: 'Chidi Okafor', phone: '+2348021112233' },
      paymentChannel: 'card',
    },
    userId: mockUser.id,
    amountKobo: orderTotals(2_250_000).totalKobo,
    paystackConfirmed: false,
    pollsSinceConfirm: 0,
    status: 'pending',
    ticketCodes: [],
  };
  s.checkouts[checkout.id] = checkout;
}

const eventOf = (id: string) => mockEvents.find((e) => e.id === id);
const priceOf = (ticketTypeId: string) => mockTicketTypes.find((t) => t.id === ticketTypeId)?.priceKobo ?? 0;

function buyerOf(s: MockState, t: Ticket): string | null {
  return mockTicketBuyers[t.id] ?? Object.values(s.checkouts).find((c) => c.ticketCodes.includes(t.code))?.userId ?? null;
}

function refundOf(s: MockState, t: Ticket): RefundInfo | undefined {
  const done = mockRefunds[t.id];
  if (done) return { status: 'refunded', ...done };
  return s.account?.refunds[t.id];
}

function myTicketList(s: MockState): MyTicket[] {
  account(s);
  const uid = currentUser(s).id;
  return [...mockTickets, ...s.tickets].flatMap((t) => {
    const heldByMe = t.holderUserId === uid;
    const boughtByMe = buyerOf(s, t) === uid;
    if (!heldByMe && !boughtByMe) return [];
    const details = toDetails(t);
    const event = eventOf(t.eventId);
    if (!details || !event) return [];
    const refund = refundOf(s, t);
    const checkIn = mockCheckIns.find((c) => c.ticketId === t.id);
    const ticket: MyTicket = {
      ...details,
      status: refund?.status === 'refunded' ? 'refunded' : details.status,
      eventStatus: event.status,
      pricePaidKobo: priceOf(t.ticketTypeId),
      heldByMe,
      boughtByMe,
      checkIn: checkIn && { at: checkIn.checkedInAt, method: checkIn.method },
      refund,
    };
    return [ticket];
  });
}

function pendingOrders(s: MockState): PendingOrder[] {
  account(s);
  const uid = currentUser(s).id;
  return Object.values(s.checkouts).flatMap((c) => {
    const hold = s.holds[c.request.holdId];
    const event = eventOf(c.request.eventId);
    if (c.userId !== uid || c.status !== 'pending' || c.paystackConfirmed || !hold || !event) return [];
    if (new Date(hold.expiresAt).getTime() <= Date.now()) return [];
    const { id, slug, title, startsAt, durationLabel, meetingPoint, location, coverImageUrl } = event;
    return [
      {
        checkoutId: c.id,
        reference: c.reference,
        event: { id, slug, title, startsAt, durationLabel, meetingPoint, location, coverImageUrl },
        lines: c.request.items.map((i) => ({
          ticketTypeId: i.ticketTypeId,
          ticketTypeName: mockTicketTypes.find((t) => t.id === i.ticketTypeId)?.name ?? 'Ticket',
          quantity: i.quantity,
        })),
        amountKobo: c.amountKobo,
        paymentChannel: c.request.paymentChannel,
        buyerEmail: c.request.buyer.email,
        holdExpiresAt: hold.expiresAt,
      },
    ];
  });
}

/** Past bookings held by the hiker. A booking for a hike that hasn't happened yet isn't history. */
function historyOf(s: MockState): HistoryEntry[] {
  const now = Date.now();
  return myTicketList(s)
    .filter((t) => t.heldByMe && t.eventStatus !== 'cancelled' && t.status !== 'cancelled' && t.status !== 'pending')
    .filter((t) => !!t.checkIn || t.status === 'refunded' || new Date(t.event.startsAt).getTime() + 12 * HOUR < now)
    .map((t) => {
      const e = eventOf(t.eventId)!;
      return {
        ticketCode: t.code,
        ticketTypeName: t.ticketTypeName,
        pricePaidKobo: t.pricePaidKobo,
        event: { id: e.id, slug: e.slug, title: e.title, startsAt: e.startsAt, location: e.location, distanceKm: e.distanceKm },
        outcome: t.status === 'refunded' ? 'refunded' : t.checkIn ? 'attended' : 'missed',
        checkIn: t.checkIn,
      } satisfies HistoryEntry;
    })
    .sort((a, b) => b.event.startsAt.localeCompare(a.event.startsAt));
}

const defaultNotifications: NotificationPrefs = { ticketConfirmations: true, reminders: true, reminderChannel: 'email_whatsapp', promotions: false };

function profileOf(s: MockState): MockProfile {
  const a = account(s);
  const uid = currentUser(s).id;
  a.profiles[uid] ??= { ...mockProfileExtras[uid], notifications: { ...defaultNotifications }, pendingContacts: [] };
  return a.profiles[uid];
}

function toProfile(s: MockState): HikerProfile {
  const p = profileOf(s);
  return {
    user: currentUser(s),
    dateOfBirth: p.dateOfBirth,
    emergencyContact: p.emergencyContact,
    photoUrl: p.photoUrl,
    hikesAttended: historyOf(s).filter((h) => h.outcome === 'attended').length,
    notifications: p.notifications,
    pendingContacts: p.pendingContacts.map((c) => ({ verificationId: c.verificationId, field: c.field, value: c.value, resendAvailableAt: c.resendAvailableAt })),
  };
}

/** Saves a change to the signed-in user in the account list and the session. */
function patchUser(s: MockState, patch: Partial<User>) {
  const uid = currentUser(s).id;
  const acct = auth(s).users.find((a) => a.user.id === uid);
  if (acct) acct.user = { ...acct.user, ...patch };
  if (s.sessionUser?.id === uid) s.sessionUser = { ...s.sessionUser, ...patch };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const mockAccount = {
  myTickets: (): MyTicketsResponse => update((s) => ({ tickets: myTicketList(s), pending: pendingOrders(s) })),

  history: (): HistoryEntry[] => update(historyOf),

  requestRefund(code: string, body: RefundRequest): RefundInfo {
    return update((s) => {
      const t = myTicketList(s).find((x) => x.code === code);
      if (!t) throw new ApiError(404, 'Ticket not found.');
      if (!canRequestRefund(t)) throw new ApiError(409, 'This ticket can’t be refunded under the refund policy.');
      const { amountKobo } = refundQuote(t.event.startsAt, t.pricePaidKobo);
      const refund: RefundInfo = { status: 'requested', amountKobo, requestedAt: new Date().toISOString(), reason: body.reason };
      account(s).refunds[t.id] = refund;
      return refund;
    });
  },

  /** A fresh payment session for a pending order, while its seats are still held. */
  resumeCheckout(checkoutId: string): CheckoutResponse {
    return update((s) => {
      account(s);
      const c = s.checkouts[checkoutId];
      if (!c || c.userId !== currentUser(s).id) throw new ApiError(404, 'Order not found.');
      if (c.status !== 'pending') throw new ApiError(409, 'This order has already been paid.');
      const hold = s.holds[c.request.holdId];
      if (!hold || new Date(hold.expiresAt).getTime() <= Date.now()) throw new ApiError(410, 'Your seat hold has expired, so the seats were released.');
      return { checkoutId: c.id, reference: c.reference, paystackAccessCode: `mock_access_${c.id}`, amountKobo: c.amountKobo };
    });
  },

  profile: (): HikerProfile => update(toProfile),

  /** NFR-035: profile, tickets and check-ins. No QR payloads (they're entry passes) and no photo bytes. */
  exportData: (): MyDataExport =>
    update((s) => {
      const full: Partial<HikerProfile> = { ...toProfile(s) };
      const photoUrl = full.photoUrl;
      delete full.photoUrl;
      delete full.pendingContacts;
      const profile = full as Omit<HikerProfile, 'photoUrl' | 'pendingContacts'>;
      return {
        exportedAt: new Date().toISOString(),
        about: 'Everything the group holds about you in this app. Ticket QR codes are left out because they work as entry passes; open a ticket in the app to show it.',
        profile: { ...profile, hasPhoto: !!photoUrl },
        tickets: myTicketList(s).map((t) => ({ code: t.code, event: t.event.title, eventDate: t.event.startsAt, ticketType: t.ticketTypeName, status: t.refund ? `refund ${t.refund.status}` : t.status, holder: t.holder.fullName, ...(t.boughtByMe ? {} : { boughtBy: 'someone else' }) })),
        hikingHistory: historyOf(s).map((h) => ({ event: h.event.title, date: h.event.startsAt, outcome: h.outcome, ...(h.checkIn ? { checkedInAt: h.checkIn.at } : {}) })),
      };
    }),

  updateProfile(body: ProfileUpdate): HikerProfile {
    return update((s) => {
      const me = currentUser(s);
      const others = auth(s).users.filter((a) => a.user.id !== me.id && a.user.status !== 'unverified');
      const emailChanged = !same(body.email, me.email);
      const phoneChanged = normalisePhone(body.phone) !== normalisePhone(me.phone);
      if (emailChanged && others.some((a) => same(a.user.email, body.email))) {
        fail(409, { code: 'email_taken', message: 'Another account already uses this email.', field: 'email' });
      }
      if (phoneChanged && others.some((a) => normalisePhone(a.user.phone) === normalisePhone(body.phone))) {
        fail(409, { code: 'phone_taken', message: 'Another account already uses this phone number.', field: 'phone' });
      }
      patchUser(s, { fullName: body.fullName });
      const p = profileOf(s);
      p.dateOfBirth = body.dateOfBirth;
      p.emergencyContact = body.emergencyContact;
      // AUTH-017: a changed email or phone waits for its code; the current one stays in use until then.
      const resendAvailableAt = new Date(Date.now() + RESEND_SECONDS * 1000).toISOString();
      for (const [field, changed, value] of [['email', emailChanged, body.email.trim()], ['phone', phoneChanged, normalisePhone(body.phone)]] as const) {
        const existing = p.pendingContacts.find((c) => c.field === field);
        if (!changed) p.pendingContacts = p.pendingContacts.filter((c) => c.field !== field);
        else if (!existing || existing.value !== value) {
          p.pendingContacts = [...p.pendingContacts.filter((c) => c.field !== field), { verificationId: `cv_${crypto.randomUUID().slice(0, 8)}`, field, value, resendAvailableAt, attempts: 0 }];
        }
      }
      return toProfile(s);
    });
  },

  confirmContact(verificationId: string, code: string): HikerProfile {
    return update((s) => {
      const p = profileOf(s);
      const pending = p.pendingContacts.find((c) => c.verificationId === verificationId);
      if (!pending) fail(410, { code: 'code_expired', message: 'This code has expired. Save your details again to get a new one.' });
      if (code !== MOCK_CODE) {
        pending!.attempts += 1;
        if (pending!.attempts >= CODE_ATTEMPTS) {
          p.pendingContacts = p.pendingContacts.filter((c) => c !== pending);
          fail(410, { code: 'code_expired', message: 'Too many wrong codes. Save your details again to get a new code.' });
        }
        fail(400, { code: 'invalid_code', message: 'That code isn’t right.', attemptsLeft: CODE_ATTEMPTS - pending!.attempts });
      }
      patchUser(s, pending!.field === 'email' ? { email: pending!.value, emailVerified: true } : { phone: pending!.value, phoneVerified: true });
      p.pendingContacts = p.pendingContacts.filter((c) => c !== pending);
      return toProfile(s);
    });
  },

  resendContactCode(verificationId: string): HikerProfile {
    return update((s) => {
      const pending = profileOf(s).pendingContacts.find((c) => c.verificationId === verificationId);
      if (!pending) fail(410, { code: 'code_expired', message: 'This change has expired. Save your details again.' });
      if (new Date(pending!.resendAvailableAt).getTime() > Date.now()) fail(429, { code: 'rate_limited', message: 'Please wait a moment before asking for another code.' });
      pending!.resendAvailableAt = new Date(Date.now() + RESEND_SECONDS * 1000).toISOString();
      pending!.attempts = 0;
      return toProfile(s);
    });
  },

  cancelContactChange(verificationId: string): HikerProfile {
    return update((s) => {
      const p = profileOf(s);
      p.pendingContacts = p.pendingContacts.filter((c) => c.verificationId !== verificationId);
      return toProfile(s);
    });
  },

  updateNotifications(prefs: Omit<NotificationPrefs, 'ticketConfirmations'>): NotificationPrefs {
    return update((s) => {
      const p = profileOf(s);
      // NOT-010: confirmations and receipts are always sent, whatever the client asks for.
      p.notifications = { ...prefs, ticketConfirmations: true };
      return p.notifications;
    });
  },

  setPhoto: (photoUrl: string | undefined): HikerProfile =>
    update((s) => {
      profileOf(s).photoUrl = photoUrl;
      return toProfile(s);
    }),

  deleteAccount(password: string) {
    update((s) => {
      const a = auth(s);
      const me = currentUser(s);
      const acct = a.users.find((x) => x.user.id === me.id);
      if (!acct || acct.password !== password) fail(401, { code: 'invalid_credentials', message: 'That password isn’t right.' });
      a.users = a.users.filter((x) => x !== acct);
      s.sessionUser = null;
    });
  },
};

/** Shrinks an uploaded photo to a 256px square JPEG, so the mock can keep it in sessionStorage. */
export async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const side = Math.min(bitmap.width, bitmap.height);
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.85);
}

