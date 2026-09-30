import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { planGenerateSchema } from '@/lib/plans/plans.schema';
import { generationService, generationErrorCode, generationErrorExtra } from '@/lib/plans/generation.service';
import { chainErrorCode } from '@/lib/ai/chain';
import { auditService } from '@/lib/security/audit';

function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

// POST /api/plans/generate — AI generation in from_list / ai_free modes.
// Always persists a DRAFT (pending_doctor_approval); never publishes (§8.1).
export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:plans:generate`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = planGenerateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await generationService.generate(payload.sub, parsed.data, isAdminRole(payload.role));
    await auditService.logAction({
      actorId: payload.sub,
      actorRole: payload.role,
      action: 'PLAN_GENERATED',
      entityType: 'NutritionPlan',
      entityId: result.planId,
      req: getRequestMeta(request),
      metadata: { mode: parsed.data.mode, attempts: result.attempts, wall_time_ms: result.wallTimeMs, deviation_kcal: result.deviationKcal },
    });
    return ok(result, { message: 'Draft plan generated — doctor approval required before publishing' }, 201);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return fail('NOT_FOUND', 'Patient not found', 404);
    if (code === 'NO_CANDIDATES') {
      return fail(code, (err as Error).message, 422, { action: ['request_food'] });
    }
    if (code === 'NEEDS_CONFIRMATION') {
      return fail(code, (err as Error).message, 422, { action: ['confirm_ai_free'] });
    }
    if (code === 'QUOTA_EXCEEDED' || chainErrorCode(err) === 'QUOTA_EXCEEDED') {
      return fail('QUOTA_EXCEEDED', (err as Error).message, 429);
    }
    if (code === 'AI_UNAVAILABLE' || chainErrorCode(err) === 'AI_UNAVAILABLE') {
      return fail('AI_UNAVAILABLE', (err as Error).message, 503);
    }
    const extra = generationErrorExtra(err);
    const details = extra ? { extra: [JSON.stringify(extra)] } : undefined;
    return fail(code, (err as Error).message ?? 'Plan generation failed', 500, details);
  }
}
