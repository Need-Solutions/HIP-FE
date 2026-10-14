import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adsApi } from '@/api/endpoints';
import { useViewableImpression } from '@/features/ads/useViewableImpression';
import { viewerDevice } from '@/lib/ads';
import type { AdPlacement, PublicAd } from '@/types/domain';
import { AdCreative } from './AdCreative';

/**
 * Sponsored slot for a placement (WEB-004, ADS-007..014). The server sends only approved campaigns inside their dates;
 * when several share the placement they take turns, one per page view. Renders nothing when none is running.
 * An impression counts once the ad is at least 50% visible for 1 second; a click counts on follow-through.
 */
export function AdSlot({ placement, compact = false, className }: { placement: AdPlacement; compact?: boolean; className?: string }) {
  const { data: ads } = useQuery({ queryKey: ['ads', placement], queryFn: () => adsApi.forPlacement(placement), staleTime: 60_000, meta: { silentError: true } }); // a missing ad isn't an error to the hiker
  const ad = useRotation(placement, ads);
  const ref = useRef<HTMLElement>(null);
  useViewableImpression(ref, ad?.id, () => ad && void adsApi.track(ad.id, 'impression', viewerDevice()).catch(() => undefined));

  if (!ad) return null;
  return (
    <AdCreative
      ref={ref}
      ad={ad}
      variant={compact ? 'card' : 'banner'}
      href={ad.destinationUrl}
      onClick={() => void adsApi.track(ad.id, 'click', viewerDevice()).catch(() => undefined)}
      className={className}
    />
  );
}

const ROTATION_KEY = 'hip.adTurn.';

/** Picks the campaign for this page view: round-robin per placement, remembered for the browser session. */
function useRotation(placement: AdPlacement, ads: PublicAd[] | undefined) {
  const chosen = useRef<{ ids: string; id: string } | null>(null);
  if (!ads?.length) return undefined;
  const ids = ads.map((a) => a.id).join(',');
  if (chosen.current?.ids !== ids) {
    let turn = 0;
    try {
      turn = Number(sessionStorage.getItem(ROTATION_KEY + placement)) || 0;
      sessionStorage.setItem(ROTATION_KEY + placement, String(turn + 1));
    } catch {
      // Private mode: always start with the first campaign.
    }
    chosen.current = { ids, id: ads[turn % ads.length].id };
  }
  return ads.find((a) => a.id === chosen.current!.id);
}
