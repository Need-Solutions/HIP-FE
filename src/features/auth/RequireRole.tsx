import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import type { Role } from '@/types/domain';
import { DEV_BYPASS } from './devBypass';
import { adminHome } from '@/lib/permissions';

/**
 * Route guard. UI-only convenience: the backend must enforce the same permissions (NFR-008).
 * With VITE_USE_MOCKS=true in dev, DEV_BYPASS (devBypass.ts) previews protected screens without logging in.
 */

export function RequireRole({ roles, loginPath = '/login' }: { roles?: Role[]; loginPath?: string }) {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();
  if (loading) return null;
  // Dev preview only bypasses the guard while signed out; a signed-in user gets the real role check, as in production.
  if (!user) return DEV_BYPASS ? <Outlet /> : <Navigate to={loginPath} state={{ from: location }} replace />;
  // Wrong role: staff go to the first screen their role can open (check-in staff to /checkin), others home.
  if (roles && !hasRole(...roles)) return <Navigate to={adminHome(user)} replace />;
  return <Outlet />;
}
