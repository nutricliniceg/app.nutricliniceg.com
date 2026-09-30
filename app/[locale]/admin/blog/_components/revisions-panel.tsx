'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineNotification, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface Revision {
  revision_no: number;
  title: string;
  created_at: string;
}

export default function RevisionsPanel({ postId }: { postId: string }) {
  const t = useTranslations('blogAdmin');
  const [rows, setRows] = useState<Revision[]>([]);

  const load = useCallback(async (): Promise<void> => {
    const d = await readApi<{ revisions: Revision[] }>(await fetch(`/api/admin/blog/posts/${postId}/revisions`));
    setRows(d.revisions);
  }, [postId]);

  useEffect(() => {
    void load().catch(() => setRows([]));
  }, [load]);

  async function restore(no: number): Promise<void> {
    await readApi(await fetch(`/api/admin/blog/posts/${postId}/restore`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision_no: no }),
    }));
    await load();
  }

  return (
    <Tile>
      <h3>{t('revisions')}</h3>
      {rows.length === 0 && <p>{t('noRevisions')}</p>}
      {rows.map((r) => (
        <div key={r.revision_no}>
          <span>{`#${r.revision_no} ${r.title}`}</span>
          <Button kind="ghost" size="sm" onClick={() => void restore(r.revision_no).catch(() => {})}>{t('restore')}</Button>
        </div>
      ))}
      <InlineNotification kind="info" title={t('revisionNote')} lowContrast />
    </Tile>
  );
}
