import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AdDay } from '@/api/endpoints';
import { formatDate } from '@/lib/format';

// Admin / Ad performance: daily impressions and daily clicks. Figma draws both on one axis with clicks ×10; here
// they're two small charts on the same days instead, so neither scale is distorted (no dual or rescaled axes). Each
// chart has one series and a heading, and the same numbers are in the table view and the CSV.

const tick = { fill: 'currentColor', fontSize: 11 };
const tooltipStyle = { borderRadius: 10, fontSize: 12 };
const dayLabel = (d: string) => formatDate(`${d}T12:00:00Z`, { day: 'numeric', month: 'short' });

function DailyArea({ data, dataKey, name, tone, dashed }: { data: AdDay[]; dataKey: 'impressions' | 'clicks'; name: string; tone: string; dashed?: boolean }) {
  return (
    <div role="img" aria-label={`${name} per day: ${data.map((d) => `${dayLabel(d.date)} ${d[dataKey]}`).join(', ')}`} className="h-[170px] text-slate-mute">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.3} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} tick={tick} tickFormatter={dayLabel} minTickGap={24} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={tick} width={48} tickFormatter={(v: number) => v.toLocaleString('en-NG')} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={dayLabel} formatter={(v: number) => [v.toLocaleString('en-NG'), name]} />
          <Area type="monotone" dataKey={dataKey} className={tone} stroke="currentColor" fill="currentColor" fillOpacity={0.12} strokeWidth={2} strokeDasharray={dashed ? '5 4' : undefined} activeDot={{ r: 4 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AdDailyCharts({ daily }: { daily: AdDay[] }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink"><span aria-hidden className="h-0.5 w-4 rounded bg-forest" /> Impressions</h3>
        <DailyArea data={daily} dataKey="impressions" name="Impressions" tone="text-forest" />
      </div>
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink"><span aria-hidden className="w-4 border-t-2 border-dashed border-sun" /> Clicks</h3>
        <DailyArea data={daily} dataKey="clicks" name="Clicks" tone="text-sun" dashed />
      </div>
    </div>
  );
}
