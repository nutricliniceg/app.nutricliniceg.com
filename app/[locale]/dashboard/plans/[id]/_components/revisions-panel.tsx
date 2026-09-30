'use client';

import { useEffect, useState } from 'react';
import { Button, Tile, Tag } from '@carbon/react';
import { useTranslations } from 'next-intl';

export interface RevisionEntry {
  revision_no: number;
  change_note: string | null;
  changed_by: string;
  created_at: string;
  summary: {
    added: number;
    removed: number;
    gramsChanged: number;
    kcalDelta: number;
    targetsChanged: boolean;
  };
}

import { readApi } from '@/lib/api/fetch-json';

export default function RevisionsPanel({ planId, onRestored }: { planId: string; onRestored: () => void }) {
  const t = useTranslations('plans');
  const [revisions, setRevisions] = useState<RevisionEntry[]>([]);
  const [busyNo, setBusyNo] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(): Promise<void> {
    try {
      const data = await readApi<{ revisions: RevisionEntry[] }>(await fetch(`/api/plans/${planId}/restore-revision`));
      setRevisions(data.revisions);
    } catch {
      setRevisions([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId]);

  async function restore(revisionNo: number): Promise<void> {
    if (!window.confirm(t('restoreConfirm'))) return;
    setBusyNo(revisionNo);
    try {
      await readApi(
        await fetch(`/api/plans/${planId}/restore-revision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ revision_no: revisionNo }),
        })
      );
      setNotice(t('restored'));
      await load();
      onRestored();
    } catch {
      setNotice(t('generateFailed'));
    } finally {
      setBusyNo(null);
    }
  }

  return (
    <Tile>
      <h3>{t('revisions')}</h3>
      {notice && <p>{notice}</p>}
      {revisions.length === 0 && <p style={{ opacity: 0.7 }}>{t('noRevisions')}</p>}
      {revisions.map((r) => (
        <div key={r.revision_no} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
          <Tag type="cool-gray">#{r.revision_no}</Tag>
          <span>{r.change_note ?? ''}</span>
          <span style={{ opacity: 0.7 }}>
            {t('diffAdded', { n: r.summary.added })} · {t('diffRemoved', { n: r.summary.removed })} ·{' '}
            {t('diffChanged', { n: r.summary.gramsChanged })} · {t('diffKcal', { n: r.summary.kcalDelta })}
          </span>
          <Button kind="ghost" size="sm" disabled={busyNo === r.revision_no} onClick={() => restore(r.revision_no)}>
            {t('restore')}
          </Button>
        </div>
      ))}
    </Tile>
  );
}
