'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineNotification, Select, SelectItem, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextInput, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface Sub {
  id: string;
  email: string;
  name: string | null;
  locale: string;
  status: string;
  created_at: string;
}

interface Stats {
  byStatus: Array<{ status: string; count: number }>;
  byLocale: Array<{ locale: string; count: number }>;
  growth: Array<{ month: string; count: number }>;
}

export default function NewsletterSubscribersPage() {
  const t = useTranslations('adminNewsletter');
  const [rows, setRows] = useState<Sub[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const q = status ? `?status=${status}` : '';
      const d = await readApi<{ subscribers: Sub[]; total: number }>(await fetch(`/api/admin/newsletter/subscribers${q}`));
      setRows(d.subscribers);
      setTotal(d.total);
      const s = await readApi<Stats>(await fetch('/api/admin/newsletter/subscribers?view=stats'));
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(): Promise<void> {
    if (!email.trim()) return;
    await readApi(await fetch('/api/admin/newsletter/subscribers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim() }),
    }));
    setEmail('');
    await load();
  }

  async function remove(id: string): Promise<void> {
    await readApi(await fetch(`/api/admin/newsletter/subscribers?id=${id}`, { method: 'DELETE' }));
    await load();
  }

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const d = await readApi<{ imported: number; skipped: number }>(await fetch('/api/admin/newsletter/subscribers', {
      method: 'PUT', headers: { 'Content-Type': 'text/csv' }, body: text,
    }));
    setError(`${t('imported')}: ${d.imported}, ${t('skipped')}: ${d.skipped}`);
    await load();
  }

  return (
    <div>
      <h1>{`${t('title')} (${total})`}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      {stats && (
        <Tile>
          <p>{stats.byStatus.map((s) => `${s.status}: ${s.count}`).join(' · ')}</p>
          <p>{stats.byLocale.map((s) => `${s.locale}: ${s.count}`).join(' · ')}</p>
        </Tile>
      )}
      <Select id="sub-status" labelText={t('status')} value={status} onChange={(e) => setStatus(e.target.value)}>
        <SelectItem value="" text={t('all')} />
        <SelectItem value="pending" text="pending" />
        <SelectItem value="confirmed" text="confirmed" />
        <SelectItem value="unsubscribed" text="unsubscribed" />
        <SelectItem value="bounced" text="bounced" />
      </Select>
      <TextInput id="sub-email" labelText={t('addEmail')} value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button size="sm" onClick={() => void add()}>{t('add')}</Button>
      <input aria-label={t('importCsv')} type="file" accept=".csv,text/csv" onChange={(e) => void importCsv(e)} />
      <Button kind="ghost" size="sm" onClick={() => window.open('/api/admin/newsletter/subscribers?format=csv', '_blank')}>{t('exportCsv')}</Button>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('email')}</TableHeader>
              <TableHeader>{t('status')}</TableHeader>
              <TableHeader>{t('actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.email}</TableCell>
                <TableCell>{s.status}</TableCell>
                <TableCell>
                  <Button kind="danger--ghost" size="sm" onClick={() => void remove(s.id)}>{t('delete')}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
