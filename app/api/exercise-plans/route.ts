import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { exerciseGenerateSchema, exerciseListQuerySchema } from '@/lib/exercises/exercises.schema';
import { exerciseGenerationService, exerciseErrorCode } from '@/lib/exercises/generation.service';
import { chainErrorCode } from '@/lib/ai/chain';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:exercises:list`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const parsed = exerciseListQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const result = await exerciseGenerationService.list(
    payload.sub,
    parsed.data.patient_id ?? null,
    parsed.data.page ?? 1,
    parsed.data.limit ?? 20
  );
  if (!result) return fail('NOT_FOUND', 'Patient not found', 404);
  return ok(result);
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:exercises:generate`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = exerciseGenerateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await exerciseGenerationService.generate(payload.sub, parsed.data, isAdminRole(payload.role));
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'EXERCISE_PLAN_GENERATED',
      entityType: 'ExercisePlan', entityId: result.planId, req: getRequestMeta(request),
      metadata: { goal: parsed.data.goal, level: parsed.data.level, attempts: result.attempts },
    });
    return ok(result, { message: 'Draft exercise plan generated — doctor approval required before publishing' }, 201);
  } catch (err) {
    const code = exerciseErrorCode(err);
    if (code === 'NOT_FOUND') return fail('NOT_FOUND', 'Patient not found', 404);
    if (code === 'QUOTA_EXCEEDED' || chainErrorCode(err) === 'QUOTA_EXCEEDED') return fail('QUOTA_EXCEEDED', (err as Error).message, 429);
    if (code === 'AI_UNAVAILABLE' || chainErrorCode(err) === 'AI_UNAVAILABLE') return fail('AI_UNAVAILABLE', (err as Error).message, 503);
    return fail('INTERNAL_ERROR', 'Exercise generation failed', 500);
  }
}
