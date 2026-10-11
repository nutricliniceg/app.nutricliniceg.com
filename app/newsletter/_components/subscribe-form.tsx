'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Select, SelectItem, TextInput } from '@carbon/react';
import { readApi } from '@/lib/api/fetch-json';

// Shared subscribe form (footer site-wide, blog top, landing sections).
// The server response is ALWAYS neutral (NL-08).
//
// P32-DESIGN-2: converted from hand-rolled <input>/<select>/<button> to Carbon
// components so the form matches the login page's control styling instead of
// rendering browser-default widgets inside the shared footer. The locale option
// labels were hardcoded strings, which also broke invariant 8 — they now come
// from the `common` namespace (each locale names the other language, matching
// the locale switcher).
//
// The hidden `website` field stays a raw <input>: it is an anti-bot honeypot
// that must never be styled or announced by Carbon.
export default function SubscribeForm({ source }: { source: 'footer' | 'blog' | 'landing' }) {
  const t = useTranslations('newsletter');
  const tc = useTranslations('common');
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
    <form className="nc-form" onSubmit={(e) => void submit(e)} aria-busy={busy}>
      <TextInput
        id={`nl-email-${source}`}
        type="email"
        labelText={t('email')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
        required
      />
      <TextInput
        id={`nl-name-${source}`}
        labelText={t('nameOptional')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        disabled={busy}
      />
      <Select
        id={`nl-locale-${source}`}
        labelText={t('locale')}
        value={locale}
        onChange={(e) => setLocale(e.target.value)}
        disabled={busy}
      >
        <SelectItem value="ar" text={tc('switch_to_arabic')} />
        <SelectItem value="en" text={tc('switch_to_english')} />
      </Select>
      {/* Honeypot — intentionally a raw input, never styled by Carbon. */}
      <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" style={{ display: 'none' }} aria-hidden="true" />
      <div className="nc-form__actions">
        <Button type="submit" disabled={busy}>
          {t('subscribe')}
        </Button>
      </div>
      {message && (
        <p role="status" className="nc-form__status">
          {message}
        </p>
      )}
    </form>
  );
}