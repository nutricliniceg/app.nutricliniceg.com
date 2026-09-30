// OBS-01/05: Sentry wiring with PHI scrubbing. The Sentry SDK only
// activates when SENTRY_DSN is set; every event passes through
// scrubSentryEvent first (emails/phones/national-IDs → placeholders).
import { deidentify } from '@/lib/security/deidentify';

export function scrubSentryEvent(event: Record<string, unknown>): Record<string, unknown> {
  const scrubText = (v: unknown): unknown => {
    if (typeof v === 'string') return deidentify(v).slice(0, 2000);
    if (Array.isArray(v)) return v.map(scrubText);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (/^(email|phone|address|national_id|password|token|api_key)$/i.test(k)) {
          out[k] = '[redacted]';
        } else {
          out[k] = scrubText(val);
        }
      }
      return out;
    }
    return v;
  };
  return scrubText(event) as Record<string, unknown>;
}

export function isSentryEnabled(): boolean {
  return Boolean(process.env.SENTRY_DSN);
}

// Safe capture that never throws into the request path.
export async function captureErrorSafe(err: unknown, context: Record<string, unknown> = {}): Promise<void> {
  try {
    if (!isSentryEnabled()) return;
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureException(err, { extra: scrubSentryEvent(context) });
  } catch {
    // Observability must never break the request.
  }
}
