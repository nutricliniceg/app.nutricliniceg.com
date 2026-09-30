'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// UI-13: longitudinal chart split out of the patient-detail bundle.
export default function LongitudinalChart({
  data, weightLabel, bodyFatLabel, muscleMassLabel,
}: {
  data: Array<{ date: string; weight: number | null; fat: number | null; muscle: number | null }>;
  weightLabel: string;
  bodyFatLabel: string;
  muscleMassLabel: string;
}) {
  return (
    <div style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="weight" name={weightLabel} stroke="#008080" dot={false} connectNulls />
          <Line type="monotone" dataKey="fat" name={bodyFatLabel} stroke="#005F73" dot={false} connectNulls />
          <Line type="monotone" dataKey="muscle" name={muscleMassLabel} stroke="#0A9396" dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
