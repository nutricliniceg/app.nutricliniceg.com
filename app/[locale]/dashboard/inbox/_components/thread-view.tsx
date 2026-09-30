'use client';

import { useEffect, useState } from 'react';
import { Button, InlineNotification, TextArea, Tile } from '@carbon/react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

export interface ThreadMessage {
  id: string;
  sender: 'patient' | 'doctor';
  type: string;
  text: string | null;
  attachmentUrl: string | null;
  payload: unknown;
  createdAt: string;
}

function PayloadView({ message }: { message: ThreadMessage }) {
  const t = useTranslations('inbox');
  const payload = message.payload as Record<string, unknown> | null;
  if (message.type === 'weight_log' && payload && typeof payload.weight_kg !== 'undefined') {
    return <p>{`${t('weight')}: ${String(payload.weight_kg)} ${t('kg')}`}</p>;
  }
  if (message.type === 'measurement_log' && payload && typeof payload === 'object') {
    return (
      <table>
        <tbody>
          {Object.entries(payload).map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return null;
}

export default function ThreadView({ patientId, onChanged }: { patientId: string; onChanged: () => void }) {
  const t = useTranslations('inbox');
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [name, setName] = useState('');
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setMessages([]);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  async function load(): Promise<void> {
    try {
      const d = await readApi<{ patient: { name_ar: string }; messages: ThreadMessage[] }>(await fetch(`/api/messages/threads/${patientId}`));
      setName(d.patient.name_ar);
      setMessages(d.messages);
      setLoaded(true);
      await fetch(`/api/messages/threads/${patientId}/read`, { method: 'PATCH' });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('loadFailed'));
    }
  }

  async function send(): Promise<void> {
    if (reply.trim() === '') return;
    try {
      await readApi(await fetch(`/api/messages/threads/${patientId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reply.trim() }),
      }));
      setReply('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('sendFailed'));
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await readApi(await fetch(`/api/messages/${id}`, { method: 'DELETE' }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('deleteFailed'));
    }
  }

  if (!loaded) {
    return <p>{t('loading')}</p>;
  }

  return (
    <Tile>
      <h3>{name}</h3>
      {error && <InlineNotification kind="error" title={error} lowContrast />}
      {messages.slice().reverse().map((m) => (
        <div key={m.id}>
          <p><strong>{m.sender === 'doctor' ? t('you') : name}</strong>{` · ${new Date(m.createdAt).toLocaleString()}`}</p>
          {m.text && <p>{m.text}</p>}
          <PayloadView message={m} />
          {m.attachmentUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- signed-URL thumbnails are dynamic; next/image remotePatterns cannot cover them
            <img src={m.attachmentUrl} alt={m.text || t('attachment')} style={{ maxWidth: 220 }} />
          )}
          {m.sender === 'doctor' && (
            <Button kind="ghost" size="sm" onClick={() => void remove(m.id)}>{t('delete')}</Button>
          )}
        </div>
      ))}
      <TextArea id={`reply-${patientId}`} labelText={t('reply')} value={reply} onChange={(e) => setReply(e.target.value)} rows={2} />
      <Button size="sm" onClick={() => void send()}>{t('send')}</Button>
    </Tile>
  );
}
