import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { OverviewStats } from '@/api/endpoints';

/**
 * Admin / Overview → Weekly attendance: check-in instances and unique hikers per calendar week, drawn separately
 * (SRS 3.7.7). Colours come from Tailwind tokens through currentColor.
 */
export function WeeklyAttendanceChart({ weeks }: { weeks: OverviewStats['weekly'] }) {
  const summary = weeks.map((w) => `${w.week}: ${w.instances} check-ins, ${w.uniqueHikers} unique hikers`).join('; ');
  return (
    <div role="img" aria-label={`Weekly attendance. ${summary}`} className="h-[240px] text-slate-mute">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={weeks} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.3} />
          <XAxis dataKey="week" tickLine={false} axisLine={false} tick={{ fill: 'currentColor', fontSize: 11 }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'currentColor', fontSize: 11 }} />
          <Tooltip
            formatter={(value: number, key: string) => [value, key === 'instances' ? 'Attendance (check-ins)' : 'Unique hikers']}
            contentStyle={{ borderRadius: 10, fontSize: 12 }}
          />
          <Area type="monotone" dataKey="instances" className="text-forest" stroke="currentColor" fill="currentColor" fillOpacity={0.12} strokeWidth={2.5} isAnimationActive={false} />
          <Area type="monotone" dataKey="uniqueHikers" className="text-sun" stroke="currentColor" fill="currentColor" fillOpacity={0.1} strokeWidth={2} strokeDasharray="5 4" isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
