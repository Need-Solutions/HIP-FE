import { forwardRef, type TextareaHTMLAttributes, useId } from 'react';
import { cn } from '@/lib/cn';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

/** Multi-line field styled like Input. Works with react-hook-form's register(). */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, hint, error, className, id, ...props }, ref) {
  const autoId = useId();
  const inputId = id ?? props.name ?? autoId;
  const messageId = inputId ? `${inputId}-message` : undefined;
  return (
    <div className={className}>
      {label && <label htmlFor={inputId} className="label">{label}</label>}
      <textarea
        ref={ref}
        id={inputId}
        rows={3}
        aria-invalid={!!error}
        aria-describedby={(error || hint) && messageId ? messageId : undefined}
        className={cn(
          'w-full rounded-xl border bg-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-slate-mute focus:outline-none focus:ring-2',
          error ? 'border-danger focus:ring-danger/30' : 'border-line focus:border-forest focus:ring-forest/20',
        )}
        {...props}
      />
      {error ? <p id={messageId} className="mt-1.5 text-xs text-danger">{error}</p> : hint ? <p id={messageId} className="mt-1.5 text-xs text-slate">{hint}</p> : null}
    </div>
  );
});
