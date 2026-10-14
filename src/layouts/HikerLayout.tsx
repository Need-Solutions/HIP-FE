import { NavLink, Outlet } from 'react-router-dom';
import { History, Home, Ticket, User } from 'lucide-react';
import { SiteNav } from './PublicLayout';
import { cn } from '@/lib/cn';

const tabs = [
  { to: '/account', label: 'Dashboard', icon: Home, end: true },
  { to: '/account/tickets', label: 'My tickets', icon: Ticket },
  { to: '/account/history', label: 'Hiking history', icon: History },
  { to: '/account/profile', label: 'Profile', icon: User },
];

export function HikerLayout() {
  return (
    <div className="min-h-screen bg-canvas">
      <SiteNav />
      <div className="border-b border-line bg-white print:hidden">
        <nav aria-label="My account" className="container-page flex gap-10 overflow-x-auto">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn('flex items-center gap-2 whitespace-nowrap border-b-[3px] py-4 text-[15px] font-medium', isActive ? 'border-forest font-bold text-forest' : 'border-transparent text-slate')
              }
            >
              <Icon size={18} aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <main id="main" tabIndex={-1} className="container-page py-10 focus:outline-none"><Outlet /></main>
    </div>
  );
}
