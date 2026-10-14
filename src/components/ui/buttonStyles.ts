import { cn } from '@/lib/cn';

// Shared by Button and ButtonLink so a link that looks like a button stays identical to the real thing.

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'light' | 'dark';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-forest text-on-primary hover:bg-forest-600',
  accent: 'bg-sun text-on-secondary hover:brightness-95',
  secondary: 'bg-white text-ink border border-line hover:bg-canvas',
  ghost: 'text-forest hover:bg-mint',
  danger: 'bg-danger text-white hover:brightness-95',
  light: 'bg-white text-forest hover:bg-sand',
  dark: 'bg-pine text-white hover:bg-forest',
};
const sizes: Record<ButtonSize, string> = { sm: 'h-9 px-3 text-[13px]', md: 'h-11 px-4 text-[15px]', lg: 'h-[52px] px-6 text-[15px]' };

export function buttonClasses({ variant = 'primary', size = 'md', block, className }: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; className?: string }) {
  return cn(
    'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 disabled:cursor-not-allowed disabled:opacity-50',
    variants[variant],
    sizes[size],
    block && 'w-full',
    className,
  );
}
