import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { foodCreateSchema, foodListQuerySchema } from '@/lib/foods/foods.schema';
import { foodsService, serviceErrorCode } from '@/lib/foods/foods.service';
import { auditService } from '@/lib/security/audit';

function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:foods:list`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { searchParams } = new URL(request.url);
  const parsed = foodListQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return failZod(parsed.error);
  const admin = isAdminRole(payload.role);
  const result = admin
    ? await foodsService.listAdmin(payload.sub, parsed.data)
    : await foodsService.list(payload.sub, parsed.data);
  return ok(result);
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:foods:create`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = foodCreateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const foodId = await foodsService.create(payload.sub, parsed.data, isAdminRole(payload.role));
    await auditService.logAction({
      actorId: payload.sub,
      actorRole: payload.role,
      action: 'FOOD_CREATED',
      entityType: 'FoodItem',
      entityId: foodId,
      req: getRequestMeta(request),
      metadata: { name_ar: parsed.data.name_ar, global: isAdminRole(payload.role) },
    });
    return ok({ foodId }, { message: 'Food item created successfully' }, 201);
  } catch (err) {
    const code = serviceErrorCode(err);
    if (code === 'DUPLICATE_FOOD') return fail(code, (err as Error).message, 409);
    if (code === 'INCONSISTENT_KCAL') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Failed to create food item', 500);
  }
}
