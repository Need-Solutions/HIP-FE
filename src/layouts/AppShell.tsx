import { Outlet } from 'react-router-dom';
import { Toaster } from '@/components/ui';

/** Root of every route. The toast container lives inside the router so toasts can contain <Link>s. */
export function AppShell() {
  return (
    <>
      {/* WCAG 2.4.1: first Tab stop on every page. Each layout's <main> has id="main". */}
      <a href="#main" className="sr-only z-[100] rounded-lg bg-white px-4 py-2 font-semibold text-forest shadow-lg focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-forest">
        Skip to main content
      </a>
      <Outlet />
      <Toaster />
    </>
  );
}
