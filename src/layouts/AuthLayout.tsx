import { Link, Outlet } from 'react-router-dom';
import { Logo } from '@/components/ui';
import panelArt from '@/assets/covers/auth-panel.svg';
import { useBranding } from '@/features/branding/BrandingContext';

/** Split screen used by every hiker auth page (Figma: "Auth / *"). Phones get a slim header instead of the panel. */
export function AuthLayout() {
  const { name: brand } = useBranding();
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[44%_1fr]">
      <aside className="relative hidden overflow-hidden bg-pine lg:block">
        <img src={panelArt} alt="" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-pine/45" />
        <div className="relative flex h-full flex-col justify-between p-14">
          <Link to="/" aria-label={`${brand} home`} className="self-start"><Logo dark /></Link>
          <div>
            <p className="text-[34px] font-extrabold leading-tight text-white">Every trail you finish,</p>
            <p className="text-[34px] font-extrabold leading-tight text-sun-soft">counted and kept.</p>
            <p className="mt-4 text-white/85">Your tickets, check-ins and hiking history in one place.</p>
          </div>
        </div>
      </aside>
      <div className="flex flex-col">
        <header className="border-b border-line px-4 py-4 lg:hidden">
          <Link to="/" aria-label={`${brand} home`}><Logo /></Link>
        </header>
        <main id="main" tabIndex={-1} className="flex flex-1 focus:outline-none items-start justify-center px-4 py-10 sm:items-center lg:py-12">
          <div className="w-full max-w-[440px]"><Outlet /></div>
        </main>
      </div>
    </div>
  );
}
