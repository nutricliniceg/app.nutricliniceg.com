'use client';

import { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Select, SelectItem, TextArea, TextInput, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';

export default function PostFields({ title, setTitle, excerpt, setExcerpt, category, setCategory, categories, guest, setGuest, md, setMd, onDirty }: {
  title: string;
  setTitle: (v: string) => void;
  excerpt: string;
  setExcerpt: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  categories: Array<{ id: string; name_ar: string }>;
  guest: string;
  setGuest: (v: string) => void;
  md: string;
  setMd: (v: string) => void;
  onDirty: () => void;
}) {
  const t = useTranslations('blogAdmin');
  // Live preview is admin-typed markdown rendered as HTML in the admin's
  // own browser — sanitize it (stored-XSS via paste/import would run here).
  const previewHtml = useMemo(() => {
    const raw = marked.parse(md || '') as string;
    if (typeof window === 'undefined') return '';
    return DOMPurify.sanitize(raw);
  }, [md]);
  const touch = (fn: () => void) => () => {
    fn();
    onDirty();
  };
  return (
    <>
      <TextInput id="post-title" labelText={t('title')} value={title} onChange={(e) => touch(() => setTitle(e.target.value))()} />
      <TextArea id="post-excerpt" labelText={t('excerpt')} value={excerpt} onChange={(e) => touch(() => setExcerpt(e.target.value))()} rows={2} />
      <Select id="post-cat" labelText={t('category')} value={category} onChange={(e) => touch(() => setCategory(e.target.value))()}>
        <SelectItem value="" text={t('noCategory')} />
        {categories.map((c) => (
          <SelectItem key={c.id} value={c.id} text={c.name_ar} />
        ))}
      </Select>
      <TextInput id="post-guest" labelText={t('guestAuthor')} value={guest} onChange={(e) => touch(() => setGuest(e.target.value))()} />
      <TextArea id="post-md" labelText={t('rawMarkdown')} value={md} onChange={(e) => touch(() => setMd(e.target.value))()} rows={10} />
      <Tile>
        <h3>{t('livePreview')}</h3>
        <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
      </Tile>
    </>
  );
}
