import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Inbox, Search } from 'lucide-react';
import { deliveryLogApi, type DeliveryQuery, type DeliveryRecord, type MessageType, type NotificationChannel } from '@/api/endpoints';
import { Badge, Button, Card, EmptyState, Input, Pagination, Select, Skeleton, Table, TBody, Td, Th, THead, Tr, type BadgeTone } from '@/components/ui';
import { AUDIT_PRESETS, auditRange, type AuditPreset } from '@/lib/audit';
import { formatDate, formatTime } from '@/lib/format';

// NOT-009: what was sent, to whom, on which channel, and what the provider reported back. Read-only.

const MESSAGE_LABEL: Record<MessageType | 'test', string> = {
  registration: 'Registration confirmation',
  verification: 'Verification code',
  ticket: 'Ticket confirmation',
  reminder: 'Event reminder',
  event_change: 'Event changed or cancelled',
  payment: 'Payment or refund update',
  promotions: 'New hikes and offers',
  test: 'Test message',
};
const CHANNEL_LABEL: Record<NotificationChannel, string> = { email: 'Email', sms: 'SMS', whatsapp: 'WhatsApp' };
const STATUS: Record<DeliveryRecord['status'], { label: string; tone: BadgeTone }> = {
  delivered: { label: 'Delivered', tone: 'green' },
  sent: { label: 'Sent', tone: 'blue' },
  queued: { label: 'Queued', tone: 'gray' },
  failed: { label: 'Failed', tone: 'red' },
  bounced: { label: 'Bounced', tone: 'amber' },
};

export function DeliveryLog() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<'' | MessageType | 'test'>('');
  const [channel, setChannel] = useState<'' | NotificationChannel>('');
  const [status, setStatus] = useState<'' | DeliveryRecord['status']>('');
  const [preset, setPreset] = useState<AuditPreset>('last_7');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const range = auditRange(preset, custom);
  const query: DeliveryQuery = { q: q.trim() || undefined, type: type || undefined, channel: channel || undefined, status: status || undefined, from: range.from, to: range.to, page };
  const { data, isLoading, isFetching, refetch } = useQuery({ queryKey: ['admin', 'deliveries', query], queryFn: () => deliveryLogApi.list(query), placeholderData: keepPreviousData });
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <Input label="Search recipients" className="w-full sm:w-[250px] [&_label]:sr-only" icon={Search} filled placeholder="Name, email, phone or reference" value={q} onChange={(e) => reset(setQ)(e.target.value)} />
        <Select label="Message type" hideLabel value={type} onChange={(e) => reset(setType)(e.target.value as typeof type)} className="w-full sm:w-[210px]">
          <option value="">All messages</option>
          {(Object.keys(MESSAGE_LABEL) as (MessageType | 'test')[]).map((t) => <option key={t} value={t}>{MESSAGE_LABEL[t]}</option>)}
        </Select>
        <Select label="Channel" hideLabel value={channel} onChange={(e) => reset(setChannel)(e.target.value as typeof channel)} className="w-full sm:w-[150px]">
          <option value="">All channels</option>
          {(Object.keys(CHANNEL_LABEL) as NotificationChannel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
        </Select>
        <Select label="Status" hideLabel value={status} onChange={(e) => reset(setStatus)(e.target.value as typeof status)} className="w-full sm:w-[150px]">
          <option value="">Any status</option>
          {(Object.keys(STATUS) as DeliveryRecord['status'][]).map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
        </Select>
        <Select label="Period" hideLabel value={preset} onChange={(e) => reset(setPreset)(e.target.value as AuditPreset)} className="w-full sm:w-[160px]">
          {AUDIT_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
        {preset === 'custom' && (
          <>
            <Input label="From" type="date" className="w-full sm:w-[165px]" value={custom.from} onChange={(e) => reset(setCustom)({ ...custom, from: e.target.value })} />
            <Input label="To" type="date" className="w-full sm:w-[165px]" value={custom.to} onChange={(e) => reset(setCustom)({ ...custom, to: e.target.value })} />
          </>
        )}
      </div>

      {data && (
        <p className="mt-4 text-sm text-slate" aria-live="polite">
          {data.total.toLocaleString('en-NG')} {data.total === 1 ? 'message' : 'messages'} · {data.summary.delivered} delivered · {data.summary.sent + data.summary.queued} on the way · {data.summary.failed + data.summary.bounced} failed or bounced
        </p>
      )}

      <Card className="mt-3 overflow-hidden" aria-busy={isFetching}>
        {isLoading ? (
          <div className="space-y-3 p-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : !data ? (
          <EmptyState className="border-0" icon={Inbox} title="We couldn’t load the delivery log" body="Check your connection and try again." action={<Button onClick={() => refetch()}>Try again</Button>} />
        ) : data.items.length === 0 ? (
          <EmptyState className="border-0" icon={Inbox} title="No messages match" body="Try a longer period or clear a filter." />
        ) : (
          <>
            <Table caption="Notification delivery log, newest first" minWidth={860}>
              <THead>
                <Th>Time</Th>
                <Th>Recipient</Th>
                <Th>Message</Th>
                <Th>Channel</Th>
                <Th>Status</Th>
              </THead>
              <TBody>
                {data.items.map((r) => (
                  <Tr key={r.id}>
                    <Td className="whitespace-nowrap"><time dateTime={r.at}>{formatDate(r.at, { day: 'numeric', month: 'short' })} · {formatTime(r.at)}</time></Td>
                    <Td>
                      <p className="font-semibold">{r.recipientName ?? r.recipient}</p>
                      {r.recipientName && <p className="text-xs text-slate">{r.recipient}</p>}
                    </Td>
                    <Td>
                      {MESSAGE_LABEL[r.type]}
                      {r.reference && <p className="font-mono text-xs text-slate">{r.reference}</p>}
                    </Td>
                    <Td>{CHANNEL_LABEL[r.channel]}</Td>
                    <Td>
                      <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                      {r.error && <p className="mt-1 text-xs text-slate">{r.error}</p>}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4 text-sm text-slate">
              <span>Showing {(data.page - 1) * data.pageSize + 1}–{(data.page - 1) * data.pageSize + data.items.length} of {data.total.toLocaleString('en-NG')}</span>
              <Pagination page={data.page} pageCount={Math.ceil(data.total / data.pageSize)} onChange={setPage} />
            </div>
          </>
        )}
      </Card>
      <p className="mt-4 text-xs text-slate">Statuses come from the provider (Resend, Termii, Meta). “Sent” means the provider accepted it but hasn’t confirmed delivery yet.</p>
    </div>
  );
}
