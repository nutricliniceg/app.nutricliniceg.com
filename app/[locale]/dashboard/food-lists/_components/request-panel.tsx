'use client';

import { useEffect, useState } from 'react';
import { Button, Tile, TextInput, Select, SelectItem, Tag, InlineNotification } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { CATEGORY_OPTIONS, readApi, type FoodRequestDto } from './types';

function statusType(s: string): 'green' | 'red' | 'blue' {
  if (s === 'approved') return 'green';
  if (s === 'rejected') return 'red';
  return 'blue';
}

export default function RequestPanel() {
  const t = useTranslations('foodLists');
  const [nameAr, setNameAr] = useState('');
  const [macros, setMacros] = useState({ kcal: '', protein: '', carbs: '', fats: '' });
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<FoodRequestDto[]>([]);

  async function load(): Promise<void> {
    try {
      const data = await readApi<{ requests: FoodRequestDto[] }>(await fetch('/api/food-requests'));
      setRequests(data.requests);
    } catch {
      // Queue is best-effort on first paint; the form still works.
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/food-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name_ar: nameAr,
          calories_per_100g: Number(macros.kcal),
          protein_per_100g: Number(macros.protein),
          carbs_per_100g: Number(macros.carbs),
          fats_per_100g: Number(macros.fats),
          category: category || null,
        }),
      });
      await readApi<{ requestId: string }>(res);
      setNameAr('');
      setMacros({ kcal: '', protein: '', carbs: '', fats: '' });
      setCategory('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tile>
      <h3>{t('requestTitle')}</h3>
      <p style={{ opacity: 0.75 }}>{t('requestHelp')}</p>
      <div style={{ display: 'grid', gap: 8, marginTop: 12, maxWidth: 480 }}>
        <TextInput id="req-name" labelText={t('nameAr')} value={nameAr} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNameAr(e.target.value)} />
        <TextInput id="req-kcal" labelText={t('calories')} value={macros.kcal} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMacros((m) => ({ ...m, kcal: e.target.value }))} inputMode="decimal" />
        <TextInput id="req-protein" labelText={t('protein')} value={macros.protein} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMacros((m) => ({ ...m, protein: e.target.value }))} inputMode="decimal" />
        <TextInput id="req-carbs" labelText={t('carbs')} value={macros.carbs} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMacros((m) => ({ ...m, carbs: e.target.value }))} inputMode="decimal" />
        <TextInput id="req-fats" labelText={t('fats')} value={macros.fats} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMacros((m) => ({ ...m, fats: e.target.value }))} inputMode="decimal" />
        <Select id="req-category" labelText={t('category')} value={category} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value)}>
          <SelectItem value="" text={t('allCategories')} />
          {CATEGORY_OPTIONS.map((c) => (
            <SelectItem key={c} value={c} text={c} />
          ))}
        </Select>
        <Button kind="secondary" size="sm" disabled={busy || nameAr.trim() === ''} onClick={submit}>
          {t('submitRequest')}
        </Button>
        {error && <InlineNotification kind="error" title={error} hideCloseButton lowContrast />}
      </div>
      <h4 style={{ marginTop: 16 }}>{t('myRequests')}</h4>
      {requests.length === 0 && <p style={{ opacity: 0.7 }}>—</p>}
      {requests.map((r) => (
        <p key={r.id}>
          <Tag type={statusType(r.status)}>{r.status === 'pending' ? t('pending') : r.status === 'approved' ? t('approved') : t('rejectedStatus')}</Tag>{' '}
          {r.name_ar}
          {r.review_reason && r.status === 'rejected' ? ` — ${r.review_reason}` : ''}
        </p>
      ))}
    </Tile>
  );
}
