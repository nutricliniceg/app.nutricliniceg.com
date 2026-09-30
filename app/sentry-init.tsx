'use client';

import { useEffect } from 'react';
import { scrubSentryEvent } from '@/lib/observability/sentry';

// PF-07/UI-13: the Sentry browser SDK (~80kB gzip) must NOT join the shared
// layout chunk — it loads on demand after hydration instead.
export default function SentryInit() {
  useEffect(() => {
    const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
    if (!dsn) return;
    let cancelled = false;
    void import('@sentry/nextjs').then((Sentry) => {
      if (cancelled) return;
      try {
        Sentry.init({
          dsn,
          tracesSampleRate: 0.05,
          beforeSend(event) {
            return scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event;
          },
        });
      } catch {
        // Observability never breaks the app.
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
