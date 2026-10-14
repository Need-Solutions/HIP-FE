import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * A selectable card backed by a real radio input (keyboard arrows and screen readers work).
 * Group several with the same `name`.
 */
export function RadioCard({
  name,
  value,
  checked,
  onChange,
  disabled,
  title,
  description,
  aside,
  note,
}: {
  name: string;
  value: string;
  checked: boolean;
  onChange: (value: string) => void;
  disabled?: boolean;
  title: string;
  description?: string;
  /** Right-aligned content, e.g. a price. */
  aside?: ReactNode;
  /** Small status line under the description, e.g. "Sold out". */
  note?: ReactNode;
}) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 rounded-xl border p-4 transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-forest/40',
        checked ? 'border-forest bg-mint' : 'border-line bg-white',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-forest/60',
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="size-[18px] shrink-0 accent-forest focus:outline-none"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ink">{title}</span>
        {description && <span className="mt-0.5 block text-xs text-slate">{description}</span>}
        {note && <span className="mt-1 block text-xs font-semibold">{note}</span>}
      </span>
      {aside && <span className="shrink-0 text-right">{aside}</span>}
    </label>
  );
}
