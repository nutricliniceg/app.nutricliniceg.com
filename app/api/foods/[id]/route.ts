import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { foodUpdateSchema } from '@/lib/foods/foods.schema';
import { foodsService, serviceErrorCode } from '@/lib/foods/foods.service';
import { auditService } from '@/lib/security/audit';

function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const { id } = await params;
  const item = await foodsService.get(id, payload.sub, isAdminRole(payload.role));
  if (!item) return notFound();
  return ok(item);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:foods:update`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = foodUpdateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const updated = await foodsService.update(id, payload.sub, parsed.data, isAdminRole(payload.role));
    if (!updated) return notFound();
    await auditService.logAction({
      actorId: payload.sub,
      actorRole: payload.role,
      action: 'FOOD_UPDATED',
      entityType: 'FoodItem',
      entityId: id,
      req: getRequestMeta(request),
      metadata: {},
    });
    return ok(updated);
  } catch (err) {
    const code = serviceErrorCode(err);
    if (code === 'DUPLICATE_FOOD') return fail(code, (err as Error).message, 409);
    if (code === 'INCONSISTENT_KCAL') return fail(code, (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Failed to update food item', 500);
  }
}

// FL-17: referenced items are archived instead of deleted (API + UI enforce).
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:foods:delete`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  const result = await foodsService.remove(id, payload.sub, isAdminRole(payload.role));
  if (!result) return notFound();
  await auditService.logAction({
    actorId: payload.sub,
    actorRole: payload.role,
    action: result.archived ? 'FOOD_ARCHIVED' : 'FOOD_DELETED',
    entityType: 'FoodItem',
    entityId: id,
    req: getRequestMeta(request),
    metadata: { archived: result.archived },
  });
  return ok(result, result.archived ? { message: 'Item is used by plans — archived instead of deleted' } : undefined);
}
