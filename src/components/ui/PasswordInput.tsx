import { forwardRef, useState } from 'react';
import { Input, type InputProps } from './Input';

/** Password field with the Figma "Show" toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputProps, 'type' | 'trailing'>>(function PasswordInput(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <Input
      ref={ref}
      type={visible ? 'text' : 'password'}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="rounded-lg px-2.5 py-1.5 text-sm text-slate-mute hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40"
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      }
      {...props}
    />
  );
});
