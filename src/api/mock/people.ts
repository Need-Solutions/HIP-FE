import { ApiError } from '../client';
import { mockEvents, mockProfileExtras, mockStaff } from './data';
import { auth } from './auth';
import { serverTickets, state as checkinState, type ServerCheckIn, type ServerTicket } from './checkin';
import { pushAudit, update, type MockPeopleState, type MockState } from './store';
import { can } from '@/lib/permissions';
import type { AdminHikerProfile, AdminSearchResult, HikerParticipation, HikerRow, HikersPage, HikersQuery } from '../endpoints';
import type { User } from '@/types/domain';

// Mock hikers directory (Admin / Hikers, Hiker profile, top-bar search). People are matched across tickets by
// email, else name, as the backend matches guests to accounts. Stats come from check-ins only (SRS 2.4 rule 5).

const PAGE_SIZE = 8;

export function peopleState(s: MockState): MockPeopleState {
  s.people ??= { seeded: false, suspended: {}, refunded: {}, refundRequests: {}, otherPayments: [], invites: [], staffMeta: {} };
  return s.people;
}

const keyOf = (t: { email?: string; holderName: string }) => (t.email ?? t.holderName).trim().toLowerCase();
const hash = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(36);

interface Person {
  id: string;
  key: string;
  name: string;
  email?: string;
  phone?: string;
  isGuest: boolean;
  user?: User;
  joinedAt: string;
  tickets: ServerTicket[];
  checkIns: (ServerCheckIn & { eventId: string; code: string })[];
}

/** Everyone the group knows: accounts (signed up) and guests (bought without an account), merged by email or name. */
export function directory(s: MockState): Map<string, Person> {
  const c = checkinState(s);
  const users = auth(s).users.map((u) => u.user).filter((u) => u.roles.includes('hiker'));
  const byKey = new Map<string, Person>();
  for (const e of mockEvents) {
    for (const t of serverTickets(s, e.id)) {
      const key = keyOf(t);
      let p = byKey.get(key);
      if (!p) {
        const user = users.find((u) => u.email.toLowerCase() === key);
        p = { id: user?.id ?? `hkr_${hash(key)}`, key, name: t.holderName, email: t.email, phone: t.phone, isGuest: !user && t.isGuest, user, joinedAt: user?.createdAt ?? t.issuedAt, tickets: [], checkIns: [] };
        byKey.set(key, p);
      }
      p.tickets.push(t);
      // Guests and pool hikers "joined" with their first ticket; accounts keep their sign-up date.
      if (!p.user && t.issuedAt < p.joinedAt) p.joinedAt = t.issuedAt;
      const scan = c.checkIns[e.id]?.[t.code];
      if (scan) p.checkIns.push({ ...scan, eventId: e.id, code: t.code });
    }
  }
  // Accounts with no tickets yet (just signed up).
  for (const u of users) {
    const key = u.email.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, { id: u.id, key, name: u.fullName, email: u.email, phone: u.phone, isGuest: false, user: u, joinedAt: u.createdAt, tickets: [], checkIns: [] });
  }
  return new Map([...byKey.values()].map((p) => [p.id, p]));
}

function statusOf(s: MockState, p: Person): HikerRow['status'] {
  if (peopleState(s).suspended[p.id] || p.user?.status === 'suspended') return 'suspended';
  if (p.user?.status === 'unverified') return 'unverified';
  if (p.isGuest) return 'guest';
  if (p.checkIns.length === 1) return 'first_timer';
  return 'active';
}

function toRow(s: MockState, p: Person): HikerRow {
  const last = [...p.checkIns].sort((a, b) => b.at.localeCompare(a.at))[0];
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    phone: p.phone,
    isGuest: p.isGuest,
    joinedAt: p.joinedAt,
    hikesAttended: p.checkIns.length,
    lastHike: last ? { eventTitle: mockEvents.find((e) => e.id === last.eventId)?.title ?? '', at: last.at } : undefined,
    status: statusOf(s, p),
  };
}

/** One account suspended to begin with (Figma "Admin / Hikers" shows a suspended hiker). */
function seed(s: MockState, people: Map<string, Person>) {
  const st = peopleState(s);
  if (st.seeded) return;
  st.seeded = true;
  const candidate = [...people.values()].find((p) => !p.isGuest && !p.user && p.checkIns.length >= 3);
  if (candidate) st.suspended[candidate.id] = { reason: 'Repeated no-shows after confirming and abusive messages to a guide.', at: '2026-09-28T10:00:00Z', by: mockStaff[0].fullName };
}

const lagosMonth = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit' }).format(new Date(iso));

const viewer = (s: MockState) => s.sessionUser ?? mockStaff[0];

export const mockPeople = {
  hikers: (q: HikersQuery): HikersPage =>
    update((s) => {
      if (!can(viewer(s), 'view_hikers')) throw new ApiError(403, 'You don’t have access to hikers.');
      const people = directory(s);
      seed(s, people);
      const rows = [...people.values()].map((p) => toRow(s, p));
      const thisMonth = lagosMonth(new Date().toISOString());
      const totals = {
        accounts: rows.filter((r) => !r.isGuest).length,
        guests: rows.filter((r) => r.isGuest).length,
        activeThisMonth: [...people.values()].filter((p) => p.checkIns.some((x) => lagosMonth(x.at) === thisMonth)).length,
      };
      const term = (q.q ?? '').trim().toLowerCase();
      const digits = term.replace(/\D/g, '');
      const matches = rows
        .filter((r) => (q.kind === 'accounts' ? !r.isGuest : q.kind === 'guests' ? r.isGuest : true))
        .filter((r) => q.status === 'any' || r.status === q.status)
        .filter(
          (r) =>
            !term ||
            r.name.toLowerCase().includes(term) ||
            (r.email ?? '').toLowerCase().includes(term) ||
            (digits.length >= 4 && (r.phone ?? '').replace(/\D/g, '').includes(digits)),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      const page = Math.max(1, q.page ?? 1);
      const items = q.all ? matches : matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
      return { items, total: matches.length, page, pageSize: q.all ? matches.length : PAGE_SIZE, totals };
    }),

  hiker: (id: string): AdminHikerProfile | null =>
    update((s) => {
      if (!can(viewer(s), 'view_hikers')) throw new ApiError(403, 'You don’t have access to hikers.');
      const people = directory(s);
      seed(s, people);
      const p = people.get(id);
      if (!p) return null;
      const now = Date.now();
      const history: HikerParticipation[] = p.tickets
        .map((t) => {
          const e = mockEvents.find((x) => x.id === t.eventId)!;
          const scan = p.checkIns.find((x) => x.code === t.code);
          const outcome: HikerParticipation['outcome'] =
            e.status === 'cancelled' ? 'cancelled' : t.status === 'refunded' ? 'refunded' : scan ? 'attended' : new Date(e.startsAt).getTime() < now ? 'no_show' : 'upcoming';
          return {
            eventId: e.id,
            eventTitle: e.title,
            startsAt: e.startsAt,
            ticketCode: t.code,
            ticketTypeName: t.ticketTypeName,
            priceKobo: t.priceKobo,
            outcome,
            checkIn: scan ? { at: scan.at, method: scan.method, staffName: scan.staffName } : undefined,
          };
        })
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
      const attended = history.filter((h) => h.outcome === 'attended').length;
      const months = Array.from({ length: 8 }, (_, i) => {
        const d = new Date();
        d.setUTCDate(15);
        d.setUTCMonth(d.getUTCMonth() - (7 - i));
        const key = lagosMonth(d.toISOString());
        return { label: new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' }).format(d).replace('Sept', 'Sep'), count: p.checkIns.filter((x) => lagosMonth(x.at) === key).length };
      });
      const extras = p.user ? mockProfileExtras[p.user.id] : undefined;
      const accountProfile = p.user ? s.account?.profiles[p.user.id] : undefined;
      return {
        hiker: {
          ...toRow(s, p),
          userId: p.user?.id,
          emailVerified: p.user?.emailVerified,
          phoneVerified: p.user?.phoneVerified,
          emergencyContact: accountProfile?.emergencyContact ?? extras?.emergencyContact,
          suspension: peopleState(s).suspended[p.id],
        },
        stats: {
          attended,
          eligible: attended + history.filter((h) => h.outcome === 'no_show').length,
          spentKobo: history.filter((h) => h.outcome !== 'refunded' && h.outcome !== 'cancelled').reduce((n, h) => n + h.priceKobo, 0),
        },
        monthly: months,
        history,
      };
    }),

  /** Accounts only. The reason goes to the audit log; suspended accounts can't log in. */
  setSuspended: (id: string, suspended: boolean, reason: string): AdminHikerProfile => {
    update((s) => {
      const actor = viewer(s);
      if (!can(actor, 'suspend_hikers')) throw new ApiError(403, 'You can’t suspend hikers.');
      if (reason.trim().length < 10) throw new ApiError(422, 'Give a reason of at least 10 characters.');
      const p = directory(s).get(id);
      if (!p) throw new ApiError(404, 'Hiker not found.');
      if (p.isGuest) throw new ApiError(409, 'Guests have no account to suspend.');
      const st = peopleState(s);
      if (suspended) st.suspended[id] = { reason: reason.trim(), at: new Date().toISOString(), by: actor.fullName };
      else delete st.suspended[id];
      const acct = p.user && auth(s).users.find((u) => u.user.id === p.user!.id);
      if (acct) acct.user = { ...acct.user, status: suspended ? 'suspended' : 'active' };
      pushAudit(s, { action: suspended ? 'hiker.suspended' : 'hiker.reactivated', recordType: 'user', recordId: id, details: `${suspended ? 'Suspended' : 'Reactivated'} ${p.name}`, reason: reason.trim() });
    });
    return mockPeople.hiker(id)!;
  },

  /** Hikers (name, email, phone) and ticket IDs, limited to what the signed-in staff member may see (SRCH-008). */
  search: (raw: string): AdminSearchResult =>
    update((s) => {
      const q = raw.trim().toLowerCase();
      const empty: AdminSearchResult = { hikers: [], tickets: [] };
      if (q.length < 2) return empty;
      const who = viewer(s);
      const result: AdminSearchResult = { hikers: [], tickets: [] };
      const people = can(who, 'view_hikers') || can(who, 'check_in') ? directory(s) : new Map<string, Person>();
      if (can(who, 'view_hikers')) {
        const digits = q.replace(/\D/g, '');
        result.hikers = [...people.values()]
          .filter((p) => p.name.toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q) || (digits.length >= 4 && (p.phone ?? '').replace(/\D/g, '').includes(digits)))
          .slice(0, 5)
          .map((p) => ({ id: p.id, name: p.name, email: p.email, isGuest: p.isGuest }));
      }
      if (can(who, 'check_in') && /^(hip-?)?[a-z0-9]{3,}/i.test(q)) {
        const code = q.toUpperCase().replace(/^HIP(?!-)/, 'HIP-');
        for (const p of people.values()) {
          for (const t of p.tickets) {
            if (t.code.includes(code) && result.tickets.length < 5) {
              result.tickets.push({ code: t.code, holderName: t.holderName, eventId: t.eventId, eventTitle: mockEvents.find((e) => e.id === t.eventId)?.title ?? '', status: t.status });
            }
          }
        }
      }
      return result;
    }),
};
