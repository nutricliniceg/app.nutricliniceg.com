'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, InlineLoading, InlineNotification, TextInput } from '@carbon/react';
import { readApi, ApiRequestError } from '@/lib/api/fetch-json';
import { loginErrorKey } from '@/lib/auth/login-errors';
import type { LoginResult } from '@/lib/auth/auth.service';

/**
 * Client login island. Posts exactly `{ email, password }` to the existing
 * POST /api/auth/login route (loginSchema: email + non-empty password,
 * optional turnstile_token) and consumes the standard envelope via readApi.
 * The session cookie is HttpOnly (set server-side), so on success we simply
 * navigate to the API-returned `redirectTo` (/dashboard, or /admin for
 * admin/super_admin) under the active locale. Zero DB reads — the page is
 * static and renders 200 on an empty database.
 */
export default function LoginForm({ locale }: { locale: string }) {
  const t = useTranslations('login');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setErrorKey(null);
    try {
      const data = await readApi<LoginResult>(
        await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), password }),
        }),
      );
      const target = data.redirectTo.startsWith('/') ? data.redirectTo : '/dashboard';
      router.replace(`/${locale}${target}`);
      router.refresh();
    } catch (err) {
      setErrorKey(loginErrorKey(err instanceof ApiRequestError ? err.code : null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} aria-busy={busy}>
      {errorKey && <InlineNotification kind="error" lowContrast title={t(`errors.${errorKey}`)} />}
      <TextInput
        id="login-email"
        name="email"
        type="email"
        autoComplete="email"
        labelText={t('email')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={busy}
      />
      <TextInput
        id="login-password"
        name="password"
        type="password"
        autoComplete="current-password"
        labelText={t('password')}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={busy}
      />
      <Button type="submit" disabled={busy}>
        {t('submit')}
      </Button>
      {busy && <InlineLoading description={t('submitting')} />}
    </form>
  );
}