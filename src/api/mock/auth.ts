import { ApiError } from '../client';
import { mockStaff, mockUser } from './data';
import { allTickets, mockSession, update, type MockAuthState } from './store';
import { normalisePhone } from '@/lib/validation';
import type { AuthErrorBody, SignupRequest, StaffChallenge, VerificationStart, VerifyResult } from '../endpoints';
import type { User } from '@/types/domain';

// Mock auth backend. Rules mirror what the real API must do:
//   AUTH-009  wrong email OR wrong password → the same invalid_credentials error
//   AUTH-013  5 failed attempts per identifier → 15-minute lock; each failure reports attempts left
//   AUTH-004  sign-up rejects an email/phone that belongs to a verified account
// Every mock account's password is MOCK_PASSWORD; every one-time code is MOCK_CODE.

export const MOCK_PASSWORD = 'Hiking123!';
export const MOCK_CODE = '123456';
const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const CODE_ATTEMPTS = 5;
const RESEND_SECONDS = 60;

export const fail = (status: number, body: AuthErrorBody): never => {
  throw new ApiError(status, body.message, body);
};

/** The mock accounts (created on first use). Also used by api/mock/account.ts. */
export function auth(s: { auth?: MockAuthState }): MockAuthState {
  s.auth ??= {
    failures: {},
    users: [mockUser, ...mockStaff].map((user) => ({ user, password: MOCK_PASSWORD })),
    verifications: {},
    staffChallenges: {},
  };
  return s.auth;
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const findAccount = (a: MockAuthState, identifier: string) =>
  a.users.find(({ user }) => same(user.email, identifier) || normalisePhone(user.phone) === normalisePhone(identifier));

export const maskEmail = (e: string) => e.replace(/^(.)[^@]*(@.*)$/, (_, first: string, domain: string) => `${first}•••••${domain}`);
export const maskPhone = (p: string) => `${normalisePhone(p).slice(0, 4)} ••• ••• ${normalisePhone(p).slice(-4)}`;
const id = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 8)}`;

/** Checks credentials with lockout. Returns the account or throws the generic error. */
function checkPassword(a: MockAuthState, identifier: string, password: string, accept: (u: User) => boolean) {
  const key = identifier.trim().toLowerCase();
  const f = (a.failures[key] ??= { count: 0 });
  if (f.lockedUntil && new Date(f.lockedUntil).getTime() > Date.now()) {
    const minutes = Math.ceil((new Date(f.lockedUntil).getTime() - Date.now()) / 60_000);
    fail(423, { code: 'locked', message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, retryAfterSeconds: minutes * 60, lockMinutes: LOCK_MINUTES });
  }
  const account = findAccount(a, identifier);
  if (!account || account.password !== password || !accept(account.user)) {
    f.count += 1;
    if (f.count >= MAX_ATTEMPTS) {
      f.count = 0;
      f.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
      fail(423, { code: 'locked', message: `Too many attempts. Try again in ${LOCK_MINUTES} minutes.`, retryAfterSeconds: LOCK_MINUTES * 60, lockMinutes: LOCK_MINUTES });
    }
    fail(401, { code: 'invalid_credentials', message: 'Incorrect email or password.', attemptsLeft: MAX_ATTEMPTS - f.count, lockMinutes: LOCK_MINUTES });
  }
  delete a.failures[key];
  return account!;
}

function startVerification(a: MockAuthState, user: User, channel: 'email' | 'phone', guestTickets: number): VerificationStart {
  const verificationId = id('ver');
  a.verifications[verificationId] = { userId: user.id, channel, attempts: 0, guestTickets };
  return {
    verificationId,
    channel,
    destination: channel === 'email' ? maskEmail(user.email) : maskPhone(user.phone),
    resendAvailableAt: new Date(Date.now() + RESEND_SECONDS * 1000).toISOString(),
    guestTicketsToMerge: guestTickets,
  };
}

/** Guest tickets bought with this email or phone, which join the account once it's verified. */
const guestTicketsFor = (email: string, phone: string) =>
  allTickets().filter((t) => t.isGuest && ((t.holder.email && same(t.holder.email, email)) || (t.holder.phone && normalisePhone(t.holder.phone) === normalisePhone(phone)))).length;

export const mockAuth = {
  login(identifier: string, password: string): User {
    return update((s) => {
      const a = auth(s);
      const { user } = checkPassword(a, identifier, password, () => true);
      // Right password, so saying why is safe (AUTH-009 still holds for wrong ones).
      if (user.status === 'suspended') fail(403, { code: 'suspended', message: 'This account is suspended. Contact the group if you think this is a mistake.' });
      if (user.status === 'unverified') {
        // The password was right, so saying "not verified yet" reveals nothing new (AUTH-009 still holds).
        const v = startVerification(a, user, 'email', guestTicketsFor(user.email, user.phone));
        fail(403, { code: 'unverified', message: 'Please verify your email to finish setting up your account.', verificationId: v.verificationId, destination: v.destination });
      }
      s.sessionUser = user;
      return user;
    });
  },

  signup(req: SignupRequest): VerificationStart {
    return update((s) => {
      const a = auth(s);
      const verified = a.users.filter(({ user }) => user.status !== 'unverified');
      if (verified.some(({ user }) => same(user.email, req.email))) {
        fail(409, { code: 'email_taken', message: 'An account with this email already exists.', field: 'email' });
      }
      if (verified.some(({ user }) => normalisePhone(user.phone) === normalisePhone(req.phone))) {
        fail(409, { code: 'phone_taken', message: 'An account with this phone number already exists.', field: 'phone' });
      }
      // An unverified sign-up with the same email is replaced (they never finished verifying).
      a.users = a.users.filter(({ user }) => user.status !== 'unverified' || !same(user.email, req.email));
      const user: User = {
        id: id('usr'),
        fullName: req.fullName,
        email: req.email,
        phone: req.phone,
        roles: ['hiker'],
        status: 'unverified',
        emailVerified: false,
        phoneVerified: false,
        createdAt: new Date().toISOString(),
      };
      a.users.push({ user, password: req.password });
      return startVerification(a, user, 'email', guestTicketsFor(req.email, req.phone));
    });
  },

  resend(verificationId: string, channel: 'email' | 'phone'): VerificationStart {
    return update((s) => {
      const a = auth(s);
      const v = a.verifications[verificationId];
      const account = v && a.users.find(({ user }) => user.id === v.userId);
      if (!v || !account) fail(410, { code: 'code_expired', message: 'This code has expired. Please sign up or log in again.' });
      delete a.verifications[verificationId];
      return startVerification(a, account!.user, channel, v.guestTickets);
    });
  },

  verify(verificationId: string, code: string): VerifyResult {
    return update((s) => {
      const a = auth(s);
      const v = a.verifications[verificationId];
      if (!v) fail(410, { code: 'code_expired', message: 'This code has expired. Request a new one.' });
      if (code !== MOCK_CODE) {
        v.attempts += 1;
        if (v.attempts >= CODE_ATTEMPTS) {
          delete a.verifications[verificationId];
          fail(410, { code: 'code_expired', message: 'Too many wrong codes. Request a new one.' });
        }
        fail(400, { code: 'invalid_code', message: 'That code isn’t right.', attemptsLeft: CODE_ATTEMPTS - v.attempts });
      }
      const account = a.users.find(({ user }) => user.id === v.userId)!;
      account.user = {
        ...account.user,
        status: 'active',
        emailVerified: account.user.emailVerified || v.channel === 'email',
        phoneVerified: account.user.phoneVerified || v.channel === 'phone',
      };
      delete a.verifications[verificationId];
      s.sessionUser = account.user;
      return { user: account.user, mergedTickets: v.guestTickets };
    });
  },

  resetPassword(token: string, password: string) {
    update((s) => {
      const a = auth(s);
      if (!token || token === 'expired') fail(400, { code: 'token_invalid', message: 'This reset link has expired or was already used.' });
      // Mock links reset Adaeze's account. Reusing the current password is refused.
      const account = a.users.find(({ user }) => user.id === mockUser.id)!;
      if (account.password === password) fail(400, { code: 'password_reused', message: 'Choose a password you haven’t used on HIP before.', field: 'password' });
      account.password = password;
    });
  },

  staffLogin(email: string, password: string): StaffChallenge {
    return update((s) => {
      const a = auth(s);
      // Hiker accounts get the same generic error as a wrong password (no hint that the email exists).
      const { user } = checkPassword(a, email, password, (u) => u.roles.some((r) => r !== 'hiker'));
      if (user.status === 'deactivated' || user.status === 'suspended') fail(403, { code: 'suspended', message: 'This staff account is deactivated. Ask a super admin.' });
      const challengeId = id('stf');
      a.staffChallenges[challengeId] = user.id;
      return { challengeId, method: 'authenticator' };
    });
  },

  staffVerify(challengeId: string, code: string): User {
    return update((s) => {
      const a = auth(s);
      const userId = a.staffChallenges[challengeId];
      if (!userId) fail(410, { code: 'code_expired', message: 'Your sign-in timed out. Please sign in again.' });
      if (code !== MOCK_CODE) fail(400, { code: 'invalid_code', message: 'That code isn’t right. Check your authenticator app.' });
      delete a.staffChallenges[challengeId];
      const user = a.users.find((x) => x.user.id === userId)!.user;
      s.sessionUser = user;
      return user;
    });
  },

  logout: () => mockSession.logout(),
};
