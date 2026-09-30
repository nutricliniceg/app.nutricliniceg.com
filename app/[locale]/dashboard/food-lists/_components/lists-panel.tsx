'use client';

import { useEffect, useState } from 'react';
import { Button, InlineLoading, Tile, Tag } from '@carbon/react';
import { CopyFile } from '@carbon/icons-react';
import { useTranslations } from 'next-intl';
import { readApi, type FoodListDto } from './types';

export default function ListsPanel() {
  const t = useTranslations('foodLists');
  const [lists, setLists] = useState<FoodListDto[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(): Promise<void> {
    try {
      const data = await readApi<{ lists: FoodListDto[] }>(await fetch('/api/food-lists'));
      setLists(data.lists);
    } catch {
      // Best-effort; the foods table below is the primary view.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function copy(id: string): Promise<void> {
    setBusyId(id);
    setNotice(null);
    try {
      const data = await readApi<{ copied: number }>(await fetch(`/api/food-lists/${id}/copy`, { method: 'POST' }));
      setNotice(`${t('copied')} (${data.copied})`);
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : t('loadFailed'));
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <InlineLoading description={t('loading')} />;
  if (lists.length === 0) return <Tile><p>{t('noListsYet')}</p></Tile>;

  return (
    <Tile>
      <h3>{t('listsTitle')}</h3>
      {notice && <p>{notice}</p>}
      {lists.map((l) => (
        <div key={l.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <Tag type={l.is_global || l.owner_id === null ? 'green' : 'cool-gray'}>
            {l.is_global || l.owner_id === null ? t('globalBadge') : t('mineBadge')}
          </Tag>
          <span>
            {l.name_ar} ({l.item_count})
          </span>
          {(l.is_global || l.owner_id === null) && (
            <Button kind="ghost" size="sm" renderIcon={CopyFile} disabled={busyId === l.id} onClick={() => copy(l.id)}>
              {t('copyAsBase')}
            </Button>
          )}
        </div>
      ))}
    </Tile>
  );
}
