import { useEffect, useRef } from 'react';
import type { Html5Qrcode } from 'html5-qrcode';

export type CameraStatus = 'starting' | 'running' | 'denied' | 'unavailable' | 'error';

// Rear camera feed with QR decoding (html5-qrcode, loaded on demand). It fills its parent; the scanner page
// draws the frame and controls on top. Permission problems are reported through onStatus so the page can
// explain them and offer manual search instead.

const ELEMENT_ID = 'hip-qr-reader';

// html5-qrcode starts video.play() without handling its promise, so leaving the scanner while the camera is
// still starting logs "play() request was interrupted". It's harmless; keep it out of the error logs.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { name?: string; message?: string } | undefined;
    if (r?.name === 'AbortError' && r.message?.includes('play() request was interrupted')) e.preventDefault();
  });
}

function classify(err: unknown): CameraStatus {
  const text = String((err as Error)?.name ?? '') + String((err as Error)?.message ?? err);
  if (/NotAllowed|Permission|denied/i.test(text)) return 'denied';
  if (/NotFound|not found|no camera|Overconstrained|NotReadable|getUserMedia|secure/i.test(text)) return 'unavailable';
  return 'error';
}

export function CameraView({
  onScan,
  onStatus,
  onTorchSupport,
  torchOn,
  attempt,
}: {
  onScan: (payload: string) => void;
  onStatus: (status: CameraStatus) => void;
  onTorchSupport: (supported: boolean) => void;
  torchOn: boolean;
  /** Bump to retry after the hiker or staff fixed permissions. */
  attempt: number;
}) {
  const scanner = useRef<Html5Qrcode | null>(null);
  const callbacks = useRef({ onScan, onStatus, onTorchSupport });
  callbacks.current = { onScan, onStatus, onTorchSupport };

  useEffect(() => {
    let cancelled = false;
    let instance: Html5Qrcode | null = null;
    const start = async () => {
      callbacks.current.onStatus('starting');
      if (!navigator.mediaDevices?.getUserMedia) return callbacks.current.onStatus('unavailable');
      try {
        // Don't trigger a prompt we know will fail.
        const perm = await navigator.permissions?.query({ name: 'camera' as PermissionName }).catch(() => null);
        if (perm?.state === 'denied') return callbacks.current.onStatus('denied');
      } catch {
        // Permissions API not supported: just try.
      }
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        instance = new Html5Qrcode(ELEMENT_ID, { verbose: false });
        scanner.current = instance;
        await instance.start({ facingMode: 'environment' }, { fps: 12, disableFlip: true }, (text) => callbacks.current.onScan(text), undefined);
        if (cancelled) return;
        callbacks.current.onStatus('running');
        try {
          callbacks.current.onTorchSupport(instance.getRunningTrackCameraCapabilities().torchFeature().isSupported());
        } catch {
          callbacks.current.onTorchSupport(false);
        }
      } catch (err) {
        if (!cancelled) callbacks.current.onStatus(classify(err));
      }
    };
    void start();
    return () => {
      cancelled = true;
      scanner.current = null;
      if (instance?.isScanning) void instance.stop().then(() => instance?.clear()).catch(() => undefined);
    };
  }, [attempt]);

  useEffect(() => {
    const s = scanner.current;
    if (!s?.isScanning) return;
    try {
      void s.getRunningTrackCameraCapabilities().torchFeature().apply(torchOn).catch(() => undefined);
    } catch {
      // Torch not supported on this camera.
    }
  }, [torchOn]);

  return <div id={ELEMENT_ID} aria-hidden className="hip-qr-reader absolute inset-0 overflow-hidden" />;
}
