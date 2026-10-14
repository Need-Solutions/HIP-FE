import type { PinHash } from '@/lib/pin';

// Domain types mirror SRS section 4 (Data Requirements).
// Keep these in sync with the backend API contract once it exists.

export type ID = string;

/** Page of results from a list endpoint (SRCH-007). `page` is 1-based. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export type ISODate = string; // stored in UTC, displayed in Africa/Lagos

export type Role = 'hiker' | 'admin' | 'super_admin' | 'checkin_staff' | 'advertiser';
export type AccountStatus = 'active' | 'unverified' | 'suspended' | 'deactivated';

export interface User {
  id: ID;
  fullName: string;
  email: string;
  phone: string;
  roles: Role[];
  status: AccountStatus;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: ISODate;
}

/** Someone who bought without an account (guest checkout), or any buyer's contact. Matched by email/phone. */
export interface GuestContact {
  fullName: string;
  email: string;
  phone: string;
}

/**
 * The person a ticket is for. Attendance and hiking history are per person, so every ticket names its own
 * holder. Email/phone are optional for extra attendees; when given, the backend links the ticket (and later
 * check-ins) to that person's account, or merges it when they sign up.
 */
export interface TicketHolder {
  fullName: string;
  email?: string;
  phone?: string;
}

export type Difficulty = 'easy' | 'moderate' | 'challenging';
export type EventStatus = 'draft' | 'published' | 'sales_closed' | 'completed' | 'cancelled';

export interface HikeEvent {
  id: ID;
  slug: string;
  title: string;
  description: string;
  coverImageUrl?: string;
  startsAt: ISODate;
  durationLabel: string;
  meetingPoint: string;
  location: string;
  difficulty: Difficulty;
  capacity: number;
  registrationDeadline: ISODate;
  requiredEquipment: string[];
  emergencyInfo: string;
  requirements: string;
  status: EventStatus;
  ticketsSold: number;
  /** Cheapest active ticket type, for event cards. 0 = free. */
  fromPriceKobo: number;
  distanceKm?: number;
  elevationM?: number;
}

export interface TicketType {
  id: ID;
  eventId: ID;
  name: string;
  description: string;
  priceKobo: number; // 0 = free. Money is stored in kobo (integer).
  currency: 'NGN';
  quantityLimit: number;
  quantitySold: number;
  salesStart: ISODate;
  salesEnd: ISODate;
  status: 'active' | 'paused' | 'sold_out';
}

export type TicketStatus = 'pending' | 'confirmed' | 'checked_in' | 'cancelled' | 'refunded' | 'expired';

export interface Ticket {
  id: ID;
  code: string; // human-readable, e.g. HIP-7Q4K-2291
  eventId: ID;
  ticketTypeId: ID;
  holderUserId?: ID; // undefined for guest purchases
  holder: TicketHolder; // the person attending (snapshot at purchase time); may differ from the buyer
  isGuest: boolean;
  paymentId?: ID;
  /** Signed token encoded in the QR. Contains no personal data (TKT-018). */
  qrToken: string;
  status: TicketStatus;
  issuedAt: ISODate;
}

/** Ticket plus what's needed to show it on its own (GET /api/tickets/:code, checkout confirmation). */
export interface TicketDetails extends Ticket {
  ticketTypeName: string;
  event: Pick<HikeEvent, 'id' | 'slug' | 'title' | 'startsAt' | 'durationLabel' | 'meetingPoint' | 'location' | 'coverImageUrl'>;
}

export type RefundStatus = 'requested' | 'refunded' | 'declined';

/** A refund on one ticket (TKT-021). The amount follows the refund policy; the backend calculates it. */
export interface RefundInfo {
  status: RefundStatus;
  amountKobo: number;
  requestedAt: ISODate;
  processedAt?: ISODate;
  reason?: string;
}

/** A ticket in the signed-in hiker's account (GET /api/me/tickets): ones they hold, and ones they bought for others. */
export interface MyTicket extends TicketDetails {
  eventStatus: EventStatus;
  /** What this ticket cost, without the Paystack fee (the fee isn't refunded). */
  pricePaidKobo: number;
  /** The signed-in hiker is the attendee. False for tickets they bought for someone else. */
  heldByMe: boolean;
  /** The signed-in hiker paid. Refunds go back to whoever paid, so only they can request one. */
  boughtByMe: boolean;
  checkIn?: { at: ISODate; method: CheckInMethod };
  refund?: RefundInfo;
}

/** An order waiting for payment. Tickets are issued only once the backend verifies it (TKT-010). */
export interface PendingOrder {
  checkoutId: string;
  reference: string;
  event: TicketDetails['event'];
  lines: { ticketTypeId: ID; ticketTypeName: string; quantity: number }[];
  amountKobo: number;
  paymentChannel: PaymentChannel;
  /** Paystack needs the payer's email to reopen the payment. */
  buyerEmail: string;
  /** Seats are released at this time if payment hasn't arrived (TKT-006). */
  holdExpiresAt: ISODate;
}

/**
 * One booking in a hiker's history (HIS-001..HIS-008). Outcomes come from check-ins only: a booking without a
 * check-in is "missed", a refunded booking is "refunded". Only "attended" counts as a hike.
 */
export type HikeOutcome = 'attended' | 'missed' | 'refunded';

export interface HistoryEntry {
  ticketCode: string;
  ticketTypeName: string;
  pricePaidKobo: number;
  event: Pick<HikeEvent, 'id' | 'slug' | 'title' | 'startsAt' | 'location' | 'distanceKm'>;
  outcome: HikeOutcome;
  checkIn?: { at: ISODate; method: CheckInMethod };
}

export type ReminderChannel = 'email_whatsapp' | 'email' | 'whatsapp';

/** NOT-010: ticket confirmations are required; reminders can be turned off; promotions are opt-in (off by default). */
export interface NotificationPrefs {
  ticketConfirmations: true;
  reminders: boolean;
  reminderChannel: ReminderChannel;
  promotions: boolean;
}

/** A new email or phone waiting for its code. The old one stays in use until then (AUTH-017). */
export interface PendingContactChange {
  verificationId: string;
  field: 'email' | 'phone';
  value: string;
  resendAvailableAt: ISODate;
}

export interface HikerProfile {
  user: User;
  /** YYYY-MM-DD */
  dateOfBirth?: string;
  emergencyContact?: { name: string; phone: string };
  photoUrl?: string;
  /** Checked-in hikes only. */
  hikesAttended: number;
  notifications: NotificationPrefs;
  pendingContacts: PendingContactChange[];
}

/** Payment options offered at checkout, passed to Paystack as `channels`. */
export type PaymentChannel = 'card' | 'bank_transfer' | 'ussd';

export type PaymentStatus = 'pending' | 'successful' | 'failed' | 'refund_requested' | 'refunded';

export interface Payment {
  id: ID;
  provider: 'paystack';
  providerReference: string;
  amountKobo: number;
  feeKobo: number;
  currency: 'NGN';
  status: PaymentStatus;
  paidAt?: ISODate;
  ticketIds: ID[];
}

export type CheckInMethod = 'qr' | 'qr_offline' | 'manual';

/** A re-entry approved with the event's supervisor PIN (shown in sync review and the audit log). */
export interface ReentryRecord {
  ticketCode: string;
  holderName: string;
  at: ISODate;
  staffName: string;
  gate?: string;
  /** Approved on a phone with no signal, checked against the downloaded PIN hash. */
  offline: boolean;
}

/** Supervisor PIN status per event (Admin / Check-in settings). The PIN itself is never returned. */
export interface SupervisorPinStatus {
  eventId: ID;
  eventTitle: string;
  startsAt: ISODate;
  setAt?: ISODate;
  setBy?: string;
}
export type AttendanceStatus = 'checked_in' | 'flagged' | 'voided';

export interface Attendance {
  id: ID;
  eventId: ID;
  ticketId: ID;
  hikerUserId?: ID;
  checkedInAt: ISODate;
  method: CheckInMethod;
  staffUserId: ID;
  deviceId?: string;
  status: AttendanceStatus;
  correctionReason?: string;
}

/**
 * Display status, worked out by the server from the stored state and today's date: an approved campaign is
 * "scheduled" before its start, "active" during it and "completed" after its end (or once ended early).
 */
export type AdStatus = 'draft' | 'pending_approval' | 'scheduled' | 'active' | 'paused' | 'rejected' | 'completed';
export type AdPlacement = 'homepage_banner' | 'event_page';

export interface AdCampaign {
  id: ID;
  name: string;
  headline: string;
  description: string;
  mediaUrl?: string;
  destinationUrl: string;
  placement: AdPlacement;
  startsAt: ISODate;
  endsAt: ISODate;
  status: AdStatus;
  /** Lifetime totals. Impressions count only when the ad was at least 50% visible for 1 second (ADS-013). */
  impressions: number;
  clicks: number;
  /** The advertiser account that owns the campaign; empty for a sponsor without an account (managed by admins). */
  advertiserId?: ID;
  advertiserName: string;
  createdBy: { id: ID; name: string };
  createdAt: ISODate;
  submittedAt?: ISODate;
  approval?: { by: string; at: ISODate; note?: string };
  rejection?: { by: string; at: ISODate; reason: string };
  pausedAt?: ISODate;
  endedEarly?: { by: string; at: ISODate; reason: string };
}

/** What the public site gets for a placement: no stats, owners or review history. */
export type PublicAd = Pick<AdCampaign, 'id' | 'headline' | 'description' | 'mediaUrl' | 'destinationUrl' | 'placement' | 'advertiserName'>;

export interface AuditLogEntry {
  id: ID;
  actorUserId: ID;
  actorName: string;
  action: string;
  recordType: string;
  recordId: string;
  details: string;
  reason?: string;
  createdAt: ISODate;
  /** Human name of the record ("Zuma Rock Trail", "Dayo Ibe"), filled in by the server when listing. */
  recordLabel?: string;
}

/** Who made a scan, as shown on result sheets ("6:41 AM · Gate A · by Kunle O."). */
export interface ScanBy {
  at: ISODate;
  staffName: string;
  gate?: string;
}

export type InvalidReason = 'wrong_event' | 'cancelled' | 'refunded' | 'expired' | 'bad_signature' | 'not_hip' | 'unknown_ticket' | 'attendance_closed';

/** Result shown on the check-in scanner (online or offline). Matches the five "Check-in / Result – *" frames. */
export type ScanOutcome =
  | {
      kind: 'valid';
      offline: boolean;
      code: string;
      holderName: string;
      ticketTypeName: string;
      scan: ScanBy;
      flagged?: boolean;
      /** Re-entry of someone already checked in, approved with the supervisor PIN. Doesn't add to attendance. */
      reentry?: boolean;
    }
  | { kind: 'already_used'; code: string; holderName: string; ticketTypeName?: string; firstScan: ScanBy }
  | { kind: 'invalid'; reason: InvalidReason; code?: string; holderName?: string; eventTitle?: string; detail?: string }
  // Signature valid, but the ticket isn't in the list downloaded to this phone (probably sold after the download).
  | { kind: 'not_in_offline_list'; code: string };

/** An event a staff member can check in (GET /api/checkin/events). */
export interface CheckinEvent {
  event: Pick<HikeEvent, 'id' | 'slug' | 'title' | 'startsAt' | 'location' | 'meetingPoint' | 'coverImageUrl'>;
  confirmedTickets: number;
  /** The gate an admin assigned to this staff member, if any. Otherwise staff pick one from `gates`. */
  gate?: string;
  gates: string[];
  attendanceClosedAt?: ISODate;
  /** From Admin / Check-in settings. */
  offline: { allowed: boolean; autoDownload: boolean };
  /** Re-entry needs the supervisor PIN, and a PIN has been set for this event (Admin / Check-in settings). */
  reentry: { pinRequired: boolean; pinSet: boolean };
}

/** Admin / Check-in settings. Phones get the parts they need with each download (CheckinManifest.policy). */
export interface CheckinSettings {
  allowOffline: boolean;
  /** Phones refresh an event's list by themselves when its check-in opens. */
  autoDownload: boolean;
  /** Staff may admit (and flag) a validly signed ticket that isn't in the offline list. */
  admitNotInList: boolean;
  requireSupervisorPin: boolean;
  /** Default registration deadline for new events, in hours before the start. */
  closeSalesBeforeHours: number;
  offlineListTtlHours: number;
}

/** A staff phone as last reported to the server (Admin / Check-in settings → Staff devices). */
export interface StaffDevice {
  deviceId: string;
  label: string;
  gate?: string;
  staffName: string;
  /** The offline list on the phone, if any. */
  list?: { eventId: ID; eventTitle: string; downloadedAt: ISODate };
  unsynced: number;
  lastSeenAt: ISODate;
}

/** One upload from a phone (Admin / Offline sync review → Sync log). */
export interface SyncLogEntry {
  id: ID;
  eventId: ID;
  at: ISODate;
  deviceLabel: string;
  gate?: string;
  staffName: string;
  checkIns: number;
  accepted: number;
  duplicates: number;
  flagged: number;
  /** Re-entries approved with the supervisor PIN. */
  reentries: number;
}

/** One ticket in the offline list (TKT-018: names only, no email or phone). */
export interface ManifestTicket {
  code: string;
  eventId: ID;
  holderName: string;
  ticketTypeName: string;
  status: 'confirmed' | 'cancelled' | 'refunded';
  /** Set when the ticket was already checked in at download time. */
  checkedIn?: ScanBy;
  /** For refunded or cancelled tickets: when that happened. */
  statusChangedAt?: ISODate;
}

/** GET /api/checkin/:eventId/manifest: everything a phone needs to check in offline. */
export interface CheckinManifest {
  eventId: ID;
  eventTitle: string;
  eventStartsAt: ISODate;
  generatedAt: ISODate;
  /** Ticket sales stop here; tickets sold before then but after the download won't be in the list. */
  salesCloseAt: ISODate;
  /** The phone wipes the list at this time (default 24 hours, set in Admin / Check-in settings). */
  expiresAt: ISODate;
  policy: Pick<CheckinSettings, 'admitNotInList' | 'requireSupervisorPin'> & {
    /** Salted hash of the event's supervisor PIN, so phones can approve re-entry offline. Never the PIN itself. */
    supervisorPin?: PinHash;
  };
  /** The event's public signing key. The private key never leaves the server. */
  publicKeyJwk: JsonWebKey;
  tickets: ManifestTicket[];
}

/** Live counts for the scanner and Close attendance. Attendance comes only from check-ins (SRS 2.4 rule 5). */
export interface CheckinStats {
  confirmed: number;
  checkedIn: number;
  manual: number;
  attendanceClosedAt?: ISODate;
}

/** A check-in the server couldn't take at face value after a sync. An admin decides (CLAUDE.md "Offline check-in" 4). */
export interface SyncConflict {
  id: ID;
  eventId: ID;
  kind: 'duplicate' | 'not_in_list' | 'reported';
  ticketCode: string;
  holderName?: string;
  /** Every scan of the ticket, earliest first. The earliest is the one kept. */
  scans: ScanBy[];
  /** What the server found, e.g. "valid ticket, bought 5:20 AM". */
  serverNote?: string;
  note?: string;
  resolvedAt?: ISODate;
  /** What the admin decided (Admin / Offline sync review). */
  resolution?: 'kept_earliest' | 'confirmed' | 'rejected' | 'resolved';
  resolvedBy?: string;
}
