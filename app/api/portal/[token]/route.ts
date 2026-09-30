import { NextRequest } from 'next/server';
import { ok, fail, notFound } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { portalService, PORTAL_INVALID } from '@/lib/portal/portal.service';
import { generationErrorCode } from '@/lib/plans/generation.service';

// Public token endpoint (PP-10): wrong/expired/revoked share ONE generic
// error (anti-enumeration). No accounts, no passwords (PP-13).
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rateLimit = await checkRateLimit(`portal:${token}:read`, RATE_LIMITS.portalRead);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  try {
    const result = await portalService.context(token);
    return ok(result);
  } catch (err) {
    if (generationErrorCode(err) === PORTAL_INVALID) return notFound('This link is invalid or has expired');
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
