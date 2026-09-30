import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { subscriptionAdjustSchema } from '@/lib/admin/admin.schema';
import { adminUsersService } from '@/lib/admin/users.service';
import { generationErrorCode } from '@/lib/plans/generation.service';
import { auditService } from '@/lib/security/audit';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (payload.role !== 'admin' && payload.role !== 'super_admin') return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:subscription`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = subscriptionAdjustSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await adminUsersService.adjustSubscription(id, {
      planId: parsed.data.plan_id, addDays: parsed.data.add_days, removeDays: parsed.data.remove_days,
    });
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'SUBSCRIPTION_ADJUSTED',
      entityType: 'User', entityId: id, req: getRequestMeta(request),
      metadata: { reason: parsed.data.reason, plan_id: parsed.data.plan_id ?? undefined },
    });
    return ok(result);
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
