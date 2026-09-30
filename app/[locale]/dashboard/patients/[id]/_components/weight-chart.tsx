'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// UI-13: weight chart split out of the patient-detail bundle.
export default function WeightChart({
  data, weightLabel,
}: {
  data: Array<{ visit_date: string; weight_kg: number | null }>;
  weightLabel: string;
}) {
  return (
    <div style={{ height: '300px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" />
          <YAxis dataKey="visit_date" type="category" width={100} />
          <Tooltip />
          <Bar dataKey="weight_kg" name={weightLabel} fill="#008080" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
