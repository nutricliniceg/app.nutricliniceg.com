import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { showCaloriesSchema } from '@/lib/print/print.schema';
import { plansRepository } from '@/lib/db/repositories/plans.repo';
import { auditService } from '@/lib/security/audit';

// P18 Q2 (owner decision pending): per-plan patient-facing calorie
// visibility. Defaults to visible; the doctor toggles per plan.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:plans:visibility`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = showCaloriesSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const plan = await plansRepository.findOwnedById(id, payload.sub);
  if (!plan) return notFound();
  await plansRepository.updateShowCalories(id, payload.sub, parsed.data.show_calories_to_patient);
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'PLAN_VISIBILITY_UPDATED',
    entityType: 'NutritionPlan', entityId: id, req: getRequestMeta(request),
    metadata: { show_calories_to_patient: parsed.data.show_calories_to_patient },
  });
  return ok({ id, show_calories_to_patient: parsed.data.show_calories_to_patient });
}
