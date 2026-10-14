import { cn } from '@/lib/cn';

export interface ChipOption<T extends string> {
  value: T;
  label: string;
}

/** Single-select chip group (status filters). Uses radio semantics so the selection is announced. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-9 rounded-full border px-4 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40',
              active ? 'border-forest bg-forest text-on-primary' : 'border-line bg-white text-ink hover:bg-canvas',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
