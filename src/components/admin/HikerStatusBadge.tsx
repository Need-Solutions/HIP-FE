import { Badge, type BadgeTone } from '@/components/ui';
import { HIKER_STATUS_LABEL } from '@/lib/hikers';
import type { HikerStatus } from '@/api/endpoints';

const tones: Record<HikerStatus, BadgeTone> = { active: 'green', first_timer: 'blue', guest: 'gray', unverified: 'amber', suspended: 'red' };

export function HikerStatusBadge({ status }: { status: HikerStatus }) {
  return <Badge tone={tones[status]}>{HIKER_STATUS_LABEL[status]}</Badge>;
}
