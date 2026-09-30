'use client';

import { useState } from 'react';
import { Button, InlineNotification, TextArea, TextInput, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

interface DraftItem {
  name?: string;
  value?: string;
}

export default function LabPanel({ patientId }: { patientId: string | null }) {
  const t = useTranslations('assistant');
  const [text, setText] = useState('');
  const [fileId, setFileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ draftId: string; items: DraftItem[] } | null>(null);

  async function analyze(): Promise<void> {
    if (!patientId) return;
    setBusy(true);
    setError(null);
    try {
      const d = await readApi<{ draftId: string; items: DraftItem[] }>(await fetch('/api/ai-assistant/lab-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId, text: text.trim() || null, file_id: fileId.trim() || null }),
      }));
      setDraft(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('labFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Tile>
      <h3>{t('labTitle')}</h3>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <TextArea id="lab-text" labelText={t('labText')} value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      <TextInput id="lab-file" labelText={t('labFileId')} value={fileId} onChange={(e) => setFileId(e.target.value)} />
      <Button size="sm" onClick={() => void analyze()} disabled={busy || !patientId}>{t('analyze')}</Button>
      {draft && (
        <div>
          <InlineNotification kind="warning" title={t('draftNeedsApproval')} lowContrast />
          {draft.items.map((item, i) => (
            <p key={i}>{`${item.name ?? '?'}: ${item.value ?? '?'}`}</p>
          ))}
        </div>
      )}
    </Tile>
  );
}
