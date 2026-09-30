'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, InlineNotification, Select, SelectItem, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextArea, TextInput } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface Sent {
  id: string;
  sender_alias: string;
  recipient_type: string;
  subject: string;
  sent_count: number;
  failed_count: number;
}

export default function BulkEmailPage() {
  const t = useTranslations('admin');
  const [rows, setRows] = useState<Sent[]>([]);
  const [alias, setAlias] = useState('info');
  const [audience, setAudience] = useState('doctors');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [viaEmail, setViaEmail] = useState(true);
  const [viaInApp, setViaInApp] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const d = await readApi<{ messages: Sent[] }>(await fetch('/api/admin/bulk-email'));
      setRows(d.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(): Promise<void> {
    setError(null);
    try {
      const d = await readApi<{ sent: number; failed: number }>(await fetch('/api/admin/bulk-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, audience, subject: subject.trim(), body: body.trim(), via_email: viaEmail, via_in_app: viaInApp }),
      }));
      setNotice(t('bulkResult', { sent: d.sent, failed: d.failed }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('sendFailed'));
    }
  }

  async function retry(id: string): Promise<void> {
    await readApi(await fetch(`/api/admin/bulk-email/${id}/retry`, { method: 'POST' }));
    await load();
  }

  return (
    <div>
      <h1>{t('bulkEmailTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      {notice && <InlineNotification kind="success" title={notice} lowContrast />}
      <Select id="be-alias" labelText={t('alias')} value={alias} onChange={(e) => setAlias(e.target.value)}>
        <SelectItem value="no-reply" text="no-reply" />
        <SelectItem value="info" text="info" />
        <SelectItem value="admin" text="admin" />
      </Select>
      <Select id="be-aud" labelText={t('audience')} value={audience} onChange={(e) => setAudience(e.target.value)}>
        <SelectItem value="doctors" text={t('audDoctors')} />
        <SelectItem value="admins" text={t('audAdmins')} />
        <SelectItem value="all" text={t('audAll')} />
      </Select>
      <TextInput id="be-subject" labelText={t('subject')} value={subject} onChange={(e) => setSubject(e.target.value)} />
      <TextArea id="be-body" labelText={t('body')} value={body} onChange={(e) => setBody(e.target.value)} rows={5} />
      <Checkbox id="be-email" labelText={t('viaEmail')} checked={viaEmail} onChange={(_, { checked }) => setViaEmail(Boolean(checked))} />
      <Checkbox id="be-inapp" labelText={t('viaInApp')} checked={viaInApp} onChange={(_, { checked }) => setViaInApp(Boolean(checked))} />
      <Button size="sm" onClick={() => void send()}>{t('send')}</Button>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('subject')}</TableHeader>
              <TableHeader>{t('audience')}</TableHeader>
              <TableHeader>{t('sentFailed')}</TableHeader>
              <TableHeader>{t('actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.subject}</TableCell>
                <TableCell>{m.recipient_type}</TableCell>
                <TableCell>{`${m.sent_count}/${m.failed_count}`}</TableCell>
                <TableCell>
                  {m.failed_count > 0 && (
                    <Button kind="ghost" size="sm" onClick={() => void retry(m.id)}>{t('retry')}</Button>
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
