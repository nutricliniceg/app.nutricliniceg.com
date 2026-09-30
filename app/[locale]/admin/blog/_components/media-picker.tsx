'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Modal } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface MediaItem {
  id: string;
  original_name: string | null;
  alt_text: string | null;
}

export default function MediaPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (url: string) => void }) {
  const t = useTranslations('blogAdmin');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<MediaItem[]>([]);

  const load = useCallback(async (): Promise<void> => {
    const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    const d = await readApi<{ media: MediaItem[] }>(await fetch(`/api/admin/blog/media${params}`));
    setRows(d.media);
  }, [q]);

  useEffect(() => {
    if (open) void load().catch(() => setRows([]));
  }, [open, load]);

  return (
    <Modal open={open} modalHeading={t('pickImage')} passiveModal onRequestClose={onClose}>
      <input aria-label={t('search')} placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      {rows.map((m) => (
        <div key={m.id}>
          <span>{m.original_name ?? m.id}</span>
          <Button kind="ghost" size="sm" onClick={() => { onPick(`/api/media/${m.id}`); onClose(); }}>{t('pick')}</Button>
        </div>
      ))}
    </Modal>
  );
}
