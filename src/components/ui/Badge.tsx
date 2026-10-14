import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'green' | 'orange' | 'red' | 'amber' | 'blue' | 'gray' | 'dark';

const tones: Record<BadgeTone, string> = {
  green: 'bg-mint text-forest',
  orange: 'bg-sun-light text-sun-dark',
  red: 'bg-danger-light text-danger',
  amber: 'bg-warn-light text-warn',
  blue: 'bg-info-light text-info',
  gray: 'bg-chip text-slate',
  dark: 'bg-pine text-white',
};

export function Badge({ tone = 'green', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', tones[tone], className)}>
      {children}
    </span>
  );
}
