import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/observability/logger';

// PF-02: per-route server-timing + slow-request logging (p95 < 800ms budget).
// Wrap hot GET handlers: `export const GET = timed(async (req) => {...})`.
// The wrapper preserves the (request, context) signature.
const SLOW_MS = 800;

type Handler = (req: NextRequest, ctx?: unknown) => Promise<NextResponse> | NextResponse;

export function timed<T extends Handler>(handler: T): T {
  const wrapped = (async (req: NextRequest, ctx?: unknown) => {
    const start = Date.now();
    const res = await handler(req, ctx);
    const ms = Date.now() - start;
    try {
      res.headers.set('Server-Timing', `app;dur=${ms}`);
    } catch {
      // Immutable headers — timing still logged below.
    }
    const url = new URL(req.url);
    if (ms >= SLOW_MS) {
      logger.warn('api.slow', { route: url.pathname, ms });
    } else {
      logger.debug('api.timing', { route: url.pathname, ms });
    }
    return res;
  }) as T;
  return wrapped;
}
