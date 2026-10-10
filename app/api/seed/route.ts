import { env } from '@/lib/env';
import { ok, notFound } from '@/lib/api/response';

// SEC-01/SEC-03: /api/seed returns 404 in production. Non-production answers
// use the shared envelope so every route in the app speaks one response shape.
export async function GET() {
  if (env.NODE_ENV === 'production') {
    return notFound('Not Found');
  }

  return ok({ status: 'ok', message: 'Seed endpoint placeholder (development only)' });
}

export async function POST() {
  if (env.NODE_ENV === 'production') {
    return notFound('Not Found');
  }

  return ok({ status: 'ok', message: 'Seed execution placeholder (development only)' });
}