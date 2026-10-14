import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { BarChart3, Bell, Brush, CalendarDays, FileText, LayoutGrid, LogOut, Megaphone, Menu, ScanLine, Search, UserCog, Users, Wallet, X } from 'lucide-react';
import { Avatar, Logo } from '@/components/ui';
import { AdminSearch } from '@/components/admin/AdminSearch';
import { AdminTitleContext, type AdminTitle } from '@/features/admin/adminTitle';
import { useAuth } from '@/features/auth/AuthContext';
import { usePermissionCheck } from '@/features/auth/useCan';
import { ROLE_LABEL, primaryRole, type Permission } from '@/lib/permissions';
import { cn } from '@/lib/cn';

// Each item needs the same permission as its route (routes/router.tsx), so nobody sees a link they can't open.
const items: { to: string; label: string; icon: typeof LayoutGrid; end?: boolean; permission: Permission }[] = [
  { to: '/admin', label: 'Overview', icon: LayoutGrid, end: true, permission: 'manage_events' },
  { to: '/admin/events', label: 'Events', icon: CalendarDays, permission: 'manage_events' },
  { to: '/admin/checkin', label: 'Check-in', icon: ScanLine, permission: 'manage_events' },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3, permission: 'view_analytics' },
  { to: '/admin/transactions', label: 'Transactions', icon: Wallet, permission: 'sell_refund_tickets' },
  { to: '/admin/hikers', label: 'Hikers', icon: Users, permission: 'view_hikers' },
  { to: '/admin/ads', label: 'Ads', icon: Megaphone, permission: 'manage_ads' },
  { to: '/admin/staff', label: 'Staff & roles', icon: UserCog, permission: 'manage_events' },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell, permission: 'manage_settings' },
  { to: '/admin/branding', label: 'Branding', icon: Brush, permission: 'manage_settings' },
  { to: '/admin/audit-log', label: 'Audit log', icon: FileText, permission: 'view_audit_log' },
];

/** Figma "Admin / *": pine sidebar, white top bar with the page title, canvas content. Desktop-first; a drawer below lg. */
export function AdminLayout() {
  const { user, logout } = useAuth();
  const [title, setTitleState] = useState<AdminTitle>({ title: '' });
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const location = useLocation();
  const setTitle = useCallback((t: AdminTitle) => setTitleState(t), []);
  const name = user?.fullName ?? 'Admin';
  const staffRole = user ? primaryRole(user) : null;
  const role = staffRole ? ROLE_LABEL[staffRole] : 'Super admin';
  const allowed = usePermissionCheck();
  const sectionName = [...items].reverse().find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)))?.label ?? 'Admin';

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  const sidebar = (
    <>
      <div className="flex items-center justify-between px-3">
        <Logo dark />
        <button type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} className="grid size-9 place-items-center rounded-lg text-white lg:hidden">
          <X size={20} aria-hidden />
        </button>
      </div>
      <p className="mt-10 px-3 text-[11px] font-semibold uppercase tracking-wider text-camera-mute">Manage</p>
      <nav aria-label="Admin" className="mt-3 flex-1 space-y-1.5 overflow-y-auto">
        {items.filter((i) => allowed(i.permission)).map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex h-10 items-center gap-3 rounded-xl px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                isActive ? 'bg-forest-600 font-semibold text-on-primary before:absolute before:left-0 before:h-6 before:w-[3px] before:rounded before:bg-sun' : 'font-medium text-camera-mute hover:text-white',
              )
            }
          >
            <Icon size={18} aria-hidden /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="flex items-center gap-3 border-t border-white/10 px-3 pt-5">
        <Avatar name={name} tone="sun" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
          <p className="text-xs text-camera-mute">{role}</p>
        </div>
        <button type="button" aria-label="Log out" onClick={() => void logout()} className="grid size-8 place-items-center rounded-lg text-camera-mute hover:text-white">
          <LogOut size={16} aria-hidden />
        </button>
      </div>
    </>
  );

  return (
    <AdminTitleContext.Provider value={setTitle}>
      <div className="flex min-h-screen bg-canvas">
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col bg-pine px-4 py-7 lg:flex">{sidebar}</aside>
        {menuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink/50" onClick={() => setMenuOpen(false)} />
            <aside className="relative flex h-full w-[260px] flex-col bg-pine px-4 py-7">{sidebar}</aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-40">
            <header className="flex min-h-20 items-center gap-4 border-b border-line bg-white px-4 py-3 sm:px-6 lg:px-10">
              <button type="button" aria-label="Open menu" onClick={() => setMenuOpen(true)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-line lg:hidden">
                <Menu size={20} aria-hidden />
              </button>
              <div className="min-w-0 flex-1">
                {/* Until the page sets its title (it may still be loading), name the section so the heading is never empty. */}
                <h1 className="truncate text-[22px] md:text-[26px]">{title.title || sectionName}</h1>
                {title.subtitle && <div className="mt-0.5 truncate text-[13px] text-slate md:text-sm">{title.subtitle}</div>}
              </div>
              <AdminSearch className="hidden w-[300px] md:block" />
              <button
                type="button"
                aria-label="Search hikers and tickets"
                aria-expanded={searchOpen}
                onClick={() => setSearchOpen((o) => !o)}
                className="grid size-10 shrink-0 place-items-center rounded-xl border border-line md:hidden"
              >
                <Search size={18} aria-hidden />
              </button>
              <span className="hidden sm:block">
                <Avatar name={name} />
              </span>
            </header>
            {/* Phones: the search opens in its own row under the top bar. */}
            {searchOpen && (
              <div className="border-b border-line bg-white px-4 py-3 md:hidden">
                <AdminSearch autoFocus onDone={() => setSearchOpen(false)} />
              </div>
            )}
          </div>
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
            <Outlet />
          </main>
        </div>
      </div>
    </AdminTitleContext.Provider>
  );
}
