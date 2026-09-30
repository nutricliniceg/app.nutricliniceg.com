'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Button, InlineLoading, InlineNotification, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

// UI-13: cost trend chart loads on demand, not with the admin first-load bundle.
const CostTrend = dynamic(() => import('./_components/cost-trend'), {
  loading: () => <InlineLoading description="" />,
});

interface Dashboard {
  totals: { calls: number; tokens: number; cost: number; cost_egp: number | null; usd_to_egp: number | null };
  byDoctor: Array<{ doctor_id: string | null; doctor_name: string; calls: number; tokens: number; cost: number }>;
  byProvider: Array<{ provider_id: string; provider_type: string; calls: number; success_rate: number; cost: number }>;
  trend: Array<{ day: string; calls: number; cost: number }>;
}

export default function CostPage() {
  const t = useTranslations('adminAi');
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const d = await readApi<Dashboard>(await fetch('/api/admin/ai-cost'));
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <p>{t('loading')}</p>;
  return (
    <div>
      <h1>{t('costTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Tile>{`${t('totalCalls')}: ${data.totals.calls}`}</Tile>
      <Tile>{`${t('totalTokens')}: ${data.totals.tokens}`}</Tile>
      <Tile>{`${t('totalCostUsd')}: $${data.totals.cost}`}</Tile>
      <Tile>{`${t('totalCostEgp')}: ${data.totals.cost_egp === null ? '—' : `${data.totals.cost_egp} EGP`}`}</Tile>
      <h2>{t('trend')}</h2>
      <CostTrend data={data.trend} />
      <h2>{t('topDoctors')}</h2>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('doctor')}</TableHeader>
              <TableHeader>{t('calls')}</TableHeader>
              <TableHeader>{t('costUsd')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.byDoctor.map((d) => (
              <TableRow key={d.doctor_id ?? 'none'}>
                <TableCell>{d.doctor_name}</TableCell>
                <TableCell>{d.calls}</TableCell>
                <TableCell>{`$${d.cost}`}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <h2>{t('byProvider')}</h2>
      {data.byProvider.map((p) => (
        <Tile key={p.provider_id}>{`${p.provider_type}: ${p.calls} · ${p.success_rate}% · $${p.cost}`}</Tile>
      ))}
      <Button kind="ghost" size="sm" onClick={() => window.open('/api/admin/ai-cost?format=csv', '_blank')}>{t('exportCsv')}</Button>
    </div>
  );
}
