import { lazy, Suspense, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Megaphone, Pause, Pencil, Play, Square } from 'lucide-react';
import { adsAdminApi, type AdPerformance as Perf } from '@/api/endpoints';
import { Alert, Badge, Button, ButtonLink, Card, EmptyState, Input, Select, Skeleton, StatCard, Table, TBody, Td, Th, THead, Tr } from '@/components/ui';
import { AdCreative } from '@/components/ads/AdCreative';
import { EndAdDialog, ReviewAdDialog } from '@/components/admin/AdDialogs';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { useCan } from '@/features/auth/useCan';
import { useBranding } from '@/features/branding/BrandingContext';
import { AD_PERIODS, AD_STATUS, PLACEMENT_LABEL, adPeriodRange, scheduleRange, shortUrl, type AdPeriod } from '@/lib/ads';
import { lagosDay } from '@/lib/analytics';
import { downloadText, toCsv } from '@/lib/csv';
import { formatDate, formatTime } from '@/lib/format';
import { ctr, formatPercent, growth, pointChange } from '@/lib/metrics';
import { errorMessage, notifyError } from '@/lib/notify';
import type { AdCampaign } from '@/types/domain';

// Figma: "Admin / Ad performance" (ADS-013..ADS-016). Impressions count only when an ad was at least 50% visible for
// 1 second; CTR is clicks ÷ impressions from lib/metrics. A period picker (ADS-016) sets the range; changes compare it with
// the same number of days just before. The CSV holds the same numbers as the screen.

const AdDailyCharts = lazy(() => import('@/components/admin/AdCharts').then((m) => ({ default: m.AdDailyCharts })));
const n = (v: number) => v.toLocaleString('en-NG');
const day = (d: string) => formatDate(`${d}T12:00:00Z`, { day: 'numeric', month: 'short', year: 'numeric' });

export default function AdPerformance() {
  const { adId = '' } = useParams();
  const location = useLocation();
  const reviewer = useCan('review_ads');
  const { name: brand } = useBranding();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null);
  const [dialog, setDialog] = useState<'review' | 'end' | null>(null);
  const [table, setTable] = useState(false);
  const [busy, setBusy] = useState(false);
  // ADS-016: the period lives in the URL so a filtered view can be shared; the CSV follows it.
  const [params, setParams] = useSearchParams();
  const period = (AD_PERIODS.find((p) => p.value === params.get('period'))?.value ?? 'campaign') as AdPeriod;
  const custom = { from: params.get('from') ?? '', to: params.get('to') ?? '' };
  const requested = adPeriodRange(period, custom, lagosDay(new Date()));
  const setPeriod = (patch: Record<string, string>) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v && !(k === 'period' && v === 'campaign')) p.set(k, v);
        else p.delete(k);
      }
      return p;
    }, { replace: true });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'ad', adId, 'performance', requested ?? 'all'],
    queryFn: () => adsAdminApi.performance(adId, requested),
    placeholderData: keepPreviousData,
    retry: (count, err) => (err as { status?: number }).status !== 404 && count < 2,
  });
  useAdminTitle('Campaign performance');

  if (isLoading) return <Skeleton className="h-[640px]" />;
  if (!data) {
    const missing = (error as { status?: number } | null)?.status === 404;
    return (
      <EmptyState
        icon={Megaphone}
        title={missing ? 'Campaign not found' : 'We couldn’t load this campaign'}
        body={missing ? 'It may belong to another advertiser, or the link is wrong.' : 'Check your connection and try again.'}
        action={missing ? <ButtonLink to="/admin/ads">Back to campaigns</ButtonLink> : <Button onClick={() => refetch()}>Try again</Button>}
      />
    );
  }

  const { ad } = data;
  const changed = (message: string) => {
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'ad', adId] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'ads'] });
    void queryClient.invalidateQueries({ queryKey: ['ads'] });
  };
  const pause = async (paused: boolean) => {
    setBusy(true);
    try {
      await adsAdminApi.setPaused(ad.id, paused);
      changed(paused ? `${ad.name} is paused. It stops showing straight away. Saved to the audit log.` : `${ad.name} is running again. Saved to the audit log.`);
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t change the campaign. Please try again.'), { id: 'ad-pause' });
    } finally {
      setBusy(false);
    }
  };

  const { totals, previous, range } = data;
  const days = data.daily.length;
  const vsText = `vs the ${days === 1 ? 'day' : `${days} days`} before`;
  const imprG = growth(totals.impressions, previous.impressions);
  const clickG = growth(totals.clicks, previous.clicks);
  const ctrNow = ctr(totals.clicks, totals.impressions);
  const ctrPts = pointChange(ctrNow, ctr(previous.clicks, previous.impressions));
  const delta = (g: number | null) => (g === null ? { sub: 'no earlier data to compare' } : { delta: formatPercent(Math.abs(g), 0), up: g >= 0, sub: vsText });
  const rangeText = days ? `${formatDate(`${range.from}T12:00:00Z`, { day: 'numeric', month: 'short' })} – ${formatDate(`${range.to}T12:00:00Z`, { day: 'numeric', month: 'short', year: 'numeric' })} · ${days === 1 ? '1 day' : `${days} days`}` : 'No days in this period';
  const periodLabel = AD_PERIODS.find((p) => p.value === period)!.label;
  const endDay = ad.endedEarly?.at ?? ad.endsAt;
  const daysLeftSub =
    ad.status === 'scheduled' || ad.status === 'pending_approval' || ad.status === 'draft' || ad.status === 'rejected'
      ? `starts ${formatDate(ad.startsAt, { day: 'numeric', month: 'short' })}`
      : ad.status === 'completed'
        ? `ended ${formatDate(endDay, { day: 'numeric', month: 'short' })}`
        : `ends ${formatDate(ad.endsAt, { day: 'numeric', month: 'short' })}`;

  const exportCsv = () => {
    const rows = [
      [`${brand} ad campaign report`],
      ['Campaign', ad.name],
      ['Advertiser', ad.advertiserName],
      ['Placement', PLACEMENT_LABEL[ad.placement]],
      ['Schedule', scheduleRange(ad.startsAt, ad.endsAt, true)],
      ['Status', AD_STATUS[ad.status].label],
      ['Period', `${periodLabel}: ${days ? `${range.from} to ${range.to}` : 'no days'}`],
      ['Note', 'An impression counts when the ad was at least 50% visible for 1 second. CTR = clicks ÷ impressions.'],
      [],
      ['Impressions', String(totals.impressions)],
      ['Clicks', String(totals.clicks)],
      ['CTR', formatPercent(ctrNow, 2)],
      [`Impressions, ${previous.from} to ${previous.to}`, String(previous.impressions)],
      [`Clicks, ${previous.from} to ${previous.to}`, String(previous.clicks)],
      [],
      ['Placement', 'Impressions', 'Clicks', 'CTR'],
      ...data.byPlacement.map((p) => [p.label, String(p.impressions), String(p.clicks), formatPercent(ctr(p.clicks, p.impressions), 2)]),
      [],
      ['Date', 'Impressions', 'Clicks', 'CTR'],
      ...data.daily.map((d) => [d.date, String(d.impressions), String(d.clicks), formatPercent(ctr(d.clicks, d.impressions), 2)]),
    ];
    downloadText(`ad_${ad.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}.csv`, toCsv(rows));
  };

  const canPause = ad.status === 'active' || ad.status === 'scheduled';
  const canEnd = reviewer && (canPause || ad.status === 'paused');

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Breadcrumb" className="min-w-0 text-sm text-slate">
          <Link to="/admin/ads" className="font-semibold text-forest hover:underline">Ads</Link> / {ad.name}
        </nav>
        <div className="flex flex-wrap gap-3">
          {reviewer && ad.status === 'pending_approval' && <Button onClick={() => setDialog('review')}>Approve or reject</Button>}
          {ad.status !== 'completed' && <ButtonLink to={`/admin/ads/${ad.id}/edit`} variant="secondary"><Pencil size={15} aria-hidden /> Edit</ButtonLink>}
          {canPause && <Button variant="secondary" disabled={busy} onClick={() => pause(true)}><Pause size={15} aria-hidden /> Pause</Button>}
          {ad.status === 'paused' && <Button variant="secondary" disabled={busy} onClick={() => pause(false)}><Play size={15} aria-hidden /> Resume</Button>}
          {canEnd && <Button variant="secondary" className="text-danger" onClick={() => setDialog('end')}><Square size={14} aria-hidden /> End campaign</Button>}
          <Button variant="secondary" onClick={exportCsv}><Download size={16} aria-hidden /> Export CSV</Button>
        </div>
      </div>

      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}
      <StatusAlert ad={ad} />

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <Select label="Period" value={period} onChange={(e) => setPeriod({ period: e.target.value })} className="w-full sm:w-[200px]">
          {AD_PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </Select>
        {period === 'custom' && (
          <>
            <Input label="From" type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setPeriod({ from: e.target.value })} className="w-full sm:w-[170px]" />
            <Input label="To" type="date" value={custom.to} min={custom.from || undefined} onChange={(e) => setPeriod({ to: e.target.value })} className="w-full sm:w-[170px]" />
          </>
        )}
        <p className="pb-3 text-sm text-slate" aria-live="polite">{rangeText}{period === 'custom' && !requested ? ' (choose both dates to filter)' : ''}</p>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Impressions" value={n(totals.impressions)} {...delta(imprG)} />
        <StatCard label="Clicks" value={n(totals.clicks)} {...delta(clickG)} />
        <StatCard label="CTR" value={formatPercent(ctrNow, 2)} {...(ctrPts === null ? { sub: 'clicks ÷ impressions' } : { delta: `${Math.abs(ctrPts).toFixed(1)} pt`, up: ctrPts >= 0, sub: vsText })} />
        <StatCard label="Days left" value={data.daysLeft === null ? '—' : String(data.daysLeft)} sub={daysLeftSub} />
      </div>

      <Card className="mt-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg">Daily impressions and clicks</h2>
          <button type="button" className="text-sm font-bold text-forest hover:underline" aria-pressed={table} onClick={() => setTable((t) => !t)}>{table ? 'Show charts' : 'Show as table'}</button>
        </div>
        <div className="mt-4">
          {data.daily.length === 0 ? (
            <p className="text-sm text-slate">{Date.parse(ad.startsAt) > Date.now() ? `No days to show yet. Numbers start on ${formatDate(ad.startsAt, { day: 'numeric', month: 'short' })}.` : 'The campaign didn’t run in this period.'}</p>
          ) : table ? (
            <DailyTable data={data} />
          ) : (
            <Suspense fallback={<Skeleton className="h-[180px]" />}>
              <AdDailyCharts daily={data.daily} />
            </Suspense>
          )}
        </div>
      </Card>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <h2 className="px-6 py-5 text-lg">By placement</h2>
          <Table caption="Impressions and clicks by placement and device" minWidth={420}>
            <THead>
              <Th>Placement</Th>
              <Th className="text-right">Impr.</Th>
              <Th className="text-right">Clicks</Th>
              <Th className="text-right">CTR</Th>
            </THead>
            <TBody>
              {data.byPlacement.map((p) => (
                <Tr key={p.label}>
                  <Td className="font-semibold">{p.label}</Td>
                  <Td className="text-right tabular-nums">{n(p.impressions)}</Td>
                  <Td className="text-right tabular-nums">{n(p.clicks)}</Td>
                  <Td className="text-right tabular-nums">{formatPercent(ctr(p.clicks, p.impressions), 1)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
          <div className="border-t border-line p-6">
            <h3 className="text-sm font-bold text-ink">The ad</h3>
            <AdCreative ad={ad} variant="card" layout="desktop" className="mt-3 max-w-[320px]" />
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg">Campaign details</h2>
          <dl className="mt-4 divide-y divide-line text-sm">
            <Detail label="Status"><Badge tone={AD_STATUS[ad.status].tone}>{AD_STATUS[ad.status].label}</Badge></Detail>
            <Detail label="Advertiser">{ad.advertiserName}</Detail>
            <Detail label="Placement">{PLACEMENT_LABEL[ad.placement]}</Detail>
            <Detail label="Schedule">{scheduleRange(ad.startsAt, ad.endsAt, true)}</Detail>
            <Detail label="Destination">
              <a href={ad.destinationUrl} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-forest hover:underline">{shortUrl(ad.destinationUrl)}<span className="sr-only"> (opens in a new tab)</span></a>
            </Detail>
            <Detail label="Created by">{ad.createdBy.name} · {formatDate(ad.createdAt, { day: 'numeric', month: 'short' })}</Detail>
            {ad.approval && <Detail label="Approved by">{ad.approval.by} · {formatDate(ad.approval.at, { day: 'numeric', month: 'short' })}</Detail>}
            {ad.rejection && <Detail label="Rejected by">{ad.rejection.by} · {formatDate(ad.rejection.at, { day: 'numeric', month: 'short' })}</Detail>}
            {ad.endedEarly && <Detail label="Ended by">{ad.endedEarly.by} · {formatDate(ad.endedEarly.at, { day: 'numeric', month: 'short' })}</Detail>}
          </dl>
        </Card>
      </div>

      <ReviewAdDialog
        ad={dialog === 'review' ? ad : null}
        onClose={() => setDialog(null)}
        onDone={(x) => {
          setDialog(null);
          changed(x.status === 'rejected' ? `${x.name} was rejected. The advertiser can see why. Saved to the audit log.` : `${x.name} is approved. Saved to the audit log.`);
        }}
      />
      <EndAdDialog
        ad={dialog === 'end' ? ad : null}
        onClose={() => setDialog(null)}
        onDone={(x) => {
          setDialog(null);
          changed(`${x.name} has ended. Saved to the audit log.`);
        }}
      />
    </div>
  );
}

function StatusAlert({ ad }: { ad: AdCampaign }) {
  const when = (iso: string) => `${formatDate(iso, { day: 'numeric', month: 'short' })}, ${formatTime(iso)}`;
  if (ad.status === 'pending_approval') return <Alert tone="info" className="mt-4" title="Waiting for approval">{ad.submittedAt ? `Submitted ${when(ad.submittedAt)}. ` : ''}{Date.parse(ad.startsAt) > Date.now() ? `It goes live on ${formatDate(ad.startsAt, { day: 'numeric', month: 'short' })} once approved.` : 'It goes live as soon as it’s approved.'}</Alert>;
  if (ad.status === 'rejected' && ad.rejection) return <Alert tone="error" className="mt-4" title={`Rejected by ${ad.rejection.by}`}>{ad.rejection.reason}</Alert>;
  if (ad.status === 'paused' && ad.pausedAt) return <Alert tone="warning" className="mt-4">Paused since {when(ad.pausedAt)}. It isn’t showing; resume it to continue until {formatDate(ad.endsAt, { day: 'numeric', month: 'short' })}.</Alert>;
  if (ad.endedEarly) return <Alert tone="warning" className="mt-4" title={`Ended early by ${ad.endedEarly.by}, ${when(ad.endedEarly.at)}`}>{ad.endedEarly.reason}</Alert>;
  return null;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="shrink-0 text-slate">{label}</dt>
      <dd className="min-w-0 text-right font-semibold text-ink">{children}</dd>
    </div>
  );
}

function DailyTable({ data }: { data: Perf }) {
  return (
    <Table caption="Daily impressions and clicks" minWidth={420}>
      <THead>
        <Th>Date</Th>
        <Th className="text-right">Impressions</Th>
        <Th className="text-right">Clicks</Th>
        <Th className="text-right">CTR</Th>
      </THead>
      <TBody>
        {[...data.daily].reverse().map((d) => (
          <Tr key={d.date}>
            <Td className="whitespace-nowrap">{day(d.date)}</Td>
            <Td className="text-right tabular-nums">{n(d.impressions)}</Td>
            <Td className="text-right tabular-nums">{n(d.clicks)}</Td>
            <Td className="text-right tabular-nums">{formatPercent(ctr(d.clicks, d.impressions), 1)}</Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  );
}
