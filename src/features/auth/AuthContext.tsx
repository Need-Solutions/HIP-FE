import { createContext, useContext } from 'react';
import type { Role, User } from '@/types/domain';

// The provider lives in AuthProvider.tsx, so this file exports no components (keeps React Fast Refresh happy).

export interface AuthState {
  user: User | null;
  loading: boolean;
  /** Email or phone + password. Rejects with the API error (use authError() to read it). */
  login: (identifier: string, password: string, remember?: boolean) => Promise<User>;
  /** For flows that end signed in without a password step here (code verification, staff 2-step). */
  signIn: (user: User) => void;
  logout: () => Promise<void>;
  hasRole: (...roles: Role[]) => boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
