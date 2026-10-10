import { NextRequest } from 'next/server';
import { ok, fail, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { editorService } from '@/lib/plans/editor.service';
import { generationErrorCode } from '@/lib/errors/fail';
import { auditService } from '@/lib/security/audit';

// NP-07: approve & publish — only from a reconciled state (deviation ≤ 5)
// with allergy/contraindication passes re-verified server-side.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:plans:approve`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  try {
    const result = await editorService.approve(id, payload.sub);
    if (!result) return notFound();
    await auditService.logAction({
      actorId: payload.sub,
      actorRole: payload.role,
      action: 'PLAN_APPROVED',
      entityType: 'NutritionPlan',
      entityId: id,
      req: getRequestMeta(request),
      metadata: { deviation_kcal: result.deviationKcal },
    });
    return ok(result);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'INVALID_STATUS' || code === 'RAILS_VIOLATION') return fail(code, (err as Error).message, 422);
    if (code === 'UNRECONCILED') return fail(code, (err as Error).message, 422);
    if (code === 'PLAN_BLOCKED') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Approval failed', 500);
  }
}
