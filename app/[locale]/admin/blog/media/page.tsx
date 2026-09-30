'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineNotification, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TextInput, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface MediaItem {
  id: string;
  original_name: string | null;
  alt_text: string | null;
  folder: string | null;
  url: string;
}

export default function MediaLibraryPage() {
  const t = useTranslations('blogAdmin');
  const [rows, setRows] = useState<MediaItem[]>([]);
  const [q, setQ] = useState('');
  const [alt, setAlt] = useState('');
  const [folder, setFolder] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
      const d = await readApi<{ media: MediaItem[] }>(await fetch(`/api/admin/blog/media${params}`));
      setRows(d.media);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [q, t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!alt.trim()) {
      setError(t('altRequired'));
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('alt_text', alt.trim());
    if (folder.trim()) form.append('folder', folder.trim());
    try {
      await readApi(await fetch('/api/admin/blog/media', { method: 'POST', body: form }));
      setAlt('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('uploadFailed'));
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await readApi(await fetch(`/api/admin/blog/media?id=${id}`, { method: 'DELETE' }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('deleteFailed'));
    }
  }

  return (
    <div>
      <h1>{t('mediaTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <Tile>
        <input aria-label={t('upload')} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void upload(e)} />
        <TextInput id="media-alt" labelText={t('altText')} value={alt} onChange={(e) => setAlt(e.target.value)} />
        <TextInput id="media-folder" labelText={t('folder')} value={folder} onChange={(e) => setFolder(e.target.value)} />
      </Tile>
      <input aria-label={t('search')} placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <TableContainer>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>{t('name')}</TableHeader>
              <TableHeader>{t('altText')}</TableHeader>
              <TableHeader>{t('actions')}</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((m) => (
              <TableRow key={m.id}>
                <TableCell>{m.original_name ?? m.id}</TableCell>
                <TableCell>{m.alt_text ?? '—'}</TableCell>
                <TableCell>
                  <Button kind="ghost" size="sm" onClick={() => window.open(m.url, '_blank')}>{t('view')}</Button>
                  <Button kind="danger--ghost" size="sm" onClick={() => void remove(m.id)}>{t('delete')}</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
