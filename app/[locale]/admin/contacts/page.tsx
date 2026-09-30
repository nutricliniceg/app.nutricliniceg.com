'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineNotification, Select, SelectItem, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextArea } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface Contact {
  id: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  status: string;
  reply_text: string | null;
}

export default function ContactsPage() {
  const t = useTranslations('admin');
  const [rows, setRows] = useState<Contact[]>([]);
  const [status, setStatus] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const q = status ? `?status=${status}` : '';
      const d = await readApi<{ messages: Contact[] }>(await fetch(`/api/admin/contacts${q}`));
      setRows(d.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(id: string, next: string): Promise<void> {
    await readApi(await fetch(`/api/admin/contacts?id=${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next, reply_text: reply.trim() || null }),
    }));
    await load();
  }

  return (
    <div>
      <h1>{t('contactsTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Select id="ct-status" labelText={t('status')} value={status} onChange={(e) => setStatus(e.target.value)}>
        <SelectItem value="" text={t('all')} />
        <SelectItem value="new" text="new" />
        <SelectItem value="read" text="read" />
        <SelectItem value="replied" text="replied" />
        <SelectItem value="archived" text="archived" />
      </Select>
      <TextArea id="ct-reply" labelText={t('replyText')} value={reply} onChange={(e) => setReply(e.target.value)} rows={2} />
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('name')}</TableHeader>
              <TableHeader>{t('email')}</TableHeader>
              <TableHeader>{t('message')}</TableHeader>
              <TableHeader>{t('status')}</TableHeader>
              <TableHeader>{t('actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.name}</TableCell>
                <TableCell>{c.email}</TableCell>
                <TableCell>{c.message.slice(0, 140)}</TableCell>
                <TableCell>{c.status}</TableCell>
                <TableCell>
                  <Button kind="ghost" size="sm" onClick={() => void updateStatus(c.id, 'read')}>{t('markRead')}</Button>
                  <Button kind="ghost" size="sm" onClick={() => void updateStatus(c.id, 'replied')}>{t('markReplied')}</Button>
                  <Button kind="ghost" size="sm" onClick={() => void updateStatus(c.id, 'archived')}>{t('archive')}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
