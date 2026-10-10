import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, forbidden } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { foodRequestCreateSchema } from '@/lib/foods/foods.schema';
import { foodRequestsService } from '@/lib/foods/food-requests.service';
import { serviceErrorCode } from '@/lib/foods/foods.service';
import { auditService } from '@/lib/security/audit';
import { isAdminRole, isDoctorRole } from '@/lib/security/rbac';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  // Admins see the pending queue; doctors see their own requests (FL-15/16).
  const data = isAdminRole(payload.role)
    ? await foodRequestsService.listQueue()
    : await foodRequestsService.listMine(payload.sub);
  return ok({ requests: data });
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isDoctorRole(payload.role)) return forbidden('Only doctors submit food requests');
  const rateLimit = await checkRateLimit(`${payload.sub}:foodrequests:create`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = foodRequestCreateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const requestId = await foodRequestsService.submit(payload.sub, parsed.data);
    await auditService.logAction({
      actorId: payload.sub,
      actorRole: payload.role,
      action: 'FOOD_REQUEST_CREATED',
      entityType: 'FoodRequest',
      entityId: requestId,
      req: getRequestMeta(request),
      metadata: { name_ar: parsed.data.name_ar },
    });
    return ok({ requestId }, { message: 'Request submitted for admin review' }, 201);
  } catch (err) {
    if (serviceErrorCode(err) === 'INCONSISTENT_KCAL') return fail('INCONSISTENT_KCAL', (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Failed to submit food request', 500);
  }
}
