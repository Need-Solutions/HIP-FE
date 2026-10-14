import sunrise from '@/assets/covers/card-sunrise.svg';
import mist from '@/assets/covers/card-mist.svg';
import meadow from '@/assets/covers/card-meadow.svg';
import dusk from '@/assets/covers/card-dusk.svg';
import type { HikeEvent } from '@/types/domain';

// Mountain illustrations from the Figma event cards, used when an event has no cover photo.
const cardArt = [sunrise, mist, meadow, dusk];

/** Same illustration for the same event every time, so cards don't reshuffle between renders. */
export function coverArt(event: Pick<HikeEvent, 'id' | 'coverImageUrl'>): string {
  if (event.coverImageUrl) return event.coverImageUrl;
  const hash = [...event.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
  return cardArt[hash % cardArt.length];
}
