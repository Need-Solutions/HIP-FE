import { USE_MOCKS } from '@/api/client';

/** Dev-only reminder of the mock credentials (api/mock/auth.ts). Never rendered in production builds. */
export function MockHint({ children }: { children: string }) {
  if (!import.meta.env.DEV || !USE_MOCKS) return null;
  return <p className="mt-6 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-slate">Mock data: {children}</p>;
}
