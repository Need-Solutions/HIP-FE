import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { History, Home, Menu, Ticket, User, X } from 'lucide-react';
import { Logo } from '@/components/ui';
import { useBranding } from '@/features/branding/BrandingContext';
import { cn } from '@/lib/cn';

const tabs = [
  { to: '/account', label: 'Dashboard', icon: Home, end: true },
  { to: '/account/tickets', label: 'My tickets', icon: Ticket },
  { to: '/account/history', label: 'Hiking history', icon: History },
  { to: '/account/profile', label: 'Profile', icon: User },
];

export function HikerLayout() {
  const { name } = useBranding();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const outsideClick = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    const desktop = window.matchMedia('(min-width: 768px)');
    const resize = () => {
      if (desktop.matches) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', outsideClick);
    document.addEventListener('keydown', escape);
    desktop.addEventListener('change', resize);
    return () => {
      document.removeEventListener('pointerdown', outsideClick);
      document.removeEventListener('keydown', escape);
      desktop.removeEventListener('change', resize);
    };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-canvas">
      <header
        ref={header}
        className="sticky top-0 z-40 border-b border-line bg-white print:hidden"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setMenuOpen(false);
        }}
      >
        <div className="container-page flex h-16 items-center justify-between md:h-[76px]">
          <Link to="/account" aria-label={`${name} dashboard`} className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40">
            <Logo />
          </Link>
          <nav aria-label="My account" className="hidden h-full gap-6 md:flex lg:gap-10">
            {tabs.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn('flex items-center gap-2 whitespace-nowrap border-b-[3px] py-4 text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40', isActive ? 'border-forest font-bold text-forest' : 'border-transparent text-slate')
                }
              >
                <Icon size={18} aria-hidden /> {label}
              </NavLink>
            ))}
          </nav>
          <button
            ref={menuButton}
            type="button"
            aria-label={menuOpen ? 'Close account menu' : 'Open account menu'}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            onClick={() => setMenuOpen((open) => !open)}
            className="grid size-11 place-items-center rounded-xl border border-line text-forest hover:bg-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 md:hidden"
          >
            {menuOpen ? <X size={22} aria-hidden /> : <Menu size={22} aria-hidden />}
          </button>
        </div>
        <nav
          id={menuId}
          aria-label="My account"
          hidden={!menuOpen}
          className="absolute inset-x-0 top-full border-b border-line bg-white shadow-lg md:hidden"
        >
          <div className="container-page space-y-1 py-3">
            {tabs.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => {
                  setMenuOpen(false);
                  menuButton.current?.focus();
                }}
                className={({ isActive }) =>
                  cn('flex min-h-11 items-center gap-3 rounded-xl px-4 py-3 text-[15px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40', isActive ? 'bg-mint font-bold text-forest' : 'text-slate hover:bg-canvas hover:text-forest')
                }
              >
                <Icon size={18} aria-hidden /> {label}
              </NavLink>
            ))}
          </div>
        </nav>
      </header>
      <main id="main" tabIndex={-1} className="container-page py-10 focus:outline-none"><Outlet /></main>
    </div>
  );
}
