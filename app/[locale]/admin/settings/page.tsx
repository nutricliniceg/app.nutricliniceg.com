'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextArea, TextInput } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface Setting {
  key: string;
  is_sensitive: boolean;
  hidden: boolean;
}

export default function SettingsPage() {
  const t = useTranslations('admin');
  const [rows, setRows] = useState<Setting[]>([]);
  const [aliases, setAliases] = useState<string[]>([]);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [testTo, setTestTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const d = await readApi<{ settings: Setting[]; sender_aliases: string[] }>(await fetch('/api/admin/settings'));
      setRows(d.settings);
      setAliases(d.sender_aliases);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(): Promise<void> {
    try {
      let parsed: unknown = value;
      try {
        parsed = JSON.parse(value) as unknown;
      } catch {
        parsed = value;
      }
      await readApi(await fetch(`/api/admin/settings?key=${encodeURIComponent(key.trim())}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: parsed }),
      }));
      setNotice(t('saved'));
      setKey('');
      setValue('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    }
  }

  async function testEmail(): Promise<void> {
    try {
      await readApi(await fetch('/api/admin/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: testTo.trim() }),
      }));
      setNotice(t('testSent'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('testFailed'));
    }
  }

  return (
    <div>
      <h1>{t('settingsTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      {notice && <InlineNotification kind="success" title={notice} lowContrast />}
      <p>{`${t('senderAliases')}: ${aliases.join(', ')}`}</p>
      <TableContainer>
        {loading ? (
          <InlineLoading description={t('loading')} />
        ) : rows.length === 0 ? (
          <p>{t('noResults')}</p>
        ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('key')}</TableHeader>
              <TableHeader>{t('sensitive')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell>{r.key}</TableCell>
                <TableCell>{r.is_sensitive ? t('yes') : t('no')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        )}
      </TableContainer>
      <TextInput id="set-key" labelText={t('key')} value={key} onChange={(e) => setKey(e.target.value)} />
      <TextArea id="set-value" labelText={t('valueJson')} value={value} onChange={(e) => setValue(e.target.value)} rows={3} />
      <Button size="sm" onClick={() => void save()}>{t('save')}</Button>
      <TextInput id="test-to" labelText={t('testEmailTo')} value={testTo} onChange={(e) => setTestTo(e.target.value)} />
      <Button size="sm" kind="secondary" onClick={() => void testEmail()}>{t('sendTestEmail')}</Button>
    </div>
  );
}
