import { NextRequest } from 'next/server';
import { ok, fail, unauthorized, notFound } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { messagingService } from '@/lib/messages/messaging.service';
import { generationErrorCode } from '@/lib/errors/fail';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ patientId: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:messages:read`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { patientId } = await params;
  try {
    await messagingService.markRead(payload.sub, patientId);
    return ok({ read: true });
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
