import { ApiError } from '../client';
import { mockStaff } from './data';
import { auth } from './auth';
import { peopleState } from './people';
import { pushAudit, update, type MockState } from './store';
import { STAFF_ROLES, can, primaryRole, ROLE_LABEL, type StaffRole } from '@/lib/permissions';
import type { AuthenticatorSetup, StaffMember } from '../endpoints';
import type { Role } from '@/types/domain';

// Mock staff management (Admin / Staff & roles). Rules the backend must keep:
//   - Only super admins manage staff; nobody changes their own role or deactivates themselves (ADM-005).
//   - The last active super admin can't be demoted or deactivated.
//   - Staff sign in with two-step login (ADM-001); each sets up an authenticator app, and a super admin can reset it.
//   - Every change is audit-logged.

const viewer = (s: MockState) => s.sessionUser ?? mockStaff[0];
const isStaff = (roles: Role[]) => roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function seedMeta(s: MockState) {
  const st = peopleState(s);
  if (st.staffSeeded) return st;
  st.staffSeeded = true;
  const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  st.staffMeta = {
    usr_staff_1: { lastActiveAt: ago(0), twoFactorAt: '2025-01-10T10:00:00Z' },
    usr_staff_2: { lastActiveAt: ago(26), twoFactorAt: '2025-02-01T10:00:00Z' },
    usr_staff_3: { lastActiveAt: ago(2), twoFactorAt: '2025-03-15T10:00:00Z' },
    usr_staff_4: { lastActiveAt: '2026-10-10T06:30:00Z', twoFactorAt: '2025-06-01T10:00:00Z' },
    usr_staff_5: { lastActiveAt: ago(30), twoFactorAt: null },
  };
  if (!st.invites.length) st.invites.push({ id: 'inv_dayo', name: 'Dayo Ibe', email: 'dayo@hip.ng', role: 'checkin_staff', invitedAt: '2026-10-11T09:00:00Z', invitedBy: mockStaff[0].fullName });
  return st;
}

function members(s: MockState): StaffMember[] {
  const st = seedMeta(s);
  const me = viewer(s);
  const users = auth(s)
    .users.map((u) => u.user)
    .filter((u) => isStaff(u.roles))
    .map((u): StaffMember => {
      const meta = st.staffMeta[u.id] ?? {};
      return {
        id: u.id,
        name: u.fullName,
        email: u.email,
        role: primaryRole(u) ?? 'checkin_staff',
        status: u.status === 'deactivated' ? 'deactivated' : 'active',
        lastActiveAt: u.id === me.id ? new Date().toISOString() : meta.lastActiveAt,
        twoFactor: { setUp: !!meta.twoFactorAt, setUpAt: meta.twoFactorAt ?? undefined },
        isYou: u.id === me.id,
      };
    });
  const invited = st.invites.map((i): StaffMember => ({ id: i.id, name: i.name, email: i.email, role: i.role, status: 'invited', twoFactor: { setUp: false }, isYou: false }));
  const order: StaffRole[] = ['super_admin', 'admin', 'checkin_staff', 'advertiser'];
  return [...users.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.name.localeCompare(b.name)), ...invited];
}

function requireManager(s: MockState) {
  if (!can(viewer(s), 'manage_staff')) throw new ApiError(403, 'Only a super admin can manage staff.');
}

function account(s: MockState, id: string) {
  const acct = auth(s).users.find((u) => u.user.id === id && isStaff(u.user.roles));
  if (!acct) throw new ApiError(404, 'Staff member not found.');
  return acct;
}

function lastSuperAdmin(s: MockState, id: string) {
  const supers = auth(s).users.filter((u) => u.user.roles.includes('super_admin') && u.user.status !== 'deactivated');
  return supers.length === 1 && supers[0].user.id === id;
}

const rolesFor = (role: StaffRole): Role[] => (role === 'super_admin' ? ['admin', 'super_admin'] : [role]);

export const mockStaffAdmin = {
  list: (): StaffMember[] => update(members),

  invite: (body: { name: string; email: string; role: StaffRole }): StaffMember =>
    update((s) => {
      requireManager(s);
      const st = seedMeta(s);
      const email = body.email.trim().toLowerCase();
      if (auth(s).users.some((u) => u.user.email.toLowerCase() === email && isStaff(u.user.roles)) || st.invites.some((i) => i.email.toLowerCase() === email)) {
        throw new ApiError(409, 'This email already belongs to a staff member or invite.', { code: 'email_taken', message: 'This email already belongs to a staff member or invite.', field: 'email' });
      }
      const invite = { id: `inv_${crypto.randomUUID().slice(0, 8)}`, name: body.name.trim(), email, role: body.role, invitedAt: new Date().toISOString(), invitedBy: viewer(s).fullName };
      st.invites.push(invite);
      pushAudit(s, { action: 'staff.invited', recordType: 'user', recordId: invite.id, details: `Invited ${invite.name} (${email}) as ${ROLE_LABEL[body.role]}` });
      return members(s).find((m) => m.id === invite.id)!;
    }),

  resendInvite: (id: string): void =>
    update((s) => {
      requireManager(s);
      const invite = seedMeta(s).invites.find((i) => i.id === id);
      if (!invite) throw new ApiError(404, 'Invite not found.');
      pushAudit(s, { action: 'staff.invite_resent', recordType: 'user', recordId: id, details: `Invite sent again to ${invite.email}` });
    }),

  /** ADM-005: never your own role. */
  changeRole: (id: string, role: StaffRole): StaffMember =>
    update((s) => {
      requireManager(s);
      if (id === viewer(s).id) throw new ApiError(403, 'You can’t change your own role. Ask another super admin.');
      const st = seedMeta(s);
      const invite = st.invites.find((i) => i.id === id);
      if (invite) {
        const before = invite.role;
        invite.role = role;
        pushAudit(s, { action: 'staff.role_changed', recordType: 'user', recordId: id, details: `${invite.name} (invited): ${ROLE_LABEL[before]} → ${ROLE_LABEL[role]}` });
        return members(s).find((m) => m.id === id)!;
      }
      const acct = account(s, id);
      const before = primaryRole(acct.user) ?? 'checkin_staff';
      if (before === 'super_admin' && role !== 'super_admin' && lastSuperAdmin(s, id)) throw new ApiError(409, 'There must always be at least one active super admin.');
      acct.user = { ...acct.user, roles: rolesFor(role) };
      pushAudit(s, { action: 'staff.role_changed', recordType: 'user', recordId: id, details: `${acct.user.fullName}: ${ROLE_LABEL[before]} → ${ROLE_LABEL[role]}` });
      return members(s).find((m) => m.id === id)!;
    }),

  setActive: (id: string, active: boolean): StaffMember =>
    update((s) => {
      requireManager(s);
      if (id === viewer(s).id) throw new ApiError(403, 'You can’t deactivate your own account.');
      const st = seedMeta(s);
      const inviteIndex = st.invites.findIndex((i) => i.id === id);
      if (inviteIndex >= 0) {
        if (active) throw new ApiError(409, 'An invite becomes active when the person accepts it.');
        const [invite] = st.invites.splice(inviteIndex, 1);
        pushAudit(s, { action: 'staff.invite_cancelled', recordType: 'user', recordId: id, details: `Cancelled the invite for ${invite.email}` });
        return { id, name: invite.name, email: invite.email, role: invite.role, status: 'deactivated', twoFactor: { setUp: false }, isYou: false };
      }
      const acct = account(s, id);
      if (!active && acct.user.roles.includes('super_admin') && lastSuperAdmin(s, id)) throw new ApiError(409, 'There must always be at least one active super admin.');
      acct.user = { ...acct.user, status: active ? 'active' : 'deactivated' };
      pushAudit(s, { action: active ? 'staff.activated' : 'staff.deactivated', recordType: 'user', recordId: id, details: `${active ? 'Activated' : 'Deactivated'} ${acct.user.fullName}` });
      return members(s).find((m) => m.id === id)!;
    }),

  resetTwoFactor: (id: string): StaffMember =>
    update((s) => {
      requireManager(s);
      const st = seedMeta(s);
      const acct = account(s, id);
      st.staffMeta[id] = { ...st.staffMeta[id], twoFactorAt: null };
      pushAudit(s, { action: 'staff.two_factor_reset', recordType: 'user', recordId: id, details: `Two-step login reset for ${acct.user.fullName}: they set it up again at their next sign-in` });
      return members(s).find((m) => m.id === id)!;
    }),

  /** Your own authenticator: a fresh secret (the real server also stores it until confirmed). */
  startTotp: (): AuthenticatorSetup =>
    update((s) => {
      const me = viewer(s);
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => BASE32[b % 32]).join('');
      peopleState(s).pendingTotp = { userId: me.id, secret };
      const issuer = encodeURIComponent((s.branding?.name ?? 'HIP') + ' Staff');
      return { secret, otpauthUri: `otpauth://totp/${issuer}:${encodeURIComponent(me.email)}?secret=${secret}&issuer=${issuer}&digits=6&period=30` };
    }),

  /** Mock: every authenticator code is 123456 (the real server checks the TOTP against the secret). */
  confirmTotp: (code: string): StaffMember =>
    update((s) => {
      const me = viewer(s);
      const st = seedMeta(s);
      if (!st.pendingTotp || st.pendingTotp.userId !== me.id) throw new ApiError(409, 'Start the setup again.');
      if (code !== '123456') throw new ApiError(400, 'That code isn’t right. Check the time on your phone and try again.', { code: 'invalid_code', message: 'That code isn’t right.' });
      st.staffMeta[me.id] = { ...st.staffMeta[me.id], twoFactorAt: new Date().toISOString() };
      delete st.pendingTotp;
      pushAudit(s, { action: 'staff.two_factor_set_up', recordType: 'user', recordId: me.id, details: `${me.fullName} set up two-step login with an authenticator app` });
      return members(s).find((m) => m.id === me.id)!;
    }),
};
