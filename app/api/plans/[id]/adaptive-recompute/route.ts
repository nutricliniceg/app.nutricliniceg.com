import { NextRequest } from 'next/server';
import { ok, fail, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { bulkService } from '@/lib/plans/bulk.service';
import { planWeeksService } from '@/lib/plans/plan-weeks.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

// NP-11: recalculate from the last visit weight, update targets, reconcile.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:plans:adaptive`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  try {
    const result = await planWeeksService.adaptiveRecompute(id, payload.sub);
    if (!result) return notFound();
    await auditService.logAction({
      actorId: payload.sub,
      actorRole: payload.role,
      action: 'PLAN_ADAPTIVE_RECOMPUTE',
      entityType: 'NutritionPlan',
      entityId: id,
      req: getRequestMeta(request),
      metadata: { weight_kg: result.weightUsedKg, target_calories: result.targets.calories },
    });
    return ok(result);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'ARCHIVED' || code === 'EMPTY_PLAN') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Adaptive recompute failed', 500);
  }
}
