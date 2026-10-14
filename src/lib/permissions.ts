import type { Role, User } from '@/types/domain';

// Role permissions from Figma "Admin / Staff & roles" → Role permissions. The UI hides what a role can't do; the
// backend must enforce the same table (NFR-008). Change it here only. The last three rows (ads review, settings,
// audit log) aren't in the Figma matrix yet; they follow ROLE_ACCESS (admins: "events, hikers, reports, ads").

export type Permission =
  | 'manage_events'
  | 'sell_refund_tickets'
  | 'check_in'
  | 'correct_attendance'
  | 'view_analytics'
  | 'manage_ads'
  | 'review_ads'
  | 'manage_settings'
  | 'view_audit_log'
  | 'manage_staff'
  | 'view_hikers'
  | 'suspend_hikers';

export const STAFF_ROLES = ['super_admin', 'admin', 'checkin_staff', 'advertiser'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: 'Super admin',
  admin: 'Admin',
  checkin_staff: 'Check-in staff',
  advertiser: 'Advertiser',
};

export const ROLE_ACCESS: Record<StaffRole, string> = {
  super_admin: 'Everything incl. roles & refunds',
  admin: 'Events, hikers, reports, ads',
  checkin_staff: 'Scanner and manual check-in only',
  advertiser: 'Own campaigns and their stats',
};

/** Rows of the matrix, in Figma order. */
export const PERMISSION_ROWS: { permission: Permission; label: string; note?: string }[] = [
  { permission: 'manage_events', label: 'Manage events' },
  { permission: 'sell_refund_tickets', label: 'Sell & refund tickets' },
  { permission: 'check_in', label: 'Check in hikers' },
  { permission: 'correct_attendance', label: 'Correct attendance' },
  { permission: 'view_analytics', label: 'View analytics' },
  { permission: 'manage_ads', label: 'Manage ads', note: 'Advertisers: their own campaigns only' },
  { permission: 'review_ads', label: 'Approve, reject & end ads' },
  { permission: 'manage_settings', label: 'Branding & notifications' },
  { permission: 'view_audit_log', label: 'View audit log' },
  { permission: 'manage_staff', label: 'Manage staff & roles' },
];

const MATRIX: Record<StaffRole, Permission[]> = {
  super_admin: ['manage_events', 'sell_refund_tickets', 'check_in', 'correct_attendance', 'view_analytics', 'manage_ads', 'review_ads', 'manage_settings', 'view_audit_log', 'manage_staff', 'view_hikers', 'suspend_hikers'],
  admin: ['manage_events', 'sell_refund_tickets', 'check_in', 'correct_attendance', 'view_analytics', 'manage_ads', 'review_ads', 'manage_settings', 'view_audit_log', 'view_hikers', 'suspend_hikers'],
  checkin_staff: ['check_in'],
  advertiser: ['manage_ads'],
};

export const roleHas = (role: StaffRole, permission: Permission) => MATRIX[role].includes(permission);

/** Whether any of the user's roles grants `permission`. */
export function can(user: Pick<User, 'roles'> | null | undefined, permission: Permission): boolean {
  return !!user && user.roles.some((r: Role) => (STAFF_ROLES as readonly string[]).includes(r) && roleHas(r as StaffRole, permission));
}

/** The highest staff role a user has, for display. */
export function primaryRole(user: Pick<User, 'roles'>): StaffRole | null {
  return STAFF_ROLES.find((r) => user.roles.includes(r)) ?? null;
}

/** Where a staff member lands in the admin area: the first screen their role can open. */
export function adminHome(user: Pick<User, 'roles'> | null | undefined): string {
  if (can(user, 'manage_events')) return '/admin';
  if (can(user, 'manage_ads')) return '/admin/ads';
  if (can(user, 'check_in')) return '/checkin';
  return '/';
}
