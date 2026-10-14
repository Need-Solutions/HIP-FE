import type { ReactNode } from 'react';
import { toast, type Id } from 'react-toastify';
import { ApiError } from '@/api/client';

// Error messages are shown as toasts (react-toastify). Field-level validation stays under each field (NFR-024).
// Components call notifyError() directly; failed queries and mutations reach it through the global listener in
// api/queryClient.ts, so new screens get error toasts without wiring anything up.

/** Container rendered inside an open <Dialog>: a modal sits in the browser's top layer, above the page's toasts. */
export const DIALOG_TOASTS = 'dialog';

/**
 * Shows an error toast. The same `id` (by default, the same text) updates the toast already on screen instead of
 * stacking copies, e.g. when someone presses "Log in" five times.
 */
export function notifyError(message: ReactNode, { id }: { id?: string } = {}): Id {
  const containerId = typeof document !== 'undefined' && document.querySelector('dialog[open]') ? DIALOG_TOASTS : undefined;
  const toastId = id ?? (typeof message === 'string' ? message : undefined);
  if (toastId !== undefined && toast.isActive(toastId, containerId)) {
    toast.update(toastId, { render: message, containerId });
    return toastId;
  }
  return toast.error(message, { toastId, containerId });
}

/** A message people can act on: the API's own message for request problems, plain wording for the rest. */
export function errorMessage(err: unknown, fallback: string): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'You’re offline. Check your connection and try again.';
  if (err instanceof ApiError && err.status < 500 && err.message) return err.message;
  return fallback;
}
