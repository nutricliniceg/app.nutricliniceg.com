'use client';

import { useCallback, useEffect, useState } from 'react';
import { InlineLoading, InlineNotification, Select, SelectItem, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface Row {
  id: string;
  provider_type: string;
  doctor_name: string | null;
  total_tokens: number;
  estimated_cost: number;
  success: boolean | number;
  request_type: string;
  created_at: string;
}

export default function UsagePage() {
  const t = useTranslations('adminAi');
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (success) q.set('success', success);
      const d = await readApi<{ rows: Row[]; total: number }>(await fetch(`/api/admin/ai-usage?${q.toString()}`));
      setRows(d.rows);
      setTotal(d.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [success, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1>{`${t('usageTitle')} (${total})`}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Select id="ux-success" labelText={t('success')} value={success} onChange={(e) => setSuccess(e.target.value)}>
        <SelectItem value="" text={t('all')} />
        <SelectItem value="true" text={t('yes')} />
        <SelectItem value="false" text={t('no')} />
      </Select>
      <TableContainer>
        {loading ? (
          <InlineLoading description={t('loading')} />
        ) : rows.length === 0 ? (
          <p>{t('noResults')}</p>
        ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('provider')}</TableHeader>
              <TableHeader>{t('doctor')}</TableHeader>
              <TableHeader>{t('tokens')}</TableHeader>
              <TableHeader>{t('costUsd')}</TableHeader>
              <TableHeader>{t('type')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.provider_type}</TableCell>
                <TableCell>{r.doctor_name ?? '—'}</TableCell>
                <TableCell>{r.total_tokens}</TableCell>
                <TableCell>{`$${r.estimated_cost}`}</TableCell>
                <TableCell>{r.request_type}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </TableContainer>
    </div>
  );
}
