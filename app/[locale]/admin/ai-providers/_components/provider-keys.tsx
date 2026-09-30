'use client';

import { useState } from 'react';
import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextInput } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

export interface KeyInfo {
  id: string;
  name: string | null;
  key_hint: string;
  is_active: boolean | number;
  last_used_at: string | null;
  last_rotated_at: string | null;
  stats: { calls: number; cost: number; last_used: string | null };
}

export default function ProviderKeys({ providerId, keys, onChanged }: { providerId: string; keys: KeyInfo[]; onChanged: () => void }) {
  const t = useTranslations('adminAi');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function addKey(): Promise<void> {
    const key = value.trim();
    if (!key) return;
    try {
      await readApi(await fetch(`/api/admin/ai-providers/${providerId}/keys`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }),
      }));
      setValue('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    }
  }

  async function rotateKey(keyId: string): Promise<void> {
    const key = value.trim();
    if (!key) return;
    await readApi(await fetch(`/api/admin/ai-keys/${keyId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }),
    }));
    setValue('');
    onChanged();
  }

  return (
    <div>
      {error && <p>{error}</p>}
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('keyHint')}</TableHeader>
              <TableHeader>{t('usage')}</TableHeader>
              <TableHeader>{t('actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {keys.map((k) => (
              <TableRow key={k.id}>
                <TableCell>{k.key_hint}</TableCell>
                <TableCell>{`${k.stats.calls} / $${k.stats.cost}`}</TableCell>
                <TableCell>
                  <Button kind="ghost" size="sm" onClick={() => void rotateKey(k.id)}>{t('rotate')}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TextInput id={`nk-${providerId}`} labelText={t('newKey')} type="password" value={value} onChange={(e) => setValue(e.target.value)} />
      <Button size="sm" onClick={() => void addKey()}>{t('addKey')}</Button>
    </div>
  );
}
