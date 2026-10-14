import { useBranding } from '@/features/branding/BrandingContext';
import { cn } from '@/lib/cn';

/**
 * The group's logo (Admin / Branding): an uploaded image, or the built-in mountain mark in the brand colours with
 * the group's short name. `dark` is for dark backgrounds.
 */
export function Logo({ dark = false, className }: { dark?: boolean; className?: string }) {
  const { name, logoUrl } = useBranding();
  if (logoUrl) return <img src={logoUrl} alt={name} className={cn('h-8 w-auto max-w-[160px] object-contain', className)} />;
  return (
    <span className={cn('inline-flex items-center gap-2', dark ? 'text-white' : 'text-forest', className)}>
      <svg width="32" height="28" viewBox="0 0 32 28" aria-hidden>
        <polygon points="0,26 11,6 17,15 21,9 32,26" fill="currentColor" />
        <circle cx="25" cy="5" r="3.5" className="text-sun" fill="currentColor" />
      </svg>
      <span className="text-[22px] font-extrabold tracking-wide">{name}</span>
    </span>
  );
}
