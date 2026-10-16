import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Info, Search, Wallet } from 'lucide-react';
import { adminPeopleApi, type TransactionRow, type TransactionStatus } from '@/api/endpoints';
import { Alert, Badge, Button, Card, EmptyState, Input, Pagination, Select, Skeleton, StatCard, Table, TBody, Td, Th, THead, Tr, type BadgeTone } from '@/components/ui';
import { RefundReviewDialog } from '@/components/admin/RefundReviewDialog';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { useCan } from '@/features/auth/useCan';
import { PRESETS, periodRange, type AnalyticsPreset } from '@/lib/analytics';
import { downloadText, toCsv } from '@/lib/csv';
import { formatDate, formatNaira, formatNairaCompact, formatTime } from '@/lib/format';
import { formatPercent, growth } from '@/lib/metrics';

// Figma: "Admin / Transactions" (PAY-*, TKT-021, ANA-028). Pending and failed payments are listed but never counted
// as sales. Refund requests from hikers (My tickets) are reviewed here; the decision and reason go to the audit log.

const statuses: { value: 'all' | TransactionStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'successful', label: 'Successful' },
  { value: 'refund_requested', label: 'Refund requested' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
];
/** Money columns show "₦0", not "Free" (formatNaira says "Free" for ticket prices). */
const money = (kobo: number) => (kobo === 0 ? '₦0' : formatNaira(kobo));

const statusBadge: Record<TransactionStatus, { label: string; tone: BadgeTone }> = {
  successful: { label: 'Successful', tone: 'green' },
  refund_requested: { label: 'Refund requested', tone: 'amber' },
  refunded: { label: 'Refunded', tone: 'gray' },
  pending: { label: 'Pending', tone: 'blue' },
  failed: { label: 'Failed', tone: 'red' },
};

export default function Transactions() {
  useAdminTitle('Transactions & refunds', 'All Paystack payments, refunds and fees.');
  const canRefund = useCan('sell_refund_tickets');
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const preset = (PRESETS.find((p) => p.value === params.get('period'))?.value ?? 'this_month') as AnalyticsPreset;
  const status = (statuses.find((s) => s.value === params.get('status'))?.value ?? 'all') as 'all' | TransactionStatus;
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const range = periodRange(preset, { from: params.get('from') ?? '', to: params.get('to') ?? '' });
  const [reviewing, setReviewing] = useState<TransactionRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const set = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '' || (k === 'page' && v === '1')) p.delete(k);
        else p.set(k, v);
      }
      if (!('page' in patch)) p.delete('page');
      return p;
    }, { replace: true });

  const query = { from: range.from, to: range.to, status, q: q.trim() || undefined, page };
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'transactions', query],
    queryFn: () => adminPeopleApi.transactions(query),
    placeholderData: keepPreviousData,
  });

  const exportCsv = async () => {
    const all = await adminPeopleApi.transactions({ ...query, page: 1, all: true });
    const sm = all.summary;
    const rows = [
      ['Transactions'],
      ['Period', range.label],
      ['Status', statuses.find((s) => s.value === status)!.label],
      ...(q.trim() ? [['Search', q.trim()]] : []),
      ['Note', 'Pending and failed payments are never counted as sales.'],
      [],
      ['Gross ticket sales', money(sm.grossKobo)],
      ['Refunds', money(sm.refundsKobo), `${sm.refundCount} refunds`],
      // ['Paystack fees', money(sm.feesKobo)],
      ['Net proceeds', money(sm.netKobo)],
      [],
      ['Reference', 'Ticket', 'Hiker', 'Email', 'Event', 'Ticket price', 'Fee', 'Amount charged', 'Date', 'Status', 'Refund amount', 'Refund decision', 'Refund reason'],
      ...all.items.map((r) => [
        r.reference,
        r.ticketCode ?? '',
        r.buyerName,
        r.buyerEmail ?? '',
        r.eventTitle,
        money(r.ticketKobo),
        money(r.feeKobo),
        money(r.amountKobo),
        `${formatDate(r.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })} ${formatTime(r.createdAt)}`,
        statusBadge[r.status].label,
        r.refund ? money(r.refund.amountKobo) : '',
        r.refund?.decision ?? (r.status === 'refund_requested' ? 'waiting' : ''),
        r.refund?.note ?? r.refund?.reason ?? '',
      ]),
    ];
    downloadText(`transactions_${range.from}_to_${range.to}${status !== 'all' ? `_${status}` : ''}.csv`, toCsv(rows));
  };

  const sm = data?.summary;
  const g = sm ? growth(sm.grossKobo, sm.previousGrossKobo) : null;

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        <Input
          label="Search payments"
          className="w-full sm:w-[260px] [&_label]:sr-only"
          icon={Search}
          filled
          placeholder="Payment ref, ticket ID or name"
          value={q}
          onChange={(e) => set({ q: e.target.value })}
        />
        <Select label="Period" hideLabel value={preset} onChange={(e) => set({ period: e.target.value === 'this_month' ? null : e.target.value, from: null, to: null })} className="w-full sm:w-[170px]">
          {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
        {preset === 'custom' && (
          <div className="flex gap-2">
            <Input label="From" type="date" className="w-[150px] [&_label]:sr-only" value={range.from} onChange={(e) => set({ from: e.target.value, to: range.to })} />
            <Input label="To" type="date" className="w-[150px] [&_label]:sr-only" value={range.to} onChange={(e) => set({ from: range.from, to: e.target.value })} />
          </div>
        )}
        <Select label="Status" hideLabel value={status} onChange={(e) => set({ status: e.target.value === 'all' ? null : e.target.value })} className="w-full sm:w-[180px]">
          {statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
        <Button variant="secondary" className="sm:ml-auto" onClick={exportCsv} disabled={!data}>
          <Download size={16} aria-hidden /> Export CSV
        </Button>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate">{range.label}</p>

      {isLoading ? (
        <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[124px]" />)}</div>
      ) : !data || !sm ? (
        <EmptyState className="mt-4" icon={Wallet} title="We couldn’t load transactions" body="Check your connection and try again." action={<Button onClick={() => refetch()}>Try again</Button>} />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard label="Gross ticket sales" value={formatNairaCompact(sm.grossKobo)} {...(g === null ? {} : { delta: formatPercent(Math.abs(g), 0), up: g >= 0 })} sub={range.vsLabel} />
            <StatCard label="Refunds" value={formatNairaCompact(sm.refundsKobo)} sub={`${sm.refundCount} ${sm.refundCount === 1 ? 'refund' : 'refunds'}`} />
            {/* <StatCard label="Paystack fees" value={formatNairaCompact(sm.feesKobo)} sub="1.5% + ₦100" /> */}
            <StatCard label="Net proceeds" value={formatNairaCompact(sm.netKobo)} sub={`Pending not counted${sm.pendingCount ? ` (${sm.pendingCount})` : ''}`} />
          </div>

          {sm.refundRequests > 0 && status !== 'refund_requested' && (
            <Alert tone="warning" className="mt-4">
              {sm.refundRequests} refund {sm.refundRequests === 1 ? 'request is' : 'requests are'} waiting.{' '}
              <button type="button" className="font-bold text-forest underline" onClick={() => set({ status: 'refund_requested', period: 'custom', from: '2025-01-01', to: range.to })}>Show them</button>
            </Alert>
          )}
          {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}

          <Card className="mt-4 overflow-hidden" aria-busy={isFetching}>
            {data.items.length === 0 ? (
              <EmptyState className="border-0" icon={Wallet} title="No payments match" body="Try another period, status or search." />
            ) : (
              <>
                <Table caption="Payments" minWidth={900}>
                  <THead>
                    <Th>Reference</Th>
                    <Th>Hiker</Th>
                    <Th>Event</Th>
                    <Th>Amount</Th>
                    <Th>Date</Th>
                    <Th>Status</Th>
                    <Th><span className="sr-only">Actions</span></Th>
                  </THead>
                  <TBody>
                    {data.items.map((r) => (
                      <Tr key={r.reference + (r.ticketCode ?? '')}>
                        <Td className="whitespace-nowrap font-mono text-[13px]">{r.reference}</Td>
                        <Td>
                          <p className="font-semibold">{r.buyerName}</p>
                          {r.ticketCode && <Link to={`/admin/tickets/${encodeURIComponent(r.ticketCode)}`} className="block font-mono text-xs text-forest hover:underline">{r.ticketCode}</Link>}
                        </Td>
                        <Td>{r.eventTitle}</Td>
                        <Td className="whitespace-nowrap tabular-nums">{money(r.amountKobo)}</Td>
                        <Td className="whitespace-nowrap">{formatDate(r.createdAt, { day: 'numeric', month: 'short' })} · {formatTime(r.createdAt)}</Td>
                        <Td>
                          <Badge tone={statusBadge[r.status].tone}>{statusBadge[r.status].label}</Badge>
                          {r.refund?.decision === 'declined' && <p className="mt-1 text-xs text-slate">Refund declined</p>}
                          {r.status === 'refunded' && r.refund && <p className="mt-1 text-xs text-slate">{formatNaira(r.refund.amountKobo)} back</p>}
                        </Td>
                        <Td className="text-right">
                          {r.status === 'refund_requested' && canRefund && (
                            <button type="button" onClick={() => setReviewing(r)} className="text-sm font-bold text-forest hover:underline">Review</button>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4 text-sm text-slate">
                  <span>Showing {(data.page - 1) * data.pageSize + 1}–{(data.page - 1) * data.pageSize + data.items.length} of {data.total}</span>
                  <Pagination page={data.page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={(p) => set({ page: String(p) })} />
                </div>
              </>
            )}
          </Card>
          <p className="mt-4 flex items-start gap-2 text-[13px] text-slate">
            <Info size={15} aria-hidden className="mt-0.5 shrink-0" />
            Pending and failed payments are never counted as sales. Payment callbacks are verified with Paystack before a ticket is issued.
          </p>
        </>
      )}

      <RefundReviewDialog
        row={reviewing}
        onClose={() => setReviewing(null)}
        onDone={(row) => {
          setReviewing(null);
          setNotice(`${row.buyerName}: refund ${row.status === 'refunded' ? `of ${formatNaira(row.refund?.amountKobo ?? 0)} approved` : 'declined'}. Saved to the audit log.`);
          void queryClient.invalidateQueries({ queryKey: ['admin'] });
          void queryClient.invalidateQueries({ queryKey: ['myTickets'] });
        }}
      />
    </div>
  );
}
