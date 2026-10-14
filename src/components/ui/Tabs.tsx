import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

export interface TabOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/**
 * Pill tabs (Figma "Hiker / My tickets"). Follows the ARIA tabs pattern: arrow keys move between tabs and only
 * the selected tab is in the tab order. Give the panel id `${idPrefix}-panel` and aria-labelledby the tab id.
 */
export function Tabs<T extends string>({
  options,
  value,
  onChange,
  label,
  idPrefix,
  className,
}: {
  options: TabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  idPrefix: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? options.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const n = (next + options.length) % options.length;
    onChange(options[n].value);
    refs.current[n]?.focus();
  };

  return (
    <div role="tablist" aria-label={label} className={cn('flex gap-2.5 overflow-x-auto', className)}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => (refs.current[i] = el)}
            id={`${idPrefix}-tab-${o.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'h-10 shrink-0 whitespace-nowrap rounded-full border px-5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40',
              active ? 'border-forest bg-forest text-on-primary' : 'border-line bg-white text-ink hover:bg-canvas',
            )}
          >
            {o.label}
            {o.count !== undefined && ` (${o.count})`}
          </button>
        );
      })}
    </div>
  );
}
