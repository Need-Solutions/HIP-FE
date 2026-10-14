import { cn } from '@/lib/cn';

/**
 * On/off toggle (Figma "Hiker / Profile" notifications). A button with role="switch", so it's announced as on
 * or off. Name it with `aria-labelledby` (a visible label) or `aria-label`. `locked` shows a setting that
 * can't be changed, e.g. required notifications.
 */
export function Switch({
  checked,
  onChange,
  locked,
  disabled,
  id,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  'aria-label': label,
}: {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  locked?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-label'?: string;
}) {
  const off = locked || disabled;
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-label={label}
      aria-disabled={off || undefined}
      onClick={() => !off && onChange?.(!checked)}
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 focus-visible:ring-offset-2',
        checked ? 'bg-forest' : 'bg-line',
        off ? 'cursor-not-allowed' : 'cursor-pointer',
        locked && 'opacity-60',
        disabled && !locked && 'opacity-50',
      )}
    >
      <span aria-hidden className={cn('absolute top-1 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-6' : 'left-1')} />
    </button>
  );
}
