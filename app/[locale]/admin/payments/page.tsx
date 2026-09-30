'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Select, SelectItem, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextInput } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface ReqRow {
  id: string;
  user_id: string;
  plan_id: string;
  method: string;
  reference: string;
  status: string;
  created_at: string;
}

export default function PaymentsPage() {
  const t = useTranslations('adminBilling');
  const [rows, setRows] = useState<ReqRow[]>([]);
  const [status, setStatus] = useState('pending');
  const [reason, setReason] = useState('');
  const [trialUser, setTrialUser] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const d = await readApi<{ requests: ReqRow[] }>(await fetch(`/api/admin/payments?status=${status}`));
      setRows(d.requests);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(id: string, action: 'approve' | 'reject'): Promise<void> {
    await readApi(await fetch(`/api/admin/payments/${id}/${action}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() || null }),
    }));
    await load();
  }

  async function grantTrial(): Promise<void> {
    if (!trialUser.trim()) return;
    await readApi(await fetch('/api/admin/payments/trial', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: trialUser.trim(), days: 14 }),
    }));
    setTrialUser('');
    await load();
  }

  return (
    <div>
      <h1>{t('paymentsTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Select id="pay-status" labelText={t('status')} value={status} onChange={(e) => setStatus(e.target.value)}>
        <SelectItem value="pending" text="pending" />
        <SelectItem value="approved" text="approved" />
        <SelectItem value="rejected" text="rejected" />
      </Select>
      <TextInput id="pay-reason" labelText={t('reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
      <TableContainer>
        {loading ? (
          <InlineLoading description={t('loading')} />
        ) : rows.length === 0 ? (
          <p>{t('noResults')}</p>
        ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('reference')}</TableHeader>
              <TableHeader>{t('method')}</TableHeader>
              <TableHeader>{t('status')}</TableHeader>
              <TableHeader>{t('actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.reference}</TableCell>
                <TableCell>{r.method}</TableCell>
                <TableCell>{r.status}</TableCell>
                <TableCell>
                  {r.status === 'pending' && (
                    <>
                      <Button kind="ghost" size="sm" onClick={() => void review(r.id, 'approve')}>{t('approve')}</Button>
                      <Button kind="danger--ghost" size="sm" onClick={() => void review(r.id, 'reject')}>{t('reject')}</Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </TableContainer>
      <TextInput id="trial-user" labelText={t('trialUser')} value={trialUser} onChange={(e) => setTrialUser(e.target.value)} />
      <Button size="sm" onClick={() => void grantTrial()}>{t('grantTrial')}</Button>
    </div>
  );
}
