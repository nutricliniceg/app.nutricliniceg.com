'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// UI-13: recharts split out of the dashboard first-load bundle; loaded via
// next/dynamic by the page.
export default function WeeklyChart({
  data, visitsLabel, plansLabel,
}: {
  data: Array<{ day: string; visits: number; plans: number }>;
  visitsLabel: string;
  plansLabel: string;
}) {
  return (
    <div style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" allowDecimals={false} />
          <YAxis dataKey="day" type="category" width={60} />
          <Tooltip />
          <Legend />
          <Bar dataKey="visits" name={visitsLabel} fill="#008080" />
          <Bar dataKey="plans" name={plansLabel} fill="#005F73" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
