import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Users, X } from 'lucide-react';
import { checkinApi } from '@/api/endpoints';
import { Alert, Avatar, Badge, Button, Dialog, EmptyState, FilterChips, Input, Skeleton } from '@/components/ui';
import { CheckinHeader } from '@/components/checkin/CheckinHeader';
import { eventTickets, localCheckIns } from '@/features/checkin/offline/db';
import { NotDownloadedError, checkInByCode, checkinKeys, useCheckinEvent, useStaff } from '@/features/checkin/useCheckin';
import { useOnlineStatus } from '@/features/checkin/useOnlineStatus';
import { formatTime } from '@/lib/format';
import { errorMessage, notifyError } from '@/lib/notify';
import type { ManifestTicket } from '@/types/domain';

// Figma: "Check-in / Manual search" (ATT-013..ATT-015). For hikers whose QR won't scan. Online it uses the
// server's list; offline the list downloaded to this phone. Either way, scans waiting to sync count as in.

type Filter = 'all' | 'out' | 'in';

async function loadRoster(eventId: string, online: boolean): Promise<ManifestTicket[]> {
  const [list, mine] = await Promise.all([online ? checkinApi.roster(eventId) : eventTickets(eventId), localCheckIns(eventId)]);
  const local = new Map(mine.map((c) => [c.ticketCode, { at: c.checkedInAt, staffName: c.staffName, gate: c.gate }]));
  return list
    .map((t) => (t.checkedIn || !local.has(t.code) ? t : { ...t, checkedIn: local.get(t.code) }))
    .sort((a, b) => a.holderName.localeCompare(b.holderName));
}

const shortCode = (code: string) => code.split('-').slice(0, 2).join('-');
const norm = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function ManualSearch() {
  const { eventId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const online = useOnlineStatus();
  const queryClient = useQueryClient();
  const { title, gate } = useCheckinEvent(eventId);
  const staff = useStaff(gate);
  const [confirming, setConfirming] = useState<ManifestTicket | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const q = params.get('q') ?? '';
  const filter = (['all', 'out', 'in'] as const).includes(params.get('filter') as Filter) ? (params.get('filter') as Filter) : 'all';
  const setParam = (key: string, value: string) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (value) p.set(key, value);
      else p.delete(key);
      return p;
    }, { replace: true });

  const roster = useQuery({
    queryKey: checkinKeys.roster(eventId, online),
    queryFn: () => loadRoster(eventId, online),
    networkMode: 'always',
    retry: 0,
    meta: { silentError: true }, // offline it reads the phone's list; the page explains any gap
  });

  const all = roster.data ?? [];
  const valid = all.filter((t) => t.status === 'confirmed');
  const inCount = valid.filter((t) => t.checkedIn).length;
  const term = norm(q.trim());
  const shown = all
    .filter((t) => (filter === 'in' ? !!t.checkedIn : filter === 'out' ? t.status === 'confirmed' && !t.checkedIn : true))
    .filter((t) => !term || norm(t.holderName).includes(term) || norm(t.code).includes(term));

  const confirm = async () => {
    if (!confirming) return;
    setBusy(true);
    try {
      const outcome = await checkInByCode(confirming.code, eventId, staff);
      if (outcome.kind === 'valid') {
        setDone(`${outcome.holderName} checked in${outcome.offline ? ' on this phone. It will sync when signal returns.' : '.'}`);
      } else if (outcome.kind === 'already_used') {
        notifyError(`${outcome.holderName} was already checked in at ${formatTime(outcome.firstScan.at)} by ${outcome.firstScan.staffName}.`, { id: 'manual' });
      } else {
        notifyError('This ticket can’t be checked in. It may be refunded or cancelled.', { id: 'manual' });
      }
      setConfirming(null);
      await queryClient.invalidateQueries({ queryKey: checkinKeys.all });
    } catch (err) {
      notifyError(err instanceof NotDownloadedError ? err.message : errorMessage(err, 'We couldn’t check them in. Please try again.'), { id: 'manual' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pb-10">
      <CheckinHeader back={`/checkin/${eventId}/scan`} title="Find a hiker" subtitle={roster.data ? `${title} · ${inCount} of ${valid.length} in` : title} />
      <div className="px-5">
        <Input
          label="Search by name or ticket ID"
          className="[&_label]:sr-only"
          icon={Search}
          value={q}
          onChange={(e) => setParam('q', e.target.value)}
          placeholder="Name or ticket ID"
          autoComplete="off"
          enterKeyHint="search"
          trailing={
            q ? (
              <button type="button" aria-label="Clear search" onClick={() => setParam('q', '')} className="grid size-8 place-items-center rounded-lg text-slate hover:text-ink">
                <X size={18} aria-hidden />
              </button>
            ) : undefined
          }
        />
        <FilterChips
          className="mt-4"
          label="Show"
          value={filter}
          onChange={(v) => setParam('filter', v === 'all' ? '' : v)}
          options={[
            { value: 'all', label: `All ${valid.length}` },
            { value: 'out', label: `Not in ${valid.length - inCount}` },
            { value: 'in', label: `Checked in ${inCount}` },
          ]}
        />

        {done && <Alert tone="success" className="mt-4">{done}</Alert>}

        <div className="mt-4">
          {roster.isLoading ? (
            <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px]" />)}</div>
          ) : roster.isError && !roster.data ? (
            <EmptyState
              icon={Users}
              title={online ? 'We couldn’t load the list' : 'This event isn’t saved on this phone'}
              body={online ? 'Check your connection and try again.' : 'Reconnect and download the event to search offline.'}
              action={online ? <Button onClick={() => roster.refetch()}>Try again</Button> : undefined}
            />
          ) : !online && all.length === 0 ? (
            <EmptyState icon={Users} title="This event isn’t saved on this phone" body="Reconnect and download the event to search offline." />
          ) : shown.length === 0 ? (
            <EmptyState icon={Search} title="No one matches" body={q ? `Nobody called “${q}” in this list.` : 'Nobody in this group.'} />
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
              {shown.slice(0, 100).map((t) => (
                <li key={t.code} className="flex items-center gap-3 px-4 py-3.5">
                  <Avatar name={t.holderName} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-bold text-ink">{t.holderName}</p>
                    <p className="truncate text-[13px] text-slate">{shortCode(t.code)} · {t.ticketTypeName}</p>
                  </div>
                  {t.status !== 'confirmed' ? (
                    <Badge tone="red" className="shrink-0 capitalize">{t.status}</Badge>
                  ) : t.checkedIn ? (
                    <Badge className="shrink-0">In · {formatTime(t.checkedIn.at)}</Badge>
                  ) : (
                    <Button size="sm" className="shrink-0" onClick={() => setConfirming(t)}>Check in</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {shown.length > 100 && <p className="mt-3 text-center text-xs text-slate">Showing 100 of {shown.length}. Search to narrow it down.</p>}
        </div>
        <p className="mt-5 text-center text-[13px] text-slate">Manual check-ins record your name and time.</p>
      </div>

      <Dialog open={!!confirming} onClose={() => setConfirming(null)} title="Confirm manual check-in">
        {confirming && (
          <div className="p-6">
            <h2 className="text-xl">Check in {confirming.holderName}?</h2>
            <p className="mt-1 text-sm text-slate">{confirming.ticketTypeName} · {confirming.code}</p>
            <p className="mt-4 rounded-xl bg-warn-light p-3.5 text-[13px] text-ink">Check their ID matches this name before you confirm. This records your name and the time.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setConfirming(null)} disabled={busy}>Cancel</Button>
              <Button onClick={confirm} disabled={busy} autoFocus>{busy ? 'Checking in…' : 'Check in'}</Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
