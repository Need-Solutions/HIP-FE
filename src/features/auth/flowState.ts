import type { VerificationStart } from '@/api/endpoints';

// Router state passed between auth pages. Pages must still work without it (refresh, shared link).

/** Sign up / log in → /verify?id=… */
export interface VerifyState extends Partial<VerificationStart> {
  firstName?: string;
}

/** /verify → /welcome */
export interface WelcomeState {
  firstName: string;
  mergedTickets: number;
}

/** Shown as a banner on /login, e.g. after a password reset. */
export interface LoginNotice {
  notice?: string;
  /** Where to go after logging in (set by RequireRole). */
  from?: { pathname: string; search?: string };
}
