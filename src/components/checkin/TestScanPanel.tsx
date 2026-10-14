import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { mockTools } from '@/api/endpoints';

/**
 * Mock builds only (never against the real backend): feeds sample QR payloads to the scanner, the same way the
 * camera would, so every result screen can be tried without a ticket or a camera.
 */
export function TestScanPanel({ eventId, onScan, disabled }: { eventId: string; onScan: (payload: string) => void; disabled?: boolean }) {
  const [samples, setSamples] = useState<{ label: string; payload: string }[] | null>(null);
  const [open, setOpen] = useState(false);
  if (!mockTools.enabled) return null;
  const toggle = async () => {
    if (!open && !samples) setSamples(await mockTools.scanSamples(eventId));
    setOpen((o) => !o);
  };
  return (
    <div className="mt-3 rounded-xl border border-dashed border-white/25 p-2 text-left">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-2 px-1 text-xs font-semibold text-camera-mute">
        <FlaskConical size={14} aria-hidden /> Test scan (mock data)
      </button>
      {open && samples && (
        <ul className="mt-2 grid gap-1.5">
          {samples.map((s) => (
            <li key={s.label}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onScan(s.payload)}
                className="w-full truncate rounded-lg bg-white/10 px-3 py-2 text-left text-xs text-white hover:bg-white/20 disabled:opacity-50"
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
