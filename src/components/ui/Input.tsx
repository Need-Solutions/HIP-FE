import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Decorative icon shown inside the field on the left. */
  icon?: LucideIcon;
  /** Grey fill instead of white, for search boxes inside a white card. */
  filled?: boolean;
  /** Control shown inside the field on the right, e.g. a Show/Hide button. */
  trailing?: ReactNode;
  /** Red styling without a message of its own (e.g. when a form-level error covers several fields). */
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, icon: Icon, filled, trailing, invalid, className, id, ...props }, ref) {
  const autoId = useId();
  const inputId = id ?? props.name ?? autoId;
  const messageId = inputId ? `${inputId}-message` : undefined;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="label">{label}</label>}
      <div className="relative">
        {Icon && <Icon size={18} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-mute" />}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error || invalid}
          aria-describedby={(error || hint) && messageId ? messageId : undefined}
          className={cn(
            'h-11 w-full rounded-xl border px-3.5 text-[14px] text-ink placeholder:text-slate-mute focus:outline-none focus:ring-2',
            filled ? 'bg-canvas' : 'bg-white',
            Icon && 'pl-10',
            trailing && 'pr-16',
            error || invalid ? 'border-danger focus:ring-danger/30' : 'border-line focus:border-forest focus:ring-forest/20',
          )}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>}
      </div>
      {error ? <p id={messageId} className="mt-1.5 text-xs text-danger">{error}</p> : hint ? <p id={messageId} className="mt-1.5 text-xs text-slate">{hint}</p> : null}
    </div>
  );
});
