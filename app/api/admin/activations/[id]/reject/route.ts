import { NextRequest } from 'next/server';
import { ok, fail, failZod, unauthorized, notFound } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { activationRejectSchema } from '@/lib/admin/admin.schema';
import { adminUsersService } from '@/lib/admin/users.service';
import { generationErrorCode } from '@/lib/errors/fail';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (!isAdminRole(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const rateLimit = await checkRateLimit(`${payload.sub}:admin:reject`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = activationRejectSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  try {
    const result = await adminUsersService.reject(payload.sub, id, parsed.data.reason);
    await auditService.logAction({
      actorId: payload.sub, actorRole: payload.role, action: 'USER_ACTIVATION_REJECTED',
      entityType: 'User', entityId: id, req: getRequestMeta(request),
      metadata: { reason: parsed.data.reason },
    });
    return ok(result);
  } catch (err) {
    if (generationErrorCode(err) === 'NOT_FOUND') return notFound();
    return fail('INTERNAL_ERROR', 'Request failed', 500);
  }
}
