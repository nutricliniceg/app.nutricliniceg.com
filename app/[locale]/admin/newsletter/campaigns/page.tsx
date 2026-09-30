'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineNotification, Select, SelectItem, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextInput, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface Campaign {
  id: string;
  subject: string;
  locale: string;
  status: string;
  auto_generated: boolean | number;
  scheduled_at: string | null;
  sent_count: number;
  failed_count: number;
  click_count: number;
}

export default function NewsletterCampaignsPage() {
  const t = useTranslations('adminNewsletter');
  const [rows, setRows] = useState<Campaign[]>([]);
  const [status, setStatus] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const q = status ? `?status=${status}` : '';
      const d = await readApi<{ campaigns: Campaign[] }>(await fetch(`/api/admin/newsletter/campaigns${q}`));
      setRows(d.campaigns);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [status, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(): Promise<void> {
    if (!subject.trim() || !body.trim()) return;
    await readApi(await fetch('/api/admin/newsletter/campaigns', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: subject.trim(), body_html: `<p>${body.trim()}</p>`, body_text: body.trim(), locale: 'ar' }),
    }));
    setSubject('');
    setBody('');
    await load();
  }

  async function launch(id: string): Promise<void> {
    await readApi(await fetch(`/api/admin/newsletter/campaigns/${id}?op=launch`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
    await load();
  }

  async function cancel(id: string): Promise<void> {
    await readApi(await fetch(`/api/admin/newsletter/campaigns?id=${id}`, { method: 'DELETE' }));
    await load();
  }

  async function sendTest(id: string): Promise<void> {
    if (!testEmail.trim()) return;
    await readApi(await fetch(`/api/admin/newsletter/campaigns/${id}?op=test`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: testEmail.trim() }),
    }));
  }

  async function report(id: string): Promise<void> {
    const d = await readApi<{ sends: { sent: number; failed: number; queued: number } }>(
      await fetch(`/api/admin/newsletter/campaigns?view=report&id=${id}`, { method: 'PATCH' })
    );
    alert(`sent=${d.sends.sent} failed=${d.sends.failed} queued=${d.sends.queued}`);
  }

  return (
    <div>
      <h1>{t('campaignsTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Tile>
        <TextInput id="nc-subject" labelText={t('subject')} value={subject} onChange={(e) => setSubject(e.target.value)} />
        <TextInput id="nc-body" labelText={t('body')} value={body} onChange={(e) => setBody(e.target.value)} />
        <Button onClick={create}>{t('createCampaign')}</Button>
      </Tile>
      <Tile>
        <Select id="nc-status" labelText={t('filterStatus')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <SelectItem value="" text="—" />
          <SelectItem value="draft" text="draft" />
          <SelectItem value="scheduled" text="scheduled" />
          <SelectItem value="sending" text="sending" />
          <SelectItem value="sent" text="sent" />
          <SelectItem value="failed" text="failed" />
        </Select>
        <TextInput id="nc-test" labelText={t('testEmail')} value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
      </Tile>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('subject')}</TableHeader>
              <TableHeader>{t('locale')}</TableHeader>
              <TableHeader>{t('status')}</TableHeader>
              <TableHeader>{t('sent')}</TableHeader>
              <TableHeader>{t('clicks')}</TableHeader>
              <TableHeader>{t('actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{c.subject}{c.auto_generated ? ' 🤖' : ''}</TableCell>
                <TableCell>{c.locale}</TableCell>
                <TableCell>{c.status}</TableCell>
                <TableCell>{c.sent_count}/{c.failed_count}</TableCell>
                <TableCell>{c.click_count}</TableCell>
                <TableCell>
                  <Button size="sm" onClick={() => launch(c.id)}>{t('launch')}</Button>{' '}
                  <Button size="sm" kind="secondary" onClick={() => sendTest(c.id)}>{t('sendTest')}</Button>{' '}
                  <Button size="sm" kind="tertiary" onClick={() => report(c.id)}>{t('report')}</Button>{' '}
                  <Button size="sm" kind="danger" onClick={() => cancel(c.id)}>{t('cancel')}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
