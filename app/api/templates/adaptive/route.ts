import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { adaptiveSuggestSchema } from '@/lib/templates/templates.schema';
import { adaptiveService } from '@/lib/templates/adaptive.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:templates:adaptive`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = adaptiveSuggestSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await adaptiveService.suggest(payload.sub, parsed.data);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'PLAN_ADAPTIVE_SUGGESTED',
      entityType: 'NutritionPlan', entityId: result.planId, req: getRequestMeta(request),
      metadata: { patient_id: parsed.data.patient_id, weight_kg: result.weightUsedKg },
    });
    return ok(result, { message: 'Adaptive draft created — doctor approval required' }, 201);
  } catch (err) {
    const code = generationErrorCode(err);
    if (code === 'NOT_FOUND') return notFound();
    if (code === 'NO_ACTIVE_PLAN') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Adaptive suggestion failed', 500);
  }
}
