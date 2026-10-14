import { ApiError } from '../client';
import { seedAudit } from './audit';
import { mockEvents, mockStaff, mockTicketTypes, upsertMockEvent } from './data';
import { auth } from './auth';
import { defaultCheckinSettings, eventTitle, serverTickets, state as checkinState, stats as checkinStats, type ServerCheckIn } from './checkin';
import { pushAudit, update, type MockState } from './store';
import { mockFinance } from './finance';
import { isoWeekLabel, inWeek, weekEnd, weekStart } from '@/lib/weeks';
import { lagosDayBoundary } from '@/lib/format';
import type {
  AdminEventRow,
  AnalyticsBucket,
  AnalyticsCounts,
  AnalyticsQuery,
  AnalyticsReport,
  AdminEventsPage,
  AdminEventsQuery,
  AttendanceCorrection,
  EventInput,
  OverviewStats,
  ParticipantRow,
  ParticipantsData,
  SyncReview,
} from '../endpoints';
import type { CheckinSettings, HikeEvent, Role, StaffDevice, SyncConflict, TicketType } from '@/types/domain';

// Mock admin backend. Rules the real API must keep:
//   - Attendance comes only from check-ins (SRS 2.4 rules 5, 11); instances and unique hikers are counted
//     separately (SRS 3.7.7). Percentages are left to lib/metrics.ts on the client.
//   - Attendance corrections need a reason and are written to the audit log with old and new state (ATT-018).
//   - An admin can't change their own role (ADM-005).
//   - Every admin change is audit-logged.

const SALES_CLOSING_HOURS = 72;
const PAGE_SIZE = 9;

const now = () => Date.now();

function adminEvents(s: MockState) {
  return (s.adminEvents ??= { events: [], ticketTypes: [] });
}

function ensure(s: MockState) {
  seedAudit(s);
  return checkinState(s);
}

function row(s: MockState, e: HikeEvent): AdminEventRow {
  const c = checkinState(s);
  const tickets = serverTickets(s, e.id);
  const confirmed = tickets.filter((t) => t.status === 'confirmed');
  const refundedAll = e.status === 'cancelled' && tickets.length > 0;
  const started = new Date(e.startsAt).getTime() < now() || e.status === 'completed';
  const scans = Object.keys(c.checkIns[e.id] ?? {}).length;
  return {
    event: e,
    confirmed: confirmed.length,
    capacity: e.capacity,
    checkedIn: started || scans > 0 ? scans : null,
    revenueKobo: refundedAll ? 0 : confirmed.reduce((sum, t) => sum + t.priceKobo, 0),
    refunded: refundedAll,
    salesClosing: e.status === 'published' && new Date(e.registrationDeadline).getTime() - now() < SALES_CLOSING_HOURS * 3_600_000 && new Date(e.registrationDeadline).getTime() > now(),
  };
}

/** A person's key for "unique hikers": email when known, else name. */
const personKey = (t: { email?: string; holderName: string }) => (t.email ?? t.holderName).toLowerCase();

function allScans(s: MockState) {
  const c = checkinState(s);
  const out: { at: string; person: string }[] = [];
  for (const e of mockEvents) {
    const scans = c.checkIns[e.id];
    if (!scans) continue;
    const people = new Map(serverTickets(s, e.id).map((t) => [t.code, personKey(t)]));
    for (const [code, scan] of Object.entries(scans)) out.push({ at: scan.at, person: people.get(code) ?? code });
  }
  return out;
}

export const mockAdmin = {
  overview: (): OverviewStats =>
    update((s) => {
      ensure(s);
      const thisWeek = weekStart(new Date());
      const lastWeek = weekStart(new Date(), 1);
      const scans = allScans(s);
      const tickets = mockEvents.flatMap((e) => serverTickets(s, e.id));
      const sold = (w: Date) => tickets.filter((t) => t.status !== 'cancelled' && inWeek(t.issuedAt, w));
      const revenue = (w: Date) =>
        sold(w).reduce((sum, t) => sum + t.priceKobo, 0) - tickets.filter((t) => t.status === 'refunded' && t.statusChangedAt && inWeek(t.statusChangedAt, w)).reduce((sum, t) => sum + t.priceKobo, 0);
      const weekly = Array.from({ length: 8 }, (_, i) => {
        const w = weekStart(new Date(), 7 - i);
        const inW = scans.filter((x) => inWeek(x.at, w));
        return { week: isoWeekLabel(w), startsOn: w.toISOString(), instances: inW.length, uniqueHikers: new Set(inW.map((x) => x.person)).size };
      });
      const thisScans = scans.filter((x) => inWeek(x.at, thisWeek));
      const registered = new Set([...tickets.filter((t) => !t.isGuest).map(personKey), ...auth(s).users.filter((u) => u.user.roles.includes('hiker')).map((u) => u.user.email.toLowerCase())]).size;
      return {
        weekStart: thisWeek.toISOString(),
        weekEnd: weekEnd(thisWeek).toISOString(),
        registeredHikers: registered,
        attendance: {
          instances: thisScans.length,
          uniqueHikers: new Set(thisScans.map((x) => x.person)).size,
          previousInstances: scans.filter((x) => inWeek(x.at, lastWeek)).length,
        },
        ticketsSold: { value: sold(thisWeek).length, previous: sold(lastWeek).length },
        netRevenueKobo: { value: revenue(thisWeek), previous: revenue(lastWeek) },
        weekly,
        upcoming: mockEvents
          .filter((e) => new Date(e.startsAt).getTime() > now() && e.status !== 'cancelled')
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
          .slice(0, 4)
          .map((e) => row(s, e)),
        activity: [...(s.audit ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4),
        pendingRefunds: mockFinance.pendingRefundCount(s),
      };
    }),

  events: (q: AdminEventsQuery): AdminEventsPage =>
    update((s) => {
      ensure(s);
      const inRange = mockEvents.filter((e) => {
        const t = new Date(e.startsAt).getTime();
        if (q.range === 'upcoming') return t >= now() - 12 * 3_600_000;
        if (q.range === 'past') return t < now();
        return true;
      });
      const counts = { all: inRange.length, draft: 0, published: 0, sales_closed: 0, completed: 0, cancelled: 0 } as AdminEventsPage['counts'];
      for (const e of inRange) counts[e.status] += 1;
      const term = (q.q ?? '').trim().toLowerCase();
      const matches = inRange
        .filter((e) => q.status === 'all' || e.status === q.status)
        .filter((e) => !term || e.title.toLowerCase().includes(term) || e.location.toLowerCase().includes(term))
        // Upcoming first (soonest first), then past (most recent first).
        .sort((a, b) => {
          const pa = new Date(a.startsAt).getTime() < now();
          const pb = new Date(b.startsAt).getTime() < now();
          if (pa !== pb) return pa ? 1 : -1;
          return pa ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt);
        });
      const page = Math.max(1, q.page ?? 1);
      return { items: matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((e) => row(s, e)), total: matches.length, page, pageSize: PAGE_SIZE, counts };
    }),

  event: (id: string): { event: HikeEvent; ticketTypes: TicketType[] } | null =>
    update((s) => {
      ensure(s);
      const event = mockEvents.find((e) => e.id === id);
      return event ? { event, ticketTypes: mockTicketTypes.filter((t) => t.eventId === id) } : null;
    }),

  saveEvent: (input: EventInput, publish: boolean): { event: HikeEvent; ticketTypes: TicketType[] } =>
    update((s) => {
      ensure(s);
      const existing = input.id ? mockEvents.find((e) => e.id === input.id) : undefined;
      if (input.id && !existing) throw new ApiError(404, 'Event not found.');
      if (existing && (existing.status === 'completed' || existing.status === 'cancelled')) throw new ApiError(409, `A ${existing.status} event can’t be edited.`);
      const startsAt = new Date(`${input.date}T${input.startTime || '06:00'}:00+01:00`).toISOString();
      const registrationDeadline = new Date(`${input.registrationDeadline}:00+01:00`).toISOString();
      if (publish) {
        if (new Date(startsAt).getTime() < now()) throw new ApiError(422, 'The start date is in the past.');
        if (registrationDeadline > startsAt) throw new ApiError(422, 'The registration deadline must be before the start.');
        if (input.ticketTypes.length === 0) throw new ApiError(422, 'Add at least one ticket type.');
      }
      const id = existing?.id ?? `evt_${crypto.randomUUID().slice(0, 8)}`;
      const baseSlug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'event';
      const ticketTypes: TicketType[] = input.ticketTypes.map((t) => {
        const prior = mockTicketTypes.find((x) => x.id === t.id);
        return {
          id: prior?.id ?? `tt_${crypto.randomUUID().slice(0, 8)}`,
          eventId: id,
          name: t.name,
          description: t.description ?? '',
          priceKobo: t.priceKobo,
          currency: 'NGN',
          quantityLimit: t.quantityLimit,
          quantitySold: prior?.quantitySold ?? 0,
          salesStart: new Date(`${t.salesStart}T00:00:00+01:00`).toISOString(),
          salesEnd: new Date(`${t.salesEnd}T23:59:00+01:00`).toISOString(),
          status: prior?.status ?? 'active',
        };
      });
      const event: HikeEvent = {
        id,
        slug: existing?.slug ?? (mockEvents.some((e) => e.slug === baseSlug) ? `${baseSlug}-${id.slice(4, 8)}` : baseSlug),
        title: input.title,
        description: input.description,
        coverImageUrl: input.coverImageUrl,
        startsAt,
        durationLabel: input.durationLabel,
        meetingPoint: input.meetingPoint,
        location: input.location,
        difficulty: input.difficulty,
        capacity: input.capacity,
        registrationDeadline,
        requiredEquipment: input.requiredEquipment,
        emergencyInfo: input.emergencyInfo,
        requirements: input.requirements,
        status: publish ? (existing?.status === 'sales_closed' ? 'sales_closed' : 'published') : (existing?.status ?? 'draft'),
        ticketsSold: existing?.ticketsSold ?? 0,
        fromPriceKobo: ticketTypes.length ? Math.min(...ticketTypes.map((t) => t.priceKobo)) : 0,
        distanceKm: existing?.distanceKm,
        elevationM: existing?.elevationM,
      };
      const store = adminEvents(s);
      store.events = [...store.events.filter((e) => e.id !== id), event];
      store.ticketTypes = [...store.ticketTypes.filter((t) => t.eventId !== id), ...ticketTypes];
      upsertMockEvent(event, ticketTypes);
      const publishedNow = publish && (!existing || existing.status === 'draft');
      // EVT-008: the server tells ticket holders when a live event's date, time or place changes.
      const moved = existing && existing.status !== 'draft' && (existing.startsAt !== event.startsAt || existing.meetingPoint !== event.meetingPoint || existing.location !== event.location);
      const notified = moved ? existing.ticketsSold : 0;
      pushAudit(s, {
        action: publishedNow ? 'event.published' : existing ? 'event.updated' : 'event.created',
        recordType: 'event',
        recordId: id,
        details: `${publishedNow ? 'Published' : existing ? 'Updated' : 'Created draft'} “${event.title}”${notified ? ` · ${notified} ticket holders notified of the change` : ''}`,
      });
      return { event, ticketTypes };
    }),

  cancelEvent: (id: string, reason: string): HikeEvent =>
    update((s) => {
      ensure(s);
      const e = mockEvents.find((x) => x.id === id);
      if (!e) throw new ApiError(404, 'Event not found.');
      if (reason.trim().length < 10) throw new ApiError(422, 'Give a reason of at least 10 characters.');
      const cancelled: HikeEvent = { ...e, status: 'cancelled' };
      const store = adminEvents(s);
      store.events = [...store.events.filter((x) => x.id !== id), cancelled];
      upsertMockEvent(cancelled);
      pushAudit(s, { action: 'event.cancelled', recordType: 'event', recordId: id, details: `Cancelled “${e.title}”`, reason });
      return cancelled;
    }),

  participants: (eventId: string): ParticipantsData =>
    update((s) => {
      const c = ensure(s);
      const event = mockEvents.find((e) => e.id === eventId);
      if (!event) throw new ApiError(404, 'Event not found.');
      const scans = c.checkIns[eventId] ?? {};
      const open = c.conflicts.filter((x) => x.eventId === eventId && !x.resolvedAt);
      const rows: ParticipantRow[] = serverTickets(s, eventId)
        .map((t) => {
          const scan = scans[t.code];
          const issue = open.find((x) => x.ticketCode === t.code);
          return {
            ticketCode: t.code,
            holderName: t.holderName,
            email: t.email,
            phone: t.phone,
            ticketTypeName: t.ticketTypeName,
            isGuest: t.isGuest,
            ticketStatus: t.status,
            checkIn: scan ? { at: scan.at, method: scan.method, staffName: scan.staffName, gate: scan.gate, flagged: scan.flagged } : undefined,
            issue: issue ? { kind: issue.kind, conflictId: issue.id } : undefined,
          };
        })
        .sort((a, b) => a.holderName.localeCompare(b.holderName));
      const st = checkinStats(s, eventId);
      return {
        event,
        attendanceClosedAt: c.closed[eventId],
        stats: {
          confirmed: st.confirmed,
          checkedIn: st.checkedIn,
          offlineScans: Object.values(scans).filter((x) => x.method === 'qr_offline').length,
          offlineWaiting: Object.values(c.devices).filter((d) => d.list?.eventId === eventId).reduce((n, d) => n + d.unsynced, 0),
          flagged: rows.filter((r) => r.issue).length,
        },
        rows,
      };
    }),

  correctAttendance: (eventId: string, body: AttendanceCorrection): ParticipantRow =>
    update((s) => {
      const c = ensure(s);
      const reason = body.reason.trim();
      if (reason.length < 10) throw new ApiError(422, 'Give a reason of at least 10 characters (ATT-018).');
      const t = serverTickets(s, eventId).find((x) => x.code === body.ticketCode);
      if (!t) throw new ApiError(404, 'Ticket not found.');
      if (t.status !== 'confirmed') throw new ApiError(409, `This ticket is ${t.status}, so it can’t be checked in.`);
      const scans = (c.checkIns[eventId] ??= {});
      const before = scans[t.code];
      const fmt = (x?: ServerCheckIn) =>
        x ? `Checked in ${new Intl.DateTimeFormat('en-US', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' }).format(new Date(x.at))} (${x.method === 'manual' ? 'Manual' : x.method === 'qr_offline' ? 'QR offline' : 'QR'})` : 'Not checked in';
      let after: ServerCheckIn | undefined;
      if (body.checkedIn) {
        const actor = s.sessionUser ?? mockStaff[0];
        const [first, ...rest] = actor.fullName.split(' ');
        after = { at: body.at ?? new Date().toISOString(), method: body.method ?? 'manual', staffName: `${first} ${rest.length ? `${rest[rest.length - 1][0]}.` : ''}`.trim(), gate: before?.gate };
        scans[t.code] = after;
      } else {
        delete scans[t.code];
      }
      pushAudit(s, {
        action: 'attendance.corrected',
        recordType: 'ticket',
        recordId: t.code,
        details: `${t.holderName} (${t.code}) at ${eventTitle(eventId)}: ${fmt(before)} → ${fmt(after)}`,
        reason,
      });
      return {
        ticketCode: t.code,
        holderName: t.holderName,
        email: t.email,
        phone: t.phone,
        ticketTypeName: t.ticketTypeName,
        isGuest: t.isGuest,
        ticketStatus: t.status,
        checkIn: after ? { at: after.at, method: after.method, staffName: after.staffName, gate: after.gate } : undefined,
      };
    }),

  checkinSettings: (): CheckinSettings => update((s) => ({ ...defaultCheckinSettings, ...ensure(s).settings })),

  saveCheckinSettings: (next: CheckinSettings): CheckinSettings =>
    update((s) => {
      const c = ensure(s);
      if (next.offlineListTtlHours < 1 || next.offlineListTtlHours > 72) throw new ApiError(422, 'Offline lists can last between 1 and 72 hours.');
      const changed = (Object.keys(next) as (keyof CheckinSettings)[]).filter((k) => next[k] !== c.settings[k]);
      c.settings = { ...next };
      if (changed.length) pushAudit(s, { action: 'checkin_settings.updated', recordType: 'settings', recordId: 'checkin', details: `Changed ${changed.join(', ')}` });
      return c.settings;
    }),

  devices: (): StaffDevice[] => update((s) => Object.values(ensure(s).devices).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))),

  syncReview: (eventId: string): SyncReview =>
    update((s) => {
      const c = ensure(s);
      const scans = Object.values(c.checkIns[eventId] ?? {});
      const devices = Object.values(c.devices).filter((d) => d.list?.eventId === eventId);
      const waitingDevices = devices.filter((d) => d.unsynced > 0);
      const synced = scans.filter((x) => x.method === 'qr_offline').length;
      const waiting = waitingDevices.reduce((n, d) => n + d.unsynced, 0);
      const conflicts = c.conflicts.filter((x) => x.eventId === eventId);
      return {
        stats: {
          offline: synced + waiting,
          synced,
          waiting,
          waitingDevices: waitingDevices.map((d) => `${d.gate ? `${d.gate} ` : ''}phone`),
          devices: devices.length,
          needsReview: conflicts.filter((x) => !x.resolvedAt).length,
        },
        conflicts,
        log: c.syncLog.filter((x) => x.eventId === eventId).sort((a, b) => a.at.localeCompare(b.at)),
        reentries: [...(c.reentries[eventId] ?? [])].sort((a, b) => a.at.localeCompare(b.at)),
      };
    }),

  /** Admin / Offline sync review actions. Rejecting a flagged admission removes its check-in and needs a reason. */
  resolveConflict: (id: string, decision: NonNullable<SyncConflict['resolution']>, reason?: string): SyncConflict =>
    update((s) => {
      const c = ensure(s);
      const x = c.conflicts.find((cf) => cf.id === id);
      if (!x) throw new ApiError(404, 'Not found.');
      if (x.resolvedAt) throw new ApiError(409, 'Already resolved.');
      if (decision === 'rejected' && (reason ?? '').trim().length < 10) throw new ApiError(422, 'Give a reason of at least 10 characters.');
      const actor = s.sessionUser ?? mockStaff[0];
      if (decision === 'rejected') delete c.checkIns[x.eventId]?.[x.ticketCode];
      x.resolvedAt = new Date().toISOString();
      x.resolution = decision;
      x.resolvedBy = actor.fullName;
      const what = { kept_earliest: 'kept the earliest scan', confirmed: 'confirmed the flagged admission', rejected: 'rejected the flagged admission (check-in removed)', resolved: 'marked it resolved' }[decision];
      pushAudit(s, { action: `checkin.conflict_${decision}`, recordType: 'ticket', recordId: x.ticketCode, details: `${x.holderName ?? x.ticketCode}: ${what}`, reason: reason?.trim() || undefined });
      return x;
    }),

  /**
   * Admin / Analytics. Raw counts only; the client derives every percentage with lib/metrics.ts. A person is their
   * email when known, else their name; "first-time" means their first ever check-in with the group falls in the
   * period. No-shows count only hikes that started in the period.
   */
  analytics: (q: AnalyticsQuery): AnalyticsReport =>
    update((s) => {
      const c = ensure(s);
      const nowMs = Date.now();
      // Every check-in, with the person it belongs to.
      const scans: { eventId: string; at: number; person: string }[] = [];
      for (const e of mockEvents) {
        const map = c.checkIns[e.id];
        if (!map) continue;
        const people = new Map(serverTickets(s, e.id).map((t) => [t.code, personKey(t)]));
        for (const [code, scan] of Object.entries(map)) scans.push({ eventId: e.id, at: new Date(scan.at).getTime(), person: people.get(code) ?? code });
      }
      const firstEver = new Map<string, number>();
      for (const x of scans) if (!firstEver.has(x.person) || x.at < firstEver.get(x.person)!) firstEver.set(x.person, x.at);
      const mine = q.eventId ? scans.filter((x) => x.eventId === q.eventId) : scans;

      const span = (from: number, to: number) => {
        const inRange = mine.filter((x) => x.at >= from && x.at <= to);
        const people = new Set(inRange.map((x) => x.person));
        const firstTime = [...people].filter((p) => firstEver.get(p)! >= from).length;
        return { instances: inRange.length, uniqueHikers: people.size, firstTime, returning: people.size - firstTime };
      };
      const hikesIn = (from: number, to: number) =>
        mockEvents.filter((e) => {
          const t = new Date(e.startsAt).getTime();
          return e.status !== 'draft' && e.status !== 'cancelled' && t >= from && t <= to && t <= nowMs && (!q.eventId || e.id === q.eventId);
        });
      const counts = (fromDay: string, toDay: string): AnalyticsCounts => {
        const from = new Date(lagosDayBoundary(fromDay, 'start')).getTime();
        const to = new Date(lagosDayBoundary(toDay, 'end')).getTime();
        const hikes = hikesIn(from, to);
        return {
          ...span(from, to),
          eligibleConfirmed: hikes.reduce((n, e) => n + serverTickets(s, e.id).filter((t) => t.status === 'confirmed').length, 0),
          checkedInEligible: hikes.reduce((n, e) => n + Object.keys(c.checkIns[e.id] ?? {}).length, 0),
        };
      };

      // Trailing buckets ending with the period's last day: 8 weeks or 7 months.
      const endDay = new Date(lagosDayBoundary(q.to, 'end'));
      const series: AnalyticsBucket[] = [];
      if (q.granularity === 'weekly') {
        for (let i = 7; i >= 0; i--) {
          const start = weekStart(endDay, i);
          const end = weekEnd(start);
          series.push({ label: isoWeekLabel(start), start: start.toISOString(), end: end.toISOString(), partial: end.getTime() > nowMs, ...span(start.getTime(), end.getTime()) });
        }
      } else {
        const [y, m] = q.to.split('-').map(Number);
        for (let i = 6; i >= 0; i--) {
          const first = new Date(Date.UTC(y, m - 1 - i, 1));
          const ymd = first.toISOString().slice(0, 10);
          const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
          const start = new Date(lagosDayBoundary(ymd, 'start'));
          const end = new Date(new Date(lagosDayBoundary(next, 'start')).getTime() - 1);
          const label = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(first).replace('Sept', 'Sep');
          series.push({ label, start: start.toISOString(), end: end.toISOString(), partial: end.getTime() > nowMs, ...span(start.getTime(), end.getTime()) });
        }
      }

      const from = new Date(lagosDayBoundary(q.from, 'start')).getTime();
      const to = new Date(lagosDayBoundary(q.to, 'end')).getTime();
      return {
        query: q,
        current: counts(q.from, q.to),
        previous: counts(q.prevFrom, q.prevTo),
        series,
        events: hikesIn(from, to).map((e) => ({
          eventId: e.id,
          title: e.title,
          startsAt: e.startsAt,
          ticketsSold: serverTickets(s, e.id).filter((t) => t.status === 'confirmed').length,
          checkedIn: Object.keys(c.checkIns[e.id] ?? {}).length,
        })),
        eventOptions: mockEvents
          .filter((e) => e.status !== 'draft')
          .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
          .map((e) => ({ id: e.id, title: e.title, startsAt: e.startsAt })),
        generatedAt: new Date().toISOString(),
      };
    }),

  /** ADM-005: an admin can't change their own role. (Used by Admin / Staff & roles.) */
  setStaffRole: (userId: string, roles: Role[]): void =>
    update((s) => {
      const actor = s.sessionUser ?? mockStaff[0];
      if (userId === actor.id) throw new ApiError(403, 'You can’t change your own role. Ask another admin.');
      const acct = auth(s).users.find((u) => u.user.id === userId);
      if (!acct) throw new ApiError(404, 'Staff member not found.');
      const before = acct.user.roles.join(', ');
      acct.user = { ...acct.user, roles };
      pushAudit(s, { action: 'staff.role_changed', recordType: 'user', recordId: userId, details: `${acct.user.fullName}: ${before} → ${roles.join(', ')}` });
    }),

};

