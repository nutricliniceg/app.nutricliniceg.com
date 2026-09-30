import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { exerciseBulkSchema } from '@/lib/exercises/exercises.schema';
import { exerciseEditorService } from '@/lib/exercises/editor.service';
import { exerciseErrorCode } from '@/lib/exercises/generation.service';
import { auditService } from '@/lib/security/audit';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:exercises:bulk`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = exerciseBulkSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await exerciseEditorService.bulkEdit(id, payload.sub, parsed.data);
    if (!result) return notFound();
    if (!parsed.data.preview) {
      await auditService.logAction({
        actorId: payload.sub, actorRole: payload.role, action: 'EXERCISE_PLAN_BULK_EDIT',
        entityType: 'ExercisePlan', entityId: id, req: getRequestMeta(request),
        metadata: { scope: parsed.data.scope, op: parsed.data.op.type },
      });
    }
    return ok(result);
  } catch (err) {
    const code = exerciseErrorCode(err);
    if (code === 'ARCHIVED' || code === 'NO_POSITIONS') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Bulk edit failed', 500);
  }
}
