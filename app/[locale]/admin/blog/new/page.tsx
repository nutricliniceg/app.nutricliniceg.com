'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button, InlineNotification, Select, SelectItem, TextInput } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

export default function NewBlogPostPage() {
  const t = useTranslations('blogAdmin');
  const router = useRouter();
  const params = useParams();
  const locale = String(params.locale);
  const [title, setTitle] = useState('');
  const [postLocale, setPostLocale] = useState('ar');
  const [error, setError] = useState<string | null>(null);

  async function create(): Promise<void> {
    try {
      const d = await readApi<{ id: string }>(await fetch('/api/admin/blog/posts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: postLocale, title: title.trim(), content_md: `# ${title.trim()}\n` }),
      }));
      router.push(`/${locale}/admin/blog/${d.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('saveFailed'));
    }
  }

  return (
    <div>
      <h1>{t('newPost')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <TextInput id="new-title" labelText={t('title')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <Select id="new-locale" labelText={t('locale')} value={postLocale} onChange={(e) => setPostLocale(e.target.value)}>
        <SelectItem value="ar" text="العربية" />
        <SelectItem value="en" text="English" />
      </Select>
      <Button onClick={() => void create()} disabled={title.trim().length < 2}>{t('create')}</Button>
    </div>
  );
}
