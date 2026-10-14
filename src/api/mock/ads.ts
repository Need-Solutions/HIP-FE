import { ApiError } from '../client';
import { mockStaff } from './data';
import { auth } from './auth';
import { pushAudit, update, type MockState } from './store';
import { addDays, lagosDay } from '@/lib/analytics';
import { PLACEMENT_LABEL, lagosEndIso, lagosStartIso, scheduleRange } from '@/lib/ads';
import { can } from '@/lib/permissions';
import type { AdDay, AdInput, AdPerformance, AdsList, AdsQuery, AdSlotInfo, AdTab } from '../endpoints';
import type { AdCampaign, AdPlacement, AdStatus, PublicAd } from '@/types/domain';

// Mock ad server (Admin / Ads, Create ad, Ad performance, and the public ad slots). Rules the backend must keep:
//   - Advertisers see and edit only their own campaigns; admins see all (review_ads).
//   - An advertiser's campaign goes to "Pending approval"; only admins approve or reject (reject needs a reason).
//     An advertiser editing an approved campaign sends it back for approval.
//   - The public site gets only approved, unpaused campaigns inside their dates. Campaigns sharing a placement rotate.
//   - Impressions and clicks count only for a live campaign. The client sends an impression after 50% visibility for
//     1 second; the server should also de-duplicate per page view.
//   - Every change is audit-logged.

type StoredState = 'draft' | 'pending_approval' | 'approved' | 'rejected';
interface StoredAd extends Omit<AdCampaign, 'status' | 'impressions' | 'clicks'> {
  state: StoredState;
  paused: boolean;
}
/** Per day: desktop impressions, mobile impressions, desktop clicks, mobile clicks. */
type Bucket = [number, number, number, number];

export interface MockAdsState {
  campaigns: StoredAd[];
  daily: Record<string, Record<string, Bucket>>;
}

const DAY = 86_400_000;
const today = () => lagosDay(new Date());
const startOf = lagosStartIso;
const endOf = lagosEndIso;
const viewer = (s: MockState) => s.sessionUser ?? mockStaff[0];

function rand(seed: number) {
  let x = seed;
  return () => ((x = (x * 16807) % 2147483647) / 2147483647);
}

// Update unchanged sample copy already saved in a browser session during development.
const previousSampleCopy: Record<string, string> = {
  'Boots, packs and hydration from Outdoor Hub Lagos. Show your ticket in store.': 'Boots, packs and hydration from Outdoor Hub Abuja. Show your ticket in store.',
  'The HydroPack 2L hydration vest. Free delivery in Lagos this month.': 'The HydroPack 2L hydration vest. Free delivery in Abuja this month.',
  'Lagos Camping Co.': 'Abuja Camping Co.',
  'https://lagoscamping.example/hip': 'https://abujacamping.example/hip',
  'Kayak Lagos weekend': 'Kayak Abuja weekend',
  'Kayak Lagos': 'Kayak Abuja',
  'From trail to lagoon': 'From trail to lake',
  'Guided kayak tours on Lekki lagoon. Book a Saturday paddle after your hike.': 'Guided kayak tours on Jabi Lake. Book a Saturday paddle after your hike.',
  'https://kayaklagos.example/': 'https://kayakabuja.example/',
};

function seed(s: MockState): MockAdsState {
  if (s.ads) {
    for (const campaign of s.ads.campaigns) {
      for (const field of ['name', 'headline', 'description', 'destinationUrl', 'advertiserName'] as const) {
        const value = campaign[field];
        if (value && Object.prototype.hasOwnProperty.call(previousSampleCopy, value)) campaign[field] = previousSampleCopy[value];
      }
    }
    return s.ads;
  }
  const t = today();
  const kunle = { id: mockStaff[0].id, name: mockStaff[0].fullName };
  const hub = mockStaff.find((u) => u.roles.includes('advertiser'))!;
  const hubBy = { id: hub.id, name: hub.fullName };
  const approved = (daysAgo: number) => ({ by: kunle.name, at: new Date(Date.now() - daysAgo * DAY).toISOString() });
  const base = (id: string, p: Partial<StoredAd> & Pick<StoredAd, 'name' | 'headline' | 'description' | 'placement' | 'destinationUrl'>, from: number, to: number): StoredAd => ({
    id,
    advertiserName: p.advertiserName ?? p.name,
    createdBy: kunle,
    createdAt: new Date(Date.now() - (Math.max(0, -from) + 5) * DAY).toISOString(),
    startsAt: startOf(addDays(t, from)),
    endsAt: endOf(addDays(t, to)),
    state: 'approved',
    paused: false,
    approval: approved(Math.max(1, -from + 2)),
    ...p,
  });
  const campaigns: StoredAd[] = [
    base('ad_1', { name: 'Outdoor Hub gear sale', headline: 'Trail-ready gear at 20% off for HIP members', description: 'Boots, packs and hydration from Outdoor Hub Abuja. Show your ticket in store.', placement: 'homepage_banner', destinationUrl: 'https://outdoorhub.example/hip', advertiserId: hub.id, advertiserName: hub.fullName, createdBy: hubBy }, -12, 18),
    base('ad_2', { name: 'HydroPack 2L', headline: 'Never run dry on the trail', description: 'The HydroPack 2L hydration vest. Free delivery in Abuja this month.', placement: 'event_page', destinationUrl: 'https://hydropack.example/2l', advertiserName: 'HydroPack' }, -3, 28),
    base('ad_3', { name: 'TrailFit Gym', headline: 'Train for the summit', description: 'Hill-training classes every Wednesday. First week free for hikers.', placement: 'event_page', destinationUrl: 'https://trailfit.example/hikers', advertiserName: 'TrailFit Gym' }, -2, 60),
    base('ad_4', { name: 'Abuja Camping Co.', headline: 'Gear up for weekend camping', description: 'Tents, stoves and sleeping bags to rent or buy. 15% off with code HIP15.', placement: 'homepage_banner', destinationUrl: 'https://abujacamping.example/hip', advertiserName: 'Abuja Camping Co.' }, 19, 48),
    base('ad_5', { name: 'Kayak Abuja weekend', headline: 'From trail to lake', description: 'Guided kayak tours on Jabi Lake. Book a Saturday paddle after your hike.', placement: 'event_page', destinationUrl: 'https://kayakabuja.example/', advertiserName: 'Kayak Abuja' }, 10, 40),
    base('ad_6', { name: 'SunShield SPF 50', headline: 'Sun cream that survives the climb', description: 'Sweat-resistant SPF 50 in a 50 ml trail tube. Sold at Outdoor Hub.', placement: 'event_page', destinationUrl: 'https://outdoorhub.example/sunshield', advertiserId: hub.id, advertiserName: hub.fullName, createdBy: hubBy, state: 'pending_approval', approval: undefined, submittedAt: new Date(Date.now() - 1 * DAY).toISOString() }, 7, 37),
    base('ad_7', { name: 'Ride Share promo', headline: 'Ride to the trailhead for less', description: 'Split a ride with other hikers. ₦1,000 off your first trip with code TRAIL.', placement: 'homepage_banner', destinationUrl: 'https://rideshare.example/trail', advertiserName: 'RideShare NG', paused: true, pausedAt: new Date(Date.now() - 5 * DAY).toISOString() }, -20, 10),
    base('ad_8', { name: 'Harmattan hydration drive', headline: 'Stay hydrated this harmattan', description: 'Electrolyte tabs for long hikes, from Outdoor Hub.', placement: 'homepage_banner', destinationUrl: 'https://outdoorhub.example/hydrate', advertiserId: hub.id, advertiserName: hub.fullName, createdBy: hubBy }, -75, -45),
    base('ad_9', { name: 'Trail Mix Co. launch', headline: 'Fuel up for the climb', description: 'Trail Mix Co. energy bars. Show your HIP ticket for a free sample pack.', placement: 'event_page', destinationUrl: 'https://trailmix.example/', advertiserName: 'Trail Mix Co.' }, -50, -21),
  ];
  // Daily numbers up to today (or until paused), near the Figma totals.
  const targets: Record<string, [number, number]> = { ad_1: [21400, 0.031], ad_2: [3900, 0.024], ad_3: [2300, 0.022], ad_7: [5000, 0.016], ad_8: [16200, 0.027], ad_9: [11800, 0.021] };
  const daily: MockAdsState['daily'] = {};
  campaigns.forEach((c, n) => {
    const target = targets[c.id];
    if (!target) return;
    const r = rand(n + 7);
    const first = lagosDay(new Date(c.startsAt));
    const stop = [lagosDay(new Date(c.endsAt)), t, ...(c.pausedAt ? [addDays(lagosDay(new Date(c.pausedAt)), -1)] : [])].sort()[0];
    const days: string[] = [];
    for (let d = first; d <= stop; d = addDays(d, 1)) days.push(d);
    const desk = c.placement === 'homepage_banner' ? 0.69 : 0.45;
    const per = target[0] / Math.max(1, days.length - (days[days.length - 1] === t ? 0.55 : 0));
    daily[c.id] = {};
    for (const d of days) {
      const impr = Math.round(per * (0.75 + r() * 0.5) * (d === t ? 0.45 : 1));
      const iD = Math.round(impr * desk);
      const clicks = Math.round(impr * target[1] * (0.7 + r() * 0.6));
      const cD = Math.round(clicks * (desk + 0.04));
      daily[c.id][d] = [iD, impr - iD, Math.min(cD, clicks), clicks - Math.min(cD, clicks)];
    }
  });
  return (s.ads = { campaigns, daily });
}

function totals(st: MockAdsState, id: string, from = '0000', to = '9999') {
  let impressions = 0;
  let clicks = 0;
  for (const [d, b] of Object.entries(st.daily[id] ?? {})) {
    if (d < from || d > to) continue;
    impressions += b[0] + b[1];
    clicks += b[2] + b[3];
  }
  return { impressions, clicks };
}

function statusOf(a: StoredAd, now = Date.now()): AdStatus {
  if (a.state !== 'approved') return a.state;
  if (a.endedEarly || now > Date.parse(a.endsAt)) return 'completed';
  if (a.paused) return 'paused';
  return now < Date.parse(a.startsAt) ? 'scheduled' : 'active';
}

function view(st: MockAdsState, a: StoredAd): AdCampaign {
  const rest: Partial<StoredAd> = { ...a };
  delete rest.state;
  delete rest.paused;
  return { ...(rest as Omit<StoredAd, 'state' | 'paused'>), status: statusOf(a), ...totals(st, a.id) };
}

const reviewer = (s: MockState) => can(viewer(s), 'review_ads');

function visible(s: MockState, st: MockAdsState) {
  const me = viewer(s);
  if (!can(me, 'manage_ads')) throw new ApiError(403, 'You don’t have access to ads.');
  return reviewer(s) ? st.campaigns : st.campaigns.filter((a) => a.advertiserId === me.id);
}

function find(s: MockState, id: string) {
  const st = seed(s);
  const a = visible(s, st).find((x) => x.id === id);
  if (!a) throw new ApiError(404, 'Campaign not found.');
  return { st, a };
}

function monthRange(offset: number) {
  const [y, m] = today().split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(y, m + offset, 0));
  return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)] as const;
}

const STATUS_ORDER: AdStatus[] = ['pending_approval', 'active', 'scheduled', 'paused', 'draft', 'rejected', 'completed'];

const HTTPS = /^https:\/\/[^\s/$.?#][^\s]*$/i;

function validate(input: AdInput, existing?: StoredAd) {
  const fail = (m: string) => {
    throw new ApiError(400, m);
  };
  if (input.name.trim().length < 3) fail('Give the campaign a name.');
  if (input.headline.trim().length < 5 || input.headline.length > 60) fail('The headline must be 5–60 characters.');
  if (input.description.trim().length < 10 || input.description.length > 150) fail('The description must be 10–150 characters.');
  if (!HTTPS.test(input.destinationUrl)) fail('The destination must be a full https:// link.');
  if (!(input.placement in PLACEMENT_LABEL)) fail('Choose a placement.');
  const start = lagosDay(new Date(input.startsAt));
  const end = lagosDay(new Date(input.endsAt));
  if (end < start) fail('The end date must be on or after the start date.');
  if (end < today()) fail('The end date can’t be in the past.');
  const startChanged = !existing || lagosDay(new Date(existing.startsAt)) !== start;
  if (startChanged && start < today()) fail('The start date can’t be in the past.');
}

export const mockAdsServer = {
  live: (placement: AdPlacement): PublicAd[] =>
    update((s) =>
      seed(s)
        .campaigns.filter((a) => a.placement === placement && statusOf(a) === 'active')
        .map(({ id, headline, description, mediaUrl, destinationUrl, placement: p, advertiserName }) => ({ id, headline, description, mediaUrl, destinationUrl, placement: p, advertiserName })),
    ),

  track: (id: string, type: 'impression' | 'click', device: 'desktop' | 'mobile') =>
    update((s) => {
      const st = seed(s);
      const a = st.campaigns.find((x) => x.id === id);
      if (!a || statusOf(a) !== 'active') return; // only live campaigns count
      const b = ((st.daily[id] ??= {})[today()] ??= [0, 0, 0, 0]);
      b[(type === 'impression' ? 0 : 2) + (device === 'desktop' ? 0 : 1)] += 1;
    }),

  list: (q: AdsQuery): AdsList =>
    update((s) => {
      const st = seed(s);
      const mine = visible(s, st);
      let rows = mine.map((a) => view(st, a));
      const term = q.q?.trim().toLowerCase();
      if (term) rows = rows.filter((a) => [a.name, a.advertiserName, a.headline].some((v) => v.toLowerCase().includes(term)));
      if (q.schedule !== 'any') {
        const [from, to] = monthRange(q.schedule === 'this_month' ? 0 : q.schedule === 'next_month' ? 1 : -1);
        rows = rows.filter((a) => lagosDay(new Date(a.startsAt)) <= to && lagosDay(new Date(a.endsAt)) >= from);
      }
      const counts = { all: rows.length } as Record<AdTab, number>;
      for (const k of STATUS_ORDER) counts[k] = rows.filter((a) => a.status === k).length;
      if (q.tab !== 'all') rows = rows.filter((a) => a.status === q.tab);
      rows.sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || b.startsAt.localeCompare(a.startsAt));
      const t = today();
      const sum = (from: string, to: string) => mine.reduce((acc, a) => {
        const x = totals(st, a.id, from, to);
        return { impressions: acc.impressions + x.impressions, clicks: acc.clicks + x.clicks };
      }, { impressions: 0, clicks: 0 });
      const cur = sum(addDays(t, -29), t);
      const prev = sum(addDays(t, -59), addDays(t, -30));
      const livePlacements = new Set(mine.filter((a) => statusOf(a) === 'active').map((a) => a.placement));
      return {
        items: rows,
        counts,
        summary: { impressions: cur.impressions, impressionsPrev: prev.impressions, clicks: cur.clicks, clicksPrev: prev.clicks, activePlacements: livePlacements.size, placements: Object.keys(PLACEMENT_LABEL).length },
      };
    }),

  get: (id: string): AdCampaign | null =>
    update((s) => {
      const st = seed(s);
      const a = visible(s, st).find((x) => x.id === id);
      return a ? view(st, a) : null;
    }),

  performance: (id: string, range?: { from: string; to: string }): AdPerformance =>
    update((s) => {
      const { st, a } = find(s, id);
      const t = today();
      const runFrom = lagosDay(new Date(a.startsAt));
      const lastDay = lagosDay(new Date(a.endedEarly?.at ?? a.endsAt));
      const runTo = lastDay < t ? lastDay : t;
      // Clip the requested range to the days the campaign could have run.
      const from = range?.from && range.from > runFrom ? range.from : runFrom;
      const to = range?.to && range.to < runTo ? range.to : runTo;
      const daily: AdDay[] = [];
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const b = st.daily[id]?.[d] ?? [0, 0, 0, 0];
        daily.push({ date: d, impressions: b[0] + b[1], clicks: b[2] + b[3] });
      }
      const split = Object.entries(st.daily[id] ?? {})
        .filter(([d]) => d >= from && d <= to)
        .reduce((acc, [, b]) => acc.map((v, i) => v + b[i]) as Bucket, [0, 0, 0, 0] as Bucket);
      const days = daily.length;
      const prevTo = addDays(from, -1);
      const prevFrom = addDays(from, -Math.max(days, 1));
      const place = a.placement === 'homepage_banner' ? 'Homepage' : 'Event page';
      const status = statusOf(a);
      const started = Date.now() >= Date.parse(a.startsAt);
      const daysLeft = started && (status === 'active' || status === 'paused') ? Math.max(0, Math.round((Date.parse(`${lastDay}T12:00:00Z`) - Date.parse(`${t}T12:00:00Z`)) / DAY)) : null;
      return {
        ad: view(st, a),
        daily,
        range: { from, to },
        totals: from <= to ? totals(st, id, from, to) : { impressions: 0, clicks: 0 },
        previous: { from: prevFrom, to: prevTo, ...totals(st, id, prevFrom, prevTo) },
        byPlacement: [
          { label: `${place} (desktop)`, impressions: split[0], clicks: split[2] },
          { label: `${place} (mobile)`, impressions: split[1], clicks: split[3] },
        ],
        daysLeft,
      };
    }),

  save: (id: string | null, input: AdInput, submit: boolean): AdCampaign =>
    update((s) => {
      const st = seed(s);
      const me = viewer(s);
      if (!can(me, 'manage_ads')) throw new ApiError(403, 'You don’t have access to ads.');
      const admin = reviewer(s);
      const existing = id ? find(s, id).a : undefined;
      if (existing && statusOf(existing) === 'completed') throw new ApiError(409, 'This campaign has ended and can’t be changed.');
      validate(input, existing);
      let owner: { advertiserId?: string; advertiserName: string };
      if (admin) {
        const acct = input.advertiserId ? auth(s).users.find((u) => u.user.id === input.advertiserId && u.user.roles.includes('advertiser')) : undefined;
        if (input.advertiserId && !acct) throw new ApiError(400, 'Choose an advertiser account.');
        if (!acct && input.advertiserName.trim().length < 2) throw new ApiError(400, 'Name the sponsor.');
        owner = acct ? { advertiserId: acct.user.id, advertiserName: acct.user.fullName } : { advertiserId: undefined, advertiserName: input.advertiserName.trim() };
      } else {
        owner = { advertiserId: me.id, advertiserName: me.fullName };
      }
      const now = new Date().toISOString();
      const fields = {
        name: input.name.trim(),
        headline: input.headline.trim(),
        description: input.description.trim(),
        mediaUrl: input.mediaUrl,
        destinationUrl: input.destinationUrl.trim(),
        placement: input.placement,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        ...owner,
      };
      const when = scheduleRange(input.startsAt, input.endsAt);
      if (!existing) {
        const ad: StoredAd = {
          id: `ad_${crypto.randomUUID().slice(0, 8)}`,
          ...fields,
          createdBy: { id: me.id, name: me.fullName },
          createdAt: now,
          state: !submit ? 'draft' : admin ? 'approved' : 'pending_approval',
          paused: false,
          ...(submit ? { submittedAt: now } : {}),
          ...(submit && admin ? { approval: { by: me.fullName, at: now } } : {}),
        };
        st.campaigns.push(ad);
        const action = !submit ? 'ad.created' : admin ? 'ad.approved' : 'ad.submitted';
        pushAudit(s, { action, recordType: 'ad', recordId: ad.id, details: `${ad.name} · ${PLACEMENT_LABEL[ad.placement]} · ${when}${!submit ? ' · saved as draft' : admin ? ' · created and approved' : ''}` });
        return view(st, ad);
      }
      const changed = (Object.keys(fields) as (keyof typeof fields)[]).filter((k) => (existing[k] ?? '') !== (fields[k] ?? ''));
      Object.assign(existing, fields);
      let note = '';
      if (existing.state === 'approved' && !admin && changed.length) {
        existing.state = 'pending_approval';
        existing.approval = undefined;
        existing.submittedAt = now;
        note = ' · sent back for approval';
      } else if ((existing.state === 'draft' || existing.state === 'rejected') && submit) {
        existing.submittedAt = now;
        existing.rejection = undefined;
        if (admin) {
          existing.state = 'approved';
          existing.approval = { by: me.fullName, at: now };
          note = ' · approved';
        } else {
          existing.state = 'pending_approval';
          note = ' · submitted for approval';
        }
      }
      if (changed.length || note) {
        pushAudit(s, { action: note.includes('submitted') ? 'ad.submitted' : note === ' · approved' ? 'ad.approved' : 'ad.updated', recordType: 'ad', recordId: existing.id, details: `${existing.name}: ${changed.length ? `changed ${changed.map((k) => (k === 'mediaUrl' ? 'image' : k === 'destinationUrl' ? 'destination' : k === 'startsAt' || k === 'endsAt' ? 'dates' : k.replace('advertiserName', 'advertiser'))).filter((v, i, arr) => arr.indexOf(v) === i).join(', ')}` : 'no content changes'}${note}` });
      }
      return view(st, existing);
    }),

  review: (id: string, decision: 'approve' | 'reject', reason?: string): AdCampaign =>
    update((s) => {
      if (!reviewer(s)) throw new ApiError(403, 'Only admins can approve or reject campaigns.');
      const { st, a } = find(s, id);
      if (a.state !== 'pending_approval') throw new ApiError(409, 'This campaign isn’t waiting for approval any more.');
      const why = reason?.trim() ?? '';
      if (decision === 'reject' && why.length < 10) throw new ApiError(400, 'Give a reason of at least 10 characters. The advertiser sees it.');
      const me = viewer(s);
      const at = new Date().toISOString();
      if (decision === 'approve') {
        a.state = 'approved';
        a.approval = { by: me.fullName, at, ...(why ? { note: why } : {}) };
        a.rejection = undefined;
      } else {
        a.state = 'rejected';
        a.rejection = { by: me.fullName, at, reason: why };
      }
      pushAudit(s, { action: decision === 'approve' ? 'ad.approved' : 'ad.rejected', recordType: 'ad', recordId: a.id, details: `${a.name} · ${PLACEMENT_LABEL[a.placement]} · ${scheduleRange(a.startsAt, a.endsAt)}`, ...(why ? { reason: why } : {}) });
      return view(st, a);
    }),

  setPaused: (id: string, paused: boolean): AdCampaign =>
    update((s) => {
      const { st, a } = find(s, id);
      const status = statusOf(a);
      if (paused && status !== 'active' && status !== 'scheduled') throw new ApiError(409, 'Only active or scheduled campaigns can be paused.');
      if (!paused && status !== 'paused') throw new ApiError(409, 'This campaign isn’t paused.');
      a.paused = paused;
      a.pausedAt = paused ? new Date().toISOString() : undefined;
      pushAudit(s, { action: paused ? 'ad.paused' : 'ad.resumed', recordType: 'ad', recordId: a.id, details: `${a.name} ${paused ? 'paused' : 'resumed'}` });
      return view(st, a);
    }),

  terminate: (id: string, reason: string): AdCampaign =>
    update((s) => {
      if (!reviewer(s)) throw new ApiError(403, 'Only admins can end a campaign.');
      const { st, a } = find(s, id);
      const status = statusOf(a);
      if (status !== 'active' && status !== 'scheduled' && status !== 'paused') throw new ApiError(409, 'Only running, scheduled or paused campaigns can be ended.');
      if (reason.trim().length < 10) throw new ApiError(400, 'Give a reason of at least 10 characters. It goes in the audit log.');
      a.endedEarly = { by: viewer(s).fullName, at: new Date().toISOString(), reason: reason.trim() };
      a.paused = false;
      pushAudit(s, { action: 'ad.ended', recordType: 'ad', recordId: a.id, details: `${a.name} ended early`, reason: reason.trim() });
      return view(st, a);
    }),

  slotInfo: (placement: AdPlacement, startsAt: string, endsAt: string, excludeId?: string): AdSlotInfo =>
    update((s) => {
      const st = seed(s);
      const from = Date.parse(startsAt);
      const to = Date.parse(endsAt);
      const others = st.campaigns.filter((a) => a.id !== excludeId && a.placement === placement && a.state === 'approved' && !a.endedEarly && Date.parse(a.startsAt) <= to && Date.parse(a.endsAt) >= from).length;
      return { others };
    }),

  checkLink: (url: string): { reachable: boolean } => {
    if (!HTTPS.test(url)) throw new ApiError(400, 'Enter a full https:// link.');
    const host = new URL(url).hostname;
    return { reachable: !/(^|\.)(invalid|broken|localhost)($|\.)|^127\.|^10\.|^192\.168\./.test(host) };
  },

  advertisers: () =>
    update((s) => {
      if (!reviewer(s)) throw new ApiError(403, 'Only admins can choose an advertiser.');
      return auth(s).users.filter((u) => u.user.roles.includes('advertiser')).map((u) => ({ id: u.user.id, name: u.user.fullName }));
    }),
};
