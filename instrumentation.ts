import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@/lib/observability/sentry';

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    beforeSend(event) {
      return scrubSentryEvent(event as unknown as Record<string, unknown>) as unknown as typeof event;
    },
  });
}

export const onRequestError = Sentry.captureRequestError;
