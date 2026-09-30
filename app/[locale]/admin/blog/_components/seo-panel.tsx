'use client';

import { useMemo } from 'react';
import { Checkbox, TextArea, TextInput, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';

export interface SeoState {
  slug: string;
  metaTitle: string;
  metaDesc: string;
  ogImage: string;
  canonical: string;
  noindex: boolean;
  featuredImage: string;
}

export default function SeoPanel({ value, onChange, onPickImage }: {
  value: SeoState;
  onChange: (patch: Partial<SeoState>) => void;
  onPickImage: (target: 'featured' | 'og') => void;
}) {
  const t = useTranslations('blogAdmin');
  const serp = useMemo(() => ({
    title: (value.metaTitle || '').slice(0, 60),
    desc: (value.metaDesc || '').slice(0, 160),
  }), [value.metaTitle, value.metaDesc]);
  return (
    <Tile>
      <h3>{t('seoTitle')}</h3>
      <TextInput id="seo-slug" labelText={t('slug')} value={value.slug} onChange={(e) => onChange({ slug: e.target.value })} />
      <TextInput id="seo-title" labelText={`${t('metaTitle')} (${serp.title.length}/60)`} value={value.metaTitle} onChange={(e) => onChange({ metaTitle: e.target.value.slice(0, 60) })} />
      <TextArea id="seo-desc" labelText={`${t('metaDesc')} (${serp.desc.length}/160)`} value={value.metaDesc} onChange={(e) => onChange({ metaDesc: e.target.value.slice(0, 160) })} rows={2} />
      <TextInput id="seo-og" labelText={t('ogImage')} value={value.ogImage} onChange={(e) => onChange({ ogImage: e.target.value })} />
      <TextInput id="seo-feat" labelText={t('featuredImage')} value={value.featuredImage} onChange={(e) => onChange({ featuredImage: e.target.value })} />
      <button type="button" onClick={() => onPickImage('featured')}>{t('pickFeatured')}</button>
      <button type="button" onClick={() => onPickImage('og')}>{t('pickOg')}</button>
      <TextInput id="seo-canon" labelText={t('canonical')} value={value.canonical} onChange={(e) => onChange({ canonical: e.target.value })} />
      <Checkbox id="seo-noindex" labelText={t('noindex')} checked={value.noindex} onChange={(_, { checked }) => onChange({ noindex: Boolean(checked) })} />
      <div>
        <p>{t('serpPreview')}</p>
        <p><a href={value.canonical || '#'}>{serp.title || '—'}</a></p>
        <p>{serp.desc}</p>
      </div>
      <div>
        <p>{t('sharePreview')}</p>
        <p><strong>{serp.title || '—'}</strong></p>
        <p>{serp.desc}</p>
      </div>
    </Tile>
  );
}
