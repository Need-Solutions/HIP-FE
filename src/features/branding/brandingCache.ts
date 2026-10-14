import { applyBrandColors } from '@/lib/brandColors';
import { migrateDefaultBrandLocation } from '@/lib/brandDefaults';
import type { Branding } from '@/api/endpoints';

// The last brand this device saw, so the next load starts with the right colours instead of the defaults.

const CACHE_KEY = 'hip.branding';

export function readCachedBranding(): Branding | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? migrateDefaultBrandLocation(JSON.parse(raw) as Branding) : null;
  } catch {
    return null;
  }
}

export function writeCachedBranding(b: Branding) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(b));
  } catch {
    // Private mode: the brand reloads from the server next time.
  }
}

/** Call before the first render so cached colours apply immediately. */
export function applyCachedBranding() {
  const cached = readCachedBranding();
  if (cached) applyBrandColors(cached.colors);
}
