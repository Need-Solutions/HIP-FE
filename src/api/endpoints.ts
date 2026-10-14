import { api, ApiError, USE_MOCKS } from './client';
import { mockEvents, mockTicketTypes } from './mock/data';
import { allTickets, checkoutStatus, createHold, mockSession, startCheckout, toDetails } from './mock/store';
import { mockAuth } from './mock/auth';
import { mockAccount, shrinkPhoto } from './mock/account';
import { mockCheckin } from './mock/checkin';
import { mockAdmin } from './mock/admin';
import { mockBranding, mockBrandingAdmin } from './mock/branding';
import { mockFinance } from './mock/finance';
import { mockPeople } from './mock/people';
import { mockStaffAdmin } from './mock/staff';
import { mockAdsServer } from './mock/ads';
import { mockNotifications } from './mock/notifications';
import { mockAudit } from './mock/audit';
import type { StaffRole } from '@/lib/permissions';
import type { BrandColors, BrandDetails } from '@/lib/brandDefaults';
import { signTicketQr } from './mock/signing';
import type {
  AdCampaign,
  PublicAd,
  AuditLogEntry,
  CheckInMethod,
  CheckinSettings,
  Difficulty,
  EventStatus,
  ReentryRecord,
  Role,
  SyncLogEntry,
  CheckinEvent,
  CheckinManifest,
  CheckinStats,
  ManifestTicket,
  ScanOutcome,
  StaffDevice,
  SupervisorPinStatus,
  SyncConflict,
  GuestContact,
  HikeEvent,
  HikerProfile,
  HistoryEntry,
  ISODate,
  MyTicket,
  NotificationPrefs,
  Paginated,
  PaymentChannel,
  PendingOrder,
  RefundInfo,
  TicketDetails,
  TicketHolder,
  TicketType,
  User,
} from '@/types/domain';
import { FEW_SPOTS_THRESHOLD, isPast, purchaseBlocker, spotsLeft } from '@/lib/events';
import type { LocalCheckIn } from '@/features/checkin/offline/db';

// One function per backend endpoint. Paths are the proposed REST contract;
// adjust them when the backend is built. Components should only import from here.

const delay = <T,>(value: T, ms = 250) => new Promise<T>((r) => setTimeout(() => r(value), ms));

export type EventStatusFilter = 'all' | 'open' | 'few' | 'sold_out' | 'past';
export type EventSort = 'soonest' | 'latest';

export interface EventSearchParams {
  q?: string;
  /** UTC ISO bounds on startsAt (inclusive). */
  from?: string;
  to?: string;
  status?: EventStatusFilter;
  /** soonest: upcoming first (soonest first), then past (most recent first). latest: newest date first. */
  sort?: EventSort;
  page?: number;
  pageSize?: number;
}

const byStartAsc = (a: HikeEvent, b: HikeEvent) => a.startsAt.localeCompare(b.startsAt);

// Mirrors the server-side filter the backend should implement for GET /api/events (WEB-006, WEB-011, SRCH-007).
function mockSearch({ q = '', from, to, status = 'all', sort = 'soonest', page = 1, pageSize = 9 }: EventSearchParams): Paginated<HikeEvent> {
  const now = Date.now();
  const term = q.trim().toLowerCase();
  const matches = mockEvents.filter((e) => {
    if (e.status === 'draft') return false;
    if (term && ![e.title, e.location, e.meetingPoint].some((f) => f.toLowerCase().includes(term))) return false;
    if (from && e.startsAt < from) return false;
    if (to && e.startsAt > to) return false;
    switch (status) {
      case 'open': return purchaseBlocker(e, now) === null;
      case 'few': return purchaseBlocker(e, now) === null && spotsLeft(e) <= FEW_SPOTS_THRESHOLD;
      case 'sold_out': return !isPast(e, now) && e.status !== 'cancelled' && spotsLeft(e) <= 0;
      case 'past': return isPast(e, now);
      default: return true;
    }
  });
  const newestFirst = (a: HikeEvent, b: HikeEvent) => byStartAsc(b, a);
  const all =
    sort === 'latest'
      ? [...matches].sort(newestFirst)
      : [...matches.filter((e) => !isPast(e, now)).sort(byStartAsc), ...matches.filter((e) => isPast(e, now)).sort(newestFirst)];
  const start = (page - 1) * pageSize;
  return { items: all.slice(start, start + pageSize), total: all.length, page, pageSize };
}

function toQuery(params: EventSearchParams) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && qs.set(k, String(v)));
  return qs.toString();
}

export const eventsApi = {
  /** Upcoming public events, soonest first (Landing). */
  list: (): Promise<HikeEvent[]> =>
    USE_MOCKS
      ? delay(mockEvents.filter((e) => e.status !== 'draft' && e.status !== 'cancelled' && !isPast(e)).sort(byStartAsc))
      : api('/api/events?upcoming=true'),
  /** Filtered, paginated listing for the Events page. */
  search: (params: EventSearchParams): Promise<Paginated<HikeEvent>> =>
    USE_MOCKS ? delay(mockSearch(params)) : api(`/api/events?${toQuery(params)}`),
  /** Resolves to null for an unknown slug (TanStack Query rejects undefined as query data). */
  bySlug: (slug: string): Promise<HikeEvent | null> =>
    // Drafts are never public, so they 404 like an unknown slug.
    USE_MOCKS
      ? delay(mockEvents.find((e) => e.slug === slug && e.status !== 'draft') ?? null)
      : api<HikeEvent>(`/api/events/${slug}`).catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        }),
  /** By ID, for checkout. The backend can serve ids and slugs on the same path. Drafts are never public. */
  byId: (id: string): Promise<HikeEvent | null> =>
    USE_MOCKS
      ? delay(mockEvents.find((e) => e.id === id && e.status !== 'draft') ?? null)
      : api<HikeEvent>(`/api/events/${id}`).catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        }),
  ticketTypes: (eventId: string): Promise<TicketType[]> =>
    USE_MOCKS ? delay(mockTicketTypes.filter((t) => t.eventId === eventId)) : api(`/api/events/${eventId}/ticket-types`),
};

/**
 * Error body from the auth endpoints. `code` drives the UI. Messages never say whether an account exists
 * (AUTH-009), except sign-up's duplicate check (AUTH-004).
 */
export interface AuthErrorBody {
  code: 'invalid_credentials' | 'locked' | 'suspended' | 'unverified' | 'email_taken' | 'phone_taken' | 'invalid_code' | 'code_expired' | 'token_invalid' | 'password_reused' | 'rate_limited';
  message: string;
  /** invalid_credentials / invalid_code: tries left before a lock or a new code is needed (AUTH-013). */
  attemptsLeft?: number;
  lockMinutes?: number;
  retryAfterSeconds?: number;
  /** unverified: where to continue verifying. */
  verificationId?: string;
  destination?: string;
  /** Which form field the error belongs to, when it's about one field. */
  field?: string;
}

/** The AuthErrorBody inside an API error, or null for network and other failures. */
export function authError(err: unknown): AuthErrorBody | null {
  return err instanceof ApiError && err.body && typeof err.body === 'object' && 'code' in err.body ? (err.body as AuthErrorBody) : null;
}

export interface SignupRequest {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}

/** A one-time code was sent. `destination` is masked (a•••••@example.com). */
export interface VerificationStart {
  verificationId: string;
  channel: 'email' | 'phone';
  destination: string;
  resendAvailableAt: ISODate;
  /** Guest tickets bought with this email or phone; they join the account once it's verified. */
  guestTicketsToMerge: number;
}

export interface VerifyResult {
  user: User;
  /** Past guest tickets now attached to the account. */
  mergedTickets: number;
}

/** Staff sign-in, step 2 (ADM-001): a code from an authenticator app or email. */
export interface StaffChallenge {
  challengeId: string;
  method: 'authenticator' | 'email';
  destination?: string;
}

const post = <T,>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
/** Mock calls run after the delay, so thrown ApiErrors reject the promise like a real response would. */
const mock = <T,>(fn: () => T, ms?: number) => delay(null, ms).then(fn);

/** Mock tickets carry real signatures from the mock test key, so the check-in scanner can verify them. */
const withSignedQr = async <T extends { code: string; eventId: string; qrToken: string }>(t: T): Promise<T> => ({ ...t, qrToken: await signTicketQr(t.code, t.eventId) });

export const authApi = {
  me: (): Promise<User | null> => (USE_MOCKS ? delay(mockSession.user()) : api('/api/auth/me')),
  /** `identifier` is an email or phone number (AUTH-008). */
  login: (identifier: string, password: string, remember = false): Promise<User> =>
    USE_MOCKS ? mock(() => mockAuth.login(identifier, password)) : post('/api/auth/login', { identifier, password, remember }),
  logout: (): Promise<void> => (USE_MOCKS ? mock(() => mockAuth.logout()) : post('/api/auth/logout', {})),
  signup: (body: SignupRequest): Promise<VerificationStart> => (USE_MOCKS ? mock(() => mockAuth.signup(body)) : post('/api/auth/signup', body)),
  verify: (verificationId: string, code: string): Promise<VerifyResult> =>
    USE_MOCKS ? mock(() => mockAuth.verify(verificationId, code)) : post('/api/auth/verify', { verificationId, code }),
  resendCode: (verificationId: string, channel: 'email' | 'phone'): Promise<VerificationStart> =>
    USE_MOCKS ? mock(() => mockAuth.resend(verificationId, channel)) : post('/api/auth/verify/resend', { verificationId, channel }),
  /** Always resolves the same way, whether or not the email has an account (AUTH-010). */
  forgotPassword: (email: string): Promise<void> => (USE_MOCKS ? delay(undefined, 600) : post('/api/auth/forgot', { email })),
  resetPassword: (token: string, password: string): Promise<void> =>
    USE_MOCKS ? mock(() => mockAuth.resetPassword(token, password)) : post('/api/auth/reset', { token, password }),
  staffLogin: (email: string, password: string): Promise<StaffChallenge> =>
    USE_MOCKS ? mock(() => mockAuth.staffLogin(email, password)) : post('/api/auth/staff/login', { email, password }),
  staffVerify: (challengeId: string, code: string): Promise<User> =>
    USE_MOCKS ? mock(() => mockAuth.staffVerify(challengeId, code)) : post('/api/auth/staff/verify', { challengeId, code }),
};

export interface OrderItem {
  ticketTypeId: string;
  quantity: number;
}

/** Seats reserved while the buyer checks out (TKT-006). The countdown on the checkout page shows `expiresAt`. */
export interface SeatHold {
  holdId: string;
  expiresAt: ISODate;
}

export interface CheckoutRequest {
  holdId: string;
  eventId: string;
  items: OrderItem[];
  /** Who is paying. Receipt and all tickets go here. For guests, the backend later merges by this email/phone. */
  buyer: GuestContact;
  /**
   * One attendee per ticket: `items` expanded by quantity, in order (Standard × 2, Student × 1 → three entries).
   * The first is usually the buyer. Each ticket is issued to its attendee, so check-ins count per person.
   */
  attendees: CheckoutAttendee[];
  emergencyContact: { name: string; phone: string };
  /** Guests only: create an account from these details (sign-up stays optional). */
  createAccount?: boolean;
  whatsappReminders?: boolean;
  paymentChannel: PaymentChannel;
}

export interface CheckoutAttendee extends TicketHolder {
  ticketTypeId: string;
}

export interface CheckoutResponse {
  checkoutId: string;
  /** Paystack transaction reference. */
  reference: string;
  /** From Paystack's initialize call, made by the backend. Absent for free orders, which skip payment. */
  paystackAccessCode?: string;
  /** What the backend will charge in kobo, fee included. This is the real amount; the page shows an estimate. */
  amountKobo: number;
}

export interface CheckoutStatus {
  status: 'pending' | 'paid' | 'failed';
  reference: string;
  amountKobo: number;
  isGuest: boolean;
  buyer: GuestContact;
  /** True when a guest asked for an account and the backend created one. */
  accountCreated: boolean;
  /** Empty until the backend has verified payment (TKT-010). */
  tickets: TicketDetails[];
  failureReason?: string;
}

export const checkoutApi = {
  hold: (body: { eventId: string; items: OrderItem[] }): Promise<SeatHold> =>
    USE_MOCKS ? delay(createHold()) : api('/api/checkout/holds', { method: 'POST', body: JSON.stringify(body) }),
  start: (body: CheckoutRequest): Promise<CheckoutResponse> =>
    USE_MOCKS ? delay(null).then(() => startCheckout(body)) : api('/api/checkout', { method: 'POST', body: JSON.stringify(body) }),
  /** Poll after the Paystack popup closes. Tickets only appear once the backend has verified payment (TKT-010). */
  status: (checkoutId: string): Promise<CheckoutStatus> =>
    USE_MOCKS
      ? delay(null)
          .then(() => checkoutStatus(checkoutId))
          .then(async (r) => ({ ...r, tickets: await Promise.all(r.tickets.map(withSignedQr)) }))
      : api(`/api/checkout/${checkoutId}`),
  /** New payment session for an unpaid order (My tickets "Complete payment"). 410 once the seat hold has expired. */
  resume: (checkoutId: string): Promise<CheckoutResponse> =>
    USE_MOCKS ? mock(() => mockAccount.resumeCheckout(checkoutId)) : post(`/api/checkout/${checkoutId}/resume`, {}),
};

export interface MyTicketsResponse {
  /** Tickets the hiker holds plus tickets they bought for others. Each says which (`heldByMe`, `boughtByMe`). */
  tickets: MyTicket[];
  /** Orders still waiting for payment, while their seats are held. */
  pending: PendingOrder[];
}

export interface RefundRequest {
  reason: string;
  note?: string;
}

export const ticketsApi = {
  mine: (): Promise<MyTicketsResponse> =>
    USE_MOCKS
      ? mock(() => mockAccount.myTickets()).then(async (r) => ({ ...r, tickets: await Promise.all(r.tickets.map(withSignedQr)) }))
      : api('/api/me/tickets'),
  /** TKT-021. The server works out the amount from the refund policy; only the buyer can ask. */
  requestRefund: (code: string, body: RefundRequest): Promise<RefundInfo> =>
    USE_MOCKS ? mock(() => mockAccount.requestRefund(code, body), 600) : post(`/api/me/tickets/${encodeURIComponent(code)}/refund`, body),
  /**
   * One ticket by code. Account holders are authorised by their session; guests by the `token` from their
   * one-time link. Resolves to null when the ticket doesn't exist or isn't theirs.
   */
  byCode: (code: string, token?: string): Promise<TicketDetails | null> => {
    if (USE_MOCKS) {
      const t = allTickets().find((x) => x.code.toUpperCase() === code.toUpperCase());
      const details = t ? toDetails(t) : null;
      return delay(null).then(() => (details ? withSignedQr(details) : null));
    }
    return api<TicketDetails>(`/api/tickets/${encodeURIComponent(code)}${token ? `?token=${encodeURIComponent(token)}` : ''}`).catch((err: unknown) => {
      if (err instanceof ApiError && (err.status === 404 || err.status === 403)) return null;
      throw err;
    });
  },
  /** Guest "Find my ticket": sends a one-time link by email/WhatsApp. Always succeeds, so it can't be used to probe for tickets. */
  requestGuestLink: (contact: string, code?: string): Promise<void> =>
    USE_MOCKS ? delay(undefined, 600) : api('/api/tickets/guest-link', { method: 'POST', body: JSON.stringify({ contact, code }) }),
};

export const historyApi = {
  /** Past bookings with their outcome, newest first. Outcomes come from check-ins only (HIS-004, HIS-008). */
  list: (): Promise<HistoryEntry[]> => (USE_MOCKS ? mock(() => mockAccount.history()) : api('/api/me/history')),
};

export interface ProfileUpdate {
  fullName: string;
  /** YYYY-MM-DD */
  dateOfBirth?: string;
  /** A new email or phone isn't applied until its code is confirmed (AUTH-017); see HikerProfile.pendingContacts. */
  email: string;
  phone: string;
  emergencyContact?: { name: string; phone: string };
}

export const profileApi = {
  get: (): Promise<HikerProfile> => (USE_MOCKS ? mock(() => mockAccount.profile()) : api('/api/me/profile')),
  /** Errors: email_taken / phone_taken (AuthErrorBody) when another account uses the new email or phone. */
  update: (body: ProfileUpdate): Promise<HikerProfile> =>
    USE_MOCKS ? mock(() => mockAccount.updateProfile(body), 500) : api('/api/me/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  confirmContact: (verificationId: string, code: string): Promise<HikerProfile> =>
    USE_MOCKS ? mock(() => mockAccount.confirmContact(verificationId, code)) : post('/api/me/contact/verify', { verificationId, code }),
  resendContactCode: (verificationId: string): Promise<HikerProfile> =>
    USE_MOCKS ? mock(() => mockAccount.resendContactCode(verificationId)) : post('/api/me/contact/resend', { verificationId }),
  /** Drops a pending change and keeps the current email or phone. */
  cancelContactChange: (verificationId: string): Promise<HikerProfile> =>
    USE_MOCKS ? mock(() => mockAccount.cancelContactChange(verificationId)) : api(`/api/me/contact/${verificationId}`, { method: 'DELETE' }),
  /** Ticket confirmations are always on (NOT-010), so they aren't sent. */
  updateNotifications: (prefs: Omit<NotificationPrefs, 'ticketConfirmations'>): Promise<NotificationPrefs> =>
    USE_MOCKS ? mock(() => mockAccount.updateNotifications(prefs)) : api('/api/me/notifications', { method: 'PUT', body: JSON.stringify(prefs) }),
  uploadPhoto: async (file: File): Promise<HikerProfile> => {
    if (USE_MOCKS) {
      const dataUrl = await shrinkPhoto(file);
      return mock(() => mockAccount.setPhoto(dataUrl), 400);
    }
    const form = new FormData();
    form.append('photo', file);
    return api('/api/me/photo', { method: 'POST', body: form });
  },
  removePhoto: (): Promise<HikerProfile> => (USE_MOCKS ? mock(() => mockAccount.setPhoto(undefined)) : api('/api/me/photo', { method: 'DELETE' })),
  /** NFR-035: everything the group holds about the signed-in hiker, as one JSON document. */
  exportData: (): Promise<MyDataExport> => (USE_MOCKS ? mock(() => mockAccount.exportData(), 500) : api('/api/me/export')),
  /** Needs the current password. Ends the session. */
  deleteAccount: (password: string): Promise<void> =>
    USE_MOCKS ? mock(() => mockAccount.deleteAccount(password), 600) : post('/api/me/delete', { password }),
};

export interface MyDataExport {
  exportedAt: ISODate;
  /** Explains the file to the person who downloads it. */
  about: string;
  profile: Omit<HikerProfile, 'photoUrl' | 'pendingContacts'> & { hasPhoto: boolean };
  tickets: { code: string; event: string; eventDate: ISODate; ticketType: string; status: string; holder: string; boughtBy?: string }[];
  /** From check-ins only (SRS 2.4 rule 11). */
  hikingHistory: { event: string; date: ISODate; outcome: string; checkedInAt?: ISODate }[];
}

export interface PinErrorBody {
  code: 'invalid_pin' | 'pin_locked' | 'pin_not_set';
  message: string;
  attemptsLeft?: number;
}

/** The PinErrorBody inside an API error from checkinApi.reentry, or null for anything else. */
export function pinError(err: unknown): PinErrorBody | null {
  const body = err instanceof ApiError ? (err.body as Partial<PinErrorBody> | undefined) : undefined;
  return body && (body.code === 'invalid_pin' || body.code === 'pin_locked' || body.code === 'pin_not_set') ? (body as PinErrorBody) : null;
}

/**
 * Mock check-in calls fail like real requests when the phone has no connection, so offline mode can be tested
 * by switching the network off (DevTools or the headless browser).
 */
const mockNet = <T,>(fn: () => T | Promise<T>, ms = 150) =>
  navigator.onLine ? delay(null, ms).then(fn) : Promise.reject(new TypeError('Failed to fetch'));

export interface SyncResult {
  /** Local ids the server now has (including ones it already had: sync is idempotent). */
  synced: string[];
  /** New conflicts for admin review (duplicates, tickets not in the offline list). */
  conflicts: number;
}

/** Check-in for staff (CLAUDE.md "Offline check-in"). The staff member and gate come from the session. */
export const checkinApi = {
  /** Events this staff member can check in over the next two weeks, soonest first. */
  events: (): Promise<CheckinEvent[]> => (USE_MOCKS ? mockNet(() => mockCheckin.events()) : api('/api/checkin/events')),
  /** The offline list: names, ticket types, statuses and the event's public key. */
  manifest: (eventId: string): Promise<CheckinManifest> =>
    USE_MOCKS ? mockNet(() => mockCheckin.manifest(eventId), 400) : api(`/api/checkin/${eventId}/manifest`),
  /** Online scan. The server verifies the signature and records the check-in. */
  scan: (eventId: string, payload: string, deviceId: string, gate?: string): Promise<ScanOutcome> =>
    USE_MOCKS ? mockNet(() => mockCheckin.scan(eventId, payload, gate)) : post('/api/checkin/scan', { eventId, payload, deviceId, gate }),
  /** Manual search check-in (by ticket code, after staff check the hiker's ID). */
  manualCheckIn: (eventId: string, ticketCode: string, deviceId: string, gate?: string): Promise<ScanOutcome> =>
    USE_MOCKS ? mockNet(() => mockCheckin.manualCheckIn(eventId, ticketCode, gate)) : post('/api/checkin/manual', { eventId, ticketCode, deviceId, gate }),
  /** Every ticket with its check-in, for manual search. */
  roster: (eventId: string): Promise<ManifestTicket[]> => (USE_MOCKS ? mockNet(() => mockCheckin.roster(eventId)) : api(`/api/checkin/${eventId}/roster`)),
  stats: (eventId: string): Promise<CheckinStats> => (USE_MOCKS ? mockNet(() => mockCheckin.stats(eventId)) : api(`/api/checkin/${eventId}/stats`)),
  /**
   * Re-entry for someone already checked in, approved with the event's supervisor PIN (online). Errors carry
   * `PinErrorBody` (wrong PIN with tries left, locked, or no PIN set); read them with pinError().
   */
  reentry: (eventId: string, ticketCode: string, pin: string, deviceId: string, gate?: string): Promise<ScanOutcome> =>
    USE_MOCKS ? mockNet(() => mockCheckin.reentry(eventId, ticketCode, pin, deviceId, gate)) : post('/api/checkin/reentry', { eventId, ticketCode, pin, deviceId, gate }),
  /** Uploads offline scans. Idempotent by localId; the earliest scan per ticket wins on the server. */
  sync: (checkins: LocalCheckIn[], device: { deviceId: string; label: string }): Promise<SyncResult> =>
    USE_MOCKS ? mockNet(() => mockCheckin.sync(checkins, device), 300) : post('/api/checkin/sync', { checkins, device }),
  /** The phone's state (offline list, unsynced count) for Admin / Check-in settings → Staff devices. */
  heartbeat: (device: Omit<StaffDevice, 'lastSeenAt' | 'staffName'>): Promise<void> =>
    USE_MOCKS ? mockNet(() => mockCheckin.heartbeat(device), 50) : post('/api/checkin/devices/heartbeat', device),
  conflicts: (eventId: string): Promise<SyncConflict[]> =>
    USE_MOCKS ? mockNet(() => mockCheckin.conflicts(eventId)) : api(`/api/checkin/${eventId}/conflicts`),
  /** Admins only. */
  resolveConflict: (id: string): Promise<SyncConflict> =>
    USE_MOCKS ? mockNet(() => mockCheckin.resolveConflict(id)) : post(`/api/checkin/conflicts/${id}/resolve`, {}),
  reportIssue: (eventId: string, ticketCode: string, note: string): Promise<SyncConflict> =>
    USE_MOCKS ? mockNet(() => mockCheckin.reportIssue(eventId, ticketCode, note)) : post(`/api/checkin/${eventId}/issues`, { ticketCode, note }),
  /** Locks attendance. Only an admin can correct records afterwards (ATT-018). */
  close: (eventId: string): Promise<CheckinStats> => (USE_MOCKS ? mockNet(() => mockCheckin.close(eventId), 400) : post(`/api/checkin/${eventId}/close`, {})),
};

/**
 * Mock builds only: sample QR payloads (valid, used, refunded, other event, bought after download, forged,
 * not HIP) for the scanner's "Test scan" panel, since a laptop or headless browser has no ticket to point at.
 * Always empty against the real backend.
 */
export const mockTools = {
  /**
   * Dev server with mocks, or a build made with VITE_TEST_TOOLS=true (used for the offline tests). A normal
   * production build folds this to false, so the panel and its import are left out of the bundle.
   */
  enabled: USE_MOCKS && (import.meta.env.DEV || import.meta.env.VITE_TEST_TOOLS === 'true'),
  scanSamples: (eventId: string): Promise<{ label: string; payload: string }[]> =>
    mockTools.enabled ? import('./mock/checkin').then((m) => m.mockScanSamples(eventId)) : Promise.resolve([]),
};

// --- Admin (phase 6) ---

/** One row in Admin / Events and the Overview's upcoming list. */
export interface AdminEventRow {
  event: HikeEvent;
  /** Confirmed tickets (refunded and cancelled ones excluded). */
  confirmed: number;
  capacity: number;
  /** Check-ins so far; null before the hike when nobody has been scanned. Attendance comes only from check-ins. */
  checkedIn: number | null;
  /** Ticket revenue after refunds, without Paystack fees. */
  revenueKobo: number;
  /** Cancelled event whose tickets were refunded. */
  refunded: boolean;
  /** Published, registration closes within 72 hours. */
  salesClosing: boolean;
}

export type AdminEventFilter = 'all' | EventStatus;

export interface AdminEventsQuery {
  status: AdminEventFilter;
  range: 'all' | 'upcoming' | 'past';
  q?: string;
  page?: number;
}

export interface AdminEventsPage extends Paginated<AdminEventRow> {
  counts: Record<AdminEventFilter, number>;
}

export interface OverviewStats {
  weekStart: ISODate;
  weekEnd: ISODate;
  registeredHikers: number;
  /** Instances (every check-in) and unique hikers are separate numbers (SRS 3.7.7). */
  attendance: { instances: number; uniqueHikers: number; previousInstances: number };
  ticketsSold: { value: number; previous: number };
  netRevenueKobo: { value: number; previous: number };
  /** Last 8 calendar weeks, oldest first: check-ins, not ticket sales. */
  weekly: { week: string; startsOn: ISODate; instances: number; uniqueHikers: number }[];
  upcoming: AdminEventRow[];
  activity: AuditLogEntry[];
  pendingRefunds: number;
}

/** Create/edit event form (Admin / Create event). Dates are Abuja calendar dates; the server stores UTC. */
export interface EventInput {
  id?: string;
  title: string;
  description: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24-hour */
  startTime: string;
  durationLabel: string;
  meetingPoint: string;
  location: string;
  difficulty: Difficulty;
  capacity: number;
  /** YYYY-MM-DDTHH:MM (Abuja). Defaults to the start minus "close ticket sales before start" (Check-in settings). */
  registrationDeadline: string;
  requiredEquipment: string[];
  emergencyInfo: string;
  requirements: string;
  coverImageUrl?: string;
  ticketTypes: TicketTypeInput[];
}

export interface TicketTypeInput {
  id?: string;
  name: string;
  description?: string;
  priceKobo: number;
  quantityLimit: number;
  /** YYYY-MM-DD */
  salesStart: string;
  salesEnd: string;
}

export interface ParticipantRow {
  ticketCode: string;
  holderName: string;
  email?: string;
  phone?: string;
  ticketTypeName: string;
  isGuest: boolean;
  ticketStatus: 'confirmed' | 'refunded' | 'cancelled';
  checkIn?: { at: ISODate; method: CheckInMethod; staffName: string; gate?: string; flagged?: boolean };
  /** An open sync conflict on this ticket (Admin / Offline sync review). */
  issue?: { kind: SyncConflict['kind']; conflictId: string };
}

export interface ParticipantsData {
  event: HikeEvent;
  attendanceClosedAt?: ISODate;
  stats: { confirmed: number; checkedIn: number; offlineScans: number; offlineWaiting: number; flagged: number };
  rows: ParticipantRow[];
}

/** ATT-018: every correction carries a reason and is written to the audit log with the old and new state. */
export interface AttendanceCorrection {
  ticketCode: string;
  checkedIn: boolean;
  at?: ISODate;
  method?: CheckInMethod;
  reason: string;
}

export interface SyncReview {
  stats: { offline: number; synced: number; waiting: number; waitingDevices: string[]; devices: number; needsReview: number };
  conflicts: SyncConflict[];
  log: SyncLogEntry[];
  /** Re-entries approved with the supervisor PIN (online and synced offline ones). */
  reentries: ReentryRecord[];
}

export type AnalyticsGranularity = 'weekly' | 'monthly';

/** Admin / Analytics filters. Dates are Abuja calendar dates (YYYY-MM-DD), inclusive. */
export interface AnalyticsQuery {
  from: string;
  to: string;
  /** The period compared against (lib/analytics.ts periodRange). */
  prevFrom: string;
  prevTo: string;
  eventId?: string;
  granularity: AnalyticsGranularity;
}

/**
 * Raw counts for one period. Percentages are never sent: the client derives them with lib/metrics.ts, so the
 * screen and the CSV export always agree (ANA-033).
 */
export interface AnalyticsCounts {
  /** Every check-in in the period (SRS 3.7.7 "attendance instances"). */
  instances: number;
  /** Distinct people among those check-ins. */
  uniqueHikers: number;
  /** Unique hikers whose first ever check-in with the group is in the period. */
  firstTime: number;
  /** Unique hikers who had checked in before the period. */
  returning: number;
  /** Confirmed tickets for hikes that took place in the period (no-show denominator). */
  eligibleConfirmed: number;
  /** Check-ins for those hikes. */
  checkedInEligible: number;
}

export interface AnalyticsBucket {
  /** "W42" or "Oct 2026". */
  label: string;
  start: ISODate;
  end: ISODate;
  /** The bucket isn't over yet (e.g. "October shows month to date"). */
  partial: boolean;
  instances: number;
  uniqueHikers: number;
  firstTime: number;
  returning: number;
}

export interface AnalyticsReport {
  query: AnalyticsQuery;
  current: AnalyticsCounts;
  previous: AnalyticsCounts;
  /** Trailing weeks (8) or months (7) ending with the period's last day. */
  series: AnalyticsBucket[];
  /** Hikes that took place in the period: ticket sales vs attendance. */
  events: { eventId: string; title: string; startsAt: ISODate; ticketsSold: number; checkedIn: number }[];
  /** Every event with a date, for the event filter. */
  eventOptions: { id: string; title: string; startsAt: ISODate }[];
  generatedAt: ISODate;
}

/** Admin panel. The backend must check the admin role on every call (NFR-008). */
export const adminApi = {
  overview: (): Promise<OverviewStats> => (USE_MOCKS ? mock(() => mockAdmin.overview()) : api('/api/admin/overview')),
  events: (q: AdminEventsQuery): Promise<AdminEventsPage> =>
    USE_MOCKS
      ? mock(() => mockAdmin.events(q))
      : api(`/api/admin/events?${new URLSearchParams({ status: q.status, range: q.range, page: String(q.page ?? 1), ...(q.q ? { q: q.q } : {}) })}`),
  event: (id: string): Promise<{ event: HikeEvent; ticketTypes: TicketType[] } | null> =>
    USE_MOCKS
      ? mock(() => mockAdmin.event(id))
      : api<{ event: HikeEvent; ticketTypes: TicketType[] }>(`/api/admin/events/${id}`).catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        }),
  /** Creates or updates; `publish` also validates everything needed to go on sale. */
  saveEvent: (input: EventInput, publish: boolean): Promise<{ event: HikeEvent; ticketTypes: TicketType[] }> =>
    USE_MOCKS
      ? mock(() => mockAdmin.saveEvent(input, publish), 500)
      : api(input.id ? `/api/admin/events/${input.id}` : '/api/admin/events', { method: input.id ? 'PUT' : 'POST', body: JSON.stringify({ ...input, publish }) }),
  /** EVT-010. Ticket holders are refunded by the backend. */
  cancelEvent: (id: string, reason: string): Promise<HikeEvent> =>
    USE_MOCKS ? mock(() => mockAdmin.cancelEvent(id, reason), 500) : post(`/api/admin/events/${id}/cancel`, { reason }),
  participants: (eventId: string): Promise<ParticipantsData> =>
    USE_MOCKS ? mock(() => mockAdmin.participants(eventId)) : api(`/api/admin/events/${eventId}/participants`),
  correctAttendance: (eventId: string, body: AttendanceCorrection): Promise<ParticipantRow> =>
    USE_MOCKS ? mock(() => mockAdmin.correctAttendance(eventId, body), 400) : post(`/api/admin/events/${eventId}/attendance`, body),
  checkinSettings: (): Promise<CheckinSettings> => (USE_MOCKS ? mock(() => mockAdmin.checkinSettings()) : api('/api/admin/checkin/settings')),
  saveCheckinSettings: (settings: CheckinSettings): Promise<CheckinSettings> =>
    USE_MOCKS ? mock(() => mockAdmin.saveCheckinSettings(settings), 400) : api('/api/admin/checkin/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  devices: (): Promise<StaffDevice[]> => (USE_MOCKS ? mock(() => mockAdmin.devices()) : api('/api/admin/checkin/devices')),
  syncReview: (eventId: string): Promise<SyncReview> => (USE_MOCKS ? mock(() => mockAdmin.syncReview(eventId)) : api(`/api/admin/checkin/${eventId}/sync`)),
  resolveConflict: (id: string, decision: NonNullable<SyncConflict['resolution']>, reason?: string): Promise<SyncConflict> =>
    USE_MOCKS ? mock(() => mockAdmin.resolveConflict(id, decision, reason), 400) : post(`/api/admin/checkin/conflicts/${id}/resolve`, { decision, reason }),
  /** Event cover image. Returns the URL to save with the event. */
  uploadCover: async (file: File): Promise<{ url: string }> => {
    if (USE_MOCKS) {
      const { shrinkImage } = await import('@/lib/images');
      const url = await shrinkImage(file, 1200, 675);
      return mock(() => ({ url }), 300);
    }
    const form = new FormData();
    form.append('image', file);
    return api('/api/admin/uploads/cover', { method: 'POST', body: form });
  },
  /** Upcoming events and whether each has a supervisor PIN. The PIN itself is never returned. */
  supervisorPins: (): Promise<SupervisorPinStatus[]> => (USE_MOCKS ? mock(() => mockCheckin.pinStatuses()) : api('/api/admin/checkin/pins')),
  /** Super admins only. The server keeps a salted hash and sends phones only that hash. */
  setSupervisorPin: (eventId: string, pin: string): Promise<SupervisorPinStatus> =>
    USE_MOCKS ? delay(null, 400).then(() => mockCheckin.setPin(eventId, pin)) : api(`/api/admin/checkin/pins/${eventId}`, { method: 'PUT', body: JSON.stringify({ pin }) }),
  /** Admin / Analytics (ANA-001..ANA-033). Counts from check-ins only, never ticket sales. */
  analytics: (q: AnalyticsQuery): Promise<AnalyticsReport> =>
    USE_MOCKS
      ? mock(() => mockAdmin.analytics(q), 350)
      : api(`/api/admin/analytics?${new URLSearchParams({ from: q.from, to: q.to, prevFrom: q.prevFrom, prevTo: q.prevTo, granularity: q.granularity, ...(q.eventId ? { eventId: q.eventId } : {}) })}`),
  /** ADM-005: the server refuses changes to the caller's own role. */
  setStaffRole: (userId: string, roles: Role[]): Promise<void> =>
    USE_MOCKS ? mock(() => mockAdmin.setStaffRole(userId, roles)) : api(`/api/admin/staff/${userId}/roles`, { method: 'PUT', body: JSON.stringify({ roles }) }),
};

// --- Admin, phase 7a: transactions, hikers, search, staff ---

export type TransactionStatus = 'successful' | 'pending' | 'failed' | 'refund_requested' | 'refunded';

/** One Paystack payment (one ticket). Amounts in kobo; `amountKobo` is what was charged (ticket + fee). */
export interface TransactionRow {
  reference: string;
  ticketCode?: string;
  buyerName: string;
  buyerEmail?: string;
  eventId: string;
  eventTitle: string;
  ticketKobo: number;
  feeKobo: number;
  amountKobo: number;
  status: TransactionStatus;
  createdAt: ISODate;
  refund?: {
    amountKobo: number;
    requestedAt: ISODate;
    reason?: string;
    decision?: 'approved' | 'declined';
    decidedAt?: ISODate;
    decidedBy?: string;
    note?: string;
  };
}

export interface TransactionsQuery {
  /** Abuja calendar dates, inclusive. */
  from: string;
  to: string;
  status: 'all' | TransactionStatus;
  q?: string;
  page?: number;
  /** Every matching row (CSV export). */
  all?: boolean;
}

/**
 * Totals for the period and status filter. Pending and failed payments are never counted as sales (ANA-028).
 * gross = amounts charged for successful payments (incl. later refunded); net = gross − refunds − Paystack fees.
 */
export interface TransactionsSummary {
  grossKobo: number;
  previousGrossKobo: number;
  refundsKobo: number;
  refundCount: number;
  feesKobo: number;
  netKobo: number;
  pendingCount: number;
  failedCount: number;
  refundRequests: number;
}

export interface TransactionsPage extends Paginated<TransactionRow> {
  summary: TransactionsSummary;
}

export type HikerStatus = 'active' | 'first_timer' | 'guest' | 'unverified' | 'suspended';

export interface HikerRow {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isGuest: boolean;
  joinedAt: ISODate;
  /** Check-ins only. */
  hikesAttended: number;
  lastHike?: { eventTitle: string; at: ISODate };
  status: HikerStatus;
}

export interface HikersQuery {
  q?: string;
  kind: 'all' | 'accounts' | 'guests';
  status: 'any' | HikerStatus;
  page?: number;
  all?: boolean;
}

export interface HikersPage extends Paginated<HikerRow> {
  totals: { accounts: number; guests: number; activeThisMonth: number };
}

export interface HikerParticipation {
  eventId: string;
  eventTitle: string;
  startsAt: ISODate;
  ticketCode: string;
  ticketTypeName: string;
  priceKobo: number;
  outcome: 'attended' | 'no_show' | 'refunded' | 'cancelled' | 'upcoming';
  checkIn?: { at: ISODate; method: CheckInMethod; staffName: string };
}

export interface AdminHikerProfile {
  hiker: HikerRow & {
    userId?: string;
    emailVerified?: boolean;
    phoneVerified?: boolean;
    emergencyContact?: { name: string; phone: string };
    suspension?: { reason: string; at: ISODate; by: string };
  };
  /** attended ÷ eligible (attended + no-shows) is the attendance rate (lib/metrics). */
  stats: { attended: number; eligible: number; spentKobo: number };
  monthly: { label: string; count: number }[];
  history: HikerParticipation[];
}

/** Top-bar search. The server only returns what the caller may see (SRCH-008). */
export interface AdminSearchResult {
  hikers: { id: string; name: string; email?: string; isGuest: boolean }[];
  tickets: { code: string; holderName: string; eventId: string; eventTitle: string; status: string }[];
}

export type StaffStatus = 'active' | 'invited' | 'deactivated';

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  status: StaffStatus;
  lastActiveAt?: ISODate;
  twoFactor: { setUp: boolean; setUpAt?: ISODate };
  isYou: boolean;
}

export interface AuthenticatorSetup {
  /** Base32 secret, for typing into the app by hand. */
  secret: string;
  /** otpauth:// URI shown as a QR code. */
  otpauthUri: string;
}

export const adminPeopleApi = {
  transactions: (q: TransactionsQuery): Promise<TransactionsPage> =>
    USE_MOCKS ? mock(() => mockFinance.transactions(q)) : api(`/api/admin/transactions?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))}`),
  /** Approve or decline a refund request. A reason is required either way and goes to the audit log. */
  reviewRefund: (reference: string, decision: 'approve' | 'decline', reason: string): Promise<TransactionRow> =>
    USE_MOCKS ? mock(() => mockFinance.reviewRefund(reference, decision, reason), 400) : post(`/api/admin/transactions/${reference}/refund`, { decision, reason }),
  hikers: (q: HikersQuery): Promise<HikersPage> =>
    USE_MOCKS ? mock(() => mockPeople.hikers(q)) : api(`/api/admin/hikers?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))}`),
  hiker: (id: string): Promise<AdminHikerProfile | null> =>
    USE_MOCKS
      ? mock(() => mockPeople.hiker(id))
      : api<AdminHikerProfile>(`/api/admin/hikers/${encodeURIComponent(id)}`).catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        }),
  /** Accounts only. A reason is required and written to the audit log. */
  setHikerSuspended: (id: string, suspended: boolean, reason: string): Promise<AdminHikerProfile> =>
    USE_MOCKS ? mock(() => mockPeople.setSuspended(id, suspended, reason), 400) : post(`/api/admin/hikers/${encodeURIComponent(id)}/${suspended ? 'suspend' : 'reactivate'}`, { reason }),
  search: (q: string): Promise<AdminSearchResult> => (USE_MOCKS ? mock(() => mockPeople.search(q), 120) : api(`/api/admin/search?q=${encodeURIComponent(q)}`)),
  staff: (): Promise<StaffMember[]> => (USE_MOCKS ? mock(() => mockStaffAdmin.list()) : api('/api/admin/staff')),
  inviteStaff: (body: { name: string; email: string; role: StaffRole }): Promise<StaffMember> =>
    USE_MOCKS ? mock(() => mockStaffAdmin.invite(body), 400) : post('/api/admin/staff/invites', body),
  resendInvite: (id: string): Promise<void> => (USE_MOCKS ? mock(() => mockStaffAdmin.resendInvite(id)) : post(`/api/admin/staff/invites/${id}/resend`, {})),
  /** ADM-005: never your own role; the last active super admin can't be demoted. */
  changeRole: (id: string, role: StaffRole): Promise<StaffMember> =>
    USE_MOCKS ? mock(() => mockStaffAdmin.changeRole(id, role), 300) : api(`/api/admin/staff/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
  setStaffActive: (id: string, active: boolean): Promise<StaffMember> =>
    USE_MOCKS ? mock(() => mockStaffAdmin.setActive(id, active), 300) : post(`/api/admin/staff/${id}/${active ? 'activate' : 'deactivate'}`, {}),
  /** Makes a staff member set up their authenticator again at their next sign-in. */
  resetTwoFactor: (id: string): Promise<StaffMember> => (USE_MOCKS ? mock(() => mockStaffAdmin.resetTwoFactor(id), 300) : post(`/api/admin/staff/${id}/two-factor/reset`, {})),
  /** Your own authenticator: a new secret to scan, then confirm with a code from the app. */
  startAuthenticatorSetup: (): Promise<AuthenticatorSetup> => (USE_MOCKS ? mock(() => mockStaffAdmin.startTotp()) : post('/api/admin/me/two-factor', {})),
  confirmAuthenticator: (code: string): Promise<StaffMember> =>
    USE_MOCKS ? mock(() => mockStaffAdmin.confirmTotp(code), 300) : post('/api/admin/me/two-factor/confirm', { code }),
};

/** The group's brand (Admin / Branding): colours, name, logo and contact details. Public, read at startup. */
export interface Branding extends BrandDetails {
  updatedBy?: string;
  colors: BrandColors;
  updatedAt?: ISODate;
}

export const brandingApi = {
  /** Public. The app falls back to the defaults in lib/brandDefaults.ts if this fails. */
  get: (): Promise<Branding> => (USE_MOCKS ? delay(mockBranding()) : api('/api/branding')),
  /** Admin / Branding. Replaces the whole brand; the server audit-logs which fields changed. */
  save: (input: BrandingInput): Promise<Branding> =>
    USE_MOCKS ? mock(() => mockBrandingAdmin.save(input), 400) : api('/api/admin/branding', { method: 'PUT', body: JSON.stringify(input) }),
  /** Logo (SVG, PNG or WebP), favicon (SVG, PNG or ICO) or homepage banner (JPG, PNG or WebP). Returns the URL to save. */
  upload: async (kind: BrandAssetKind, file: File): Promise<{ url: string }> => {
    if (USE_MOCKS) {
      const { mockBrandAsset } = await import('./mock/branding');
      return delay(null, 300).then(() => mockBrandAsset(kind, file));
    }
    const form = new FormData();
    form.append('file', file);
    return api(`/api/admin/branding/assets/${kind}`, { method: 'POST', body: form });
  },
};

export type BrandAssetKind = 'logo' | 'favicon' | 'banner';
export type BrandingInput = Omit<Branding, 'updatedAt' | 'updatedBy'>;

// --- Admin ticket detail (TKT-020) ---

export interface AdminTicketDetail {
  code: string;
  status: 'confirmed' | 'checked_in' | 'refund_requested' | 'refunded' | 'cancelled';
  event: { id: string; title: string; startsAt: ISODate; status: HikeEvent['status'] };
  ticketTypeName: string;
  holder: { name: string; email?: string; phone?: string; isGuest: boolean; hikerId?: string };
  /** Absent for staff who can't see transactions. */
  payment?: TransactionRow;
  checkIn?: ParticipantRow['checkIn'];
  issue?: ParticipantRow['issue'];
  /** Oldest first: issue, refund, check-in, corrections, re-entries. */
  history: { at: ISODate; label: string; by?: string; detail?: string }[];
}

export const adminTicketsApi = {
  detail: async (code: string): Promise<AdminTicketDetail | null> => {
    if (USE_MOCKS) {
      const { mockTicketDetail } = await import('./mock/ticketDetail');
      return delay(null).then(() => mockTicketDetail(code));
    }
    return api<AdminTicketDetail>(`/api/admin/tickets/${encodeURIComponent(code)}`).catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    });
  },
};

// --- About & contact (WEB-005) ---

export interface AboutStats {
  hikesRun: number;
  members: number;
  guides: number;
  seriousIncidents: number;
}

export interface ContactMessage {
  name: string;
  email: string;
  message: string;
  /** Honeypot: real people leave it empty; the server drops messages that fill it. */
  website?: string;
}

export const aboutApi = {
  /** Public. Hikes run and members come from the data (check-ins, accounts); guides and incidents are admin-set. */
  stats: (): Promise<AboutStats> => (USE_MOCKS ? mock(() => ({ hikesRun: 156, members: 2480, guides: 12, seriousIncidents: 0 })) : api('/api/about/stats')),
  /** Public. The server rate-limits by IP, emails the group's contact address and replies to the sender. */
  contact: (body: ContactMessage): Promise<{ reference: string }> =>
    USE_MOCKS ? mockNet(() => mockContact(body), 600) : post('/api/contact', body),
};

function mockContact(body: ContactMessage) {
  if (body.website) return { reference: 'ignored' }; // looks sent to a bot
  if (body.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) || body.message.trim().length < 10) throw new ApiError(400, 'Check the form and try again.');
  return { reference: `MSG-${Math.random().toString(36).slice(2, 7).toUpperCase()}` };
}

// --- Ads (phase 7b) ---

export type AdTab = 'all' | AdCampaign['status'];
/** Campaigns whose schedule overlaps the chosen month. */
export type AdSchedule = 'any' | 'this_month' | 'next_month' | 'last_month';

export interface AdsQuery {
  tab: AdTab;
  schedule: AdSchedule;
  q?: string;
}

export interface AdsList {
  items: AdCampaign[];
  /** For the tabs, before the tab filter (search and schedule applied). */
  counts: Record<AdTab, number>;
  /** Last 30 days vs the 30 before, across the campaigns this person can see. */
  summary: { impressions: number; impressionsPrev: number; clicks: number; clicksPrev: number; activePlacements: number; placements: number };
}

export interface AdInput {
  name: string;
  headline: string;
  description: string;
  mediaUrl?: string;
  destinationUrl: string;
  placement: AdCampaign['placement'];
  startsAt: ISODate;
  endsAt: ISODate;
  /** Admins only: the advertiser account, or none for a direct sponsor. Advertisers always own what they create. */
  advertiserId?: string | null;
  advertiserName: string;
}

export interface AdDay {
  date: string;
  impressions: number;
  clicks: number;
}

export interface AdPerformance {
  ad: AdCampaign;
  daily: AdDay[];
  /** The days shown (Abuja dates, inclusive): the requested range clipped to the campaign's run. */
  range: { from: string; to: string };
  /** Totals for the range, and for the same number of days just before it (for the change badges). */
  totals: { impressions: number; clicks: number };
  previous: { from: string; to: string; impressions: number; clicks: number };
  /** Placement split by device for the range, e.g. "Homepage (desktop)". */
  byPlacement: { label: string; impressions: number; clicks: number }[];
  /** null before the start and after the end. */
  daysLeft: number | null;
}

export interface AdSlotInfo {
  /** Other approved campaigns in the same placement whose dates overlap. */
  others: number;
}

export interface AdImage {
  url: string;
  width: number;
  height: number;
  bytes: number;
  name: string;
}

export const adsApi = {
  /** Public: approved campaigns running now for the placement (never paused, pending or out of schedule). */
  forPlacement: (placement: AdCampaign['placement']): Promise<PublicAd[]> =>
    USE_MOCKS ? mock(() => mockAdsServer.live(placement), 150) : api(`/api/ads?placement=${placement}`),
  /** ADS-013/014. The client only sends an impression after 50% visibility for 1 second. */
  track: (adId: string, type: 'impression' | 'click', device: 'desktop' | 'mobile') =>
    USE_MOCKS ? mock(() => mockAdsServer.track(adId, type, device), 0) : post<void>(`/api/ads/${adId}/events`, { type, device }),
};

export const adsAdminApi = {
  /** Advertisers get their own campaigns only; the server filters. */
  list: (q: AdsQuery): Promise<AdsList> =>
    USE_MOCKS ? mock(() => mockAdsServer.list(q)) : api(`/api/admin/ads?${new URLSearchParams({ tab: q.tab, schedule: q.schedule, ...(q.q ? { q: q.q } : {}) })}`),
  get: (id: string): Promise<AdCampaign | null> =>
    USE_MOCKS
      ? mock(() => mockAdsServer.get(id))
      : api<AdCampaign>(`/api/admin/ads/${id}`).catch((err: unknown) => {
          if (err instanceof ApiError && err.status === 404) return null;
          throw err;
        }),
  /** ADS-016: performance for a date range (Abuja dates); without one, the campaign's whole run so far. */
  performance: (id: string, range?: { from: string; to: string }): Promise<AdPerformance> =>
    USE_MOCKS ? mock(() => mockAdsServer.performance(id, range)) : api(`/api/admin/ads/${id}/performance${range ? `?${new URLSearchParams(range)}` : ''}`),
  /**
   * Create (id null) or update. `submit`: an advertiser's campaign goes to "Pending approval"; an admin's goes live on
   * its dates. Without `submit` a new or unapproved campaign is saved as a draft. An advertiser editing an approved
   * campaign sends it back for approval.
   */
  save: (id: string | null, input: AdInput, submit: boolean): Promise<AdCampaign> =>
    USE_MOCKS
      ? mock(() => mockAdsServer.save(id, input, submit), 400)
      : api(id ? `/api/admin/ads/${id}` : '/api/admin/ads', { method: id ? 'PUT' : 'POST', body: JSON.stringify({ ...input, submit }) }),
  /** Admins. A reason is required to reject and is shown to the advertiser; both go to the audit log. */
  review: (id: string, decision: 'approve' | 'reject', reason?: string): Promise<AdCampaign> =>
    USE_MOCKS ? mock(() => mockAdsServer.review(id, decision, reason), 400) : post(`/api/admin/ads/${id}/review`, { decision, reason }),
  setPaused: (id: string, paused: boolean): Promise<AdCampaign> =>
    USE_MOCKS ? mock(() => mockAdsServer.setPaused(id, paused), 300) : post(`/api/admin/ads/${id}/${paused ? 'pause' : 'resume'}`, {}),
  /** Admins. Ends the campaign for good; a reason is required. */
  terminate: (id: string, reason: string): Promise<AdCampaign> =>
    USE_MOCKS ? mock(() => mockAdsServer.terminate(id, reason), 400) : post(`/api/admin/ads/${id}/terminate`, { reason }),
  slotInfo: (placement: AdCampaign['placement'], startsAt: string, endsAt: string, excludeId?: string): Promise<AdSlotInfo> =>
    USE_MOCKS
      ? mock(() => mockAdsServer.slotInfo(placement, startsAt, endsAt, excludeId), 120)
      : api(`/api/admin/ads/slot?${new URLSearchParams({ placement, startsAt, endsAt, ...(excludeId ? { excludeId } : {}) })}`),
  /** The server requests the URL (HEAD, then GET) and reports whether it answered. */
  checkLink: (url: string): Promise<{ reachable: boolean }> => (USE_MOCKS ? mock(() => mockAdsServer.checkLink(url), 500) : post('/api/admin/ads/check-link', { url })),
  /** Admins: advertiser accounts to pick an owner from. */
  advertisers: (): Promise<{ id: string; name: string }[]> => (USE_MOCKS ? mock(() => mockAdsServer.advertisers()) : api('/api/admin/ads/advertisers')),
  uploadImage: async (file: File): Promise<AdImage> => {
    if (USE_MOCKS) {
      const { shrinkImage } = await import('@/lib/images');
      const url = await shrinkImage(file, 1200, 400);
      const img = await createImageBitmap(file);
      return mock(() => ({ url, width: img.width, height: img.height, bytes: file.size, name: file.name }), 300);
    }
    const form = new FormData();
    form.append('image', file);
    return api('/api/admin/uploads/ad-image', { method: 'POST', body: form });
  },
};

// --- Notifications (phase 7b) ---

export type NotificationChannel = 'email' | 'sms' | 'whatsapp';
export type MessageType = 'registration' | 'verification' | 'ticket' | 'reminder' | 'event_change' | 'payment' | 'promotions';

export interface MessageSetting {
  type: MessageType;
  label: string;
  /** Transactional messages always go by email (NOT-011). Promotional ones reach only hikers who opted in (NOT-010). */
  category: 'transactional' | 'promotional';
  channels: Record<NotificationChannel, boolean>;
}

export interface NotificationProvider {
  channel: NotificationChannel;
  provider: string;
  /** From address, sender ID or business number. */
  sender: string;
  status: 'connected' | 'pending' | 'not_connected';
  /** The API key is write-only; only its last four characters come back. */
  keyLast4?: string;
  updatedAt?: ISODate;
}

export interface NotificationSettings {
  messages: MessageSetting[];
  providers: NotificationProvider[];
}

export interface ProviderInput {
  provider: string;
  sender: string;
  /** Leave empty to keep the saved key. */
  apiKey?: string;
}

export const notificationsApi = {
  get: (): Promise<NotificationSettings> => (USE_MOCKS ? mock(() => mockNotifications.get()) : api('/api/admin/notifications')),
  /** The server keeps transactional email on whatever is sent, and channels without a connected provider off. */
  saveMessages: (messages: MessageSetting[]): Promise<NotificationSettings> =>
    USE_MOCKS ? mock(() => mockNotifications.saveMessages(messages), 400) : api('/api/admin/notifications', { method: 'PUT', body: JSON.stringify({ messages }) }),
  configure: (channel: NotificationChannel, input: ProviderInput): Promise<NotificationSettings> =>
    USE_MOCKS ? mock(() => mockNotifications.configure(channel, input), 500) : api(`/api/admin/notifications/providers/${channel}`, { method: 'PUT', body: JSON.stringify(input) }),
  sendTest: (channel: NotificationChannel, to: string): Promise<{ sentTo: string }> =>
    USE_MOCKS ? mock(() => mockNotifications.sendTest(channel, to), 700) : post(`/api/admin/notifications/providers/${channel}/test`, { to }),
};

/** NOT-009: one message as the provider reported it. */
export interface DeliveryRecord {
  id: string;
  at: ISODate;
  recipientName?: string;
  /** Email address or phone number. */
  recipient: string;
  type: MessageType | 'test';
  channel: NotificationChannel;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced';
  /** Provider reason for a failure or bounce. */
  error?: string;
  /** Ticket, event or payment the message was about. */
  reference?: string;
}

export interface DeliveryQuery {
  q?: string;
  type?: MessageType | 'test';
  channel?: NotificationChannel;
  status?: DeliveryRecord['status'];
  /** Abuja dates, inclusive. */
  from?: string;
  to?: string;
  page: number;
}

export interface DeliveryPage {
  items: DeliveryRecord[];
  total: number;
  page: number;
  pageSize: number;
  /** Counts for the filtered period, by status. */
  summary: Record<DeliveryRecord['status'], number>;
}

export const deliveryLogApi = {
  list: (q: DeliveryQuery): Promise<DeliveryPage> =>
    USE_MOCKS
      ? mock(() => mockNotifications.log(q))
      : api(`/api/admin/notifications/log?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))}`),
};

// --- Audit log (phase 7b). Read-only: there is no endpoint to edit or delete an entry. ---

export interface AuditQuery {
  q?: string;
  /** An action code ("refund.approved") or a group ("group:refunds"). */
  action?: string;
  actorId?: string;
  /** Abuja dates, inclusive. */
  from?: string;
  to?: string;
  page: number;
  all?: boolean;
}

export interface AuditPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  /** Everyone who appears in the log, for the staff filter. */
  actors: { id: string; name: string }[];
}

export const auditApi = {
  list: (q: AuditQuery): Promise<AuditPage> =>
    USE_MOCKS
      ? mock(() => mockAudit.list(q))
      : api(`/api/admin/audit-log?${new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]))}`),
};
