'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineNotification, Select, SelectItem, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextInput } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface ErrRow {
  id: string;
  level: string;
  source: string;
  message: string;
  resolved_at: string | null;
  created_at: string;
}

export default function ErrorsPage() {
  const t = useTranslations('admin');
  const [rows, setRows] = useState<ErrRow[]>([]);
  const [total, setTotal] = useState(0);
  const [level, setLevel] = useState('');
  const [resolved, setResolved] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const q = new URLSearchParams();
      if (level) q.set('level', level);
      if (resolved) q.set('resolved', resolved);
      const d = await readApi<{ rows: ErrRow[]; total: number }>(await fetch(`/api/admin/errors?${q.toString()}`));
      setRows(d.rows);
      setTotal(d.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [level, resolved, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string): Promise<void> {
    await readApi(await fetch(`/api/admin/errors?id=${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note.trim() || null }),
    }));
    await load();
  }

  return (
    <div>
      <h1>{`${t('errorsTitle')} (${total})`}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Select id="err-level" labelText={t('level')} value={level} onChange={(e) => setLevel(e.target.value)}>
        <SelectItem value="" text={t('all')} />
        <SelectItem value="error" text="error" />
        <SelectItem value="warning" text="warning" />
        <SelectItem value="info" text="info" />
      </Select>
      <Select id="err-res" labelText={t('resolved')} value={resolved} onChange={(e) => setResolved(e.target.value)}>
        <SelectItem value="" text={t('all')} />
        <SelectItem value="true" text={t('yes')} />
        <SelectItem value="false" text={t('no')} />
      </Select>
      <TextInput id="err-note" labelText={t('resolveNote')} value={note} onChange={(e) => setNote(e.target.value)} />
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('level')}</TableHeader>
              <TableHeader>{t('source')}</TableHeader>
              <TableHeader>{t('message')}</TableHeader>
              <TableHeader>{t('actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.level}</TableCell>
                <TableCell>{r.source}</TableCell>
                <TableCell>{r.message.slice(0, 120)}</TableCell>
                <TableCell>
                  {!r.resolved_at && (
                    <Button kind="ghost" size="sm" onClick={() => void resolve(r.id)}>{t('resolve')}</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
