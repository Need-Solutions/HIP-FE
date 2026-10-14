import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { DIALOG_TOASTS } from '@/lib/notify';
import { Toaster } from './Toaster';

/** Modal built on the native <dialog>, which traps focus and closes on Escape. */
export function Dialog({ open, onClose, title, children, className }: { open: boolean; onClose: () => void; title: string; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn('w-[calc(100%-32px)] max-w-md rounded-2xl border border-line bg-white p-0 text-ink backdrop:bg-ink/50', className)}
    >
      {open && children}
      {/* Toasts raised while the modal is open show here, above its backdrop (see lib/notify.ts). */}
      {open && <Toaster containerId={DIALOG_TOASTS} />}
    </dialog>
  );
}
