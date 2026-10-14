import { Badge, type BadgeTone } from '@/components/ui';
import type { AdminEventRow } from '@/api/endpoints';

const labels: Record<AdminEventRow['event']['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Draft', tone: 'gray' },
  published: { label: 'Published', tone: 'green' },
  sales_closed: { label: 'Sales closed', tone: 'amber' },
  completed: { label: 'Completed', tone: 'blue' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

/** Status of an event in admin lists. A published event whose sales end within 72 hours shows "Sales closing". */
export function EventStatusBadge({ row }: { row: Pick<AdminEventRow, 'event' | 'salesClosing' | 'confirmed' | 'capacity'> }) {
  if (row.event.status === 'published' && row.capacity > 0 && row.confirmed >= row.capacity) return <Badge tone="orange">Sold out</Badge>;
  if (row.salesClosing) return <Badge tone="orange">Sales closing</Badge>;
  const s = labels[row.event.status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
