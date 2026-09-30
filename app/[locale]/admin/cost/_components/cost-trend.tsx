'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// UI-13: recharts split out of the admin cost first-load bundle.
export default function CostTrend({ data }: { data: Array<{ day: string; calls: number; cost: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="day" />
        <YAxis />
        <Tooltip />
        <Line type="monotone" dataKey="cost" stroke="#008080" dot={false} />
        <Line type="monotone" dataKey="calls" stroke="#005F73" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
