import { NextRequest } from 'next/server';
import { ok, fail, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { generationService } from '@/lib/plans/generation.service';
import { generationErrorCode } from '@/lib/errors/fail';
import { auditService } from '@/lib/security/audit';

// NUT-16: swap every unverified item to the nearest-calorie ADMIN item.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:plans:convert`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  try {
    const result = await generationService.convertToVerified(id, payload.sub);
    if (!result) return notFound();
    await auditService.logAction({
      actorId: payload.sub,
      actorRole: payload.role,
      action: 'PLAN_CONVERTED_TO_VERIFIED',
      entityType: 'NutritionPlan',
      entityId: id,
      req: getRequestMeta(request),
      metadata: { converted: result.converted },
    });
    return ok(result);
  } catch (err) {
    if (generationErrorCode(err) === 'NO_CANDIDATES') return fail('NO_CANDIDATES', (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Conversion failed', 500);
  }
}
