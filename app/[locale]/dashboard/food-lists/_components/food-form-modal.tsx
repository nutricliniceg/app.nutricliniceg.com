'use client';

import { useState } from 'react';
import { Modal, TextInput, Select, SelectItem, InlineNotification } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { CATEGORY_OPTIONS, type FoodItemDto } from './types';

interface Props {
  open: boolean;
  initial: FoodItemDto | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
}

function val(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v);
}

export default function FoodFormModal({ open, initial, saving, error, onClose, onSubmit }: Props) {
  const t = useTranslations('foodLists');
  const [form, setForm] = useState<Record<string, string>>({});
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const current = (key: string, fallback: string): string => form[key] ?? fallback;

  return (
    <Modal
      open={open}
      modalHeading={initial ? t('editItem') : t('addItem')}
      primaryButtonText={t('save')}
      secondaryButtonText={t('cancel')}
      onRequestClose={onClose}
      onRequestSubmit={() =>
        onSubmit({
          name_ar: current('name_ar', initial?.name_ar ?? ''),
          name_en: current('name_en', initial?.name_en ?? ''),
          calories_per_100g: current('calories', val(initial?.calories_per_100g)),
          protein_per_100g: current('protein', val(initial?.protein_per_100g)),
          carbs_per_100g: current('carbs', val(initial?.carbs_per_100g)),
          fats_per_100g: current('fats', val(initial?.fats_per_100g)),
          category: current('category', initial?.category ?? ''),
          tags: current('tags', (initial?.tags ?? []).join(', ')),
          pairing_tags: current('pairing', (initial?.pairing_tags ?? []).join(', ')),
        })
      }
      primaryButtonDisabled={saving}
    >
      <TextInput id="food-name-ar" labelText={t('nameAr')} value={current('name_ar', initial?.name_ar ?? '')} onChange={set('name_ar')} />
      <TextInput id="food-name-en" labelText={t('nameEn')} value={current('name_en', initial?.name_en ?? '')} onChange={set('name_en')} />
      <TextInput id="food-kcal" labelText={t('calories')} value={current('calories', val(initial?.calories_per_100g))} onChange={set('calories')} inputMode="decimal" />
      <TextInput id="food-protein" labelText={t('protein')} value={current('protein', val(initial?.protein_per_100g))} onChange={set('protein')} inputMode="decimal" />
      <TextInput id="food-carbs" labelText={t('carbs')} value={current('carbs', val(initial?.carbs_per_100g))} onChange={set('carbs')} inputMode="decimal" />
      <TextInput id="food-fats" labelText={t('fats')} value={current('fats', val(initial?.fats_per_100g))} onChange={set('fats')} inputMode="decimal" />
      <Select id="food-category" labelText={t('category')} value={current('category', initial?.category ?? '')} onChange={set('category')}>
        <SelectItem value="" text={t('allCategories')} />
        {CATEGORY_OPTIONS.map((c) => (
          <SelectItem key={c} value={c} text={c} />
        ))}
      </Select>
      <TextInput id="food-tags" labelText={t('tags')} value={current('tags', (initial?.tags ?? []).join(', '))} onChange={set('tags')} />
      <TextInput id="food-pairing" labelText={t('pairingTags')} value={current('pairing', (initial?.pairing_tags ?? []).join(', '))} onChange={set('pairing')} />
      {error && <InlineNotification kind="error" title={error} hideCloseButton lowContrast />}
    </Modal>
  );
}
