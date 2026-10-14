import { addDays, lagosDay } from './analytics';

// Audit log wording (Admin / Audit log): a label for every action code the server writes, grouped for the action
// filter, and the date presets. Unknown codes still show, as "Thing changed".

export const AUDIT_GROUPS = [
  { id: 'events', label: 'Events' },
  { id: 'attendance', label: 'Attendance & check-in' },
  { id: 'refunds', label: 'Refunds' },
  { id: 'hikers', label: 'Hikers' },
  { id: 'staff', label: 'Staff & roles' },
  { id: 'ads', label: 'Ads' },
  { id: 'settings', label: 'Settings & branding' },
] as const;
export type AuditGroup = (typeof AUDIT_GROUPS)[number]['id'];

export const AUDIT_ACTIONS: Record<string, { label: string; group: AuditGroup }> = {
  'event.created': { label: 'Event created', group: 'events' },
  'event.updated': { label: 'Event updated', group: 'events' },
  'event.published': { label: 'Event published', group: 'events' },
  'event.cancelled': { label: 'Event cancelled', group: 'events' },
  'attendance.corrected': { label: 'Attendance corrected', group: 'attendance' },
  'attendance.closed': { label: 'Attendance closed', group: 'attendance' },
  'checkin.synced': { label: 'Offline scans synced', group: 'attendance' },
  'checkin.conflict_kept_earliest': { label: 'Sync conflict resolved', group: 'attendance' },
  'checkin.conflict_confirmed': { label: 'Sync conflict resolved', group: 'attendance' },
  'checkin.conflict_rejected': { label: 'Sync conflict resolved', group: 'attendance' },
  'checkin.conflict_resolved': { label: 'Sync conflict resolved', group: 'attendance' },
  'checkin.reentry_approved': { label: 'Re-entry approved', group: 'attendance' },
  'checkin.pin_set': { label: 'Supervisor PIN set', group: 'attendance' },
  'checkin.pin_changed': { label: 'Supervisor PIN changed', group: 'attendance' },
  'refund.approved': { label: 'Refund approved', group: 'refunds' },
  'refund.declined': { label: 'Refund declined', group: 'refunds' },
  'hiker.suspended': { label: 'Account suspended', group: 'hikers' },
  'hiker.reactivated': { label: 'Account reactivated', group: 'hikers' },
  'staff.invited': { label: 'Staff invited', group: 'staff' },
  'staff.invite_resent': { label: 'Invite resent', group: 'staff' },
  'staff.invite_cancelled': { label: 'Invite cancelled', group: 'staff' },
  'staff.role_changed': { label: 'Role changed', group: 'staff' },
  'staff.activated': { label: 'Staff activated', group: 'staff' },
  'staff.deactivated': { label: 'Staff deactivated', group: 'staff' },
  'staff.two_factor_reset': { label: 'Two-step login reset', group: 'staff' },
  'staff.two_factor_set_up': { label: 'Two-step login set up', group: 'staff' },
  'ad.created': { label: 'Ad drafted', group: 'ads' },
  'ad.submitted': { label: 'Ad submitted', group: 'ads' },
  'ad.updated': { label: 'Ad updated', group: 'ads' },
  'ad.approved': { label: 'Ad approved', group: 'ads' },
  'ad.activated': { label: 'Ad approved', group: 'ads' },
  'ad.rejected': { label: 'Ad rejected', group: 'ads' },
  'ad.paused': { label: 'Ad paused', group: 'ads' },
  'ad.resumed': { label: 'Ad resumed', group: 'ads' },
  'ad.ended': { label: 'Ad ended early', group: 'ads' },
  'checkin_settings.updated': { label: 'Check-in settings changed', group: 'settings' },
  'notifications.updated': { label: 'Notifications changed', group: 'settings' },
  'notifications.provider_configured': { label: 'Provider configured', group: 'settings' },
  'branding.updated': { label: 'Branding changed', group: 'settings' },
};

export function auditLabel(action: string) {
  const known = AUDIT_ACTIONS[action];
  if (known) return known.label;
  const [thing, verb = 'changed'] = action.split('.');
  const text = `${thing.replace(/_/g, ' ')} ${verb.replace(/_/g, ' ')}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const auditGroupOf = (action: string): AuditGroup | undefined => AUDIT_ACTIONS[action]?.group;

/** Actions shown under each group in the filter (duplicate labels collapse to one code). */
export function actionsByGroup(group: AuditGroup) {
  const seen = new Set<string>();
  return Object.entries(AUDIT_ACTIONS)
    .filter(([, v]) => v.group === group && !seen.has(v.label) && seen.add(v.label))
    .map(([code, v]) => ({ code, label: v.label }));
}

/** Codes that share a label with `code` ("Sync conflict resolved" covers four), so filtering by one finds all. */
export const sameLabelCodes = (code: string) => {
  const label = AUDIT_ACTIONS[code]?.label;
  return label ? Object.keys(AUDIT_ACTIONS).filter((k) => AUDIT_ACTIONS[k].label === label) : [code];
};

export type AuditPreset = 'today' | 'last_7' | 'last_30' | 'last_90' | 'all' | 'custom';
export const AUDIT_PRESETS: { value: AuditPreset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'last_7', label: 'Last 7 days' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom dates' },
];

/** Inclusive Abuja dates for a preset; empty for "All time". */
export function auditRange(preset: AuditPreset, custom: { from?: string; to?: string } = {}, now = new Date()): { from?: string; to?: string } {
  const t = lagosDay(now);
  switch (preset) {
    case 'today':
      return { from: t, to: t };
    case 'last_7':
      return { from: addDays(t, -6), to: t };
    case 'last_30':
      return { from: addDays(t, -29), to: t };
    case 'last_90':
      return { from: addDays(t, -89), to: t };
    case 'custom':
      return { from: custom.from || undefined, to: custom.to || undefined };
    default:
      return {};
  }
}
