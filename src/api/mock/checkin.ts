import { ApiError } from '../client';
import { mockCheckIns, mockEvents, mockStaff, mockTicketTypes, mockTickets } from './data';
import { MOCK_PUBLIC_JWK, signTicketQr } from './signing';
import { pushAudit, update, type MockState } from './store';
import { parseTicketQr, verifyTicketQr } from '@/lib/ticketQr';
import { PIN_MAX_TRIES, hashPin, verifyPin, type PinHash } from '@/lib/pin';
import type { LocalCheckIn } from '@/features/checkin/offline/db';
import type {
  CheckInMethod,
  CheckinEvent,
  CheckinManifest,
  CheckinSettings,
  CheckinStats,
  ManifestTicket,
  ReentryRecord,
  ScanBy,
  ScanOutcome,
  StaffDevice,
  SupervisorPinStatus,
  SyncConflict,
  SyncLogEntry,
  User,
} from '@/types/domain';

// Mock check-in backend. Rules the real API must keep (CLAUDE.md "Offline check-in"):
//   - The server checks the QR signature with the event's key; phones only get the public key.
//   - One check-in per ticket. On sync, the earliest scan wins and the other becomes a "duplicate" conflict.
//   - Tickets admitted although not in the offline list come back as "not_in_list" conflicts for an admin.
//   - Attendance comes only from check-ins (SRS 2.4 rule 5).
// Event tickets are the real mock tickets plus generated hikers, so the counts look like a real trailhead.

const HORIZON_DAYS = 14;
const GATE = 'Gate A';
const GATES = ['Gate A', 'Gate B', 'Gate C'];
/** Sold after a phone would have downloaded the list: shows the "Not in offline list" result offline. */
const LATE_SALES = new Set(['HIP-8RT2-0071']);

export interface ServerTicket extends ManifestTicket {
  issuedAt: string;
  /** Admin views only; never sent to phones (TKT-018). */
  email?: string;
  phone?: string;
  isGuest: boolean;
  priceKobo: number;
}

export interface ServerCheckIn extends ScanBy {
  method: CheckInMethod;
  flagged?: boolean;
}

export const defaultCheckinSettings: CheckinSettings = {
  allowOffline: true,
  autoDownload: true,
  admitNotInList: true,
  requireSupervisorPin: false,
  closeSalesBeforeHours: 2,
  offlineListTtlHours: 24,
};

export interface MockCheckinState {
  seeded: boolean;
  checkIns: Record<string, Record<string, ServerCheckIn>>;
  syncedLocalIds: string[];
  conflicts: SyncConflict[];
  closed: Record<string, string>;
  settings: CheckinSettings;
  devices: Record<string, StaffDevice>;
  syncLog: SyncLogEntry[];
  /** Supervisor PIN per event: only the salted hash is kept. */
  pins: Record<string, { hash: PinHash; setAt: string; setBy: string }>;
  /** Wrong PIN tries per phone and event (online re-entry). */
  pinAttempts: Record<string, { fails: number; lockedUntil?: string }>;
  reentries: Record<string, ReentryRecord[]>;
}

const PIN_LOCK_MINUTES = 15;

// --- Generated hikers (deterministic, so codes stay the same across reloads) ---

const FIRST = ['Adebayo', 'Tobi', 'Adewale', 'Kemi', 'Chinedu', 'Ngozi', 'Femi', 'Bisi', 'Emeka', 'Funke', 'Ifeanyi', 'Yemi', 'Amaka', 'Segun', 'Tunde', 'Halima', 'Uche', 'Zainab', 'Dayo', 'Ireti', 'Obinna', 'Sade', 'Kunle', 'Nkechi', 'Gbenga', 'Aisha', 'Chioma', 'Lanre', 'Folake', 'Musa'];
const LAST = ['Martins', 'Adeyemi', 'Ojo', 'Adeleke', 'Eze', 'Okonkwo', 'Balogun', 'Bello', 'Nwosu', 'Afolabi', 'Okeke', 'Ibrahim', 'Lawal', 'Obi', 'Adesina', 'Usman', 'Onyeka', 'Fashola', 'Danjuma', 'Akande'];
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * The group's regulars and occasional hikers: generated tickets are drawn from this pool, so the same people come
 * back across events (analytics: first-time vs returning, repeat rate).
 */
const PEOPLE = (() => {
  const r = rng('hip-people');
  return Array.from({ length: 280 }, (_, i) => {
    const name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
    return {
      name,
      email: r() < 0.88 ? `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${i}@example.com` : undefined,
      phone: `+23480${String(10_000_000 + Math.floor(r() * 89_999_999))}`,
      isGuest: r() < 0.3,
      // Regulars (the first 90) are far more likely to be picked.
      weight: i < 90 ? 6 : 1,
    };
  });
})();
const PEOPLE_WEIGHT = PEOPLE.reduce((n, p) => n + p.weight, 0);
function pickPerson(r: () => number, taken: Set<number>) {
  for (let attempt = 0; attempt < 50; attempt++) {
    let x = r() * PEOPLE_WEIGHT;
    let i = 0;
    while (x >= PEOPLE[i].weight) x -= PEOPLE[i++].weight;
    if (!taken.has(i)) {
      taken.add(i);
      return PEOPLE[i];
    }
  }
  const free = PEOPLE.findIndex((_, i) => !taken.has(i));
  taken.add(free);
  return PEOPLE[free];
}

function rng(seedText: string) {
  let a = [...seedText].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Named hikers from the Figma check-in frames, for the soonest event. */
const FIGMA_HIKERS: [code: string, name: string, type: string, status?: 'refunded'][] = [
  ['HIP-2WQ9-3184', 'Adebayo Martins', 'Standard'],
  ['HIP-6HH3-7720', 'Tobi Adeyemi', 'Standard'],
  ['HIP-4KP7-5096', 'Adewale Ojo', 'Student'],
  ['HIP-9ZZ2-4417', 'Kemi Adeleke', 'Standard'],
  ['HIP-5PL2-8830', 'Chinedu Eze', 'Standard'],
  ['HIP-3KD8-2462', 'Folake Akande', 'Standard', 'refunded'],
];

const typeName = (id: string) => mockTicketTypes.find((t) => t.id === id)?.name ?? 'Ticket';
/** Price of a ticket type; events without types in the sample data fall back to their "from" price. */
const typePrice = (eventId: string, name: string) =>
  mockTicketTypes.find((t) => t.eventId === eventId && t.name === name)?.priceKobo ?? mockEvents.find((e) => e.id === eventId)?.fromPriceKobo ?? 0;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z]+/g, '.');

/** Every ticket the server knows for an event (no pending orders). */
export function serverTickets(s: MockState, eventId: string): ServerTicket[] {
  const event = mockEvents.find((e) => e.id === eventId);
  if (!event) return [];
  const real: ServerTicket[] = [...mockTickets, ...s.tickets]
    .filter((t) => t.eventId === eventId && t.status !== 'pending' && t.status !== 'expired')
    .map((t) => ({
      code: t.code,
      eventId,
      holderName: t.holder.fullName,
      ticketTypeName: typeName(t.ticketTypeId),
      status: t.status === 'refunded' ? 'refunded' : t.status === 'cancelled' ? 'cancelled' : 'confirmed',
      issuedAt: t.issuedAt,
      email: t.holder.email,
      phone: t.holder.phone,
      isGuest: t.isGuest,
      priceKobo: mockTicketTypes.find((x) => x.id === t.ticketTypeId)?.priceKobo ?? 0,
    }));
  const types = mockTicketTypes.filter((t) => t.eventId === eventId).map((t) => t.name);
  const rand = rng(eventId);
  const generated: ServerTicket[] = [];
  const taken = new Set<number>();
  const named = eventId === soonestEventId() ? FIGMA_HIKERS : [];
  for (const [code, holderName, ticketTypeName, status] of named) {
    generated.push({
      code, eventId, holderName, ticketTypeName, status: status ?? 'confirmed', issuedAt: '2026-10-05T10:00:00Z', statusChangedAt: status ? '2026-10-12T09:30:00Z' : undefined,
      email: `${slug(holderName)}@example.com`, isGuest: false, priceKobo: typePrice(eventId, ticketTypeName),
    });
  }
  while (real.length + generated.length < event.ticketsSold) {
    const code = `HIP-${Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)]).join('')}-${String(1000 + Math.floor(rand() * 9000))}`;
    const person = pickPerson(rand, taken);
    const holderName = person.name;
    const ticketTypeName = types[Math.floor(rand() * types.length)] ?? 'Standard';
    // Sold over the three weeks before the hike, and never in the future (upcoming hikes are still selling).
    const soldAt = new Date(event.startsAt).getTime() - (2 + rand() * 19) * 86_400_000;
    const issuedAt = new Date(Math.min(soldAt, Date.now() - (1 + rand() * 72) * 3_600_000)).toISOString();
    generated.push({
      code, eventId, holderName, ticketTypeName, status: 'confirmed', issuedAt,
      email: person.email,
      phone: person.phone,
      isGuest: person.isGuest,
      priceKobo: typePrice(eventId, ticketTypeName),
    });
  }
  // Refunds approved in Admin / Transactions apply everywhere (participants, check-in, analytics).
  const approved = s.people?.refunded ?? {};
  return [...real, ...generated].map((t) => (approved[t.code] && t.status === 'confirmed' ? { ...t, status: 'refunded' as const, statusChangedAt: approved[t.code].at } : t));
}

export function upcoming() {
  const now = Date.now();
  return mockEvents
    .filter((e) => (e.status === 'published' || e.status === 'sales_closed') && new Date(e.startsAt).getTime() > now - 12 * 3_600_000)
    .filter((e) => new Date(e.startsAt).getTime() < now + HORIZON_DAYS * 86_400_000)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
const soonestEventId = () => upcoming()[0]?.id;

const shortName = (u: Pick<User, 'fullName'>) => {
  const [first, ...rest] = u.fullName.split(' ');
  return rest.length ? `${first} ${rest[rest.length - 1][0]}.` : first;
};

/** The signed-in staff member. In dev the guards are bypassed, so with nobody signed in it's Tola (check-in staff). */
export const staffOf = (s: MockState, gate?: string) => ({ staffName: shortName(s.sessionUser ?? mockStaff[1]), gate: gate ?? GATE });

export function state(s: MockState): MockCheckinState {
  s.checkin ??= { seeded: false, checkIns: {}, syncedLocalIds: [], conflicts: [], closed: {}, settings: { ...defaultCheckinSettings }, devices: {}, syncLog: [], pins: {}, pinAttempts: {}, reentries: {} };
  // Sessions started before supervisor PINs existed.
  s.checkin.pins ??= {};
  s.checkin.pinAttempts ??= {};
  s.checkin.reentries ??= {};
  if (!s.checkin.seeded) seed(s, s.checkin);
  return s.checkin;
}

/** About 40% of the soonest event's hikers are already in, scanned by two phones at two gates. */
function seed(s: MockState, c: MockCheckinState) {
  c.seeded = true;
  const eventId = soonestEventId();
  if (!eventId) return;
  const keep = new Set(['HIP-7Q4K-2291', 'HIP-K3WD-5518', 'HIP-2WQ9-3184', 'HIP-4KP7-5096', 'HIP-9ZZ2-4417', 'HIP-5PL2-8830']);
  const rand = rng(`${eventId}-seed`);
  const now = Date.now();
  const map: Record<string, ServerCheckIn> = {};
  for (const t of serverTickets(s, eventId)) {
    if (t.status !== 'confirmed' || keep.has(t.code) || LATE_SALES.has(t.code)) continue;
    const isTobi = t.code === 'HIP-6HH3-7720';
    if (!isTobi && rand() > 0.42) continue;
    map[t.code] = {
      at: new Date(now - (isTobi ? 95 : 10 + Math.floor(rand() * 150)) * 60_000).toISOString(),
      staffName: isTobi || rand() < 0.5 ? 'Ife M.' : 'Kunle O.',
      gate: isTobi || rand() < 0.6 ? 'Gate A' : 'Gate B',
      method: rand() < 0.12 ? 'manual' : 'qr',
    };
  }
  c.checkIns[eventId] = map;
  // Another phone at Gate B scanned Tobi again offline; the earlier Gate A scan was kept.
  const tobi = map['HIP-6HH3-7720'];
  seedPastAttendance(s, c);
  seedDevices(c, eventId);
  c.conflicts.push({
    id: 'cf_seed_tobi',
    eventId,
    kind: 'duplicate',
    ticketCode: 'HIP-6HH3-7720',
    holderName: 'Tobi Adeyemi',
    scans: [tobi, { at: new Date(new Date(tobi.at).getTime() + 18 * 60_000).toISOString(), staffName: 'Kunle O.', gate: 'Gate B' }],
    note: 'Earliest scan kept automatically.',
  });
}

/** What phones get: no purchase time (and never contact details). */
const forPhone = (t: ServerTicket, scan?: ServerCheckIn): ManifestTicket => ({
  code: t.code,
  eventId: t.eventId,
  holderName: t.holderName,
  ticketTypeName: t.ticketTypeName,
  status: t.status,
  statusChangedAt: t.statusChangedAt,
  checkedIn: scan ? { at: scan.at, staffName: scan.staffName, gate: scan.gate } : undefined,
});

/** Completed hikes: about 90% came, scanned around the start. Adaeze's history check-ins are used as they are. */
function seedPastAttendance(s: MockState, c: MockCheckinState) {
  const now = Date.now();
  for (const e of mockEvents.filter((x) => x.status === 'completed' || (new Date(x.startsAt).getTime() < now && x.status !== 'cancelled'))) {
    const rand = rng(`${e.id}-past`);
    const map: Record<string, ServerCheckIn> = {};
    const start = new Date(e.startsAt).getTime();
    for (const t of serverTickets(s, e.id)) {
      if (t.status !== 'confirmed') continue;
      const real = mockTickets.find((x) => x.code === t.code);
      if (real) {
        const ci = mockCheckIns.find((x) => x.ticketId === real.id);
        if (ci) map[t.code] = { at: ci.checkedInAt, staffName: 'Kunle O.', gate: 'Gate A', method: ci.method };
        continue;
      }
      if (rand() > 0.9) continue;
      map[t.code] = {
        at: new Date(start - (5 + rand() * 50) * 60_000).toISOString(),
        staffName: rand() < 0.5 ? 'Kunle O.' : 'Ife M.',
        gate: rand() < 0.5 ? 'Gate A' : 'Gate B',
        method: rand() < 0.1 ? 'manual' : rand() < 0.2 ? 'qr_offline' : 'qr',
      };
    }
    c.checkIns[e.id] = map;
    c.closed[e.id] = new Date(start + 4 * 3_600_000).toISOString();
  }
}

/** Two phones at the trailhead (Figma "Admin / Check-in settings" → Staff devices). */
function seedDevices(c: MockCheckinState, eventId: string) {
  const title = mockEvents.find((e) => e.id === eventId)?.title ?? '';
  const today = (h: number, m: number) => new Date(Date.now() - ((Date.now() / 60_000) % 1440) * 60_000 + ((h - 1) * 60 + m) * 60_000).toISOString();
  c.devices.dev_seed_iphone = { deviceId: 'dev_seed_iphone', label: 'iPhone 13', gate: 'Gate A', staffName: 'Kunle O.', list: { eventId, eventTitle: title, downloadedAt: today(5, 12) }, unsynced: 0, lastSeenAt: today(9, 14) };
  c.devices.dev_seed_tecno = { deviceId: 'dev_seed_tecno', label: 'Tecno Camon 20', gate: 'Gate B', staffName: 'Ife M.', list: { eventId, eventTitle: title, downloadedAt: today(5, 20) }, unsynced: 4, lastSeenAt: today(7, 41) };
  c.syncLog.push(
    { id: 'log_seed_1', eventId, at: today(7, 40), deviceLabel: 'iPhone 13', gate: 'Gate A', staffName: 'Kunle O.', checkIns: 15, accepted: 15, duplicates: 0, flagged: 0, reentries: 0 },
    { id: 'log_seed_2', eventId, at: today(7, 41), deviceLabel: 'Tecno Camon 20', gate: 'Gate B', staffName: 'Ife M.', checkIns: 4, accepted: 3, duplicates: 1, flagged: 0, reentries: 0 },
  );
}

export const eventTitle = (id: string) => mockEvents.find((e) => e.id === id)?.title;

export function findTicket(s: MockState, code: string): ServerTicket | undefined {
  for (const e of mockEvents) {
    const t = serverTickets(s, e.id).find((x) => x.code === code);
    if (t) return t;
  }
  return undefined;
}

function decide(s: MockState, eventId: string, code: string, method: CheckInMethod, gate?: string): ScanOutcome {
  const c = state(s);
  if (c.closed[eventId]) return { kind: 'invalid', reason: 'attendance_closed', code };
  const ticket = findTicket(s, code);
  if (!ticket) return { kind: 'invalid', reason: 'unknown_ticket', code };
  if (ticket.eventId !== eventId) {
    return { kind: 'invalid', reason: 'wrong_event', code, holderName: ticket.holderName, eventTitle: eventTitle(ticket.eventId) };
  }
  if (ticket.status !== 'confirmed') {
    return { kind: 'invalid', reason: ticket.status, code, holderName: ticket.holderName, eventTitle: eventTitle(eventId), detail: ticket.statusChangedAt };
  }
  const existing = c.checkIns[eventId]?.[code];
  if (existing) return { kind: 'already_used', code, holderName: ticket.holderName, ticketTypeName: ticket.ticketTypeName, firstScan: existing };
  const scan: ServerCheckIn = { at: new Date().toISOString(), ...staffOf(s, gate), method };
  (c.checkIns[eventId] ??= {})[code] = scan;
  return { kind: 'valid', offline: false, code, holderName: ticket.holderName, ticketTypeName: ticket.ticketTypeName, scan };
}

export function stats(s: MockState, eventId: string): CheckinStats {
  const c = state(s);
  const scans = Object.values(c.checkIns[eventId] ?? {});
  return {
    confirmed: serverTickets(s, eventId).filter((t) => t.status === 'confirmed').length,
    checkedIn: scans.length,
    manual: scans.filter((x) => x.method === 'manual').length,
    attendanceClosedAt: c.closed[eventId],
  };
}

const timeOf = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

export const mockCheckin = {
  events: (): CheckinEvent[] =>
    update((s) => {
      const c = state(s);
      return upcoming().map((e) => ({
        event: { id: e.id, slug: e.slug, title: e.title, startsAt: e.startsAt, location: e.location, meetingPoint: e.meetingPoint, coverImageUrl: e.coverImageUrl },
        confirmedTickets: serverTickets(s, e.id).filter((t) => t.status === 'confirmed').length,
        // No gate assignments yet (Admin / Staff & roles): staff pick one on Select event.
        gate: undefined,
        gates: GATES,
        attendanceClosedAt: c.closed[e.id],
        offline: { allowed: c.settings.allowOffline, autoDownload: c.settings.autoDownload },
        reentry: { pinRequired: c.settings.requireSupervisorPin, pinSet: !!c.pins[e.id] },
      }));
    }),

  manifest: (eventId: string): CheckinManifest =>
    update((s) => {
      const c = state(s);
      const event = mockEvents.find((e) => e.id === eventId);
      if (!event) throw new ApiError(404, 'Event not found.');
      if (c.closed[eventId]) throw new ApiError(409, 'Attendance for this event is closed.');
      if (!c.settings.allowOffline) throw new ApiError(403, 'Offline scanning is turned off in Check-in settings.');
      const scans = c.checkIns[eventId] ?? {};
      const generatedAt = new Date();
      return {
        eventId,
        eventTitle: event.title,
        eventStartsAt: event.startsAt,
        generatedAt: generatedAt.toISOString(),
        salesCloseAt: event.registrationDeadline,
        expiresAt: new Date(generatedAt.getTime() + c.settings.offlineListTtlHours * 3_600_000).toISOString(),
        policy: {
          admitNotInList: c.settings.admitNotInList,
          requireSupervisorPin: c.settings.requireSupervisorPin,
          // Only the salted hash goes to phones, never the PIN.
          supervisorPin: c.settings.requireSupervisorPin ? c.pins[eventId]?.hash : undefined,
        },
        publicKeyJwk: MOCK_PUBLIC_JWK,
        tickets: serverTickets(s, eventId)
          .filter((t) => !LATE_SALES.has(t.code))
          .map((t) => forPhone(t, scans[t.code])),
      };
    }),

  /** Online scan: the server checks the signature, then the ticket. */
  async scan(eventId: string, payload: string, gate?: string): Promise<ScanOutcome> {
    const parsed = parseTicketQr(payload);
    if (!parsed) return { kind: 'invalid', reason: 'not_hip' };
    if (!(await verifyTicketQr(payload, MOCK_PUBLIC_JWK))) return { kind: 'invalid', reason: 'bad_signature', code: parsed.code };
    return update((s) => decide(s, eventId, parsed.code, 'qr', gate));
  },

  manualCheckIn: (eventId: string, code: string, gate?: string): ScanOutcome => update((s) => decide(s, eventId, code, 'manual', gate)),

  roster: (eventId: string): ManifestTicket[] =>
    update((s) => {
      const scans = state(s).checkIns[eventId] ?? {};
      return serverTickets(s, eventId).map((t) => forPhone(t, scans[t.code]));
    }),

  stats: (eventId: string): CheckinStats => update((s) => stats(s, eventId)),

  /** Upload from a phone. Idempotent by localId; the earliest scan per ticket wins. */
  sync: (checkins: LocalCheckIn[], device: { deviceId: string; label: string }): { synced: string[]; conflicts: number } =>
    update((s) => {
      const c = state(s);
      let conflicts = 0;
      const tally: Record<string, SyncLogEntry> = {};
      for (const p of checkins) {
        if (c.syncedLocalIds.includes(p.localId)) continue;
        const log = (tally[p.eventId] ??= { id: `log_${crypto.randomUUID().slice(0, 8)}`, eventId: p.eventId, at: new Date().toISOString(), deviceLabel: device.label, gate: p.gate, staffName: p.staffName, checkIns: 0, accepted: 0, duplicates: 0, flagged: 0, reentries: 0 });
        log.checkIns += 1;
        if (p.flagged) log.flagged += 1;
        c.syncedLocalIds.push(p.localId);
        if (p.reentry) {
          // Approved offline with the supervisor PIN: recorded as a re-entry, not as a second check-in.
          log.reentries += 1;
          const record: ReentryRecord = { ticketCode: p.ticketCode, holderName: p.holderName, at: p.checkedInAt, staffName: p.staffName, gate: p.gate, offline: true };
          (c.reentries[p.eventId] ??= []).push(record);
          pushAudit(s, { action: 'checkin.reentry_approved', recordType: 'ticket', recordId: p.ticketCode, details: `Re-entry, supervisor approved (offline): ${p.holderName} (${p.ticketCode}) · ${p.gate ?? 'no gate'} · ${p.staffName}`, at: p.checkedInAt });
          continue;
        }
        const scans = (c.checkIns[p.eventId] ??= {});
        const mine: ServerCheckIn = { at: p.checkedInAt, staffName: p.staffName, gate: p.gate, method: p.method, flagged: p.flagged };
        const ticket = findTicket(s, p.ticketCode);
        if (p.flagged) {
          conflicts += 1;
          c.conflicts.push({
            id: `cf_${crypto.randomUUID().slice(0, 8)}`,
            eventId: p.eventId,
            kind: 'not_in_list',
            ticketCode: p.ticketCode,
            holderName: ticket?.holderName,
            scans: [mine],
            serverNote: !ticket
              ? 'No ticket with this code.'
              : ticket.eventId !== p.eventId
                ? `Ticket for ${eventTitle(ticket.eventId)}.`
                : ticket.status !== 'confirmed'
                  ? `Ticket ${ticket.status}.`
                  : `Valid ticket, bought ${timeOf(ticket.issuedAt)}.`,
          });
          if (!ticket || ticket.eventId !== p.eventId || ticket.status !== 'confirmed') continue;
        }
        const existing = scans[p.ticketCode];
        if (!existing) {
          scans[p.ticketCode] = mine;
          if (!p.flagged) log.accepted += 1;
          continue;
        }
        log.duplicates += 1;
        // Two scans of one ticket: keep the earliest, record both for review.
        const [first, second] = [existing, mine].sort((a, b) => a.at.localeCompare(b.at));
        scans[p.ticketCode] = first;
        conflicts += 1;
        c.conflicts.push({
          id: `cf_${crypto.randomUUID().slice(0, 8)}`,
          eventId: p.eventId,
          kind: 'duplicate',
          ticketCode: p.ticketCode,
          holderName: ticket?.holderName ?? p.holderName,
          scans: [first, second].map(({ at, staffName, gate }) => ({ at, staffName, gate })),
          note: 'Earliest scan kept automatically.',
        });
      }
      c.syncLog.push(...Object.values(tally));
      return { synced: checkins.map((p) => p.localId), conflicts };
    }),

  /** Phones report their state while online, for Admin / Check-in settings → Staff devices. */
  heartbeat: (d: Omit<StaffDevice, 'lastSeenAt' | 'staffName'> & { staffName?: string }): void =>
    update((s) => {
      const c = state(s);
      c.devices[d.deviceId] = { ...d, staffName: d.staffName ?? staffOf(s).staffName, lastSeenAt: new Date().toISOString() };
    }),

  conflicts: (eventId: string): SyncConflict[] => update((s) => state(s).conflicts.filter((x) => x.eventId === eventId)),

  resolveConflict: (id: string): SyncConflict =>
    update((s) => {
      const x = state(s).conflicts.find((cf) => cf.id === id);
      if (!x) throw new ApiError(404, 'Already resolved.');
      x.resolvedAt = new Date().toISOString();
      x.resolution = 'resolved';
      pushAudit(s, { action: 'checkin.conflict_resolved', recordType: 'ticket', recordId: x.ticketCode, details: `${x.holderName ?? x.ticketCode}: marked resolved` });
      return x;
    }),

  /**
   * Re-entry for someone already checked in, approved with the event's supervisor PIN. Doesn't add to attendance.
   * Wrong PIN: 403 invalid_pin with attempts left; after 5 wrong tries this phone is locked out for 15 minutes.
   */
  async reentry(eventId: string, ticketCode: string, pin: string, device: string, gate?: string): Promise<ScanOutcome> {
    const stored = update((s) => state(s).pins[eventId]);
    const ok = stored ? await verifyPin(pin, stored.hash) : false;
    return update((s) => {
      const c = state(s);
      if (!c.settings.requireSupervisorPin) throw new ApiError(409, 'Supervisor PINs are turned off in Check-in settings.');
      if (!stored) throw new ApiError(409, 'No supervisor PIN is set for this event. Ask an admin.', { code: 'pin_not_set', message: 'No supervisor PIN is set for this event.' });
      const key = `${device}:${eventId}`;
      const tries = (c.pinAttempts[key] ??= { fails: 0 });
      if (tries.lockedUntil && new Date(tries.lockedUntil).getTime() > Date.now()) {
        throw new ApiError(423, 'Too many wrong PINs. Try again later.', { code: 'pin_locked', message: `Too many wrong PINs. Re-entry is locked on this phone for ${PIN_LOCK_MINUTES} minutes.` });
      }
      if (!ok) {
        tries.fails += 1;
        if (tries.fails >= PIN_MAX_TRIES) {
          tries.fails = 0;
          tries.lockedUntil = new Date(Date.now() + PIN_LOCK_MINUTES * 60_000).toISOString();
          throw new ApiError(423, 'Too many wrong PINs.', { code: 'pin_locked', message: `Too many wrong PINs. Re-entry is locked on this phone for ${PIN_LOCK_MINUTES} minutes.` });
        }
        throw new ApiError(403, 'Wrong PIN.', { code: 'invalid_pin', message: 'Wrong PIN.', attemptsLeft: PIN_MAX_TRIES - tries.fails });
      }
      delete c.pinAttempts[key];
      const ticket = findTicket(s, ticketCode);
      if (!ticket || ticket.eventId !== eventId) throw new ApiError(404, 'Ticket not found for this event.');
      if (!c.checkIns[eventId]?.[ticketCode]) throw new ApiError(409, 'This ticket hasn’t been checked in yet, so it needs a normal scan.');
      const by = staffOf(s, gate);
      const record: ReentryRecord = { ticketCode, holderName: ticket.holderName, at: new Date().toISOString(), staffName: by.staffName, gate: by.gate, offline: false };
      (c.reentries[eventId] ??= []).push(record);
      pushAudit(s, { action: 'checkin.reentry_approved', recordType: 'ticket', recordId: ticketCode, details: `Re-entry, supervisor approved: ${ticket.holderName} (${ticketCode}) · ${by.gate} · ${by.staffName}` });
      return { kind: 'valid', offline: false, reentry: true, code: ticketCode, holderName: ticket.holderName, ticketTypeName: ticket.ticketTypeName, scan: { at: record.at, staffName: by.staffName, gate: by.gate } };
    });
  },

  /** Upcoming events and whether each has a supervisor PIN (Admin / Check-in settings). */
  pinStatuses: (): SupervisorPinStatus[] =>
    update((s) => {
      const c = state(s);
      return upcoming().map((e) => ({ eventId: e.id, eventTitle: e.title, startsAt: e.startsAt, setAt: c.pins[e.id]?.setAt, setBy: c.pins[e.id]?.setBy }));
    }),

  /** Super admins only. Stores a salted hash; the PIN itself is never kept or logged. */
  async setPin(eventId: string, pin: string): Promise<SupervisorPinStatus> {
    const actorRoles = update((s) => (s.sessionUser ?? mockStaff[0]).roles);
    if (!actorRoles.includes('super_admin')) throw new ApiError(403, 'Only a super admin can set the supervisor PIN.');
    const hash = await hashPin(pin);
    return update((s) => {
      const c = state(s);
      const event = mockEvents.find((e) => e.id === eventId);
      if (!event) throw new ApiError(404, 'Event not found.');
      const actor = s.sessionUser ?? mockStaff[0];
      const changed = !!c.pins[eventId];
      c.pins[eventId] = { hash, setAt: new Date().toISOString(), setBy: actor.fullName };
      pushAudit(s, { action: changed ? 'checkin.pin_changed' : 'checkin.pin_set', recordType: 'event', recordId: eventId, details: `Supervisor PIN ${changed ? 'changed' : 'set'} for ${event.title}` });
      return { eventId, eventTitle: event.title, startsAt: event.startsAt, setAt: c.pins[eventId].setAt, setBy: actor.fullName };
    });
  },

  reportIssue: (eventId: string, code: string, note: string): SyncConflict =>
    update((s) => {
      const c = state(s);
      const ticket = findTicket(s, code);
      const conflict: SyncConflict = {
        id: `cf_${crypto.randomUUID().slice(0, 8)}`,
        eventId,
        kind: 'reported',
        ticketCode: code,
        holderName: ticket?.holderName,
        scans: c.checkIns[eventId]?.[code] ? [c.checkIns[eventId][code]] : [],
        note: note || 'Reported at the gate.',
      };
      c.conflicts.push(conflict);
      return conflict;
    }),

  close: (eventId: string): CheckinStats =>
    update((s) => {
      const c = state(s);
      if (!c.closed[eventId]) {
        c.closed[eventId] = new Date().toISOString();
        const st = stats(s, eventId);
        pushAudit(s, { action: 'attendance.closed', recordType: 'event', recordId: eventId, details: `Closed attendance · ${eventTitle(eventId)} · ${st.checkedIn} of ${st.confirmed} checked in` });
      }
      return stats(s, eventId);
    }),
};

/** Dev-only test scans for the scanner (headless browsers have no camera). Each is a payload a phone could read. */
export async function mockScanSamples(eventId: string): Promise<{ label: string; payload: string }[]> {
  const other = upcoming().find((e) => e.id !== eventId)?.id ?? 'evt_2';
  const tickets = update((s) => serverTickets(s, eventId));
  const scans = update((s) => state(s).checkIns[eventId] ?? {});
  const fresh = tickets.find((t) => t.status === 'confirmed' && !scans[t.code] && !LATE_SALES.has(t.code));
  const used = tickets.find((t) => scans[t.code]);
  const refunded = tickets.find((t) => t.status === 'refunded');
  const late = tickets.find((t) => LATE_SALES.has(t.code));
  const otherTicket = update((s) => serverTickets(s, other))[0];
  const samples: { label: string; payload: Promise<string> }[] = [];
  if (fresh) samples.push({ label: `Valid · ${fresh.holderName}`, payload: signTicketQr(fresh.code, eventId) });
  if (used) samples.push({ label: `Already used · ${used.holderName}`, payload: signTicketQr(used.code, eventId) });
  if (refunded) samples.push({ label: `Refunded · ${refunded.holderName}`, payload: signTicketQr(refunded.code, eventId) });
  if (otherTicket) samples.push({ label: 'Ticket for another event', payload: signTicketQr(otherTicket.code, other) });
  if (late) samples.push({ label: `Bought after download · ${late.code}`, payload: signTicketQr(late.code, eventId) });
  if (fresh) {
    samples.push({
      label: 'Forged signature',
      payload: signTicketQr(fresh.code, eventId).then((p) => {
        const sig = p.split('.')[2];
        return `${fresh.code}.${eventId}.${sig[0] === 'A' ? 'B' : 'A'}${sig.slice(1)}`;
      }),
    });
  }
  samples.push({ label: 'Not a HIP ticket', payload: Promise.resolve('https://example.com/some-other-qr') });
  return Promise.all(samples.map(async (x) => ({ label: x.label, payload: await x.payload })));
}
