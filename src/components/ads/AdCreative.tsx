import { forwardRef } from 'react';
import { buttonClasses } from '@/components/ui/buttonStyles';
import { cn } from '@/lib/cn';
import type { PublicAd } from '@/types/domain';
import adArt from '@/assets/covers/ad-meadow.svg';

// What an ad looks like (Figma "Web / Landing" sponsored banner and the "Web / Event details" sponsor card). The
// public ad slots and the live preview in Admin / Create ad both render this, so the preview is exactly what hikers
// see. `layout` forces the desktop or phone version for the preview; the public site uses `responsive`.

export type AdLayout = 'responsive' | 'desktop' | 'mobile';

const pick = (layout: AdLayout, responsive: string, desktop: string, mobile: string) => (layout === 'responsive' ? responsive : layout === 'desktop' ? desktop : mobile);

interface Props {
  ad: Pick<PublicAd, 'headline' | 'description' | 'mediaUrl'>;
  variant: 'banner' | 'card';
  layout?: AdLayout;
  /** Renders a link to the advertiser; without it, a plain preview. */
  href?: string;
  onClick?: () => void;
  className?: string;
}

export const AdCreative = forwardRef<HTMLElement, Props>(function AdCreative({ ad, variant, layout = 'responsive', href, onClick, className }, ref) {
  const Tag = href ? 'a' : 'div';
  const linkProps = href ? { href, target: '_blank', rel: 'noopener sponsored', onClick } : {};
  const focus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40';
  const headline = ad.headline || 'Your headline';
  const description = ad.description || 'A short description of the offer.';

  if (variant === 'card') {
    return (
      <Tag ref={ref as never} {...linkProps} className={cn('block overflow-hidden rounded-2xl bg-sand', focus, className)}>
        <img src={ad.mediaUrl ?? adArt} alt="" className={cn('h-[150px] w-full object-cover', pick(layout, 'hidden lg:block', 'block', 'hidden'))} />
        <div className={pick(layout, 'p-4 lg:p-5', 'p-5', 'p-4')}>
          <p className="text-[10px] font-bold tracking-wider text-slate-mute">SPONSORED</p>
          <p className={cn('mt-1.5 break-words font-bold text-ink', pick(layout, 'lg:text-base', 'text-base', ''))}>{headline}</p>
          <p className={cn('mt-1 break-words text-[13px] text-slate', pick(layout, 'hidden lg:block', 'block', 'hidden'))}>{description}</p>
          <p className={cn('mt-2 text-[13px] font-bold text-forest', pick(layout, 'hidden lg:block', 'block', 'hidden'))}>
            Learn more →{href && <span className="sr-only"> (opens in a new tab)</span>}
          </p>
        </div>
      </Tag>
    );
  }

  return (
    <Tag ref={ref as never} {...linkProps} className={cn('flex overflow-hidden rounded-[20px] bg-sand', pick(layout, 'flex-col md:flex-row', 'flex-row', 'flex-col'), focus, className)}>
      <div className={cn('min-w-0 flex-1', pick(layout, 'p-6 md:p-8', 'p-8', 'p-6'))}>
        <p className="text-[11px] font-bold tracking-wider text-slate-mute">SPONSORED</p>
        <p className={cn('mt-3 break-words font-extrabold text-ink', pick(layout, 'text-2xl md:text-[28px]', 'text-[28px] leading-tight', 'text-2xl'))}>{headline}</p>
        <p className="mt-2 break-words text-sm text-slate">{description}</p>
        <span className={buttonClasses({ variant: 'dark', size: 'sm', className: 'mt-5' })}>
          Learn more{href && <span className="sr-only"> (opens in a new tab)</span>}
        </span>
      </div>
      {ad.mediaUrl ? (
        <img src={ad.mediaUrl} alt="" className={cn('object-cover', pick(layout, 'h-44 w-full md:h-auto md:w-[400px]', 'w-[400px] shrink-0', 'h-44 w-full'))} />
      ) : (
        <div aria-hidden className={cn('bg-gradient-to-b from-sun-soft to-sun-dark/60', pick(layout, 'h-44 md:h-auto md:w-[400px]', 'w-[400px] shrink-0', 'h-44'))} />
      )}
    </Tag>
  );
});
