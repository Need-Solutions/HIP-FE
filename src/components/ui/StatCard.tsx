import { Card } from './Card';
import { Badge } from './Badge';

/** Metric tile. `compact` is the small grey tile used for facts like distance or capacity. */
/** `up` sets the arrow; `good` sets the colour when they differ (e.g. a falling no-show rate is ▼ but good). */
export function StatCard({ label, value, delta, up = true, good, sub, compact = false }: { label: string; value: string; delta?: string; up?: boolean; good?: boolean; sub?: string; compact?: boolean }) {
  if (compact) {
    return (
      <div className="rounded-xl border border-line bg-canvas p-4">
        <p className="text-[13px] text-slate">{label}</p>
        <p className="mt-1 text-xl font-bold text-ink">{value}</p>
      </div>
    );
  }
  return (
    <Card className="p-5">
      <p className="text-[13px] font-medium text-slate">{label}</p>
      <p className="mt-2 text-3xl font-bold text-ink">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        {delta && <Badge tone={(good ?? up) ? 'green' : 'red'}>{up ? '▲' : '▼'} {delta}</Badge>}
        {sub && <span className="text-xs text-slate-mute">{sub}</span>}
      </div>
    </Card>
  );
}
