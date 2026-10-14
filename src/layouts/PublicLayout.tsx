import { Link, NavLink, Outlet } from 'react-router-dom';
import { Avatar, Logo, ButtonLink } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { useBranding } from '@/features/branding/BrandingContext';
import { cn } from '@/lib/cn';

const links = [
  { to: '/events', label: 'Events' },
  { to: '/about', label: 'About' },
  { to: '/find-ticket', label: 'Find my ticket' },
];

export function SiteNav() {
  const { user } = useAuth();
  const { name } = useBranding();
  return (
    <header className="fixed inset-x-4 top-4 z-40 mx-auto max-w-[1216px] rounded-2xl border border-line/70 bg-white/95 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.3)] backdrop-blur-xl md:inset-x-8 md:top-6 print:hidden">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 md:h-[72px]">
        <Link to="/" aria-label={`${name} home`}><Logo /></Link>
        <nav aria-label="Main" className="hidden gap-1 md:flex">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                cn('rounded-full px-4 py-2 text-[15px] font-medium text-ink transition-colors hover:bg-mint hover:text-forest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40', isActive && 'bg-mint font-semibold text-forest')
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          {user ? (
            <Link to="/account" className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Avatar name={user.fullName} />
              <span className="max-sm:sr-only">{user.fullName.split(' ')[0]}</span>
            </Link>
          ) : (
            <>
              <Link to="/login" className="hidden text-[15px] font-semibold text-ink hover:text-forest sm:inline">Log in</Link>
              <ButtonLink to="/signup" variant="accent" size="sm" className="px-5">Sign up</ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { name, fullName, tagline, contact } = useBranding();
  const social = [
    { label: 'Instagram', href: contact.instagram },
    { label: 'X', href: contact.x },
    { label: 'Facebook', href: contact.facebook },
    { label: 'WhatsApp', href: contact.whatsapp },
  ].filter((x): x is { label: string; href: string } => !!x.href);
  return (
    <footer className="bg-pine text-mist print:hidden">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo dark />
          <p className="mt-4 max-w-xs text-sm">{fullName} — {tagline}</p>
        </div>
        {[
          { title: 'Explore', links: [['Events', '/events'], ['Past hikes', '/events?status=past'], ['Find my ticket', '/find-ticket']] },
          { title: 'Group', links: [['About us', '/about'], ['Safety', '/about#safety'], ['Contact', '/about#contact']] },
        ].map(({ title, links }) => (
          <nav key={title} aria-label={title}>
            <p className="text-sm font-bold text-white">{title}</p>
            <ul className="mt-4 space-y-3 text-sm">
              {links.map(([label, to]) => (
                <li key={to}><Link to={to} className="hover:text-white hover:underline">{label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
        <div>
          <p className="text-sm font-bold text-white">Contact</p>
          <ul className="mt-4 space-y-3 text-sm">
            <li><a href={`mailto:${contact.email}`} className="hover:text-white hover:underline">{contact.email}</a></li>
            <li><a href={`tel:${contact.phone.replace(/\s+/g, '')}`} className="hover:text-white hover:underline">{contact.phone}</a></li>
            <li>{contact.location}</li>
          </ul>
        </div>
      </div>
      <div className="container-page flex flex-wrap justify-between gap-4 border-t border-pine-line py-6 text-[13px] text-mist-dim">
        <span>© {new Date().getFullYear()} {name}. All rights reserved.</span>
        <nav aria-label="Legal and social" className="flex flex-wrap items-center gap-x-2">
          <Link to="/privacy" className="hover:text-white hover:underline">Privacy</Link>
          <span aria-hidden>·</span>
          <Link to="/terms" className="hover:text-white hover:underline">Terms</Link>
          {social.map((x) => (
            <span key={x.label} className="contents">
              <span aria-hidden>·</span>
              <a href={x.href} target="_blank" rel="noopener noreferrer" className="hover:text-white hover:underline">{x.label}</a>
            </span>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SiteNav />
      <main id="main" tabIndex={-1} className="flex-1 pt-28 focus:outline-none md:pt-32"><Outlet /></main>
      <SiteFooter />
    </div>
  );
}
