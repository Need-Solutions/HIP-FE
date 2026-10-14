import { useEffect, useState, type ReactNode } from 'react';
import { authApi } from '@/api/endpoints';
import type { User } from '@/types/domain';
import { AuthContext, type AuthState } from './AuthContext';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authApi
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const value: AuthState = {
    user,
    loading,
    login: async (identifier, password, remember) => {
      const u = await authApi.login(identifier, password, remember);
      setUser(u);
      return u;
    },
    signIn: setUser,
    logout: async () => {
      await authApi.logout();
      setUser(null);
    },
    hasRole: (...roles) => !!user && user.roles.some((r) => roles.includes(r)),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
