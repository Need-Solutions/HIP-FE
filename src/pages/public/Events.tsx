import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarDays, Mountain, Search } from 'lucide-react';
import { eventsApi, type EventSort, type EventStatusFilter } from '@/api/endpoints';
import { Button, EmptyState, FilterChips, Input, Pagination, Select, type ChipOption } from '@/components/ui';
import { EventCard, EventCardSkeleton } from '@/components/events/EventCard';
import { lagosDayBoundary, lagosToday } from '@/lib/format';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

// Figma: "Web / Events". Every published hike with search, date filter, status chips, sort and pagination
// (WEB-006, WEB-009, WEB-011, SRCH-007). Filters live in the URL so links and the back button keep them.

const PAGE_SIZE = 9;

const statusOptions: ChipOption<EventStatusFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'few', label: 'Few spots left' },
  { value: 'sold_out', label: 'Sold out' },
  { value: 'past', label: 'Past hikes' },
];

type DatePreset = 'any' | 'week' | 'month' | 'next_month' | 'custom';
const datePresets: { value: DatePreset; label: string }[] = [
  { value: 'any', label: 'Any date' },
  { value: 'week', label: 'Next 7 days' },
  { value: 'month', label: 'This month' },
  { value: 'next_month', label: 'Next month' },
  { value: 'custom', label: 'Custom range' },
];

const sortOptions: { value: EventSort; label: string }[] = [
  { value: 'soonest', label: 'Soonest first' },
  { value: 'latest', label: 'Latest first' },
];

const oneOf = <T extends string>(list: { value: T }[], v: string | null, fallback: T): T =>
  list.some((o) => o.value === v) ? (v as T) : fallback;

/** "YYYY-MM-DD" day range (Abuja calendar) for a preset. */
function presetRange(preset: DatePreset, from: string, to: string): { from?: string; to?: string } {
  const today = lagosToday();
  const [y, m] = today.split('-').map(Number);
  const day = (utc: number) => new Date(utc).toISOString().slice(0, 10);
  switch (preset) {
    case 'week': return { from: today, to: lagosToday(6) };
    case 'month': return { from: today, to: day(Date.UTC(y, m, 0)) }; // day 0 of next month = last day of this one
    case 'next_month': return { from: day(Date.UTC(y, m, 1)), to: day(Date.UTC(y, m + 1, 0)) };
    case 'custom': return { from: from || undefined, to: to || undefined };
    default: return {};
  }
}

export default function Events() {
  const [params, setParams] = useSearchParams();
  const status = oneOf(statusOptions, params.get('status'), 'all');
  const datePreset = oneOf(datePresets, params.get('date'), 'any');
  const sort = oneOf(sortOptions, params.get('sort'), 'soonest');
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  // The search box updates the URL after typing pauses, so each keystroke doesn't hit the API.
  const [q, setQ] = useState(params.get('q') ?? '');
  const debouncedQ = useDebouncedValue(q.trim());

  const update = (patch: Record<string, string>, resetPage = true) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
        if (resetPage) next.delete('page');
        return next;
      },
      { replace: true },
    );

  useEffect(() => {
    if (debouncedQ !== (params.get('q') ?? '')) update({ q: debouncedQ });
    // Only react to the debounced value; `params` changes on every filter update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const rangeError = datePreset === 'custom' && from && to && from > to ? 'End date must be on or after the start date.' : undefined;
  const range = rangeError ? {} : presetRange(datePreset, from, to);

  const query = {
    q: params.get('q') ?? '',
    status,
    sort,
    page,
    pageSize: PAGE_SIZE,
    from: range.from && lagosDayBoundary(range.from, 'start'),
    to: range.to && lagosDayBoundary(range.to, 'end'),
  };
  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['events', 'search', query],
    queryFn: () => eventsApi.search(query),
    placeholderData: keepPreviousData,
  });

  const pageCount = data ? Math.ceil(data.total / data.pageSize) : 0;
  const hasFilters = !!(query.q || datePreset !== 'any' || status !== 'all');

  const clearFilters = () => {
    setQ('');
    setParams(sort === 'soonest' ? {} : { sort }, { replace: true });
  };

  const goToPage = (p: number) => {
    update({ page: p > 1 ? String(p) : '' }, false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <section className="bg-sand">
        <div className="container-page pb-20 pt-10 md:pb-24 md:pt-14">
          <h1 className="text-4xl md:text-[44px]">Hiking events</h1>
          <p className="mt-3 text-[17px] text-slate">Every published hike from the group. Filter by date or status, then grab your spot.</p>
        </div>
      </section>

      <div className="container-page -mt-12 pb-16 md:-mt-14 md:pb-20">
        {/* Filters */}
        <div className="card p-4 shadow-sm md:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Input
              type="search"
              name="q"
              aria-label="Search events"
              filled
              icon={Search}
              placeholder="Search by trail, town or keyword"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="lg:w-[380px]"
            />
            <Select
              name="date"
              label="Date"
              hideLabel
              icon={CalendarDays}
              value={datePreset}
              onChange={(e) => update({ date: e.target.value === 'any' ? '' : e.target.value, from: '', to: '' })}
              className="lg:w-[180px]"
            >
              {datePresets.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            <FilterChips label="Event status" options={statusOptions} value={status} onChange={(v) => update({ status: v === 'all' ? '' : v })} />
          </div>
          {datePreset === 'custom' && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:max-w-[560px]">
              <Input type="date" name="from" label="From" value={from} onChange={(e) => update({ from: e.target.value })} />
              <Input type="date" name="to" label="To" value={to} min={from || undefined} error={rangeError} onChange={(e) => update({ to: e.target.value })} />
            </div>
          )}
        </div>

        {/* Results */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[15px] font-bold text-ink" aria-live="polite">
            {data && !isLoading ? `${data.total} ${data.total === 1 ? 'event' : 'events'}` : 'Loading events…'}
          </p>
          <div className="flex items-center gap-3">
            {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}
            <label className="flex items-center gap-1 text-sm text-slate">
              Sort:
              <select
                value={sort}
                onChange={(e) => update({ sort: e.target.value === 'soonest' ? '' : e.target.value })}
                className="rounded-lg bg-transparent py-1 text-sm text-slate focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/40"
              >
                {sortOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
          </div>
        </div>

        {isError && !data ? (
          <EmptyState
            className="mt-6"
            icon={Mountain}
            title="We couldn't load events"
            body="Check your connection and try again."
            action={<Button onClick={() => refetch()}>Try again</Button>}
          />
        ) : isLoading ? (
          <div className="mt-5 grid gap-7 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <EventCardSkeleton key={i} />)}
          </div>
        ) : data && data.items.length > 0 ? (
          <>
            <h2 className="sr-only">Results</h2>
            <div className={`mt-5 grid gap-7 transition-opacity md:grid-cols-2 lg:grid-cols-3 ${isFetching ? 'opacity-60' : ''}`}>
              {data.items.map((e) => <EventCard key={e.id} event={e} />)}
            </div>
            <Pagination className="mt-12" page={page} pageCount={pageCount} onChange={goToPage} />
          </>
        ) : (
          <EmptyState
            className="mt-6"
            icon={Mountain}
            title="No hikes match your filters"
            body="Try a different date or status, or clear the filters to see every hike."
            action={hasFilters ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        )}
      </div>
    </>
  );
}
