import { NextRequest } from 'next/server';
import { ok, notFound } from '@/lib/api/response';
import { campaignsService } from '@/lib/newsletter/campaigns.service';

// CRON-11: newsletter batch sender — every 5 minutes, 50/batch (NL-12).
// Auth: x-cron-secret header (CRON-02 unified runner also serves this task
// at POST /api/cron/newsletter-send). Bearer kept for backwards compat.
// An invalid/missing secret answers 404, never 403 (hard invariant #1:
// cron surface must not be enumerable).
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  const headerSecret = request.headers.get('x-cron-secret');
  if (!secret || (auth !== `Bearer ${secret}` && headerSecret !== secret)) {
    return notFound('Not found');
  }
  const result = await campaignsService.processDue();
  return ok(result);
}

export async function GET() {
  return notFound('Not found');
}
