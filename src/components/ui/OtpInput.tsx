import { useRef, type ClipboardEvent, type KeyboardEvent } from 'react';
import { cn } from '@/lib/cn';

/**
 * One box per digit (Figma "Auth / Verify OTP"). Typing moves forward, Backspace moves back, and pasting a
 * whole code fills every box. The first box opts in to the phone's one-time-code autofill.
 */
export function OtpInput({
  value,
  onChange,
  length = 6,
  label,
  error,
  disabled,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  label: string;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');
  const focus = (i: number) => refs.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  const setDigit = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join('').slice(0, length));
  };

  const onKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i]) {
      e.preventDefault();
      setDigit(i - 1, '');
      focus(i - 1);
    } else if (e.key === 'ArrowLeft') focus(i - 1);
    else if (e.key === 'ArrowRight') focus(i + 1);
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    focus(pasted.length);
  };

  return (
    <div>
      <div role="group" aria-label={label} className="flex gap-2 sm:gap-2.5">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => (refs.current[i] = el)}
            value={d}
            disabled={disabled}
            autoFocus={autoFocus && i === 0}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={i === 0 ? length : 1}
            aria-label={`Digit ${i + 1} of ${length}`}
            aria-invalid={!!error}
            onPaste={onPaste}
            onKeyDown={(e) => onKeyDown(i, e)}
            onChange={(e) => {
              const typed = e.target.value.replace(/\D/g, '');
              if (typed.length > 1) {
                // Autofill or fast typing into the first box: spread the digits out.
                onChange(typed.slice(0, length));
                focus(typed.length);
                return;
              }
              setDigit(i, typed);
              if (typed) focus(i + 1);
            }}
            className={cn(
              'h-14 w-full min-w-0 max-w-[52px] rounded-xl border bg-white text-center text-2xl font-bold text-ink focus:outline-none focus:ring-2 disabled:opacity-50',
              error ? 'border-danger focus:ring-danger/30' : 'border-line focus:border-forest focus:ring-forest/20',
            )}
          />
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
