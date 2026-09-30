import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { subscriptionPlanSchema } from '@/lib/admin/admin.schema';
import { pricingService } from '@/lib/admin/pricing.service';
import { auditService } from '@/lib/security/audit';

function requireSuper(role: string): boolean {
  return role === 'super_admin';
}

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (payload.role !== 'admin' && payload.role !== 'super_admin') return fail('NOT_FOUND', 'Not found', 404);
  return ok({ plans: await pricingService.list() });
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!requireSuper(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:plans`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = subscriptionPlanSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const result = await pricingService.create(true, {
    nameAr: parsed.data.name_ar, nameEn: parsed.data.name_en,
    descriptionAr: parsed.data.description_ar, descriptionEn: parsed.data.description_en,
    priceMonthly: parsed.data.price_monthly, priceYearly: parsed.data.price_yearly,
    durationDays: parsed.data.duration_days, maxPatients: parsed.data.max_patients,
    maxAiCallsMonthly: parsed.data.max_ai_calls_monthly, features: parsed.data.features,
    isActive: parsed.data.is_active, sortOrder: parsed.data.sort_order,
  });
  await auditService.logAction({
    actorId: payload.sub, actorRole: payload.role, action: 'PLAN_CREATED',
    entityType: 'SubscriptionPlan', entityId: result.id, req: getRequestMeta(request),
  });
  return ok(result, undefined, 201);
}
