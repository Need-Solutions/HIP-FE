import type { HikerStatus } from '@/api/endpoints';

/** Admin hiker status labels (badges, filters, CSV). */
export const HIKER_STATUS_LABEL: Record<HikerStatus, string> = {
  active: 'Active',
  first_timer: 'First-timer',
  guest: 'Guest',
  unverified: 'Unverified',
  suspended: 'Suspended',
};
