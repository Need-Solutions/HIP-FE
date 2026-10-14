import { cn } from '@/lib/cn';

/** Horizontal meter. `value` is a 0–100 percentage, or null when it can't be computed. */
export function ProgressBar({ value, label, tone = 'forest', className }: { value: number | null; label: string; tone?: 'forest' | 'sun' | 'danger'; className?: string }) {
  const v = value === null ? 0 : Math.min(100, Math.max(0, value));
  const fill = { forest: 'bg-forest', sun: 'bg-sun', danger: 'bg-danger' }[tone];
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : Math.round(v)}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-line', className)}
    >
      <div className={cn('h-full rounded-full transition-[width]', fill)} style={{ width: `${v}%` }} />
    </div>
  );
}
