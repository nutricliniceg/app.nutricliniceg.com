'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Select, SelectItem } from '@carbon/react';
import { useTranslations } from 'next-intl';
import SaveTemplateForm from './_components/save-template-form';
import TemplateCard from './_components/template-card';
import ApplyModal from './_components/apply-modal';
import AdaptivePanel from './_components/adaptive-panel';
import type { TemplateCardData } from './_components/template-types';

import { readApi } from '@/lib/api/fetch-json';

export default function TemplatesPage() {
  const t = useTranslations('templates');
  const [items, setItems] = useState<TemplateCardData[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('recent');
  const [selected, setSelected] = useState<TemplateCardData | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const q = new URLSearchParams({ type: 'nutrition', sort });
    if (search.trim() !== '') q.set('search', search.trim());
    if (category !== '') q.set('category', category);
    try {
      const d = await readApi<{ templates: TemplateCardData[] }>(await fetch(`/api/templates?${q.toString()}`));
      setItems(d.templates);
    } catch {
      setItems([]);
    }
  }, [search, category, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = new Map<string, TemplateCardData[]>();
  for (const tpl of items) {
    const key = tpl.category ?? 'general';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)?.push(tpl);
  }

  return (
    <div>
      <h1>{t('title')}</h1>
      <p>{t('subtitle')}</p>
      <SaveTemplateForm onSaved={() => void load()} />
      <AdaptivePanel />
      <Search id="tpl-search" labelText={t('search')} placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <Select id="tpl-cat-filter" labelText={t('category')} value={category} onChange={(e) => setCategory(e.target.value)}>
        <SelectItem value="" text={t('allCategories')} />
        <SelectItem value="diet" text={t('catDiet')} />
        <SelectItem value="diabetes" text={t('catDiabetes')} />
        <SelectItem value="sport" text={t('catSport')} />
        <SelectItem value="vegetarian" text={t('catVegetarian')} />
        <SelectItem value="pregnancy" text={t('catPregnancy')} />
        <SelectItem value="general" text={t('catGeneral')} />
      </Select>
      <Select id="tpl-sort" labelText={t('sort')} value={sort} onChange={(e) => setSort(e.target.value)}>
        <SelectItem value="recent" text={t('sortRecent')} />
        <SelectItem value="usage" text={t('sortUsage')} />
      </Select>
      {[...groups].map(([cat, list]) => (
        <section key={cat}>
          <h2>{cat}</h2>
          {list.map((tpl) => (
            <TemplateCard key={tpl.id} tpl={tpl} onApply={setSelected} />
          ))}
        </section>
      ))}
      <ApplyModal tpl={selected} onClose={() => { setSelected(null); void load(); }} />
    </div>
  );
}
