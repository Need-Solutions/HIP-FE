import { useEffect, useState } from 'react';

const formatter = new Intl.NumberFormat('en-NG');

/** Counts on mount and when the total changes; assistive tech reads the final value. */
export function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setCount(value);
      return;
    }

    setCount(0);
    let frame: number;
    let startedAt: number | undefined;
    const animate = (timestamp: number) => {
      startedAt ??= timestamp;
      const elapsed = Math.min((timestamp - startedAt) / 2000, 1);
      setCount(Math.floor(value * (1 - Math.pow(1 - elapsed, 3))));
      if (elapsed < 1) frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);

    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  return (
    <span className="tabular-nums">
      <span className="sr-only">{formatter.format(value)}{suffix}</span>
      <span aria-hidden="true">{formatter.format(count)}{suffix}</span>
    </span>
  );
}
