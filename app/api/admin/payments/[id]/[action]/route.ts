import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { manualReviewSchema } from '@/lib/billing/billing.schema';
import { billingService } from '@/lib/billing/billing.service';
import { generationErrorCode } from '@/lib/errors/fail';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';

async function review(request: NextRequest, id: string, approve: boolean) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:payments`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? (JSON.parse(text) as unknown) : {};
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = manualReviewSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  if (!approve && !(parsed.data.reason?.trim())) {
    return fail('REASON_REQUIRED', 'A rejection reason is required', 422);
  }
  try {
    const result = await billingService.reviewManual(payload.sub, id, approve, parsed.data.reason ?? null);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role,
      action: approve ? 'MANUAL_PAYMENT_APPROVED' : 'MANUAL_PAYMENT_REJECTED',
      entityType: 'ManualPaymentRequest', entityId: id, req: getRequestMeta(request),
    });
    return ok(result);
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (action !== 'approve' && action !== 'reject') return notFound();
  return review(request, id, action === 'approve');
}
