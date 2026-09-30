'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Tag,
  InlineNotification,
  TextInput,
} from '@carbon/react';
import { Checkmark, Close } from '@carbon/icons-react';
import { useTranslations } from 'next-intl';

interface QueueItem {
  id: string;
  doctor_id: string;
  name_ar: string;
  name_en: string | null;
  calories_per_100g: number;
  protein_per_100g: number;
  carbs_per_100g: number;
  fats_per_100g: number;
  category: string | null;
  status: string;
  created_at: string;
}

import { readApi } from '@/lib/api/fetch-json';

// P11 admin section (interim — full admin shell arrives in P22).
// FL-16: approve converts the request to a GLOBAL item; reject needs a reason.
export default function AdminFoodRequestsClient() {
  const t = useTranslations('foodLists');
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const data = await readApi<{ requests: QueueItem[] }>(await fetch('/api/food-requests'));
      setQueue(data.requests.filter((r) => r.status === 'pending'));
      setError(null);
    } catch {
      setError(t('loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function review(id: string, decision: 'approve' | 'reject'): Promise<void> {
    setBusyId(id);
    setError(null);
    try {
      await readApi(
        await fetch(`/api/food-requests/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ decision, reason: reason || null }),
        })
      );
      setReason('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h1>{t('requestTitle')} — {t('pending')}</h1>
      {error && <InlineNotification kind="error" title={error} hideCloseButton lowContrast />}
      <TextInput
        id="review-reason"
        labelText={t('rejectedStatus')}
        placeholder={t('requestHelp')}
        value={reason}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
      />
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('nameAr')}</TableHeader>
              <TableHeader>{t('calories')}</TableHeader>
              <TableHeader>{t('category')}</TableHeader>
              <TableHeader>{t('status')}</TableHeader>
              <TableHeader>{t('save')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {queue.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  {r.name_ar}
                  {r.name_en ? ` — ${r.name_en}` : ''}
                </TableCell>
                <TableCell>
                  {r.calories_per_100g} {t('kcal')}
                </TableCell>
                <TableCell>{r.category ?? '—'}</TableCell>
                <TableCell>
                  <Tag type="blue">{t('pending')}</Tag>
                </TableCell>
                <TableCell>
                  <Button kind="ghost" size="sm" renderIcon={Checkmark} disabled={busyId === r.id} onClick={() => review(r.id, 'approve')} aria-label={t('approved')} />
                  <Button kind="ghost" size="sm" renderIcon={Close} disabled={busyId === r.id} onClick={() => review(r.id, 'reject')} aria-label={t('rejectedStatus')} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {queue.length === 0 && <p style={{ opacity: 0.7 }}>{t('noItems')}</p>}
    </div>
  );
}
