import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, forbidden, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { foodRequestReviewSchema } from '@/lib/foods/foods.schema';
import { foodRequestsService } from '@/lib/foods/food-requests.service';
import { notificationService } from '@/lib/notifications/service';
import { auditService } from '@/lib/security/audit';

function isAdminRole(role: string): boolean {
  return role === 'admin' || role === 'super_admin';
}

// FL-16: admin approve (→ GLOBAL item, requesting doctor notified) or reject with reason.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return forbidden('Admin access required');
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = foodRequestReviewSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  const result = await foodRequestsService.review(id, payload.sub, parsed.data.decision, parsed.data.reason ?? null);
  if (!result) return notFound();
  try {
    if (result.status === 'approved') {
      await notificationService.notify({
        userId: result.doctorId,
        title: 'تمت الموافقة على الصنف المطلوب',
        body: 'Your requested food item was approved and is now available to all doctors.',
        type: 'system',
        link: '/dashboard/food-lists',
      });
    } else {
      await notificationService.notify({
        userId: result.doctorId,
        title: 'تم رفض الصنف المطلوب',
        body: parsed.data.reason || 'Your requested food item was rejected.',
        type: 'system',
        link: '/dashboard/food-lists',
      });
    }
  } catch {
    // Notification failure must not roll back the review decision.
  }
  await auditService.logAction({
    actorId: payload.sub,
    actorRole: payload.role,
    action: result.status === 'approved' ? 'FOOD_REQUEST_APPROVED' : 'FOOD_REQUEST_REJECTED',
    entityType: 'FoodRequest',
    entityId: id,
    req: getRequestMeta(request),
    metadata: { food_id: result.foodId, duplicate: result.duplicate },
  });
  return ok(result);
}
