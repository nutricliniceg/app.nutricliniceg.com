import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { exerciseCopyDaySchema } from '@/lib/exercises/exercises.schema';
import { exerciseEditorService } from '@/lib/exercises/editor.service';
import { exerciseErrorCode } from '@/lib/exercises/generation.service';
import { auditService } from '@/lib/security/audit';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:exercises:copyday`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = exerciseCopyDaySchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await exerciseEditorService.copyDay(id, payload.sub, parsed.data);
    if (!result) return notFound();
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'EXERCISE_PLAN_COPY_DAY',
      entityType: 'ExercisePlan', entityId: id, req: getRequestMeta(request),
      metadata: { from_day: parsed.data.from_day, to_days: parsed.data.to_days, copied: result.copied },
    });
    return ok(result);
  } catch (err) {
    const code = exerciseErrorCode(err);
    if (code === 'ARCHIVED' || code === 'EMPTY_DAY') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Copy day failed', 500);
  }
}
