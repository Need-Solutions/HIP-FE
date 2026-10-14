import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Lays its child out at a fixed `width` (a real desktop or phone width) and scales it down to fit the space it has,
 * for live previews of public pages inside admin screens. Never scales up. The preview is hidden from assistive
 * tech by default because it repeats content the form already holds.
 */
export function ScaleToFit({ width, children, className, label }: { width: number; children: ReactNode; className?: string; label?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const measure = () => {
      if (!outer.current || !inner.current) return;
      const s = Math.min(1, outer.current.clientWidth / width);
      setScale(s);
      setHeight(inner.current.offsetHeight * s);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={outer} className={cn('relative overflow-hidden', className)} style={{ height }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <div ref={inner} style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }} className="pointer-events-none select-none">
        {children}
      </div>
    </div>
  );
}
