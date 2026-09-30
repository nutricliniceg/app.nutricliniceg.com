'use client';

import { useState } from 'react';
import { Button, Checkbox, InlineNotification, TextInput, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

export default function LifecycleBar({ postId, status, newsletter, newsletterSentAt, onNewsletterChange, onChanged }: {
  postId: string;
  status: string;
  newsletter: boolean;
  newsletterSentAt: string | null;
  onNewsletterChange: (v: boolean) => void;
  onChanged: () => void;
}) {
  const t = useTranslations('blogAdmin');
  const [scheduledAt, setScheduledAt] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function op(name: string, body?: Record<string, unknown>): Promise<void> {
    try {
      await readApi(await fetch(`/api/admin/blog/posts/${postId}/${name}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
      }));
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('opFailed'));
    }
  }

  async function preview(): Promise<void> {
    const d = await readApi<{ token: string }>(await fetch(`/api/admin/blog/posts/${postId}/preview`, { method: 'POST' }));
    setPreviewUrl(`/blog/preview?preview=${d.token}`);
  }

  async function translate(): Promise<void> {
    const d = await readApi<{ id: string }>(await fetch(`/api/admin/blog/posts/${postId}/translate`, { method: 'POST' }));
    window.location.href = window.location.href.replace(/\/blog\/[^/]+$/, `/blog/${d.id}`);
  }

  return (
    <Tile>
      <p>{`${t('status')}: ${status}`}</p>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Button size="sm" onClick={() => void op('publish', scheduledAt ? { published_at: new Date(scheduledAt).toISOString() } : {})}>{t('publish')}</Button>
      <TextInput id="sched-at" labelText={t('scheduleAt')} type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
      <Button kind="secondary" size="sm" onClick={() => void op('unpublish')}>{t('unpublish')}</Button>
      <Button kind="danger--ghost" size="sm" onClick={() => void op('archive')}>{t('archive')}</Button>
      <Button kind="ghost" size="sm" onClick={() => void preview()}>{t('preview')}</Button>
      {previewUrl && <a href={previewUrl} target="_blank" rel="noreferrer">{t('openPreview')}</a>}
      <Button kind="ghost" size="sm" onClick={() => void translate()}>{t('addTranslation')}</Button>
      <Checkbox id="send-news" labelText={t('sendToSubscribers')} checked={newsletter} disabled={newsletterSentAt !== null} onChange={(_, { checked }) => onNewsletterChange(Boolean(checked))} />
      {newsletterSentAt && <p>{`${t('newsletterLocked')}: ${newsletterSentAt}`}</p>}
    </Tile>
  );
}
