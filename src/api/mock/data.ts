import type { CheckInMethod, HikeEvent, Ticket, TicketType, User } from '@/types/domain';

// Sample data matching the Figma screens. Replace with real API calls later.

export const mockUser: User = {
  id: 'usr_00412',
  fullName: 'Adaeze Okafor',
  email: 'adaeze@example.com',
  phone: '+234 803 000 0000',
  roles: ['hiker'],
  status: 'active',
  emailVerified: true,
  phoneVerified: true,
  createdAt: '2025-03-02T09:00:00Z',
};

/** Staff accounts for /staff/login (mock password and 2-step code: see api/mock/auth.ts). */
export const mockStaff: User[] = [
  { id: 'usr_staff_1', fullName: 'Kunle Adeyemi', email: 'kunle@hip.ng', phone: '+2348020000001', roles: ['admin', 'super_admin'], status: 'active', emailVerified: true, phoneVerified: true, createdAt: '2025-01-10T09:00:00Z' },
  { id: 'usr_staff_2', fullName: 'Tola Bakare', email: 'tola@hip.ng', phone: '+2348020000002', roles: ['checkin_staff'], status: 'active', emailVerified: true, phoneVerified: true, createdAt: '2025-02-01T09:00:00Z' },
  // From Figma "Admin / Staff & roles".
  { id: 'usr_staff_3', fullName: 'Ife Martins', email: 'ife@hip.ng', phone: '+2348020000003', roles: ['admin'], status: 'active', emailVerified: true, phoneVerified: true, createdAt: '2025-03-15T09:00:00Z' },
  { id: 'usr_staff_4', fullName: 'Sola Peters', email: 'sola@hip.ng', phone: '+2348020000004', roles: ['checkin_staff'], status: 'active', emailVerified: true, phoneVerified: true, createdAt: '2025-06-01T09:00:00Z' },
  { id: 'usr_staff_5', fullName: 'Outdoor Hub', email: 'ads@outdoorhub.ng', phone: '+2348020000005', roles: ['advertiser'], status: 'active', emailVerified: true, phoneVerified: true, createdAt: '2026-02-10T09:00:00Z' },
];

const base = {
  description:
    'A guided trail walk with scenic stops and time to take in the views. We travel by coach from Abuja and return the same evening.',
  durationLabel: 'About 6 hrs',
  meetingPoint: 'Wuse Meeting Point, Abuja',
  requiredEquipment: ['Hiking shoes with good grip', '2 litres of water and snacks', 'Light rain jacket', 'Your HIP QR ticket'],
  emergencyInfo: 'Lead guide and a medic travel with the group.',
  requirements: 'Minimum age 16 (under 18s with a guardian). Basic fitness.',
};

export const mockEvents: HikeEvent[] = [
  { ...base, id: 'evt_1', slug: 'zuma-rock-trail', title: 'Zuma Rock Trail', startsAt: '2026-10-17T05:00:00Z', location: 'Zuma Rock, Niger', difficulty: 'moderate', capacity: 100, ticketsSold: 68, fromPriceKobo: 1_000_000, registrationDeadline: '2026-10-15T22:59:00Z', status: 'published', distanceKm: 8.5, elevationM: 137 },
  { ...base, id: 'evt_2', slug: 'gurara-waterfalls', title: 'Gurara Waterfalls', startsAt: '2026-10-25T04:30:00Z', location: 'Gurara, Niger', difficulty: 'challenging', capacity: 75, ticketsSold: 69, fromPriceKobo: 2_250_000, registrationDeadline: '2026-10-23T22:59:00Z', status: 'published' },
  { ...base, id: 'evt_3', slug: 'jabi-lake-walk', title: 'Jabi Lake Walk', startsAt: '2026-11-07T06:00:00Z', location: 'Jabi, Abuja', difficulty: 'easy', capacity: 60, ticketsSold: 60, fromPriceKobo: 0, registrationDeadline: '2026-11-05T22:59:00Z', status: 'sales_closed' },
  { ...base, id: 'evt_4', slug: 'bwari-hills-ascent', title: 'Bwari Hills Ascent', description: 'Explore the hills around Bwari with trained guides, scenic viewpoints and time to rest along the trail. Coach leaves Abuja on Friday night.', startsAt: '2026-11-14T04:00:00Z', durationLabel: '2 days', location: 'Bwari, Abuja', difficulty: 'challenging', capacity: 40, ticketsSold: 12, fromPriceKobo: 4_500_000, registrationDeadline: '2026-11-11T22:59:00Z', status: 'published', distanceKm: 14, elevationM: 914 },
  { ...base, id: 'evt_5', slug: 'kubwa-sunrise-trail', title: 'Kubwa Sunrise Trail', startsAt: '2026-11-21T04:30:00Z', location: 'Kubwa, Abuja', difficulty: 'moderate', capacity: 50, ticketsSold: 43, fromPriceKobo: 1_200_000, registrationDeadline: '2026-11-19T22:59:00Z', status: 'published', distanceKm: 7 },
  { ...base, id: 'evt_6', slug: 'abuja-heritage-walk', title: 'Abuja Heritage Walk', description: 'An easy walk through Abuja with stops to explore local culture and heritage. A local guide leads the group.', startsAt: '2026-11-28T07:00:00Z', durationLabel: 'About 5 hrs', location: 'Abuja, FCT', difficulty: 'easy', capacity: 80, ticketsSold: 21, fromPriceKobo: 800_000, registrationDeadline: '2026-11-26T22:59:00Z', status: 'published', distanceKm: 6 },
  { ...base, id: 'evt_7', slug: 'usuma-dam-trail', title: 'Usuma Dam Trail', startsAt: '2026-12-05T05:00:00Z', location: 'Bwari, Abuja', difficulty: 'moderate', capacity: 60, ticketsSold: 9, fromPriceKobo: 2_000_000, registrationDeadline: '2026-12-03T22:59:00Z', status: 'cancelled', distanceKm: 9 },
  { ...base, id: 'evt_8', slug: 'abuja-forest-walk', title: 'Abuja Forest Walk', startsAt: '2026-12-12T07:00:00Z', location: 'Jabi, Abuja', difficulty: 'easy', capacity: 70, ticketsSold: 5, fromPriceKobo: 500_000, registrationDeadline: '2026-12-10T22:59:00Z', status: 'published', distanceKm: 5 },
  { ...base, id: 'evt_9', slug: 'obudu-plateau-expedition', title: 'Obudu Plateau Expedition', description: 'Three days on the Obudu plateau: canopy walk, the Grotto waterfall and a summit hike. Flights not included.', startsAt: '2027-01-09T07:00:00Z', durationLabel: '3 days', location: 'Obudu, Cross River', difficulty: 'challenging', capacity: 30, ticketsSold: 4, fromPriceKobo: 9_500_000, registrationDeadline: '2026-12-31T22:59:00Z', status: 'published', distanceKm: 22, elevationM: 1576 },
  { ...base, id: 'evt_10', slug: 'aso-rock-ridge', title: 'Aso Rock Ridge', startsAt: '2026-09-26T05:30:00Z', location: 'Abuja, FCT', difficulty: 'challenging', capacity: 45, ticketsSold: 45, fromPriceKobo: 1_800_000, registrationDeadline: '2026-09-24T22:59:00Z', status: 'completed', distanceKm: 10, elevationM: 400 },
  { ...base, id: 'evt_11', slug: 'zuma-rock-september', title: 'Zuma Rock Day Trip', startsAt: '2026-09-12T05:00:00Z', location: 'Zuma Rock, Niger', difficulty: 'moderate', capacity: 100, ticketsSold: 91, fromPriceKobo: 1_000_000, registrationDeadline: '2026-09-10T22:59:00Z', status: 'completed', distanceKm: 8.5, elevationM: 137 },
  { ...base, id: 'evt_12', slug: 'kajuru-castle-hike', title: 'Kajuru Castle Hike', startsAt: '2026-08-29T06:00:00Z', location: 'Kajuru, Kaduna', difficulty: 'moderate', capacity: 35, ticketsSold: 30, fromPriceKobo: 2_500_000, registrationDeadline: '2026-08-27T22:59:00Z', status: 'completed', distanceKm: 11 },
  ...pastHikes(),
];

/**
 * Completed hikes behind Adaeze's history (Figma "Hiker / Hiking history"). Each gets Standard, With transport
 * and Student ticket types (or one free type), ids `tt_<eventId>_std|trn|stu|free`.
 */
function pastHikes(): HikeEvent[] {
  const rows: [n: number, slug: string, title: string, startsAt: string, location: string, km: number, priceKobo: number][] = [
    [1, 'jabi-lake-walk-mar-2025', 'Jabi Lake Walk', '2025-03-08T06:00:00Z', 'Jabi, Abuja', 4, 0],
    [2, 'abuja-heritage-walk-apr-2025', 'Abuja Heritage Walk', '2025-04-12T07:00:00Z', 'Abuja, FCT', 6, 800_000],
    [3, 'zuma-rock-may-2025', 'Zuma Rock Day Trip', '2025-05-24T05:00:00Z', 'Zuma Rock, Niger', 8.5, 1_000_000],
    [4, 'kubwa-sunrise-jul-2025', 'Kubwa Sunrise Trail', '2025-07-19T04:30:00Z', 'Kubwa, Abuja', 7, 1_200_000],
    [5, 'gurara-sep-2025', 'Gurara Waterfalls', '2025-09-13T04:30:00Z', 'Gurara, Niger', 12, 2_250_000],
    [6, 'abuja-forest-nov-2025', 'Abuja Forest Walk', '2025-11-15T07:00:00Z', 'Jabi, Abuja', 5, 500_000],
    [7, 'usuma-dam-jan-2026', 'Usuma Dam Loop', '2026-01-17T05:00:00Z', 'Bwari, Abuja', 9, 1_200_000],
    [8, 'zuma-rock-may-2026', 'Zuma Rock Day Trip', '2026-05-16T05:00:00Z', 'Zuma Rock, Niger', 8.5, 1_000_000],
    [9, 'jabi-lake-walk-jul-2026', 'Jabi Lake Walk', '2026-07-18T06:00:00Z', 'Jabi, Abuja', 4, 0],
    [10, 'zuma-rock-trail-aug-2026', 'Zuma Rock Trail', '2026-08-01T05:00:00Z', 'Zuma Rock, Niger', 8.5, 1_000_000],
    [11, 'gurara-aug-2026', 'Gurara Waterfalls', '2026-08-16T04:30:00Z', 'Gurara, Niger', 12, 2_250_000],
    [12, 'bwari-hills-trek-aug-2026', 'Bwari Hills Trek', '2026-08-29T04:00:00Z', 'Bwari, Abuja', 24, 3_500_000],
    [13, 'usuma-dam-sep-2026', 'Usuma Dam Loop', '2026-09-13T05:00:00Z', 'Bwari, Abuja', 9, 1_200_000],
    [14, 'kubwa-ridge-sep-2026', 'Kubwa Ridge Walk', '2026-09-26T04:30:00Z', 'Kubwa, Abuja', 10, 1_200_000],
    [15, 'jabi-lake-walk-oct-2026', 'Jabi Lake Walk', '2026-10-03T06:00:00Z', 'Jabi, Abuja', 4, 0],
    [16, 'abuja-forest-oct-2026', 'Abuja Forest Walk', '2026-10-10T07:00:00Z', 'Jabi, Abuja', 5, 500_000],
  ];
  return rows.map(([n, slug, title, startsAt, location, distanceKm, fromPriceKobo]) => ({
    ...base,
    id: `evt_p${n}`,
    slug,
    title,
    startsAt,
    location,
    distanceKm,
    fromPriceKobo,
    difficulty: distanceKm > 10 ? 'challenging' : distanceKm > 6 ? 'moderate' : 'easy',
    capacity: 60,
    ticketsSold: 52,
    registrationDeadline: startsAt,
    status: 'completed',
  }));
}

export const mockTicketTypes: TicketType[] = [
  { id: 'tt_1', eventId: 'evt_1', name: 'Standard', description: 'Trail access, guide and first aid', priceKobo: 1_500_000, currency: 'NGN', quantityLimit: 60, quantitySold: 40, salesStart: '2026-10-01T00:00:00Z', salesEnd: '2026-10-15T22:59:00Z', status: 'active' },
  { id: 'tt_2', eventId: 'evt_1', name: 'With transport', description: 'Return coach from Wuse Meeting Point', priceKobo: 2_200_000, currency: 'NGN', quantityLimit: 30, quantitySold: 22, salesStart: '2026-10-01T00:00:00Z', salesEnd: '2026-10-15T22:59:00Z', status: 'active' },
  { id: 'tt_3', eventId: 'evt_1', name: 'Student', description: 'Valid student ID required', priceKobo: 1_000_000, currency: 'NGN', quantityLimit: 10, quantitySold: 6, salesStart: '2026-10-01T00:00:00Z', salesEnd: '2026-10-15T22:59:00Z', status: 'active' },
  { id: 'tt_4', eventId: 'evt_2', name: 'Standard', description: 'Trail access, guide, first aid and return coach', priceKobo: 2_250_000, currency: 'NGN', quantityLimit: 60, quantitySold: 55, salesStart: '2026-10-01T00:00:00Z', salesEnd: '2026-10-23T22:59:00Z', status: 'active' },
  { id: 'tt_5', eventId: 'evt_2', name: 'Early bird', description: 'Same as Standard, sold out', priceKobo: 1_800_000, currency: 'NGN', quantityLimit: 15, quantitySold: 15, salesStart: '2026-09-15T00:00:00Z', salesEnd: '2026-10-05T22:59:00Z', status: 'sold_out' },
  { id: 'tt_6', eventId: 'evt_3', name: 'Free entry', description: 'Registration required', priceKobo: 0, currency: 'NGN', quantityLimit: 60, quantitySold: 60, salesStart: '2026-10-01T00:00:00Z', salesEnd: '2026-11-05T22:59:00Z', status: 'sold_out' },
  { id: 'tt_7', eventId: 'evt_4', name: 'Weekend package', description: 'Coach, one night lodging, guide and meals', priceKobo: 4_500_000, currency: 'NGN', quantityLimit: 40, quantitySold: 12, salesStart: '2026-10-01T00:00:00Z', salesEnd: '2026-11-11T22:59:00Z', status: 'active' },
  { id: 'tt_8', eventId: 'evt_5', name: 'Standard', description: 'Trail access, guide and first aid', priceKobo: 1_200_000, currency: 'NGN', quantityLimit: 50, quantitySold: 43, salesStart: '2026-10-01T00:00:00Z', salesEnd: '2026-11-19T22:59:00Z', status: 'active' },
  { id: 'tt_9', eventId: 'evt_6', name: 'Standard', description: 'Guided walk and museum entry', priceKobo: 800_000, currency: 'NGN', quantityLimit: 60, quantitySold: 15, salesStart: '2026-10-01T00:00:00Z', salesEnd: '2026-11-26T22:59:00Z', status: 'active' },
  { id: 'tt_10', eventId: 'evt_6', name: 'With transport', description: 'Return bus from Wuse, Abuja', priceKobo: 1_300_000, currency: 'NGN', quantityLimit: 20, quantitySold: 6, salesStart: '2026-10-01T00:00:00Z', salesEnd: '2026-11-26T22:59:00Z', status: 'active' },
  { id: 'tt_11', eventId: 'evt_8', name: 'Standard', description: 'Forest walk and guide', priceKobo: 500_000, currency: 'NGN', quantityLimit: 70, quantitySold: 5, salesStart: '2026-10-01T00:00:00Z', salesEnd: '2026-12-10T22:59:00Z', status: 'active' },
  { id: 'tt_12', eventId: 'evt_9', name: 'Expedition', description: 'Ground transport from Calabar, 2 nights lodging, guides', priceKobo: 9_500_000, currency: 'NGN', quantityLimit: 30, quantitySold: 4, salesStart: '2026-10-01T00:00:00Z', salesEnd: '2026-12-31T22:59:00Z', status: 'active' },
  { id: 'tt_13', eventId: 'evt_7', name: 'Standard', description: 'Trail access, guide and first aid', priceKobo: 2_000_000, currency: 'NGN', quantityLimit: 60, quantitySold: 9, salesStart: '2026-10-01T00:00:00Z', salesEnd: '2026-12-03T22:59:00Z', status: 'paused' },
  ...mockEvents.filter((e) => e.id.startsWith('evt_p')).flatMap(pastTicketTypes),
];

function pastTicketTypes(e: HikeEvent): TicketType[] {
  const t = (suffix: string, name: string, priceKobo: number): TicketType => ({
    id: `tt_${e.id}_${suffix}`, eventId: e.id, name, description: '', priceKobo, currency: 'NGN', quantityLimit: 30, quantitySold: 26,
    salesStart: '2025-01-01T00:00:00Z', salesEnd: e.startsAt, status: 'active',
  });
  if (e.fromPriceKobo === 0) return [t('free', 'Free', 0)];
  return [t('std', 'Standard', e.fromPriceKobo), t('trn', 'With transport', e.fromPriceKobo + 700_000), t('stu', 'Student', Math.round(e.fromPriceKobo * 0.6))];
}

// Placeholder 64-byte signature (base64url). The mock ticket endpoints replace it with a real signature from the mock
// test key (api/mock/signing.ts) before returning a ticket, so the check-in scanner can verify it.
const MOCK_SIG = 'q8Jm2v0d3xT9bYk4wR7nE1pZsLhC6fUaG5oVtNiQyB-_rM0jHcXlD2eKwP8uS3gF4aJ7zT1vYbN6mQxR9kLpEw';

export const mockTickets: Ticket[] = [
  { id: 'tkt_1', code: 'HIP-7Q4K-2291', eventId: 'evt_1', ticketTypeId: 'tt_2', holderUserId: mockUser.id, holder: { fullName: mockUser.fullName, email: mockUser.email, phone: mockUser.phone }, isGuest: false, qrToken: `HIP-7Q4K-2291.evt_1.${MOCK_SIG}`, status: 'confirmed', issuedAt: '2026-10-12T08:41:00Z' },
  // Bought by Adaeze for a friend who gave only a name: the ticket carries the friend's name, not the buyer's.
  { id: 'tkt_3', code: 'HIP-K3WD-5518', eventId: 'evt_1', ticketTypeId: 'tt_2', holder: { fullName: 'Kemi Adebayo' }, isGuest: true, paymentId: 'PSK_8812734', qrToken: `HIP-K3WD-5518.evt_1.${MOCK_SIG}`, status: 'confirmed', issuedAt: '2026-10-12T08:41:00Z' },
  { id: 'tkt_2', code: 'HIP-8RT2-0071', eventId: 'evt_1', ticketTypeId: 'tt_3', holder: { fullName: 'Bola Hassan', email: 'bola.h@example.com', phone: '+234 812 555 0144' }, isGuest: true, qrToken: `HIP-8RT2-0071.evt_1.${MOCK_SIG}`, status: 'confirmed', issuedAt: '2026-10-11T19:02:00Z' },
  // Usuma Dam Trail was cancelled by the organisers, so Adaeze's ticket was cancelled and refunded in full.
  { id: 'tkt_4', code: 'HIP-W8NE-3365', eventId: 'evt_7', ticketTypeId: 'tt_13', holderUserId: mockUser.id, holder: { fullName: mockUser.fullName, email: mockUser.email, phone: mockUser.phone }, isGuest: false, paymentId: 'PSK_7HQ2MX4A', qrToken: `HIP-W8NE-3365.evt_7.${MOCK_SIG}`, status: 'cancelled', issuedAt: '2026-10-02T10:15:00Z' },
  ...adaezeHistory().map((h) => h.ticket),
];

/** Who paid for which mock ticket (Adaeze bought Kemi's ticket for her). */
export const mockTicketBuyers: Record<string, string> = {
  tkt_1: mockUser.id,
  tkt_3: mockUser.id,
  tkt_4: mockUser.id,
  ...Object.fromEntries(mockTickets.filter((t) => t.id.startsWith('tkt_p')).map((t) => [t.id, mockUser.id])),
};

/** Check-ins behind the history: the only source of attendance (SRS 2.4 rules 5 and 11). */
export interface MockCheckIn {
  ticketId: string;
  checkedInAt: string;
  method: CheckInMethod;
}

/** Refunds already processed: the cancelled-hike ticket and the August Zuma ticket (Figma history row "Refunded"). */
export const mockRefunds: Record<string, { amountKobo: number; requestedAt: string; processedAt: string; reason: string }> = {
  tkt_4: { amountKobo: 2_000_000, requestedAt: '2026-10-08T09:00:00Z', processedAt: '2026-10-08T09:00:00Z', reason: 'Hike cancelled by HIP' },
  tkt_p10: { amountKobo: 600_000, requestedAt: '2026-07-20T18:30:00Z', processedAt: '2026-07-21T10:00:00Z', reason: 'Can no longer attend' },
};

/**
 * Adaeze's past bookings: 14 attended, 1 missed, 1 refunded (93% attendance, 14 of 15 eligible).
 * Check-in times are Abuja time (UTC+1) in the comments, stored in UTC.
 */
function adaezeHistory(): { ticket: Ticket; checkIn?: MockCheckIn }[] {
  const rows: [n: number, type: 'std' | 'trn' | 'stu' | 'free', checkInUtc: string | null, method: CheckInMethod | null, status?: 'refunded'][] = [
    [1, 'free', '2025-03-08T06:05:00Z', 'qr', undefined],
    [2, 'std', '2025-04-12T06:48:00Z', 'manual', undefined],
    [3, 'trn', '2025-05-24T04:51:00Z', 'qr', undefined],
    [4, 'std', '2025-07-19T04:22:00Z', 'qr', undefined],
    [5, 'trn', '2025-09-13T04:16:00Z', 'qr_offline', undefined],
    [6, 'std', '2025-11-15T06:40:00Z', 'qr', undefined],
    [7, 'std', '2026-01-17T04:44:00Z', 'qr', undefined],
    [8, 'std', '2026-05-16T04:39:00Z', 'manual', undefined],
    [9, 'free', '2026-07-18T06:02:00Z', 'qr', undefined], // 7:02 AM
    [10, 'stu', null, null, 'refunded'],
    [11, 'std', '2026-08-16T04:40:00Z', 'qr', undefined], // 5:40 AM
    [12, 'trn', '2026-08-29T04:11:00Z', 'qr_offline', undefined], // 5:11 AM
    [13, 'std', null, null, undefined], // missed
    [14, 'std', '2026-09-26T04:58:00Z', 'manual', undefined], // 5:58 AM
    [15, 'free', '2026-10-03T05:42:00Z', 'qr', undefined], // 6:42 AM
    [16, 'std', '2026-10-10T06:12:00Z', 'qr', undefined], // 7:12 AM
  ];
  return rows.map(([n, type, checkInUtc, method, status]) => {
    const eventId = `evt_p${n}`;
    const code = `HIP-PH${String(n).padStart(2, '0')}-${String(4000 + n * 37)}`;
    const id = `tkt_p${n}`;
    return {
      ticket: {
        id, code, eventId, ticketTypeId: `tt_${eventId}_${type}`, holderUserId: mockUser.id,
        holder: { fullName: mockUser.fullName, email: mockUser.email, phone: mockUser.phone }, isGuest: false,
        paymentId: type === 'free' ? undefined : `PSK_HIST${n}`, qrToken: `${code}.${eventId}.${MOCK_SIG}`,
        status: status ?? (checkInUtc ? 'checked_in' : 'confirmed'), issuedAt: '2025-01-01T00:00:00Z',
      },
      checkIn: checkInUtc && method ? { ticketId: id, checkedInAt: checkInUtc, method } : undefined,
    };
  });
}

export const mockCheckIns: MockCheckIn[] = adaezeHistory().flatMap((h) => (h.checkIn ? [h.checkIn] : []));

/** Profile extras for Adaeze (Figma "Hiker / Profile"). */
export const mockProfileExtras = {
  [mockUser.id]: { dateOfBirth: '1996-06-14', emergencyContact: { name: 'Chidi Okafor', phone: '+2348021112233' } },
} as Record<string, { dateOfBirth?: string; emergencyContact?: { name: string; phone: string } }>;

/**
 * Events created or edited in the admin mock (api/mock/admin.ts) live in sessionStorage. Merge them in at start-up so
 * the public pages, checkout and check-in all see them; admin.ts also updates these arrays in place when saving.
 */
export function upsertMockEvent(event: HikeEvent, ticketTypes?: TicketType[]) {
  const i = mockEvents.findIndex((e) => e.id === event.id);
  if (i >= 0) mockEvents[i] = event;
  else mockEvents.push(event);
  if (ticketTypes) {
    for (let j = mockTicketTypes.length - 1; j >= 0; j--) if (mockTicketTypes[j].eventId === event.id) mockTicketTypes.splice(j, 1);
    mockTicketTypes.push(...ticketTypes);
  }
}

try {
  const saved = JSON.parse(sessionStorage.getItem('hip.mock.v1') ?? '{}') as { adminEvents?: { events: HikeEvent[]; ticketTypes: TicketType[] } };
  for (const e of saved.adminEvents?.events ?? []) upsertMockEvent(e, saved.adminEvents?.ticketTypes.filter((t) => t.eventId === e.id));
} catch {
  // No saved admin changes.
}
