import { useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus, Search } from 'lucide-react';
import { adsAdminApi, type AdSchedule, type AdTab } from '@/api/endpoints';
import { Alert, Badge, ButtonLink, Card, EmptyState, Input, Menu, Select, Skeleton, StatCard, Table, TBody, Td, Th, THead, Tr, Tabs, Button, type MenuItem } from '@/components/ui';
import { EndAdDialog, ReviewAdDialog } from '@/components/admin/AdDialogs';
import { useAdminTitle } from '@/features/admin/adminTitle';
import { useCan } from '@/features/auth/useCan';
import { AD_STATUS, PLACEMENT_LABEL, scheduleText } from '@/lib/ads';
import { ctr, formatPercent, growth } from '@/lib/metrics';
import { errorMessage, notifyError } from '@/lib/notify';
import type { AdCampaign } from '@/types/domain';
import adArt from '@/assets/covers/ad-meadow.svg';

// Figma: "Admin / Ads" (ADS-001..ADS-016). Admins see every campaign; advertisers only their own (the server filters).
// CTR is clicks ÷ impressions from lib/metrics ("—" with no impressions). Only approved campaigns inside their dates
// reach the public site.

const TABS: AdTab[] = ['all', 'active', 'scheduled', 'pending_approval', 'paused', 'completed', 'draft', 'rejected'];
/** Shown even when empty, as in Figma; the others appear only when they have campaigns. */
const ALWAYS: AdTab[] = ['all', 'active', 'scheduled', 'pending_approval', 'paused', 'completed'];
const SCHEDULES: { value: AdSchedule; label: string }[] = [
  { value: 'any', label: 'Any dates' },
  { value: 'this_month', label: 'Running this month' },
  { value: 'next_month', label: 'Running next month' },
  { value: 'last_month', label: 'Ran last month' },
];

const count = (n: number) => n.toLocaleString('en-NG');

export default function Ads() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t === params.get('tab')) ?? 'all') as AdTab;
  const schedule = (SCHEDULES.find((s) => s.value === params.get('schedule'))?.value ?? 'any') as AdSchedule;
  const q = params.get('q') ?? '';
  const set = (patch: Record<string, string>) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (!v || v === 'all' || v === 'any') p.delete(k);
        else p.set(k, v);
      }
      return p;
    }, { replace: true });

  const reviewer = useCan('review_ads');
  const queryClient = useQueryClient();
  const location = useLocation();
  const [notice, setNotice] = useState<string | null>((location.state as { notice?: string } | null)?.notice ?? null);
  const [reviewing, setReviewing] = useState<AdCampaign | null>(null);
  const [ending, setEnding] = useState<AdCampaign | null>(null);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'ads', { tab, schedule, q: q.trim() }],
    queryFn: () => adsAdminApi.list({ tab, schedule, q: q.trim() || undefined }),
    placeholderData: keepPreviousData,
  });
  useAdminTitle(reviewer ? 'Ad campaigns' : 'My campaigns', reviewer ? 'Only approved, in-schedule ads are shown.' : 'New campaigns and changes go to the group for approval.');

  const refresh = (message: string) => {
    setNotice(message);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'ads'] });
    void queryClient.invalidateQueries({ queryKey: ['ads'] });
  };
  const pause = async (ad: AdCampaign, paused: boolean) => {
    try {
      await adsAdminApi.setPaused(ad.id, paused);
      refresh(`${ad.name} is ${paused ? 'paused' : 'running again'}. Saved to the audit log.`);
    } catch (err) {
      notifyError(errorMessage(err, 'We couldn’t change the campaign. Please try again.'), { id: 'ad-pause' });
    }
  };

  const actions = (ad: AdCampaign): MenuItem[] => {
    const items: MenuItem[] = [];
    if (ad.status !== 'draft') items.push({ label: 'View performance', to: `/admin/ads/${ad.id}` });
    if (ad.status !== 'completed') items.push({ label: ad.status === 'draft' || ad.status === 'rejected' ? 'Edit and submit' : 'Edit', to: `/admin/ads/${ad.id}/edit` });
    if (reviewer && ad.status === 'pending_approval') items.push({ label: 'Approve or reject', onSelect: () => setReviewing(ad) });
    if (ad.status === 'active' || ad.status === 'scheduled') items.push({ label: 'Pause', onSelect: () => void pause(ad, true) });
    if (ad.status === 'paused') items.push({ label: 'Resume', onSelect: () => void pause(ad, false) });
    if (reviewer && (ad.status === 'active' || ad.status === 'scheduled' || ad.status === 'paused')) items.push({ label: 'End campaign', tone: 'danger', onSelect: () => setEnding(ad) });
    return items;
  };

  const sm = data?.summary;
  const imprGrowth = sm ? growth(sm.impressions, sm.impressionsPrev) : null;
  const clickGrowth = sm ? growth(sm.clicks, sm.clicksPrev) : null;
  const pending = data?.counts.pending_approval ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          idPrefix="ads"
          label="Campaign status"
          value={tab}
          onChange={(t) => set({ tab: t })}
          options={TABS.filter((t) => ALWAYS.includes(t) || (data?.counts[t] ?? 0) > 0 || t === tab).map((t) => ({ value: t, label: t === 'all' ? 'All' : AD_STATUS[t].label, count: data?.counts[t] }))}
          className="order-2 min-w-0 basis-full sm:order-1 sm:basis-0 sm:flex-1"
        />
        <ButtonLink to="/admin/ads/new" className="order-1 ml-auto shrink-0 sm:order-2"><Plus size={16} aria-hidden /> New campaign</ButtonLink>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Input label="Search campaigns" className="w-full sm:w-[300px] [&_label]:sr-only" icon={Search} filled placeholder="Campaign, advertiser or headline" value={q} onChange={(e) => set({ q: e.target.value })} />
        <Select label="Schedule" hideLabel value={schedule} onChange={(e) => set({ schedule: e.target.value })} className="w-full sm:w-[210px]">
          {SCHEDULES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </div>

      {notice && <Alert tone="success" className="mt-4">{notice}</Alert>}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {sm ? (
          <>
            <StatCard label="Impressions (30d)" value={count(sm.impressions)} {...(imprGrowth === null ? { sub: 'no earlier data' } : { delta: formatPercent(Math.abs(imprGrowth), 0), up: imprGrowth >= 0, sub: 'vs previous 30 days' })} />
            <StatCard label="Clicks (30d)" value={count(sm.clicks)} {...(clickGrowth === null ? { sub: 'no earlier data' } : { delta: formatPercent(Math.abs(clickGrowth), 0), up: clickGrowth >= 0, sub: 'vs previous 30 days' })} />
            <StatCard label="Avg. CTR" value={formatPercent(ctr(sm.clicks, sm.impressions), 2)} sub="clicks ÷ impressions" />
            <StatCard label="Active placements" value={`${sm.activePlacements} of ${sm.placements}`} sub="homepage banner, event page" />
          </>
        ) : (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[120px]" />)
        )}
      </div>

      {reviewer && pending > 0 && tab !== 'pending_approval' && (
        <Alert tone="warning" className="mt-4">
          {pending === 1 ? '1 campaign is' : `${pending} campaigns are`} waiting for approval.{' '}
          <button type="button" className="font-bold text-forest underline" onClick={() => set({ tab: 'pending_approval' })}>Show {pending === 1 ? 'it' : 'them'}</button>
        </Alert>
      )}

      <Card className="mt-5 overflow-hidden" id="ads-panel" role="tabpanel" aria-labelledby={`ads-tab-${tab}`}>
        {isLoading ? (
          <div className="space-y-3 p-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : !data ? (
          <EmptyState className="border-0" icon={Megaphone} title="We couldn’t load campaigns" body="Check your connection and try again." action={<Button onClick={() => refetch()}>Try again</Button>} />
        ) : data.items.length === 0 ? (
          <EmptyState
            className="border-0"
            icon={Megaphone}
            title={tab === 'all' && !q && schedule === 'any' ? 'No campaigns yet' : 'No campaigns match'}
            body={tab === 'all' && !q && schedule === 'any' ? 'Create a campaign to show a sponsored banner on the homepage or event pages.' : 'Try another tab, search or schedule.'}
            action={tab === 'all' && !q && schedule === 'any' ? <ButtonLink to="/admin/ads/new">New campaign</ButtonLink> : undefined}
          />
        ) : (
          <Table caption="Ad campaigns" minWidth={960}>
            <THead>
              <Th>Campaign</Th>
              <Th>Placement</Th>
              <Th>Schedule</Th>
              <Th className="text-right">Impr.</Th>
              <Th className="text-right">CTR</Th>
              <Th>Status</Th>
              <Th><span className="sr-only">Actions</span></Th>
            </THead>
            <TBody>
              {data.items.map((ad) => {
                const started = ad.impressions > 0 || ad.status === 'active' || ad.status === 'completed' || ad.status === 'paused';
                return (
                  <Tr key={ad.id}>
                    <Td>
                      <div className="flex items-center gap-3">
                        <img src={ad.mediaUrl ?? adArt} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
                        <div className="min-w-0">
                          <Link to={ad.status === 'draft' ? `/admin/ads/${ad.id}/edit` : `/admin/ads/${ad.id}`} className="font-semibold text-ink hover:text-forest hover:underline">{ad.name}</Link>
                          <p className="truncate text-xs text-slate">{ad.advertiserName}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap">{PLACEMENT_LABEL[ad.placement]}</Td>
                    <Td className="whitespace-nowrap">{scheduleText(ad)}</Td>
                    <Td className="text-right tabular-nums">{started ? count(ad.impressions) : '—'}</Td>
                    <Td className="text-right tabular-nums">{started ? formatPercent(ctr(ad.clicks, ad.impressions), 1) : '—'}</Td>
                    <Td><Badge tone={AD_STATUS[ad.status].tone}>{AD_STATUS[ad.status].label}</Badge></Td>
                    <Td className="text-right">
                      <Menu label={`Actions for ${ad.name}`} items={actions(ad)} />
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
      {!reviewer && <p className="mt-4 text-xs text-slate">You see your own campaigns only. A campaign goes live on its start date once the group approves it.</p>}

      <ReviewAdDialog
        ad={reviewing}
        onClose={() => setReviewing(null)}
        onDone={(ad) => {
          setReviewing(null);
          refresh(`${ad.name} ${ad.status === 'rejected' ? 'was rejected. The advertiser can see why.' : 'is approved.'} Saved to the audit log.`);
        }}
      />
      <EndAdDialog
        ad={ending}
        onClose={() => setEnding(null)}
        onDone={(ad) => {
          setEnding(null);
          refresh(`${ad.name} has ended. Saved to the audit log.`);
        }}
      />
    </div>
  );
}
