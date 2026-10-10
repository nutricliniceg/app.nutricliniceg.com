import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { foodListCreateSchema } from '@/lib/foods/foods.schema';
import { foodListsService } from '@/lib/foods/food-lists.service';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';

export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const admin = isAdminRole(payload.role);
  const lists = admin ? await foodListsService.listAdmin() : await foodListsService.list(payload.sub);
  return ok({ lists });
}

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:foodlists:create`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = foodListCreateSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const listId = await foodListsService.create(payload.sub, parsed.data, isAdminRole(payload.role));
  await auditService.logAction({
    actorId: payload.sub,
    actorRole: payload.role,
    action: 'FOOD_LIST_CREATED',
    entityType: 'FoodList',
    entityId: listId,
    req: getRequestMeta(request),
    metadata: { name_ar: parsed.data.name_ar },
  });
  return ok({ listId }, { message: 'Food list created successfully' }, 201);
}
