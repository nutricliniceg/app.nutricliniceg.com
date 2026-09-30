'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineNotification, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';

interface Revision {
  revision_no: number;
  change_note: string | null;
  summary: { added: number; removed: number; volumeChanged: number };
}

import { readApi } from '@/lib/api/fetch-json';

export default function RevisionsPanel({ planId }: { planId: string }) {
  const t = useTranslations('exercises');
  const [rows, setRows] = useState<Revision[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const d = await readApi<{ revisions: Revision[] }>(await fetch(`/api/exercise-plans/${planId}/restore-revision`));
      setRows(d.revisions);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [planId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(no: number): Promise<void> {
    try {
      await readApi(await fetch(`/api/exercise-plans/${planId}/restore-revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision_no: no }),
      }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('restoreFailed'));
    }
  }

  return (
    <Tile>
      <h3>{t('revisions')}</h3>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      {rows.length === 0 && <p>{t('noRevisions')}</p>}
      {rows.map((r) => (
        <div key={r.revision_no}>
          <span>{`#${r.revision_no} ${r.change_note ?? ''} (+${r.summary.added}/-${r.summary.removed}/~${r.summary.volumeChanged})`}</span>
          <Button kind="ghost" size="sm" onClick={() => void restore(r.revision_no)}>{t('restore')}</Button>
        </div>
      ))}
    </Tile>
  );
}
