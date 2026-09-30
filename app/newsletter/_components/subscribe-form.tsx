'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { readApi } from '@/lib/api/fetch-json';

// Shared subscribe form (footer site-wide, blog top, landing sections).
// The server response is ALWAYS neutral (NL-08).
export default function SubscribeForm({ source }: { source: 'footer' | 'blog' | 'landing' }) {
  const t = useTranslations('newsletter');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [locale, setLocale] = useState('ar');
  const [website, setWebsite] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await readApi<{ message: string }>(await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || null, locale, source, website: website || null }),
      }));
      setMessage(d.message);
      setEmail('');
      setName('');
    } catch {
      setMessage(t('neutral'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <input aria-label={t('email')} placeholder={t('email')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input aria-label={t('name')} placeholder={t('nameOptional')} value={name} onChange={(e) => setName(e.target.value)} />
      <select aria-label={t('locale')} value={locale} onChange={(e) => setLocale(e.target.value)}>
        <option value="ar">العربية</option>
        <option value="en">English</option>
      </select>
      <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" style={{ display: 'none' }} aria-hidden="true" />
      <button type="submit" disabled={busy}>{t('subscribe')}</button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
