'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineNotification, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextInput, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

export default function TaxonomyPage() {
  const t = useTranslations('blogAdmin');
  const [cats, setCats] = useState<Array<{ id: string; slug: string; name_ar: string }>>([]);
  const [tags, setTags] = useState<Array<{ id: string; slug: string; name_ar: string }>>([]);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    const [c, g] = await Promise.all([
      readApi<{ categories: typeof cats }>(await fetch('/api/admin/blog/taxonomy?kind=categories')),
      readApi<{ tags: typeof tags }>(await fetch('/api/admin/blog/taxonomy?kind=tags')),
    ]);
    setCats(c.categories);
    setTags(g.tags);
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : t('loadFailed')));
  }, [load, t]);

  async function create(kind: 'categories' | 'tags'): Promise<void> {
    try {
      await readApi(await fetch(`/api/admin/blog/taxonomy?kind=${kind}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug.trim(), name_ar: name.trim() }),
      }));
      setSlug('');
      setName('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    }
  }

  async function remove(kind: 'categories' | 'tags', id: string): Promise<void> {
    await readApi(await fetch(`/api/admin/blog/taxonomy?kind=${kind}&id=${id}`, { method: 'DELETE' }));
    await load();
  }

  return (
    <div>
      <h1>{t('taxonomyTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Tile>
        <TextInput id="tax-slug" labelText={t('slug')} value={slug} onChange={(e) => setSlug(e.target.value)} />
        <TextInput id="tax-name" labelText={t('name')} value={name} onChange={(e) => setName(e.target.value)} />
        <Button size="sm" onClick={() => void create('categories')}>{t('addCategory')}</Button>
        <Button size="sm" kind="secondary" onClick={() => void create('tags')}>{t('addTag')}</Button>
      </Tile>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('kind')}</TableHeader>
              <TableHeader>{t('name')}</TableHeader>
              <TableHeader>{t('actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {cats.map((c) => (
              <TableRow key={c.id}>
                <TableCell>{t('category')}</TableCell>
                <TableCell>{c.name_ar}</TableCell>
                <TableCell>
                  <Button kind="danger--ghost" size="sm" onClick={() => void remove('categories', c.id)}>{t('delete')}</Button>
                </TableCell>
              </TableRow>
            ))}
            {tags.map((g) => (
              <TableRow key={g.id}>
                <TableCell>{t('tag')}</TableCell>
                <TableCell>{g.name_ar}</TableCell>
                <TableCell>
                  <Button kind="danger--ghost" size="sm" onClick={() => void remove('tags', g.id)}>{t('delete')}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
