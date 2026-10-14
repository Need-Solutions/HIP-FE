import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, Plus } from 'lucide-react';
import { adminApi, type AdminEventFilter, type AdminEventsQuery } from '@/api/endpoints';
import { Button, ButtonLink, Card, EmptyState, FilterChips, Pagination, Select, Skeleton, Table, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { EventStatusBadge } from '@/components/admin/EventStatusBadge';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { formatDate, formatNairaCompact } from '@/lib/format';
import { attendanceRate, formatPercent } from '@/lib/metrics';

// Figma: "Admin / Events" (EVT-001..EVT-012). Checked-in counts come from check-ins only; the rate uses
// lib/metrics.ts (checked in ÷ confirmed tickets) and shows "—" before anyone has been scanned.

const statuses: { value: AdminEventFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'sales_closed', label: 'Sales closed' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];
const ranges: { value: AdminEventsQuery['range']; label: string }[] = [
  { value: 'all', label: 'All dates' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
];

export default function Events() {
  useAdminTitle('Events', 'Create, publish and track every hike.');
  const [params, setParams] = useSearchParams();
  const status = (statuses.find((s) => s.value === params.get('status'))?.value ?? 'all') as AdminEventFilter;
  const range = (ranges.find((r) => r.value === params.get('range'))?.value ?? 'all') as AdminEventsQuery['range'];
  const page = Math.max(1, Number(params.get('page')) || 1);
  const set = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '' || v === 'all' || (k === 'page' && v === '1')) p.delete(k);
        else p.set(k, v);
      }
      return p;
    });

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'events', status, range, page],
    queryFn: () => adminApi.events({ status, range, page }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <FilterChips
          label="Status"
          value={status}
          onChange={(v) => set({ status: v, page: null })}
          options={statuses.map((s) => ({ value: s.value, label: data ? `${s.label} ${data.counts[s.value]}` : s.label }))}
        />
        <div className="flex items-center gap-3">
          <Select label="Dates" hideLabel value={range} onChange={(e) => set({ range: e.target.value, page: null })} className="w-[150px]">
            {ranges.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </Select>
          <ButtonLink to="/admin/events/new"><Plus size={16} aria-hidden /> Create event</ButtonLink>
        </div>
      </div>

      <Card className="mt-5 overflow-hidden" aria-busy={isFetching}>
        {isLoading ? (
          <div className="space-y-3 p-6">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : isError && !data ? (
          <EmptyState className="border-0" icon={CalendarDays} title="We couldn’t load events" body="Check your connection and try again." action={<Button onClick={() => refetch()}>Try again</Button>} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState className="border-0" icon={CalendarDays} title="No events here" body="Try another status or date range." action={<ButtonLink to="/admin/events/new">Create event</ButtonLink>} />
        ) : (
          <>
            <Table caption="Events">
              <THead>
                <Th>Event</Th>
                <Th>Date</Th>
                <Th>Tickets sold</Th>
                <Th>Checked in</Th>
                <Th>Revenue</Th>
                <Th>Status</Th>
                <Th><span className="sr-only">Actions</span></Th>
              </THead>
              <TBody>
                {data.items.map((r) => (
                  <Tr key={r.event.id}>
                    <Td className="font-semibold">
                      <Link to={`/admin/events/${r.event.id}/participants`} className="hover:text-forest hover:underline">{r.event.title}</Link>
                    </Td>
                    <Td className="whitespace-nowrap">{formatDate(r.event.startsAt)}</Td>
                    <Td className="tabular-nums">{r.confirmed} / {r.capacity}</Td>
                    <Td className="tabular-nums">
                      {r.checkedIn === null ? '—' : `${r.checkedIn} (${formatPercent(attendanceRate(r.checkedIn, r.confirmed), 0)})`}
                    </Td>
                    <Td className="tabular-nums">
                      {r.refunded ? '₦0 (refunded)' : r.event.fromPriceKobo === 0 && r.revenueKobo === 0 ? (r.confirmed ? 'Free' : '—') : formatNairaCompact(r.revenueKobo)}
                    </Td>
                    <Td><EventStatusBadge row={r} /></Td>
                    <Td className="text-right">
                      {r.event.status !== 'completed' && r.event.status !== 'cancelled' && (
                        <Link to={`/admin/events/${r.event.id}/edit`} className="text-sm font-bold text-forest hover:underline">Edit</Link>
                      )}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4 text-sm text-slate">
              <span>
                Showing {(data.page - 1) * data.pageSize + 1}–{(data.page - 1) * data.pageSize + data.items.length} of {data.total}
              </span>
              <Pagination page={data.page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={(p) => set({ page: String(p) })} />
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
