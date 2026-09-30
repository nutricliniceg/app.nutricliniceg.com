'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { readApi } from '@/lib/api/fetch-json';

export function TokenEntry({ invalidLabel, placeholder, goLabel }: { invalidLabel: string; placeholder: string; goLabel: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function open(): Promise<void> {
    const token = value.trim();
    if (!token) {
      setError(invalidLabel);
      return;
    }
    setError(null);
    try {
      await readApi(await fetch(`/api/portal/${token}`));
      router.push(`/portal/${token}`);
    } catch {
      setError(invalidLabel);
    }
  }

  return (
    <div className="portal-form">
      <input aria-label={placeholder} placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)} inputMode="text" autoComplete="off" />
      {error && <p role="alert">{error}</p>}
      <button type="button" onClick={() => void open()}>{goLabel}</button>
    </div>
  );
}

function useSubmit(url: string): { busy: boolean; done: boolean; error: string | null; send: (payload: Record<string, unknown>) => Promise<void> } {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(payload: Record<string, unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await readApi(await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }));
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }
  return { busy, done, error, send };
}

export function WeightForm({ token, labels }: { token: string; labels: { weight: string; note: string; send: string; sent: string } }) {
  const [weight, setWeight] = useState('');
  const [note, setNote] = useState('');
  const submit = useSubmit(`/api/portal/${token}/weight`);
  return (
    <form className="portal-form" onSubmit={(e) => { e.preventDefault(); void submit.send({ weight_kg: Number(weight), note: note || null }); }}>
      <input aria-label={labels.weight} placeholder={labels.weight} value={weight} onChange={(e) => setWeight(e.target.value)} inputMode="decimal" />
      <input aria-label={labels.note} placeholder={labels.note} value={note} onChange={(e) => setNote(e.target.value)} />
      {submit.error && <p role="alert">{submit.error}</p>}
      {submit.done && <p>{labels.sent}</p>}
      <button type="submit" disabled={submit.busy}>{labels.send}</button>
    </form>
  );
}

export function NoteForm({ token, labels }: { token: string; labels: { text: string; send: string; sent: string } }) {
  const [text, setText] = useState('');
  const submit = useSubmit(`/api/portal/${token}/note`);
  return (
    <form className="portal-form" onSubmit={(e) => { e.preventDefault(); void submit.send({ text }); setText(''); }}>
      <textarea aria-label={labels.text} placeholder={labels.text} value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      {submit.error && <p role="alert">{submit.error}</p>}
      {submit.done && <p>{labels.sent}</p>}
      <button type="submit" disabled={submit.busy || text.trim() === ''}>{labels.send}</button>
    </form>
  );
}

export function MessageForm({ token, labels }: { token: string; labels: { text: string; send: string; sent: string; hint: string; attach: string; attachFailed: string } }) {
  const [text, setText] = useState('');
  const [fileId, setFileId] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const submit = useSubmit(`/api/portal/${token}/message`);

  async function attach(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachError(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const up = await readApi<{ file_id: string }>(await fetch(`/api/portal/${token}/upload`, { method: 'POST', body: form }));
      setFileId(up.file_id);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : labels.attachFailed);
    }
  }

  return (
    <form className="portal-form" onSubmit={(e) => { e.preventDefault(); void submit.send({ text, file_id: fileId }); setText(''); setFileId(null); }}>
      <p>{labels.hint}</p>
      <textarea aria-label={labels.text} placeholder={labels.text} value={text} onChange={(e) => setText(e.target.value)} rows={3} />
      <input aria-label={labels.attach} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void attach(e)} />
      {attachError && <p role="alert">{attachError}</p>}
      {submit.error && <p role="alert">{submit.error}</p>}
      {submit.done && <p>{labels.sent}</p>}
      <button type="submit" disabled={submit.busy || (text.trim() === '' && !fileId)}>{labels.send}</button>
    </form>
  );
}
