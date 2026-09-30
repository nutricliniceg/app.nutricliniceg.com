import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { exerciseSaveSchema } from '@/lib/exercises/exercises.schema';
import { exerciseEditorService } from '@/lib/exercises/editor.service';
import { exerciseErrorCode } from '@/lib/exercises/generation.service';
import { exercisesRepository } from '@/lib/db/repositories/exercises.repo';
import { auditService } from '@/lib/security/audit';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:exercises:get`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  const result = await exerciseEditorService.getEditable(id, payload.sub);
  if (!result) return notFound();
  return ok(result);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:exercises:save`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = exerciseSaveSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await exerciseEditorService.save(id, payload.sub, parsed.data);
    if (!result) return notFound();
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'EXERCISE_PLAN_SAVED',
      entityType: 'ExercisePlan', entityId: id, req: getRequestMeta(request),
      metadata: { days: parsed.data.days.length },
    });
    return ok(result);
  } catch (err) {
    const code = exerciseErrorCode(err);
    if (code === 'ARCHIVED') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Exercise save failed', 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:exercises:archive`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  const row = await exercisesRepository.findOwnedById(id, payload.sub);
  if (!row) return notFound();
  await exercisesRepository.updateStatus(id, payload.sub, 'archived');
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'EXERCISE_PLAN_ARCHIVED',
    entityType: 'ExercisePlan', entityId: id, req: getRequestMeta(request),
  });
  return ok({ id });
}
