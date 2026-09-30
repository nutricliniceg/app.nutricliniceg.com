import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { subscriptionPlanPatchSchema } from '@/lib/admin/admin.schema';
import { pricingService } from '@/lib/admin/pricing.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

const SNAKE_TO_CAMEL: Record<string, string> = {
  name_ar: 'nameAr', name_en: 'nameEn', description_ar: 'descriptionAr', description_en: 'descriptionEn',
  price_monthly: 'priceMonthly', price_yearly: 'priceYearly', duration_days: 'durationDays',
  max_patients: 'maxPatients', max_ai_calls_monthly: 'maxAiCallsMonthly', features: 'features',
  is_active: 'isActive', sort_order: 'sortOrder',
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (payload.role !== 'super_admin') return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:plans`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = subscriptionPlanPatchSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const input: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined && SNAKE_TO_CAMEL[k]) input[SNAKE_TO_CAMEL[k]] = v;
  }
  try {
    const result = await pricingService.update(true, id, input as Parameters<typeof pricingService.update>[2]);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'PLAN_UPDATED',
      entityType: 'SubscriptionPlan', entityId: id, req: getRequestMeta(request),
    });
    return ok(result);
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (payload.role !== 'super_admin') return fail('NOT_FOUND', 'Not found', 404);
  const { id } = await params;
  try {
    await pricingService.remove(true, id);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'PLAN_DELETED',
      entityType: 'SubscriptionPlan', entityId: id, req: getRequestMeta(request),
    });
    return ok({ deleted: true });
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
