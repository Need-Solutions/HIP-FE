import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';

export function QuantityStepper({ value, min = 0, max, onChange, label, disabled }: { value: number; min?: number; max: number; onChange: (v: number) => void; label: string; disabled?: boolean }) {
  const btn = 'grid size-9 place-items-center rounded-lg border border-line bg-white text-ink transition hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest/40 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={disabled || value <= min} aria-label={`Fewer ${label}`}>
        <Minus size={16} />
      </button>
      <output aria-live="polite" className={cn('w-6 text-center text-[15px] font-bold', disabled && 'text-slate-mute')}>{value}</output>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={disabled || value >= max} aria-label={`More ${label}`}>
        <Plus size={16} />
      </button>
    </div>
  );
}
