import { Navigate, Outlet } from 'react-router-dom';
import { adminHome, type Permission } from '@/lib/permissions';
import { useAuth } from './AuthContext';
import { useCan } from './useCan';

/**
 * Admin route guard by permission (lib/permissions.ts), inside RequireRole. Someone without the permission goes to
 * the first admin screen their role can open, e.g. an advertiser to Ads. The server checks every request again.
 */
export function RequirePermission({ permission }: { permission: Permission }) {
  const { user, loading } = useAuth();
  const allowed = useCan(permission);
  if (allowed) return <Outlet />;
  if (loading || !user) return null;
  return <Navigate to={adminHome(user)} replace />;
}
