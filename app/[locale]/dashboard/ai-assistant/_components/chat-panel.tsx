'use client';

import { useState } from 'react';
import { Button, InlineNotification, TextArea, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';
import SafeMarkdown from './safe-markdown';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export function ChatLog({ messages, disclaimer }: { messages: ChatMessage[]; disclaimer: string }) {
  const t = useTranslations('assistant');
  return (
    <div>
      {messages.map((m) => (
        <Tile key={m.id}>
          <p><strong>{m.role === 'assistant' ? t('assistant') : t('you')}</strong></p>
          {m.role === 'assistant' ? <SafeMarkdown text={m.content} /> : <p>{m.content}</p>}
          {m.role === 'assistant' && disclaimer && (
            <InlineNotification kind="info" title={disclaimer} lowContrast />
          )}
        </Tile>
      ))}
    </div>
  );
}

export function Composer({ conversationId, onSent }: { conversationId: string; onSent: (disclaimer: string, outbound: unknown) => void }) {
  const t = useTranslations('assistant');
  const [text, setText] = useState('');
  const [fileId, setFileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(): Promise<void> {
    if (text.trim() === '') return;
    setBusy(true);
    setError(null);
    try {
      const d = await readApi<{ reply: string; disclaimer: string; outbound: unknown }>(await fetch(`/api/ai-assistant/conversations/${conversationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text.trim(), file_ids: fileId.trim() ? [fileId.trim()] : undefined }),
      }));
      setText('');
      setFileId('');
      onSent(d.disclaimer, d.outbound);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('sendFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      <TextArea id="assistant-input" labelText={t('ask')} value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      <input aria-label={t('attachFileId')} placeholder={t('attachFileId')} value={fileId} onChange={(e) => setFileId(e.target.value)} />
      <Button onClick={() => void send()} disabled={busy || text.trim() === ''}>{t('send')}</Button>
    </div>
  );
}
