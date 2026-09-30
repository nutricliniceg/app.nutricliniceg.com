'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, InlineNotification, TextInput, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface Security {
  turnstile: { enabled: boolean; site_key: string | null; secret_set: boolean; secret_hint: string | null };
  password_policy: { minLength: number; requireUpper: boolean; requireDigit: boolean; requireSymbol: boolean; expiryDays: number };
}

export default function SecurityPage() {
  const t = useTranslations('adminAi');
  const [data, setData] = useState<Security | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [siteKey, setSiteKey] = useState('');
  const [secret, setSecret] = useState('');
  const [policy, setPolicy] = useState({ minLength: 8, requireUpper: false, requireDigit: false, requireSymbol: false, expiryDays: 0 });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const d = await readApi<Security>(await fetch('/api/admin/security'));
      setData(d);
      setEnabled(d.turnstile.enabled);
      setSiteKey(d.turnstile.site_key ?? '');
      setPolicy(d.password_policy);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveTurnstile(): Promise<void> {
    try {
      await readApi(await fetch('/api/admin/security?section=turnstile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, site_key: siteKey || null, secret_key: secret.trim() || undefined }),
      }));
      setSecret('');
      setNotice(t('saved'));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    }
  }

  async function savePolicy(): Promise<void> {
    try {
      await readApi(await fetch('/api/admin/security?section=password_policy', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(policy),
      }));
      setNotice(t('saved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    }
  }

  return (
    <div>
      <h1>{t('securityTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      {notice && <InlineNotification kind="success" title={notice} lowContrast />}
      <Tile>
        <h3>Turnstile</h3>
        <Checkbox id="ts-enabled" labelText={t('turnstileEnabled')} checked={enabled} onChange={(_, { checked }) => setEnabled(Boolean(checked))} />
        <TextInput id="ts-site" labelText={t('siteKey')} value={siteKey} onChange={(e) => setSiteKey(e.target.value)} />
        <TextInput id="ts-secret" labelText={`${t('secretKey')}${data?.turnstile.secret_hint ? ` (${data.turnstile.secret_hint})` : ''}`} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} />
        <Button size="sm" onClick={() => void saveTurnstile()}>{t('save')}</Button>
      </Tile>
      <Tile>
        <h3>{t('passwordPolicy')}</h3>
        <TextInput id="pp-min" labelText={t('minLength')} value={String(policy.minLength)} onChange={(e) => setPolicy((p) => ({ ...p, minLength: Number(e.target.value) || 8 }))} />
        <Checkbox id="pp-upper" labelText={t('requireUpper')} checked={policy.requireUpper} onChange={(_, { checked }) => setPolicy((p) => ({ ...p, requireUpper: Boolean(checked) }))} />
        <Checkbox id="pp-digit" labelText={t('requireDigit')} checked={policy.requireDigit} onChange={(_, { checked }) => setPolicy((p) => ({ ...p, requireDigit: Boolean(checked) }))} />
        <Checkbox id="pp-symbol" labelText={t('requireSymbol')} checked={policy.requireSymbol} onChange={(_, { checked }) => setPolicy((p) => ({ ...p, requireSymbol: Boolean(checked) }))} />
        <TextInput id="pp-expiry" labelText={t('expiryDays')} value={String(policy.expiryDays)} onChange={(e) => setPolicy((p) => ({ ...p, expiryDays: Number(e.target.value) || 0 }))} />
        <Button size="sm" onClick={() => void savePolicy()}>{t('save')}</Button>
      </Tile>
    </div>
  );
}
