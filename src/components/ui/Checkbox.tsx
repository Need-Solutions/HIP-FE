import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  error?: string;
}

/** Native checkbox with a clickable label and an error line. Works with react-hook-form's register(). */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox({ label, error, id, className, ...props }, ref) {
  const inputId = id ?? props.name;
  const messageId = inputId ? `${inputId}-message` : undefined;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3 text-sm text-ink">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          aria-invalid={!!error}
          aria-describedby={error && messageId ? messageId : undefined}
          className="mt-0.5 size-[18px] shrink-0 cursor-pointer rounded accent-forest focus:outline-none focus-visible:ring-2 focus-visible:ring-forest/40"
          {...props}
        />
        <span>{label}</span>
      </label>
      {error && <p id={messageId} className="ml-[30px] mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
});
