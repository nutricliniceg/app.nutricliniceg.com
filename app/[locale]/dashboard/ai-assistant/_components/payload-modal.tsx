'use client';

import { useState } from 'react';
import { Button, InlineNotification, Modal } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

export default function PayloadModal({ conversationId }: { conversationId: string | null }) {
  const t = useTranslations('assistant');
  const [open, setOpen] = useState(false);
  const [outbound, setOutbound] = useState<unknown>(null);
  const [retention, setRetention] = useState<Record<string, boolean | null>>({});

  async function show(): Promise<void> {
    if (!conversationId) return;
    const d = await readApi<{ outbound: unknown; retention: Record<string, boolean | null> }>(
      await fetch(`/api/ai-assistant/conversations/${conversationId}/payload`)
    );
    setOutbound(d.outbound);
    setRetention(d.retention);
    setOpen(true);
  }

  return (
    <>
      <Button kind="ghost" size="sm" onClick={() => void show()} disabled={!conversationId}>{t('whatWasSent')}</Button>
      <Modal open={open} modalHeading={t('whatWasSent')} passiveModal onRequestClose={() => setOpen(false)}>
        <InlineNotification kind="info" title={t('payloadNote')} lowContrast />
        <p>{`${t('retention')}: ${Object.entries(retention).map(([k, v]) => `${k}=${v === null ? '?' : v}`).join(', ') || t('retentionUnknown')}`}</p>
        <pre style={{ whiteSpace: 'pre-wrap', direction: 'ltr', textAlign: 'left' }}>{JSON.stringify(outbound, null, 2)}</pre>
      </Modal>
    </>
  );
}
