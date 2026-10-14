import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ScanLine, Smartphone } from 'lucide-react';
import { adminApi } from '@/api/endpoints';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Select,
  Skeleton,
  Switch,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '@/components/ui';
import { SupervisorPins } from '@/components/admin/SupervisorPins';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { formatDate, formatTime } from '@/lib/format';
import { errorMessage, notifyError } from '@/lib/notify';
import type { CheckinSettings as Settings } from '@/types/domain';

// Figma: "Admin / Check-in settings" (CLAUDE.md "Offline check-in"). Phones get these rules with each download:
// the offline list expires after `offlineListTtlHours` and is wiped (unsynced check-ins are kept until they sync).

const schema = z.object({
  allowOffline: z.boolean(),
  autoDownload: z.boolean(),
  admitNotInList: z.boolean(),
  requireSupervisorPin: z.boolean(),
  closeSalesBeforeHours: z.coerce.number().int().min(0).max(48),
  offlineListTtlHours: z.coerce.number().int().min(1, 'At least 1 hour').max(72, 'At most 72 hours'),
});

const toggles: {
  name: keyof Pick<Settings, 'allowOffline' | 'autoDownload' | 'admitNotInList' | 'requireSupervisorPin'>;
  label: string;
  help: string;
}[] = [
  { name: 'allowOffline', label: 'Allow offline scanning', help: 'Staff can download an event’s signed ticket list' },
  {
    name: 'autoDownload',
    label: 'Auto-download on staff phones',
    help: 'Refresh the list when an event’s check-in opens',
  },
  {
    name: 'admitNotInList',
    label: 'Admit tickets not in the offline list',
    help: 'Staff verify ID, admit and flag for review',
  },
  { name: 'requireSupervisorPin', label: 'Require supervisor PIN for re-entry', help: 'Applies online and offline' },
];

const steps = [
  ['Download', 'Staff save signed tickets before leaving signal.'],
  ['Scan offline', 'Phone checks the signature and spots duplicates.'],
  ['Sync', 'Check-ins upload when signal returns.'],
  ['Resolve', 'Admins review duplicates and flagged tickets.'],
];

export default function CheckinSettings() {
  useAdminTitle('Check-in settings', 'Scanner, offline mode and staff devices');
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ['admin', 'checkinSettings'], queryFn: adminApi.checkinSettings });
  const devices = useQuery({ queryKey: ['admin', 'devices'], queryFn: adminApi.devices, refetchInterval: 30_000 });
  const recent = useQuery({
    queryKey: ['admin', 'events', 'all', 'all', 1],
    queryFn: () => adminApi.events({ status: 'all', range: 'all', page: 1 }),
  });
  const [saved, setSaved] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<z.input<typeof schema>>({ resolver: zodResolver(schema) });
  useEffect(() => {
    if (settings.data) reset(settings.data);
  }, [settings.data, reset]);
  const offlineOn = watch('allowOffline');

  const onSubmit = handleSubmit(async (v) => {
    setSaved(false);
    try {
      const next = await adminApi.saveCheckinSettings(schema.parse(v));
      reset(next);
      queryClient.setQueryData(['admin', 'checkinSettings'], next);
      setSaved(true);
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t save the settings. Please try again.'), { id: 'checkin-settings' });
    }
  });

  if (settings.isLoading) return <Skeleton className="h-[640px]" />;
  if (!settings.data) {
    return (
      <EmptyState
        icon={ScanLine}
        title="We couldn’t load check-in settings"
        body="Check your connection and try again."
        action={<Button onClick={() => settings.refetch()}>Try again</Button>}
      />
    );
  }

  return (
    <>
      <form noValidate onSubmit={onSubmit}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate">Changes reach staff phones with their next download or sync.</p>
          <Button type="submit" disabled={!isDirty || isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
        {saved && !isDirty && (
          <Alert tone="success" className="mt-4">
            Settings saved and logged.
          </Alert>
        )}

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_368px]">
          <Card className="p-6">
            <h2 className="text-lg">Offline check-in</h2>
            <p className="mt-1 text-sm text-slate">Lets staff scan tickets with no network at the trailhead.</p>
            <ul className="mt-4 divide-y divide-line">
              {toggles.map((t) => (
                <li key={t.name} className="flex items-center justify-between gap-4 py-3.5">
                  <div className="min-w-0">
                    <p id={`${t.name}-label`} className="text-[15px] font-semibold text-ink">
                      {t.label}
                    </p>
                    <p id={`${t.name}-help`} className="text-[13px] text-slate">
                      {t.help}
                    </p>
                  </div>
                  <Controller
                    control={control}
                    name={t.name}
                    render={({ field }) => (
                      <Switch
                        checked={!!field.value}
                        onChange={field.onChange}
                        disabled={t.name !== 'allowOffline' && t.name !== 'requireSupervisorPin' && !offlineOn}
                        aria-labelledby={`${t.name}-label`}
                        aria-describedby={`${t.name}-help`}
                      />
                    )}
                  />
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Select
                label="Close ticket sales before start"
                {...register('closeSalesBeforeHours')}
                error={errors.closeSalesBeforeHours?.message}
              >
                {[0, 1, 2, 3, 6, 12, 24].map((h) => (
                  <option key={h} value={h}>
                    {h === 0 ? 'At the start' : `${h} ${h === 1 ? 'hour' : 'hours'}`}
                  </option>
                ))}
              </Select>
              <Select
                label="Offline list expires after"
                {...register('offlineListTtlHours')}
                error={errors.offlineListTtlHours?.message}
                disabled={!offlineOn}
              >
                {[6, 12, 24, 48, 72].map((h) => (
                  <option key={h} value={h}>
                    {h} hours
                  </option>
                ))}
              </Select>
            </div>
            <p className="mt-3 text-[13px] text-slate">
              Expired lists are wiped from devices. Check-ins are kept until synced. The sales cut-off is the default
              for new events.
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg">How offline scanning works</h2>
            <ol className="mt-5 space-y-5">
              {steps.map(([title, body], i) => (
                <li key={title} className="flex gap-4">
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-full bg-mint text-sm font-bold text-forest"
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-bold text-ink">{title}</p>
                    <p className="text-[13px] text-slate">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <Card className="mt-5 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5">
            <h2 className="text-lg">Staff devices</h2>
            <span className="text-[13px] text-slate">Reported by each phone while it has signal</span>
          </div>
          {devices.isLoading ? (
            <Skeleton className="m-6 h-24" />
          ) : !devices.data?.length ? (
            <EmptyState
              className="border-0"
              icon={Smartphone}
              title="No phones yet"
              body="Phones appear here after staff open check-in."
            />
          ) : (
            <Table caption="Staff devices" minWidth={760}>
              <THead>
                <Th>Device</Th>
                <Th>Staff</Th>
                <Th>Offline list</Th>
                <Th>Unsynced check-ins</Th>
                <Th>Status</Th>
              </THead>
              <TBody>
                {devices.data.map((d) => (
                  <Tr key={d.deviceId}>
                    <Td className="font-semibold">
                      {d.label}
                      {d.gate ? ` · ${d.gate}` : ''}
                    </Td>
                    <Td>{d.staffName}</Td>
                    <Td>
                      {d.list ? (
                        `${d.list.eventTitle.replace(/ (Summit|Waterfalls|Walk|Trail|Trek)$/, '')} · ${formatTime(d.list.downloadedAt)}`
                      ) : (
                        <span className="text-slate">None</span>
                      )}
                    </Td>
                    <Td className="tabular-nums">{d.unsynced}</Td>
                    <Td>
                      {d.unsynced > 0 ? <Badge tone="amber">Waiting</Badge> : <Badge>Synced</Badge>}
                      <span className="ml-2 text-xs text-slate">
                        seen{' '}
                        {formatDate(d.lastSeenAt) === formatDate(new Date().toISOString())
                          ? formatTime(d.lastSeenAt)
                          : formatDate(d.lastSeenAt)}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </form>

      {/* Outside the settings form: the PIN dialog has a form of its own. */}
      <SupervisorPins enabled={!!settings.data.requireSupervisorPin} />

      <Card className="mt-5 p-6">
        <h2 className="text-lg">Review offline sync</h2>
        <p className="mt-1 text-sm text-slate">Duplicates and flagged admissions for each event.</p>
        <ul className="mt-4 divide-y divide-line">
          {(recent.data?.items ?? [])
            .filter((r) => r.checkedIn !== null)
            .slice(0, 6)
            .map((r) => (
              <li key={r.event.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  <span className="font-semibold text-ink">{r.event.title}</span>{' '}
                  <span className="text-slate">· {formatDate(r.event.startsAt)}</span>
                </span>
                <Link
                  to={`/admin/checkin/${r.event.id}/sync`}
                  className="shrink-0 font-bold text-forest hover:underline"
                >
                  Sync review →
                </Link>
              </li>
            ))}
        </ul>
      </Card>
    </>
  );
}
