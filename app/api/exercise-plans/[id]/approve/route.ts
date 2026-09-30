import { NextRequest } from 'next/server';
import { ok, fail, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { exerciseEditorService } from '@/lib/exercises/editor.service';
import { exerciseErrorCode } from '@/lib/exercises/generation.service';
import { auditService } from '@/lib/security/audit';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:exercises:approve`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  try {
    const result = await exerciseEditorService.approve(id, payload.sub);
    if (!result) return notFound();
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'EXERCISE_PLAN_APPROVED',
      entityType: 'ExercisePlan', entityId: id, req: getRequestMeta(request),
      metadata: { exercise_count: result.exerciseCount },
    });
    return ok(result);
  } catch (err) {
    const code = exerciseErrorCode(err);
    if (code === 'ARCHIVED' || code === 'INVALID_STATUS' || code === 'EMPTY_PLAN') {
      return fail(code, (err as Error).message, 422);
    }
    return fail('INTERNAL_ERROR', 'Approval failed', 500);
  }
}
