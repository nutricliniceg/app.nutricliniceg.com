'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineNotification, Select, SelectItem, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextArea } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface Section {
  id: string;
  key_name: string;
  title_ar: string | null;
  is_visible: boolean | number;
  sort_order: number;
  items: Array<{ id: string; type: string; is_visible: boolean | number; sort_order: number }>;
}

export default function CmsPage() {
  const t = useTranslations('admin');
  const [sections, setSections] = useState<Section[]>([]);
  const [slug, setSlug] = useState('about');
  const [page, setPage] = useState({ title_ar: '', content_ar: '' });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const d = await readApi<{ sections: Section[] }>(await fetch('/api/admin/cms?kind=landing'));
      setSections(d.sections);
      const p = await readApi<{ page: { title_ar: string; content_ar: string } }>(await fetch(`/api/admin/cms?kind=page&slug=${slug}`));
      setPage({ title_ar: p.page.title_ar, content_ar: p.page.content_ar });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [slug, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleSection(s: Section): Promise<void> {
    const visible = !(s.is_visible === true || s.is_visible === 1);
    await readApi(await fetch(`/api/admin/cms?kind=landing&target=section&id=${s.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_visible: visible }),
    }));
    await load();
  }

  async function savePage(): Promise<void> {
    await readApi(await fetch(`/api/admin/cms?kind=page&slug=${slug}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title_ar: page.title_ar, content_ar: page.content_ar }),
    }));
    await load();
  }

  return (
    <div>
      <h1>{t('cmsTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <h2>{t('landingSections')}</h2>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('key')}</TableHeader>
              <TableHeader>{t('title')}</TableHeader>
              <TableHeader>{t('items')}</TableHeader>
              <TableHeader>{t('actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {sections.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.key_name}</TableCell>
                <TableCell>{s.title_ar ?? '—'}</TableCell>
                <TableCell>{s.items.length}</TableCell>
                <TableCell>
                  <Button kind="ghost" size="sm" onClick={() => void toggleSection(s)}>
                    {s.is_visible ? t('hide') : t('show')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <h2>{t('staticPages')}</h2>
      <Select id="cms-slug" labelText={t('page')} value={slug} onChange={(e) => setSlug(e.target.value)}>
        <SelectItem value="about" text="about" />
        <SelectItem value="contact" text="contact" />
        <SelectItem value="privacy" text="privacy" />
        <SelectItem value="terms" text="terms" />
      </Select>
      <TextArea id="cms-title" labelText={t('title')} value={page.title_ar} onChange={(e) => setPage((p) => ({ ...p, title_ar: e.target.value }))} rows={1} />
      <TextArea id="cms-content" labelText={t('content')} value={page.content_ar} onChange={(e) => setPage((p) => ({ ...p, content_ar: e.target.value }))} rows={8} />
      <Button size="sm" onClick={() => void savePage()}>{t('save')}</Button>
    </div>
  );
}
