import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { useAutoSync } from '@/features/checkin/useCheckin';
import { useOnlineStatus } from '@/features/checkin/useOnlineStatus';

/**
 * Phone shell for check-in staff (Figma "Check-in / *", max 430px). Works offline: the PWA service worker caches
 * the app, and every check-in screen (plus the QR decoder) is loaded up front, so moving between screens at a
 * trailhead with no signal never needs the network. Offline scans sync by themselves when signal returns.
 */
export function CheckinLayout() {
  const online = useOnlineStatus();
  const onScanner = useLocation().pathname.endsWith('/scan');
  useAutoSync();

  useEffect(() => {
    void Promise.all([
      import('@/pages/checkin/SelectEvent'),
      import('@/pages/checkin/OfflineDownload'),
      import('@/pages/checkin/Scanner'),
      import('@/pages/checkin/ManualSearch'),
      import('@/pages/checkin/Sync'),
      import('@/pages/checkin/CloseAttendance'),
      import('html5-qrcode'),
    ]).catch(() => undefined);
  }, []);

  return (
    <div className="mx-auto min-h-[100dvh] max-w-[430px] bg-canvas">
      {/* The scanner shows its own offline banner (Figma "Check-in / Scanner (offline)"). */}
      {!online && !onScanner && (
        <div role="status" className="sticky top-0 z-30 flex items-center gap-2 bg-offline px-5 py-2.5 text-[12px] font-bold text-sun-soft">
          <WifiOff size={14} aria-hidden className="shrink-0" />
          Offline mode — scans are saved on this phone and sync when signal returns
        </div>
      )}
      <main id="main" tabIndex={-1} className="focus:outline-none">
        <Outlet />
      </main>
    </div>
  );
}
