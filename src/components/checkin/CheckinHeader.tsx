import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/cn';

/** Top bar of the check-in screens: back chevron, title and subtitle, optional right slot (Figma "Check-in / *"). */
export function CheckinHeader({ back, title, subtitle, right, dark = false }: { back?: string; title: string; subtitle?: ReactNode; right?: ReactNode; dark?: boolean }) {
  return (
    <header className="flex items-center gap-2 px-4 pb-3 pt-6">
      {back && (
        <Link
          to={back}
          aria-label="Back"
          className={cn('-ml-1 grid size-10 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2', dark ? 'text-white focus-visible:ring-white/60' : 'text-ink focus-visible:ring-forest/40')}
        >
          <ChevronLeft size={28} aria-hidden />
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className={cn('truncate text-[20px] font-extrabold', dark ? 'text-white' : 'text-ink')}>{title}</h1>
        {subtitle && <p className={cn('mt-0.5 truncate text-[13px]', dark ? 'text-camera-mute' : 'text-slate')}>{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

/** "● Online" / "● Offline" pill on the camera screens. */
export function SignalPill({ online }: { online: boolean }) {
  return (
    <span role="status" className={cn('shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold', online ? 'bg-forest text-signal-on' : 'bg-signal-off-bg text-sun-soft')}>
      <span aria-hidden>● </span>
      {online ? 'Online' : 'Offline'}
    </span>
  );
}
