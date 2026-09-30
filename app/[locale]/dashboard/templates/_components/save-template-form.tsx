'use client';

import { useState } from 'react';
import { Button, TextInput, Select, SelectItem, Tile, InlineNotification } from '@carbon/react';
import { useTranslations } from 'next-intl';

import { readApi } from '@/lib/api/fetch-json';

export default function SaveTemplateForm({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations('templates');
  const [planId, setPlanId] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('diet');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId.trim(), name: name.trim(), category }),
      });
      await readApi(res);
      setNotice(t('saved'));
      setPlanId('');
      setName('');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tile>
      <h3>{t('saveTitle')}</h3>
      {notice && <InlineNotification kind="success" title={notice} lowContrast />}
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <TextInput id="tpl-plan" labelText={t('planId')} value={planId} onChange={(e) => setPlanId(e.target.value)} />
      <TextInput id="tpl-name" labelText={t('templateName')} value={name} onChange={(e) => setName(e.target.value)} />
      <Select id="tpl-cat" labelText={t('category')} value={category} onChange={(e) => setCategory(e.target.value)}>
        <SelectItem value="diet" text={t('catDiet')} />
        <SelectItem value="diabetes" text={t('catDiabetes')} />
        <SelectItem value="sport" text={t('catSport')} />
        <SelectItem value="vegetarian" text={t('catVegetarian')} />
        <SelectItem value="pregnancy" text={t('catPregnancy')} />
        <SelectItem value="general" text={t('catGeneral')} />
      </Select>
      <Button onClick={save} disabled={busy || planId.trim() === '' || name.trim().length < 3}>
        {t('saveAsTemplate')}
      </Button>
    </Tile>
  );
}
