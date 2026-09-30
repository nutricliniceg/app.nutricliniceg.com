'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineNotification } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';
import ThreadList, { type ThreadSummary } from './_components/thread-list';
import ThreadView from './_components/thread-view';

// MSG-03: lightweight 60s poll of the cheap unread-summary query while the
// page is open; immediate refresh on every user action. No WebSockets.
export default function InboxPage() {
  const t = useTranslations('inbox');
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const d = await readApi<{ threads: ThreadSummary[] }>(
        await fetch(`/api/messages/threads${showArchived ? '?include_archived=true' : ''}`)
      );
      setThreads(d.threads);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [showArchived, t]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => clearInterval(timer);
  }, [load]);

  async function archive(next: boolean): Promise<void> {
    if (!selected) return;
    try {
      await readApi(await fetch(`/api/messages/threads/${selected}/${next ? 'archive' : 'unarchive'}`, { method: 'POST' }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('archiveFailed'));
    }
  }

  return (
    <div>
      <h1>{t('title')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Button kind="ghost" size="sm" onClick={() => setShowArchived((v) => !v)}>
        {showArchived ? t('hideArchived') : t('showArchived')}
      </Button>
      <ThreadList threads={threads} selected={selected} onSelect={setSelected} />
      {selected && (
        <>
          <ThreadView key={selected} patientId={selected} onChanged={() => void load()} />
          <Button kind="ghost" size="sm" onClick={() => void archive(true)}>{t('archive')}</Button>
          <Button kind="ghost" size="sm" onClick={() => void archive(false)}>{t('unarchive')}</Button>
        </>
      )}
    </div>
  );
}
