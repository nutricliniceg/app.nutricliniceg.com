import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { exerciseRestoreSchema } from '@/lib/exercises/exercises.schema';
import { exerciseEditorService } from '@/lib/exercises/editor.service';
import { exerciseErrorCode } from '@/lib/exercises/generation.service';
import { auditService } from '@/lib/security/audit';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:exercises:revisions`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  const result = await exerciseEditorService.listRevisions(id, payload.sub);
  if (!result) return notFound();
  return ok({ revisions: result });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:exercises:restore`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = exerciseRestoreSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await exerciseEditorService.restoreRevision(id, payload.sub, parsed.data.revision_no);
    if (!result) return notFound();
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'EXERCISE_PLAN_RESTORED',
      entityType: 'ExercisePlan', entityId: id, req: getRequestMeta(request),
      metadata: { revision_no: parsed.data.revision_no },
    });
    return ok(result);
  } catch (err) {
    const code = exerciseErrorCode(err);
    if (code === 'ARCHIVED' || code === 'NOT_FOUND' || code === 'INVALID_REVISION') {
      return fail(code, (err as Error).message, code === 'NOT_FOUND' ? 404 : 422);
    }
    return fail('INTERNAL_ERROR', 'Restore failed', 500);
  }
}
