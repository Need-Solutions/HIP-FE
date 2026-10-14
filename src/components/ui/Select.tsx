import { forwardRef, type SelectHTMLAttributes, useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean;
  error?: string;
  icon?: LucideIcon;
}

/** Native select styled to match Input, so it works with keyboards, screen readers and phone pickers. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hideLabel, error, icon: Icon, className, id, children, ...props },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? props.name ?? autoId;
  const messageId = selectId ? `${selectId}-message` : undefined;
  return (
    <div className={className}>
      {label && <label htmlFor={selectId} className={cn('label', hideLabel && 'sr-only')}>{label}</label>}
      <div className="relative">
        {Icon && <Icon size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate" />}
        <select
          ref={ref}
          id={selectId}
          aria-invalid={!!error}
          aria-describedby={error && messageId ? messageId : undefined}
          className={cn(
            'h-11 w-full appearance-none rounded-xl border bg-white pr-10 text-[14px] text-ink focus:outline-none focus:ring-2',
            Icon ? 'pl-10' : 'pl-3.5',
            error ? 'border-danger focus:ring-danger/30' : 'border-line focus:border-forest focus:ring-forest/20',
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown size={16} aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-mute" />
      </div>
      {error && <p id={messageId} className="mt-1.5 text-xs text-danger">{error}</p>}
    </div>
  );
});
