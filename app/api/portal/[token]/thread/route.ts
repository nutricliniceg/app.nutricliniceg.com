import { NextRequest } from 'next/server';
import { ok, fail, notFound } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { messagingService } from '@/lib/messages/messaging.service';
import { PORTAL_INVALID } from '@/lib/portal';
import { generationErrorCode } from '@/lib/errors/fail';

// Patient-visible replies (MSG-01). Same generic error as every portal
// endpoint for wrong/expired/revoked tokens.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rateLimit = await checkRateLimit(`portal:${token}:thread`, RATE_LIMITS.portalRead);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  try {
    return ok(await messagingService.portalThread(token));
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === PORTAL_INVALID) return notFound('This link is invalid or has expired');
    if (code === 'PERMISSION_DENIED') return fail(code, (err as Error).message, 403);
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
