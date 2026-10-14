import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalyticsBucket } from '@/api/endpoints';

// Charts for Admin / Analytics. Colours come from Tailwind tokens via currentColor (forest = instances / returning,
// sun = unique / first-time). Identity never relies on colour alone: unique hikers are a dashed line, every chart
// has a legend or direct labels on the page, and the numbers are also in the page's table view and CSV export.

const tick = { fill: 'currentColor', fontSize: 11 };
const tooltipStyle = { borderRadius: 10, fontSize: 12 };

/** Instances vs unique hikers per week or month. */
export function TrendChart({ buckets }: { buckets: AnalyticsBucket[] }) {
  const summary = buckets.map((b) => `${b.label}${b.partial ? ' (to date)' : ''}: ${b.instances} check-ins, ${b.uniqueHikers} unique hikers`).join('; ');
  return (
    <div role="img" aria-label={summary} className="h-[250px] text-slate-mute">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.3} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={tick} tickFormatter={(v: string) => v.replace(/ \d{4}$/, '')} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={tick} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(label: string, items) => `${label}${items?.[0]?.payload?.partial ? ' (to date)' : ''}`}
            formatter={(value: number, key: string) => [value, key === 'instances' ? 'Attendance instances' : 'Unique hikers']}
          />
          <Area type="monotone" dataKey="instances" className="text-forest" stroke="currentColor" fill="currentColor" fillOpacity={0.12} strokeWidth={2.5} isAnimationActive={false} />
          <Area type="monotone" dataKey="uniqueHikers" className="text-sun" stroke="currentColor" fill="currentColor" fillOpacity={0.08} strokeWidth={2} strokeDasharray="5 4" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** First-time vs returning among unique hikers, with the total in the middle. */
export function NewVsReturningDonut({ firstTime, returning }: { firstTime: number; returning: number }) {
  const total = firstTime + returning;
  const data = [
    { name: 'Returning', value: returning, tone: 'text-forest' },
    { name: 'First-time', value: firstTime, tone: 'text-sun' },
  ];
  return (
    <div role="img" aria-label={`${total} unique hikers: ${returning} returning, ${firstTime} first-time`} className="relative mx-auto h-[190px] w-[190px]">
      {total > 0 ? (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [value, name]} />
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={total > 0 && firstTime > 0 && returning > 0 ? 2 : 0} stroke="none" isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.name} className={d.tone} fill="currentColor" aria-label={`${d.name}: ${d.value}`} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      ) : (
        <div className="absolute inset-[14px] rounded-full border-[26px] border-line" />
      )}
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-[30px] font-extrabold leading-none text-ink">{total || '—'}</p>
          <p className="mt-1 text-xs text-slate">unique</p>
        </div>
      </div>
    </div>
  );
}

/** Check-ins per bucket; the last two are compared above the chart. Buckets still in progress are paler. */
export function ComparisonBars({ buckets }: { buckets: AnalyticsBucket[] }) {
  const summary = buckets.map((b) => `${b.label}${b.partial ? ' (to date)' : ''}: ${b.instances}`).join('; ');
  return (
    <div role="img" aria-label={`Check-ins per period: ${summary}`} className="h-[210px] text-slate-mute">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.3} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={tick} tickFormatter={(v: string) => v.replace(/ \d{4}$/, '')} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={tick} />
          <Tooltip
            cursor={{ fill: 'currentColor', fillOpacity: 0.08 }}
            contentStyle={tooltipStyle}
            labelFormatter={(label: string, items) => `${label}${items?.[0]?.payload?.partial ? ' (to date)' : ''}`}
            formatter={(value: number) => [value, 'Attendance instances']}
          />
          <Bar dataKey="instances" radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false}>
            {buckets.map((b) => (
              <Cell key={b.label} className="text-forest" fill="currentColor" fillOpacity={b.partial ? 0.5 : 1} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Check-ins per month for one hiker (Admin / Hiker profile "Attendance by month"). */
export function MonthlyBars({ data }: { data: { label: string; count: number }[] }) {
  return (
    <div role="img" aria-label={`Check-ins per month: ${data.map((d) => `${d.label} ${d.count}`).join(', ')}`} className="h-[200px] text-slate-mute">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.3} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={tick} />
          <YAxis allowDecimals={false} domain={[0, (max: number) => Math.max(3, max)]} tickLine={false} axisLine={false} tick={tick} />
          <Tooltip cursor={{ fill: 'currentColor', fillOpacity: 0.08 }} contentStyle={tooltipStyle} formatter={(v: number) => [v, 'Check-ins']} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={32} className="text-forest" fill="currentColor" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
