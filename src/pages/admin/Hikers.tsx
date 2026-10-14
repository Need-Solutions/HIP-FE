import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, Info, Search, Users } from 'lucide-react';
import { adminPeopleApi, type HikerStatus, type HikersQuery } from '@/api/endpoints';
import { Avatar, Badge, Button, Card, EmptyState, Input, Pagination, Select, Skeleton, Table, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { HikerStatusBadge } from '@/components/admin/HikerStatusBadge';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { downloadText, toCsv } from '@/lib/csv';
import { formatDate } from '@/lib/format';
import { HIKER_STATUS_LABEL } from '@/lib/hikers';

// Figma: "Admin / Hikers" (USR-*, SRCH-*). Accounts and guests in one list; guests carry a Guest tag. Hikes attended
// and last hike come from check-ins only (SRS 2.4 rule 5).

const kinds: { value: HikersQuery['kind']; label: string }[] = [
  { value: 'all', label: 'Accounts + guests' },
  { value: 'accounts', label: 'Accounts only' },
  { value: 'guests', label: 'Guests only' },
];
const statusOptions: ('any' | HikerStatus)[] = ['any', 'active', 'first_timer', 'guest', 'unverified', 'suspended'];

/** "Jabi Lake Walk" → "Jabi", as in the Figma "Last hike" column. */
const shortTitle = (t: string) => t.split(/\s+/).slice(0, t.startsWith('Oke') ? 2 : 1).join(' ').replace(/-$/, '');

export default function Hikers() {
  const [params, setParams] = useSearchParams();
  const kind = (kinds.find((k) => k.value === params.get('kind'))?.value ?? 'all') as HikersQuery['kind'];
  const status = (statusOptions.find((s) => s === params.get('status')) ?? 'any') as HikersQuery['status'];
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const set = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '' || v === 'all' || v === 'any' || (k === 'page' && v === '1')) p.delete(k);
        else p.set(k, v);
      }
      if (!('page' in patch)) p.delete('page');
      return p;
    }, { replace: true });

  const query: HikersQuery = { q: q.trim() || undefined, kind, status, page };
  const { data, isLoading, isFetching, refetch } = useQuery({ queryKey: ['admin', 'hikers', query], queryFn: () => adminPeopleApi.hikers(query), placeholderData: keepPreviousData });
  useAdminTitle(
    'Hikers',
    data ? `${data.totals.accounts.toLocaleString('en-NG')} accounts · ${data.totals.guests.toLocaleString('en-NG')} guests · ${data.totals.activeThisMonth} active this month` : undefined,
  );

  const exportCsv = async () => {
    const all = await adminPeopleApi.hikers({ ...query, page: 1, all: true });
    const rows = [
      ['Name', 'Email', 'Phone', 'Account or guest', 'Joined', 'Hikes attended (check-ins)', 'Last hike', 'Last hike date', 'Status'],
      ...all.items.map((h) => [
        h.name,
        h.email ?? '',
        h.phone ?? '',
        h.isGuest ? 'Guest' : 'Account',
        formatDate(h.joinedAt, { month: 'short', year: 'numeric' }),
        String(h.hikesAttended),
        h.lastHike?.eventTitle ?? '',
        h.lastHike ? formatDate(h.lastHike.at, { day: 'numeric', month: 'short', year: 'numeric' }) : '',
        HIKER_STATUS_LABEL[h.status],
      ]),
    ];
    downloadText(`hikers${kind !== 'all' ? `_${kind}` : ''}${status !== 'any' ? `_${status}` : ''}.csv`, toCsv(rows));
  };

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        <Input
          label="Search hikers"
          className="w-full sm:w-[300px] [&_label]:sr-only"
          icon={Search}
          filled
          placeholder="Search name, email or phone"
          value={q}
          onChange={(e) => set({ q: e.target.value })}
        />
        <Select label="Accounts or guests" hideLabel value={kind} onChange={(e) => set({ kind: e.target.value })} className="w-full sm:w-[190px]">
          {kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </Select>
        <Select label="Status" hideLabel value={status} onChange={(e) => set({ status: e.target.value })} className="w-full sm:w-[170px]">
          {statusOptions.map((s) => <option key={s} value={s}>{s === 'any' ? 'Any status' : HIKER_STATUS_LABEL[s]}</option>)}
        </Select>
        <Button variant="secondary" className="sm:ml-auto" onClick={exportCsv} disabled={!data}>
          <Download size={16} aria-hidden /> Export CSV
        </Button>
      </div>

      <Card className="mt-5 overflow-hidden" aria-busy={isFetching}>
        {isLoading ? (
          <div className="space-y-3 p-6">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !data ? (
          <EmptyState className="border-0" icon={Users} title="We couldn’t load hikers" body="Check your connection and try again." action={<Button onClick={() => refetch()}>Try again</Button>} />
        ) : data.items.length === 0 ? (
          <EmptyState className="border-0" icon={Search} title="No hikers match" body="Try another search or filter." />
        ) : (
          <>
            <Table caption="Hikers" minWidth={880}>
              <THead>
                <Th>Hiker</Th>
                <Th>Phone</Th>
                <Th>Joined</Th>
                <Th>Hikes attended</Th>
                <Th>Last hike</Th>
                <Th>Status</Th>
              </THead>
              <TBody>
                {data.items.map((h) => (
                  <Tr key={h.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <Avatar name={h.name} />
                        <div className="min-w-0">
                          <Link to={`/admin/hikers/${encodeURIComponent(h.id)}`} className="font-semibold text-ink hover:text-forest hover:underline">{h.name}</Link>
                          {h.isGuest && <Badge tone="gray" className="ml-2 align-middle">Guest</Badge>}
                          {h.email && <p className="truncate text-xs text-slate">{h.email}</p>}
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{h.phone ?? '—'}</Td>
                    <Td className="whitespace-nowrap">{formatDate(h.joinedAt, { month: 'short', year: 'numeric' })}</Td>
                    <Td className="tabular-nums">{h.hikesAttended}</Td>
                    <Td className="whitespace-nowrap">{h.lastHike ? `${shortTitle(h.lastHike.eventTitle)} · ${formatDate(h.lastHike.at, { day: 'numeric', month: 'short' })}` : '—'}</Td>
                    <Td><HikerStatusBadge status={h.status} /></Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4 text-sm text-slate">
              <span>Showing {(data.page - 1) * data.pageSize + 1}–{(data.page - 1) * data.pageSize + data.items.length} of {data.total.toLocaleString('en-NG')}</span>
              <Pagination page={data.page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={(p) => set({ page: String(p) })} />
            </div>
          </>
        )}
      </Card>

      <div className="mt-5 flex gap-3 rounded-2xl border border-line bg-white p-5">
        <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-forest" />
        <div className="text-sm">
          <p className="font-bold text-ink">Guests</p>
          <p className="mt-1 text-slate">
            People who bought without an account. Check-ins are matched by email or phone, and their history merges into an account automatically if they sign up later with the same details.
          </p>
        </div>
      </div>
    </div>
  );
}
