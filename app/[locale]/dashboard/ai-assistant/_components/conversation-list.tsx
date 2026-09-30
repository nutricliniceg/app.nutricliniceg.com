'use client';

import { useEffect, useState } from 'react';
import { Button, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface Row {
  id: string;
  title: string | null;
  patient_id: string | null;
  is_pinned: boolean;
  is_archived: boolean;
}

export default function ConversationList({ onSelect, refreshKey }: { onSelect: (id: string | null) => void; refreshKey: number }) {
  const t = useTranslations('assistant');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('active');
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (filter === 'archived') params.set('archived', 'true');
    if (filter === 'trash') params.set('trash', 'true');
    fetch(`/api/ai-assistant/conversations?${params.toString()}`)
      .then((r) => readApi<{ conversations: Row[] }>(r))
      .then((d) => setRows(d.conversations))
      .catch(() => setRows([]));
  }, [q, filter, refreshKey]);

  async function act(id: string, kind: 'pin' | 'archive' | 'delete' | 'restore', body?: Record<string, unknown>): Promise<void> {
    const method = kind === 'restore' ? 'POST' : kind === 'delete' ? 'DELETE' : 'PATCH';
    await readApi(await fetch(`/api/ai-assistant/conversations/${id}${kind === 'restore' ? '/restore' : ''}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }));
  }

  return (
    <div>
      <input aria-label={t('search')} placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <select aria-label={t('filter')} value={filter} onChange={(e) => setFilter(e.target.value)}>
        <option value="active">{t('filterActive')}</option>
        <option value="archived">{t('filterArchived')}</option>
        <option value="trash">{t('filterTrash')}</option>
      </select>
      <Button size="sm" onClick={() => onSelect(null)}>{t('newChat')}</Button>
      {rows.map((c) => (
        <Tile key={c.id} onClick={() => onSelect(c.id)}>
          <strong>{c.title ?? t('untitled')}</strong>
          {c.is_pinned && <span> 📌</span>}
          <Button kind="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void act(c.id, 'pin', { is_pinned: !c.is_pinned }); }}>{t('pin')}</Button>
          <Button kind="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void act(c.id, 'archive', { is_archived: !c.is_archived }); }}>{t('archive')}</Button>
          {filter === 'trash' ? (
            <Button kind="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void act(c.id, 'restore'); }}>{t('restore')}</Button>
          ) : (
            <Button kind="danger--ghost" size="sm" onClick={(e) => { e.stopPropagation(); void act(c.id, 'delete'); }}>{t('delete')}</Button>
          )}
        </Tile>
      ))}
    </div>
  );
}
