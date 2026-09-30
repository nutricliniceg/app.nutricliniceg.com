import { NextRequest } from 'next/server';
import { ok, fail, unauthorized } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { messagingService } from '@/lib/messages/messaging.service';

// Cheap indexed counts + latest preview for the 60s doctor poller (MSG-03).
export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:messages:summary`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  return ok(await messagingService.unreadSummary(payload.sub));
}
