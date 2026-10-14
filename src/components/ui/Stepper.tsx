import { Fragment } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Numbered progress steps (checkout). Steps before `current` show a tick; `current` can equal `steps.length`
 * when everything is done. On phones only the current step's label is shown.
 */
export function Stepper({ steps, current, label, className }: { steps: string[]; current: number; label: string; className?: string }) {
  return (
    <ol aria-label={label} className={cn('flex items-center gap-2 sm:gap-3', className)}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <Fragment key={step}>
            {i > 0 && <li aria-hidden className={cn('h-0.5 min-w-4 flex-1 sm:max-w-20', i <= current ? 'bg-forest' : 'bg-line')} />}
            <li aria-current={active ? 'step' : undefined} className="flex shrink-0 items-center gap-2">
              <span
                className={cn(
                  'grid size-8 place-items-center rounded-full text-[13px] font-bold',
                  done || active ? 'bg-forest text-on-primary' : 'border border-line bg-white text-slate-mute',
                )}
              >
                {done ? <Check size={16} aria-hidden /> : i + 1}
              </span>
              <span className={cn('text-sm', active ? 'font-bold text-ink' : done ? 'hidden text-ink sm:inline' : 'hidden text-slate-mute sm:inline')}>
                {step}
                {done && <span className="sr-only"> (done)</span>}
              </span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
