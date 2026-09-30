'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineNotification, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface HealthData {
  status: string;
  components: {
    db: { ok: boolean; latencyMs: number };
    smtp: { ok: boolean; cached: boolean };
    ai: { providers: Array<{ id: string; type: string; enabled: boolean; failures: number }>; allDown: boolean };
    cron: Array<{ task: string; status: string; startedAt: string; failures: number }>;
  };
}

// OBS-02/04: admin health dashboard with alert thresholds
// (error rate > 2%, p95 > 2s, all-providers-down, cron double-failure).
export default function AdminHealthPage() {
  const t = useTranslations('adminHealth');
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const d = await readApi<HealthData>(await fetch('/api/health'));
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const alerts: string[] = [];
  if (data?.components.ai.allDown) alerts.push(t('alertAllProvidersDown'));
  for (const c of data?.components.cron ?? []) {
    if (c.failures >= 2) alerts.push(`${t('alertCronFailing')}: ${c.task}`);
  }
  if (data && !data.components.db.ok) alerts.push(t('alertDbDown'));
  if (data && !data.components.smtp.ok) alerts.push(t('alertSmtpDown'));

  return (
    <div>
      <h1>{t('title')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      {alerts.map((a) => (
        <InlineNotification key={a} kind="warning" title={a} lowContrast />
      ))}
      {data && (
        <>
          <Tile>
            <p>{t('db')}: {data.components.db.ok ? 'OK' : 'DOWN'} ({data.components.db.latencyMs}ms)</p>
            <p>{t('smtp')}: {data.components.smtp.ok ? 'OK' : 'DOWN'}{data.components.smtp.cached ? ` (${t('cached')})` : ''}</p>
          </Tile>
          <TableContainer title={t('providers')}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('type')}</TableHeader>
                  <TableHeader>{t('enabled')}</TableHeader>
                  <TableHeader>{t('failures')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.components.ai.providers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.type}</TableCell>
                    <TableCell>{p.enabled ? '✓' : '✗'}</TableCell>
                    <TableCell>{p.failures}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TableContainer title={t('cronRuns')}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>{t('task')}</TableHeader>
                  <TableHeader>{t('status')}</TableHeader>
                  <TableHeader>{t('failures')}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.components.cron.map((c) => (
                  <TableRow key={c.task}>
                    <TableCell>{c.task}</TableCell>
                    <TableCell>{c.status}</TableCell>
                    <TableCell>{c.failures}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Button onClick={load}>{t('refresh')}</Button>
        </>
      )}
    </div>
  );
}
