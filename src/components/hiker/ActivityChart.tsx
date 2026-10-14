import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';

/**
 * "Your activity" on the dashboard: check-ins per month. Colours come from Tailwind tokens through
 * currentColor, so the chart has no hard-coded hex values.
 */
export function ActivityChart({ data }: { data: { key: string; label: string; count: number }[] }) {
  const max = Math.max(3, ...data.map((d) => d.count));
  const summary = data.map((d) => `${d.label} ${d.count}`).join(', ');
  return (
    <div role="img" aria-label={`Check-ins per month: ${summary}`} className="h-[220px] text-slate-mute">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -24 }}>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.35} className="text-line" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'currentColor', fontSize: 11 }} />
          <YAxis allowDecimals={false} domain={[0, max]} tickLine={false} axisLine={false} tick={{ fill: 'currentColor', fontSize: 11 }} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={28} className="text-forest" fill="currentColor" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
