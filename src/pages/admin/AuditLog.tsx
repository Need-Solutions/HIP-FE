import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Download, FileText, Lock, Search } from 'lucide-react';
import { auditApi, type AuditQuery } from '@/api/endpoints';
import { Avatar, Button, Card, EmptyState, Input, Pagination, Select, Skeleton, Table, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { useBranding } from '@/features/branding/BrandingContext';
import { AUDIT_GROUPS, AUDIT_PRESETS, actionsByGroup, auditLabel, auditRange, type AuditPreset } from '@/lib/audit';
import { downloadText, toCsv } from '@/lib/csv';
import { formatDate, formatTime } from '@/lib/format';

// Figma: "Admin / Audit log" (ADM-014, NFR-012). Every sensitive action, who did it and why. Read-only by design:
// there are no edit or delete controls, and the API has no endpoint for either. Filters live in the URL so a
// filtered view can be shared; the CSV export holds the same filtered entries.

export default function AuditLog() {
  useAdminTitle('Audit log', 'Every sensitive action, who did it and why.');
  const { name: brand } = useBranding();
  const [params, setParams] = useSearchParams();
  const preset = (AUDIT_PRESETS.find((p) => p.value === params.get('period'))?.value ?? 'last_30') as AuditPreset;
  const custom = { from: params.get('from') ?? '', to: params.get('to') ?? '' };
  const range = auditRange(preset, custom);
  const q = params.get('q') ?? '';
  const action = params.get('action') ?? '';
  const actorId = params.get('staff') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const set = (patch: Record<string, string | null>) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (!v || (k === 'period' && v === 'last_30') || (k === 'page' && v === '1')) p.delete(k);
        else p.set(k, v);
      }
      if (!('page' in patch)) p.delete('page');
      return p;
    }, { replace: true });

  const query: AuditQuery = { q: q.trim() || undefined, action: action || undefined, actorId: actorId || undefined, from: range.from, to: range.to, page };
  const { data, isLoading, isFetching, refetch } = useQuery({ queryKey: ['admin', 'audit', query], queryFn: () => auditApi.list(query), placeholderData: keepPreviousData });

  const exportCsv = async () => {
    const all = await auditApi.list({ ...query, page: 1, all: true });
    const period = AUDIT_PRESETS.find((p) => p.value === preset)!.label;
    const rows = [
      [`${brand} audit log`],
      ['Period', preset === 'custom' ? `${custom.from || '…'} to ${custom.to || '…'}` : period],
      ['Action', action ? (action.startsWith('group:') ? AUDIT_GROUPS.find((g) => `group:${g.id}` === action)?.label ?? action : auditLabel(action)) : 'All actions'],
      ['Staff', actorId ? data?.actors.find((a) => a.id === actorId)?.name ?? actorId : 'Everyone'],
      ['Search', q || '—'],
      [],
      ['Time (Abuja)', 'Staff', 'Action', 'Action code', 'Record', 'Record ID', 'Details', 'Reason'],
      ...all.items.map((e) => [`${formatDate(e.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })} ${formatTime(e.createdAt)}`, e.actorName, auditLabel(e.action), e.action, e.recordLabel ?? e.recordId, e.recordId, e.details, e.reason ?? '']),
    ];
    downloadText(`audit_log${range.from ? `_${range.from}` : ''}${range.to ? `_to_${range.to}` : ''}.csv`, toCsv(rows));
  };

  return (
    <div>
      <div className="flex flex-wrap items-start gap-3">
        <Input label="Search the audit log" className="w-full sm:w-[280px] [&_label]:sr-only" icon={Search} filled placeholder="Search actions or records" value={q} onChange={(e) => set({ q: e.target.value })} />
        <Select label="Action" hideLabel value={action} onChange={(e) => set({ action: e.target.value })} className="w-full sm:w-[220px]">
          <option value="">All actions</option>
          {AUDIT_GROUPS.map((g) => (
            <optgroup key={g.id} label={g.label}>
              <option value={`group:${g.id}`}>All {g.label.toLowerCase()}</option>
              {actionsByGroup(g.id).map((a) => <option key={a.code} value={a.code}>{a.label}</option>)}
            </optgroup>
          ))}
        </Select>
        <Select label="Staff member" hideLabel value={actorId} onChange={(e) => set({ staff: e.target.value })} className="w-full sm:w-[190px]">
          <option value="">All staff</option>
          {data?.actors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select label="Period" hideLabel value={preset} onChange={(e) => set({ period: e.target.value })} className="w-full sm:w-[170px]">
          {AUDIT_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
        <Button variant="secondary" className="sm:ml-auto" onClick={exportCsv} disabled={!data}>
          <Download size={16} aria-hidden /> Export CSV
        </Button>
      </div>
      {preset === 'custom' && (
        <div className="mt-3 flex flex-wrap gap-3">
          <Input label="From" type="date" className="w-full sm:w-[180px]" value={custom.from} max={custom.to || undefined} onChange={(e) => set({ from: e.target.value, period: 'custom' })} />
          <Input label="To" type="date" className="w-full sm:w-[180px]" value={custom.to} min={custom.from || undefined} onChange={(e) => set({ to: e.target.value, period: 'custom' })} />
        </div>
      )}

      <Card className="mt-5 overflow-hidden" aria-busy={isFetching}>
        {isLoading ? (
          <div className="space-y-3 p-6">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !data ? (
          <EmptyState className="border-0" icon={FileText} title="We couldn’t load the audit log" body="Check your connection and try again." action={<Button onClick={() => refetch()}>Try again</Button>} />
        ) : data.items.length === 0 ? (
          <EmptyState className="border-0" icon={Search} title="No entries match" body="Try a longer period, another action or another staff member." />
        ) : (
          <>
            <Table caption="Audit log entries, newest first" minWidth={1000}>
              <THead>
                <Th>Time</Th>
                <Th>Staff</Th>
                <Th>Action</Th>
                <Th>Record</Th>
                <Th>Details</Th>
              </THead>
              <TBody>
                {data.items.map((e) => (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap align-top">
                      <time dateTime={e.createdAt}>{formatDate(e.createdAt, { day: 'numeric', month: 'short' })} · {formatTime(e.createdAt)}</time>
                    </Td>
                    <Td className="align-top">
                      <div className="flex items-center gap-2.5 whitespace-nowrap">
                        <Avatar name={e.actorName} />
                        <span className="font-semibold">{e.actorName}</span>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap align-top font-bold text-ink">{auditLabel(e.action)}</Td>
                    <Td className="align-top">
                      <span className={e.recordType === 'ticket' ? 'font-mono text-[13px]' : 'font-semibold'}>{e.recordLabel ?? e.recordId}</span>
                    </Td>
                    <Td className="max-w-[420px] align-top text-slate">
                      <p className="break-words">{e.details}</p>
                      {e.reason && <p className="mt-1 break-words text-ink">Reason: “{e.reason}”</p>}
                    </Td>
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
      <p className="mt-4 flex items-start gap-2 text-xs text-slate">
        <Lock size={13} aria-hidden className="mt-px shrink-0" />
        Entries are permanent. Nobody can edit or delete them, here or through the API. Times are Abuja time.
      </p>
    </div>
  );
}
