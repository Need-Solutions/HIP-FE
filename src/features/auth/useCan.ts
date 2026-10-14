import { can, type Permission } from '@/lib/permissions';
import { useAuth } from './AuthContext';
import { DEV_BYPASS } from './devBypass';

/**
 * Whether the signed-in staff member has a permission. In the dev preview (route guards bypassed, nobody signed in)
 * screens act as the sample super admin, but only once the session check has finished, so a slow /me never flashes
 * controls the real user can't use. The server checks every action again.
 */
export function useCan(permission: Permission): boolean {
  const { user, loading } = useAuth();
  if (user) return can(user, permission);
  return DEV_BYPASS && !loading;
}

/** The same check as useCan for a list of permissions (e.g. filtering the admin navigation). */
export function usePermissionCheck(): (permission: Permission) => boolean {
  const { user, loading } = useAuth();
  return (permission) => (user ? can(user, permission) : DEV_BYPASS && !loading);
}
