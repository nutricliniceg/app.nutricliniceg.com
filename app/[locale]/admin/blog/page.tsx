'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Checkbox, InlineNotification, Select, SelectItem, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextInput } from '@carbon/react';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { readApi } from '@/lib/api/fetch-json';

interface Post {
  id: string;
  locale: string;
  slug: string;
  title: string;
  status: string;
  translation_of: string | null;
  has_translation: number;
  newsletter_sent_at: string | null;
}

export default function BlogListPage() {
  const t = useTranslations('blogAdmin');
  const locale = useLocale();
  const [rows, setRows] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [untranslated, setUntranslated] = useState(0);
  const [status, setStatus] = useState('');
  const [onlyUntranslated, setOnlyUntranslated] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const q = new URLSearchParams();
      if (status) q.set('status', status);
      if (onlyUntranslated) q.set('untranslated', 'true');
      const d = await readApi<{ posts: Post[]; total: number; untranslatedCount: number }>(await fetch(`/api/admin/blog/posts?${q.toString()}`));
      setRows(d.posts);
      setTotal(d.total);
      setUntranslated(d.untranslatedCount);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [status, onlyUntranslated, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function bulk(op: string): Promise<void> {
    const ids = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
    if (ids.length === 0) return;
    await readApi(await fetch('/api/admin/blog/posts/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, op }),
    }));
    setChecked({});
    await load();
  }

  return (
    <div>
      <h1>{`${t('blogTitle')} (${total})`}</h1>
      <p>{t('untranslatedReport', { n: untranslated })}</p>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Select id="bl-status" labelText={t('status')} value={status} onChange={(e) => setStatus(e.target.value)}>
        <SelectItem value="" text={t('all')} />
        <SelectItem value="draft" text="draft" />
        <SelectItem value="scheduled" text="scheduled" />
        <SelectItem value="published" text="published" />
        <SelectItem value="archived" text="archived" />
      </Select>
      <Checkbox id="bl-untr" labelText={t('untranslatedOnly')} checked={onlyUntranslated} onChange={(_, { checked }) => setOnlyUntranslated(Boolean(checked))} />
      <Link href={`/${locale}/admin/blog/new`}>
        <Button size="sm">{t('newPost')}</Button>
      </Link>
      <Button kind="ghost" size="sm" onClick={() => void bulk('publish')}>{t('bulkPublish')}</Button>
      <Button kind="ghost" size="sm" onClick={() => void bulk('unpublish')}>{t('bulkUnpublish')}</Button>
      <Button kind="ghost" size="sm" onClick={() => void bulk('archive')}>{t('bulkArchive')}</Button>
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('select')}</TableHeader>
              <TableHeader>{t('title')}</TableHeader>
              <TableHeader>{t('status')}</TableHeader>
              <TableHeader>{t('translation')}</TableHeader>
              <TableHeader>{t('newsletter')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Checkbox id={`ck-${p.id}`} labelText="" checked={!!checked[p.id]} onChange={(_, { checked: c }) => setChecked((s) => ({ ...s, [p.id]: Boolean(c) }))} />
                </TableCell>
                <TableCell>
                  <Link href={`/${locale}/admin/blog/${p.id}`}>{p.title}</Link>
                </TableCell>
                <TableCell>{p.status}</TableCell>
                <TableCell>
                  {p.locale === 'ar' && !p.has_translation
                    ? t('untranslatedBadge')
                    : (p.locale === 'ar' && p.has_translation) || (p.locale === 'en' && p.translation_of)
                      ? t('translatedBadge')
                      : '—'}
                </TableCell>
                <TableCell>{p.newsletter_sent_at ? t('sent') : t('pending')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
