import { NextRequest } from 'next/server';
import { ok, fail, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { foodListsService } from '@/lib/foods/food-lists.service';
import { serviceErrorCode } from '@/lib/foods/foods.service';
import { auditService } from '@/lib/security/audit';
import { isDoctorRole } from '@/lib/security/rbac';

// FL-13: "Copy public list as base" — editable private copy for the doctor.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isDoctorRole(payload.role)) return fail('FORBIDDEN', 'Only doctors copy public lists', 403);
  const rateLimit = await checkRateLimit(`${payload.sub}:foodlists:copy`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  try {
    const result = await foodListsService.copyAsBase(payload.sub, id);
    if (!result) return notFound();
    await auditService.logAction({
      actorId: payload.sub,
      actorRole: payload.role,
      action: 'FOOD_LIST_COPIED',
      entityType: 'FoodList',
      entityId: result.listId,
      req: getRequestMeta(request),
      metadata: { source_list_id: id, copied: result.copied },
    });
    return ok(result, { message: `Copied ${result.copied} items to your private list` }, 201);
  } catch (err) {
    if (serviceErrorCode(err) === 'EMPTY_LIST') return fail('EMPTY_LIST', (err as Error).message, 422);
    return fail('INTERNAL_ERROR', 'Failed to copy food list', 500);
  }
}
