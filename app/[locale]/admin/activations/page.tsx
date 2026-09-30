'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, InlineNotification, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextInput } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface PendingRow {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export default function ActivationsPage() {
  const t = useTranslations('admin');
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const d = await readApi<{ users: PendingRow[]; total: number }>(await fetch('/api/admin/activations?limit=100'));
      setRows(d.users);
      setTotal(d.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  function ageInfo(created: string): { text: string; over: boolean } {
    const hours = (Date.now() - new Date(created).getTime()) / 3600000;
    return { text: `${Math.floor(hours)}h`, over: hours > 24 };
  }

  async function bulk(): Promise<void> {
    const ids = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
    if (ids.length === 0) return;
    await readApi(await fetch('/api/admin/activations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    }));
    setChecked({});
    await load();
  }

  async function reject(id: string): Promise<void> {
    await readApi(await fetch(`/api/admin/activations/${id}/reject`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reason.trim() || t('defaultReason') }),
    }));
    await load();
  }

  return (
    <div>
      <h1>{`${t('activationsTitle')} (${total})`}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <TextInput id="rej-reason" labelText={t('rejectReason')} value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button size="sm" onClick={() => void bulk()}>{t('bulkActivate')}</Button>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('select')}</TableHeader>
              <TableHeader>{t('name')}</TableHeader>
              <TableHeader>{t('email')}</TableHeader>
              <TableHeader>{t('age')}</TableHeader>
              <TableHeader>{t('actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((u) => {
              const age = ageInfo(u.created_at);
              return (
                <TableRow key={u.id} style={age.over ? { background: '#fef3c7' } : undefined}>
                  <TableCell>
                    <Checkbox id={`ck-${u.id}`} labelText="" checked={!!checked[u.id]} onChange={(_, { checked: c }) => setChecked((s) => ({ ...s, [u.id]: Boolean(c) }))} />
                  </TableCell>
                  <TableCell>{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{age.over ? `${age.text} (${t('over24h')})` : age.text}</TableCell>
                  <TableCell>
                    <Button kind="danger--ghost" size="sm" onClick={() => void reject(u.id)}>{t('reject')}</Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
