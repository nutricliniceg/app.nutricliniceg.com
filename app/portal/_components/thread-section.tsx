'use client';

import { useCallback, useEffect, useState } from 'react';
import { readApi } from '@/lib/api/fetch-json';

interface Message {
  id: string;
  sender: 'patient' | 'doctor';
  type: string;
  text: string | null;
  attachmentUrl: string | null;
  payload: unknown;
  createdAt: string;
}

export default function ThreadSection({ token, labels }: { token: string; labels: { title: string; you: string; doctor: string; weight: string; kg: string; del: string; attachment: string; empty: string } }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const d = await readApi<{ messages: Message[] }>(await fetch(`/api/portal/${token}/thread`));
      setMessages(d.messages);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(id: string): Promise<void> {
    try {
      await readApi(await fetch(`/api/portal/${token}/messages/${id}`, { method: 'DELETE' }));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    }
  }

  if (messages.length === 0 && !error) return <p>{labels.empty}</p>;

  return (
    <div>
      <h2>{labels.title}</h2>
      {error && <p role="alert">{error}</p>}
      {messages.slice().reverse().map((m) => (
        <div className="portal-card" key={m.id}>
          <p><strong>{m.sender === 'doctor' ? labels.doctor : labels.you}</strong></p>
          {m.text && <p>{m.text}</p>}
          {m.type === 'weight_log' && (m.payload as { weight_kg?: unknown } | null)?.weight_kg != null && (
            <p>{`${labels.weight}: ${String((m.payload as { weight_kg: unknown }).weight_kg)} ${labels.kg}`}</p>
          )}
          {m.attachmentUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- signed-URL thumbnails are dynamic; next/image remotePatterns cannot cover them
            <img src={m.attachmentUrl} alt={m.text || labels.attachment} style={{ maxWidth: '100%' }} />
          )}
          {m.sender === 'patient' && (
            <button type="button" onClick={() => void remove(m.id)}>{labels.del}</button>
          )}
        </div>
      ))}
    </div>
  );
}
