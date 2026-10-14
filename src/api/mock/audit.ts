import { ApiError } from '../client';
import { mockEvents, mockStaff } from './data';
import { auth } from './auth';
import { update, type MockState } from './store';
import { lagosDay } from '@/lib/analytics';
import { AUDIT_ACTIONS, sameLabelCodes } from '@/lib/audit';
import { can } from '@/lib/permissions';
import type { AuditPage, AuditQuery } from '../endpoints';
import type { AuditLogEntry } from '@/types/domain';

// Mock audit log (Admin / Audit log, ADM-014, NFR-012). Entries are append-only: there is no way to edit or delete
// one, here or on the server. Listing fills in a readable record name and filters on the server.

const PAGE_SIZE = 12;

/** A month of sample history so the log isn't empty on first run. */
export function seedAudit(s: MockState) {
  if (s.audit) return;
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
  const [kunle, , ife, , hub] = mockStaff;
  const by = (u: typeof kunle) => ({ actorUserId: u.id, actorName: u.fullName });
  const rows: Omit<AuditLogEntry, 'id'>[] = [
    { ...by(ife), action: 'event.published', recordType: 'event', recordId: 'evt_2', details: 'Capacity 75 · 2 ticket types', createdAt: at(24 * 27) },
    { ...by(kunle), action: 'staff.invited', recordType: 'user', recordId: 'inv_dayo', details: 'Invited Dayo Ibe (dayo@hip.ng) as Check-in staff', createdAt: at(24 * 25) },
    { ...by(kunle), action: 'notifications.updated', recordType: 'settings', recordId: 'notifications', details: 'Event reminder (24 hrs before) by SMS on', createdAt: at(24 * 22) },
    { ...by(ife), action: 'event.created', recordType: 'event', recordId: 'evt_3', details: 'Draft created', createdAt: at(24 * 20) },
    { ...by(kunle), action: 'checkin_settings.updated', recordType: 'settings', recordId: 'checkin', details: 'Changed offline list expiry (24 → 36 hrs)', createdAt: at(24 * 18) },
    { ...by(ife), action: 'refund.declined', recordType: 'ticket', recordId: 'HIP-PH13-1208', details: 'Refund declined · HIP-PH13', reason: 'Requested after check-in opened; policy allows no refund.', createdAt: at(24 * 16) },
    { ...by(kunle), action: 'checkin.pin_set', recordType: 'event', recordId: 'evt_1', details: 'Supervisor PIN set', createdAt: at(24 * 14) },
    { ...by(hub), action: 'ad.submitted', recordType: 'ad', recordId: 'ad_1', details: 'Outdoor Hub gear sale · Homepage banner', createdAt: at(24 * 14 + 5) },
    { ...by(kunle), action: 'ad.approved', recordType: 'ad', recordId: 'ad_1', details: 'Outdoor Hub gear sale · Homepage banner', createdAt: at(24 * 13) },
    { ...by(kunle), action: 'branding.updated', recordType: 'settings', recordId: 'branding', details: 'Changed contact phone', createdAt: at(24 * 11) },
    { ...by(ife), action: 'hiker.suspended', recordType: 'user', recordId: 'gst_femi', details: 'Suspended Femi Lawal', reason: 'Repeated no-shows on free hikes after warnings.', createdAt: at(24 * 9) },
    { ...by(kunle), action: 'staff.role_changed', recordType: 'user', recordId: 'inv_dayo', details: 'Dayo Ibe (invited): None → Check-in staff', createdAt: at(24 * 8) },
    { ...by(kunle), action: 'ad.approved', recordType: 'ad', recordId: 'ad_2', details: 'HydroPack 2L · Event page', createdAt: at(24 * 5) },
    { ...by(kunle), action: 'ad.paused', recordType: 'ad', recordId: 'ad_7', details: 'Ride Share promo paused', createdAt: at(24 * 5 - 2) },
    { ...by(ife), action: 'refund.approved', recordType: 'ticket', recordId: 'HIP-3KD8-2462', details: 'Refund approved ₦15,000 · HIP-3KD8', reason: 'Illness, doctor’s note sent by email.', createdAt: at(24 * 4) },
    { ...by(kunle), action: 'attendance.corrected', recordType: 'ticket', recordId: 'HIP-2WQ9-3381', details: 'Not checked in → Checked in', reason: 'Scanner phone died at the gate; the trail lead confirmed she hiked.', createdAt: at(24 * 3) },
    { ...by(kunle), action: 'checkin.conflict_kept_earliest', recordType: 'ticket', recordId: 'HIP-6HH3-0912', details: 'Kept 6:12 AM scan, discarded 6:30 AM', createdAt: at(24 * 3 - 1) },
    { ...by(kunle), action: 'checkin.synced', recordType: 'event', recordId: 'evt_p14', details: '23 offline check-ins synced · Gate A phone', createdAt: at(3) },
    { ...by(kunle), action: 'attendance.closed', recordType: 'event', recordId: 'evt_p16', details: 'Closed attendance · final count 91 of 97', createdAt: at(2) },
    { ...by(hub), action: 'ad.submitted', recordType: 'ad', recordId: 'ad_6', details: 'SunShield SPF 50 · Event page', createdAt: at(24) },
  ];
  s.audit = rows.map((e, i) => ({ id: `aud_seed_${i}`, ...e }));
}

function recordLabel(s: MockState, e: AuditLogEntry): string | undefined {
  switch (e.recordType) {
    case 'event':
      return mockEvents.find((x) => x.id === e.recordId)?.title;
    case 'ad':
      return s.ads?.campaigns.find((x) => x.id === e.recordId)?.name;
    case 'user':
      return (
        auth(s).users.find((u) => u.user.id === e.recordId)?.user.fullName ??
        s.people?.invites.find((i) => i.id === e.recordId)?.name ??
        (e.details.match(/^(?:Suspended|Reactivated) (.+)$/)?.[1])
      );
    case 'ticket':
      return e.recordId;
    case 'settings':
      return { notifications: 'Notifications', checkin: 'Check-in settings', branding: 'Branding' }[e.recordId] ?? (e.recordId.startsWith('provider_') ? 'Notification provider' : undefined);
    default:
      return undefined;
  }
}

export const mockAudit = {
  list: (q: AuditQuery): AuditPage =>
    update((s) => {
      if (!can(s.sessionUser ?? mockStaff[0], 'view_audit_log')) throw new ApiError(403, 'Only admins can see the audit log.');
      seedAudit(s);
      const all = [...(s.audit ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((e) => ({ ...e, recordLabel: recordLabel(s, e) ?? e.recordId }));
      const actors = [...new Map(all.map((e) => [e.actorUserId, { id: e.actorUserId, name: e.actorName }])).values()].sort((a, b) => a.name.localeCompare(b.name));
      let rows = all;
      if (q.action?.startsWith('group:')) {
        const g = q.action.slice(6);
        rows = rows.filter((e) => AUDIT_ACTIONS[e.action]?.group === g);
      } else if (q.action) {
        const codes = sameLabelCodes(q.action);
        rows = rows.filter((e) => codes.includes(e.action));
      }
      if (q.actorId) rows = rows.filter((e) => e.actorUserId === q.actorId);
      if (q.from) rows = rows.filter((e) => lagosDay(new Date(e.createdAt)) >= q.from!);
      if (q.to) rows = rows.filter((e) => lagosDay(new Date(e.createdAt)) <= q.to!);
      const term = q.q?.trim().toLowerCase();
      if (term) rows = rows.filter((e) => [e.details, e.reason ?? '', e.recordId, e.recordLabel ?? '', e.actorName, AUDIT_ACTIONS[e.action]?.label ?? e.action].some((v) => v.toLowerCase().includes(term)));
      const page = q.all ? 1 : Math.max(1, q.page);
      return { items: q.all ? rows : rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: rows.length, page, pageSize: q.all ? rows.length : PAGE_SIZE, actors };
    }),
};
