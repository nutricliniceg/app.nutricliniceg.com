'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, InlineNotification, TextInput, Tile, Toggle } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';
import ProviderKeys, { type KeyInfo } from './_components/provider-keys';

interface Provider {
  id: string;
  name: string;
  type: string;
  base_url: string | null;
  priority_order: number;
  is_enabled: boolean | number;
  failure_count: number;
  keys: KeyInfo[];
}

export default function AiProvidersPage() {
  const t = useTranslations('adminAi');
  const [rows, setRows] = useState<Provider[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [baseUrls, setBaseUrls] = useState<Record<string, string>>({});
  const [probe, setProbe] = useState<Record<string, string>>({});

  const load = useCallback(async (): Promise<void> => {
    try {
      const d = await readApi<{ providers: Provider[] }>(await fetch('/api/admin/ai-providers'));
      setRows(d.providers);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, body: Record<string, unknown>): Promise<void> {
    await readApi(await fetch(`/api/admin/ai-providers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    await load();
  }

  async function move(id: string, delta: -1 | 1): Promise<void> {
    const order = rows.map((p) => p.id);
    const i = order.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    await readApi(await fetch('/api/admin/ai-providers/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: order }),
    }));
    await load();
  }

  async function ping(id: string): Promise<void> {
    const d = await readApi<{ ok: boolean; latencyMs: number; detail: string }>(await fetch(`/api/admin/ai-providers/${id}/probe`, { method: 'POST' }));
    setProbe((s) => ({ ...s, [id]: `${d.ok ? t('probeOk') : t('probeFail')} · ${d.latencyMs}ms · ${d.detail}` }));
  }

  async function dropOn(targetId: string, draggedId: string): Promise<void> {
    if (!draggedId || draggedId === targetId) return;
    const order = rows.map((p) => p.id).filter((id) => id !== draggedId);
    order.splice(order.indexOf(targetId), 0, draggedId);
    await readApi(await fetch('/api/admin/ai-providers/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: order }),
    }));
    await load();
  }

  return (
    <div>
      <h1>{t('providersTitle')}</h1>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      {rows.map((p) => (
        <Tile
          key={p.id}
          draggable
          onDragStart={(e) => e.dataTransfer.setData('text/plain', p.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void dropOn(p.id, e.dataTransfer.getData('text/plain'));
          }}
        >
          <h3>{`${p.priority_order}. ${p.name} (${p.type})`}</h3>
          <Toggle id={`en-${p.id}`} labelText={t('enabled')} toggled={p.is_enabled === true || p.is_enabled === 1} onToggle={(v) => void patch(p.id, { is_enabled: v })} />
          <Button kind="ghost" size="sm" onClick={() => void move(p.id, -1)}>{t('moveUp')}</Button>
          <Button kind="ghost" size="sm" onClick={() => void move(p.id, 1)}>{t('moveDown')}</Button>
          <Button kind="ghost" size="sm" onClick={() => void ping(p.id)}>{t('ping')}</Button>
          {probe[p.id] && <p>{probe[p.id]}</p>}
          {p.type === 'custom' && (
            <TextInput id={`url-${p.id}`} labelText={t('baseUrl')} value={baseUrls[p.id] ?? p.base_url ?? ''} onChange={(e) => setBaseUrls((s) => ({ ...s, [p.id]: e.target.value }))} onBlur={() => void patch(p.id, { base_url: baseUrls[p.id] ?? null })} />
          )}
          <ProviderKeys providerId={p.id} keys={p.keys} onChanged={() => void load()} />
        </Tile>
      ))}
    </div>
  );
}
